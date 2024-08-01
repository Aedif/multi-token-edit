import { DataTransform } from '../scripts/picker.js';
import { applyRandomization } from '../scripts/randomizer/randomizerUtils.js';
import { applyDDTint, applyTMFXPreset } from '../scripts/tmfx.js';
import {
  MODULE_ID,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_PLACEABLES,
  applyAddSubtract,
  flagCompare,
  getCommonData,
  getData,
  getDocumentName,
  localFormat,
  mergeObjectPreserveDot,
  panToFitPlaceables,
  wildcardStringMatch,
} from '../scripts/utils.js';
import { GeneralDataAdapter, TokenDataAdapter } from './dataAdapters.js';
import { SCENE_DOC_MAPPINGS, showMassEdit } from './multiConfig.js';

export function performMassSearch(
  command,
  documentName,
  selectedFields,
  { scope = null, selected = null, control = true, pan = true } = {}
) {
  const found = [];

  if (scope === 'selected') {
    performDocSearch(selected, documentName, selectedFields, found);
  } else if (SUPPORTED_COLLECTIONS.includes(documentName)) {
    performDocSearch(Array.from(game.collections.get(documentName)), documentName, selectedFields, found);
  } else {
    let scenes = [];
    if (scope === 'world') scenes = Array.from(game.scenes);
    else if (canvas.scene) scenes = [canvas.scene];

    for (const scene of scenes) {
      performMassSearchScene(scene, documentName, selectedFields, found);
    }
  }

  // Select found placeables/documents
  if (control) {
    // First release/de-select the currently selected placeable on the current scene
    canvas.activeLayer.controlled.map((c) => c).forEach((c) => c.release());

    setTimeout(() => {
      found.forEach((f) => {
        let obj = f.object ?? f;
        if (obj.control) obj.control({ releaseOthers: false });
      });

      if (pan && found.length && game.settings.get(MODULE_ID, 'panToSearch')) {
        panToFitPlaceables(found);
      }
    }, 100);
  }
  if (command === 'meSearchAndEdit') {
    setTimeout(() => {
      showMassEdit(found, documentName);
    }, 500);
  }
  return found;
}

function performMassSearchScene(scene, documentName, selectedFields, found) {
  const docs = Array.from(scene[SCENE_DOC_MAPPINGS[documentName]]);
  performDocSearch(docs, documentName, selectedFields, found);
}

function performDocSearch(docs, documentName, selectedFields, found) {
  // Next select objects that match the selected fields
  for (const c of docs) {
    let matches = true;
    const data = foundry.utils.flattenObject(getData(c).toObject());

    // Special processing for some placeable types
    // Necessary when form data is not directly mappable to placeable
    GeneralDataAdapter.dataToForm(documentName, c, data);

    for (const [k, v] of Object.entries(selectedFields)) {
      // Special handling for flags
      if (k.startsWith('flags.')) {
        if (!flagCompare(data, k, v)) {
          matches = false;
          break;
        }
        // Special handling for empty strings and undefined
      } else if ((v === '' || v == null) && (data[k] !== '' || data[k] != null)) {
        // matches
      } else if (typeof v === 'string' && v.includes('*') && wildcardStringMatch(v, data[k])) {
        // Wildcard matched
      } else if (data[k] != v) {
        // Detection mode keys cannot be treated in isolation
        // We skip them here and will check them later
        if (documentName === 'Token') {
          if (k.startsWith('detectionModes')) {
            continue;
          }
        }

        matches = false;
        break;
      }
    }
    if (matches) {
      // We skipped detectionMode matching in the previous step and do it now instead
      if (documentName === 'Token') {
        const modes = Object.values(foundry.utils.expandObject(selectedFields)?.detectionModes || {});

        if (!TokenDataAdapter.detectionModeMatch(modes, c.detectionModes)) {
          continue;
        }
      }

      found.push(c);
    }
  }
}

export async function performMassUpdate(data, objects, documentName, applyType) {
  // Used by GenericForms, we want just the data, and no updates
  if (this.options?.simplified) {
    if (this.options.callback) this.options.callback(data);
    return;
  }
  if (foundry.utils.isEmpty(data)) {
    if (this.callbackOnUpdate) {
      this.callbackOnUpdate(objects);
    }
    return;
  }

  // Make sure we're working with documents and not placeables
  objects = objects.map((o) => o.document ?? o);

  // Update docs
  const updates = [];
  const context = {};

  const total = objects.length;
  for (let i = 0; i < total; i++) {
    const update = foundry.utils.deepClone(data);
    update._id = objects[i].id;

    // push update
    updates.push(update);
  }

  // Applies randomization
  if (this) await applyRandomization(updates, objects, this.randomizeFields);
  if (this) applyAddSubtract(updates, objects, documentName, this.addSubtractFields);

  // Necessary when form data is not directly mappable to placeable
  for (let i = 0; i < total; i++) {
    GeneralDataAdapter.formToData(documentName, objects[i], updates[i]);
  }

  await checkApplySpecialFields(documentName, updates, objects);

  if (documentName === 'Actor') {
    // Perform Updates
    // There is a lot of wonkiness related to updating of real/synthetic actors. It's probably best
    // to simply update the Actors directly

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      delete update._id;
      if (this.options?.tokens) this.options.tokens[i].actor.update(update);
      else objects[i].update(update);
    }
  } else if (documentName === 'Scene') {
    Scene.updateDocuments(updates, context);
  } else if (documentName === 'PlaylistSound') {
    for (let i = 0; i < objects.length; i++) {
      delete updates[i]._id;
      objects[i].update(updates[i]);
    }
  } else if (documentName === 'Note') {
    // Notes can be updated across different scenes
    const splitUpdates = {};
    for (let i = 0; i < updates.length; i++) {
      const scene = objects[i].scene ?? objects[i].parent;
      if (applyType === 'meApplyCurrentScene' && scene.id !== canvas.scene.id) continue;
      if (!(scene.id in splitUpdates)) {
        splitUpdates[scene.id] = { scene: scene, updates: [] };
      }
      splitUpdates[scene.id].updates.push(updates[i]);
    }
    for (const sceneUpdate of Object.values(splitUpdates)) {
      sceneUpdate.scene.updateEmbeddedDocuments(documentName, sceneUpdate.updates, context);
    }
  } else if (!this.isPrototype && SUPPORTED_PLACEABLES.includes(documentName)) {
    const splitUpdates = {};
    for (let i = 0; i < updates.length; i++) {
      const scene = objects[i].parent;
      if (!splitUpdates[scene.id]) splitUpdates[scene.id] = [];
      splitUpdates[scene.id].push(updates[i]);
    }

    for (const sceneId of Object.keys(splitUpdates)) {
      game.scenes.get(sceneId)?.updateEmbeddedDocuments(documentName, splitUpdates[sceneId], context);
    }
  } else if (SUPPORTED_COLLECTIONS.includes(documentName)) {
    objects[0].constructor?.updateDocuments(updates, context);
  } else {
    // Not a placeable or otherwise specially handled doc type
    // Simply merge the fields directly into the object
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      delete update._id;
      mergeObjectPreserveDot(objects[i], foundry.utils.mergeObject(objects[i], update));
    }
    if (this.callbackOnUpdate) {
      this.callbackOnUpdate(objects);
    }
  }

  // May need to also update Token prototypes
  if ((applyType === 'meApplyToPrototype' || this.isPrototype) && documentName === 'Token') {
    const actorUpdates = {};
    for (let i = 0; i < objects.length; i++) {
      const actor = objects[i].actor;
      if (actor) actorUpdates[actor.id] = { _id: actor.id, prototypeToken: updates[i] };
    }
    if (!foundry.utils.isEmpty(actorUpdates)) {
      const updates = [];
      for (const id of Object.keys(actorUpdates)) {
        updates.push(actorUpdates[id]);
      }
      Actor.updateDocuments(updates);
    }
  }
}

/**
 * Processes Mass Edit inserted custom fields
 * @param {String} documentName
 * @param {*} updates
 * @param {*} objects
 */
export async function checkApplySpecialFields(documentName, updates, objects) {
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const object = objects[i];

    // Token Magic FX specific processing
    if (update.hasOwnProperty('tokenmagic.ddTint') && typeof TokenMagic !== 'undefined') {
      await applyDDTint(object, update['tokenmagic.ddTint']);
    }
    if (update.hasOwnProperty('tokenmagic.preset') && typeof TokenMagic !== 'undefined') {
      await applyTMFXPreset(
        object,
        update['tokenmagic.preset'],
        this?.addSubtractFields?.['tokenmagic.preset']?.method === 'subtract'
      );
    }

    // Mass Edit inserted fields
    if (documentName === 'Tile') {
      if (update.hasOwnProperty('massedit.scale')) {
        const scale = update['massedit.scale'];
        update.width = object.width * scale;
        update.height = object.height * scale;

        // 3D Support
        if (object.flags?.['levels-3d-preview']?.depth != null) {
          update['flags.levels-3d-preview.depth'] = object.flags['levels-3d-preview'].depth *= scale;
        } else if (object['flags.levels-3d-preview.depth'] != null) {
          update['flags.levels-3d-preview.depth'] = object['flags.levels-3d-preview.depth'] * scale;
        }
      }

      if (update.hasOwnProperty('massedit.texture.scale')) {
        update['texture.scaleX'] = update['massedit.texture.scale'];
        update['texture.scaleY'] = update['massedit.texture.scale'];
        delete update['massedit.texture.scale'];
      }
    }
  }
}

// Toggle checkbox if input has been detected inside it's form-group
export async function onInputChange(event) {
  if (event.target.className === 'mass-edit-control') {
    if (!event.target.checked) {
      // If the checkbox has been unchecked we may need to remove highlighting from tabs
      deselectTabs(event.target);
      return;
    }
  }

  const meChk = $(event.target).closest('.form-group').find('.mass-edit-checkbox input');
  meChk.prop('checked', true);

  // Highlight tabs if they exist
  selectTabs(meChk[0]);

  // Immediately update the placeables
  if (this?.options.massEdit && this._performOnInputChangeUpdate && this.modUpdate) this._performOnInputChangeUpdate();
}

export function selectTabs(target) {
  const tab = $(target).parent().closest('div.tab, div.matt-tab');
  if (tab.length) {
    tab
      .siblings('nav.tabs')
      .find(`[data-tab="${tab.attr('data-tab')}"]`)
      .addClass('mass-edit-tab-selected');
    selectTabs(tab[0]);
  }
}

export function deselectTabs(target) {
  const tab = $(target).parent().closest('div.tab, div.matt-tab');
  if (tab.length && tab.find('.mass-edit-checkbox input:checked').length === 0) {
    tab
      .siblings('nav.tabs')
      .find(`[data-tab="${tab.attr('data-tab')}"]`)
      .removeClass('mass-edit-tab-selected');
    deselectTabs(tab[0]);
  }
}

function getObjFormData(obj, documentName) {
  const data = foundry.utils.flattenObject(getData(obj).toObject());

  // Special processing for some placeable types
  // Necessary when form data is not directly mappable to placeable
  GeneralDataAdapter.dataToForm(documentName, obj, data);

  return data;
}

// Merge all data and determine what is common between the docs
export function getCommonDocData(docs, documentName) {
  if (!documentName) getDocumentName(docs[0]);
  const objects = docs.map((d) => getObjFormData(d, documentName));
  return getCommonData(objects);
}

/**
 *
 * @param {Document} docs
 * @param {Preset} preset
 * @param {boolean} suppressNotif
 * @returns
 */
export function pasteDataUpdate(docs, preset, suppressNotif = false, excludePosition = false, transform = null) {
  if (!docs || !docs.length) return false;

  let documentName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;

  preset = preset ?? getClipboardData(documentName);
  let applyType;

  // Special handling for Tokens/Actors
  if (!preset) {
    if (documentName === 'Token') {
      if (!preset) {
        preset = getClipboardData('TokenProto');
        applyType = 'meApplyToPrototype';
      }

      if (!preset) {
        preset = getClipboardData('Actor');
        documentName = 'Actor';
        docs = docs.filter((d) => d.actor).map((d) => d.actor);
      }
    }
  }

  if (preset) {
    if (preset.documentName !== documentName) return;

    const context = { meObjects: docs };
    if (!foundry.utils.isEmpty(preset.randomize)) context.randomizeFields = preset.randomize;
    if (!foundry.utils.isEmpty(preset.addSubtract)) context.addSubtractFields = preset.addSubtract;

    const ogData = preset.data[Math.floor(Math.random() * preset.data.length)];
    let data = foundry.utils.deepClone(ogData);
    if (transform) {
      DataTransform.apply(documentName, data, { x: 0, y: 0 }, transform);
      data = foundry.utils.mergeObject(ogData, data, { insertKeys: false, inplace: false });
    }
    if (excludePosition) {
      delete data.x;
      delete data.y;
      delete data.c;
    }

    performMassUpdate.call(context, foundry.utils.flattenObject(data), docs, preset.documentName, applyType);
    if (!suppressNotif)
      ui.notifications.info(
        localFormat('clipboard.paste', {
          document: preset.documentName,
          count: docs.length,
        })
      );

    return true;
  }
  return false;
}

// ==================================
// ========== CLIPBOARD =============
// ==================================

const CLIPBOARD = {};

export function copyToClipboard(preset, command, isPrototype) {
  CLIPBOARD[preset.documentName] = preset;

  // Special handling for Actors/Tokens
  if (preset.documentName === 'Token' && isPrototype) {
    CLIPBOARD['TokenProto'] = preset;
  } else if (preset.documentName === 'Token') {
    if (command === 'copyProto') {
      delete CLIPBOARD['Token'];
      CLIPBOARD['TokenProto'] = preset;
    }
  }

  // Also copy the fields to the game clipboard as plain text
  game.clipboard.copyPlainText(
    JSON.stringify(foundry.utils.deepClone(preset.data.length === 1 ? preset.data[0] : preset.data), null, 2)
  );

  ui.notifications.info(
    localFormat('clipboard.copy', {
      document: preset.documentName,
    })
  );
}

export function getClipboardData(documentName) {
  return CLIPBOARD[documentName];
}

export function deleteFromClipboard(documentName) {
  delete CLIPBOARD[documentName];
  if (documentName === 'Token') delete CLIPBOARD['TokenProto'];
}
