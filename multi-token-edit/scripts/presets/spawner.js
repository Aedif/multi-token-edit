import { checkApplySpecialFields } from '../../applications/formUtils.js';
import { showGenericForm } from '../../applications/multiConfig.js';
import { MODULE_ID, PIVOTS } from '../constants.js';
import { DataTransformer } from '../data/transformer.js';
import { PreviewTransformer } from '../previewTransformer.js';
import { applyRandomization } from '../randomizer/randomizerUtils.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { createDocuments, executeScript } from '../utils.js';
import { PresetAPI } from './collection.js';
import { Preset } from './preset.js';
import {
  applyTaggerTagRules,
  getPivotOffset,
  getPresetDataBounds,
  getTransformToOrigin,
  mergePresetDataToDefaultDoc,
} from './utils.js';

export class Spawner {
  /**
   * Spawn a preset on the scene (uuid, name or preset itself are required).
   * By default the current mouse position is used.
   * @param {object} [options={}]
   * @param {Preset} [options.preset]                    Preset
   * @param {String} [options.uuid]                      Preset UUID
   * @param {String} [options.name]                      Preset name
   * @param {String} [options.type]                      Preset type ("Token", "Tile", etc)
   * @param {String|Array[String]|Object} [options.tags] Preset tags, See PresetAPI.getPreset
   * @param {Boolean} [options.random]                   If a unique preset could not be found, a random one will be chosen from the matched list
   * @param {Number} [options.x]                         Spawn canvas x coordinate (mouse position used if x or y are null)
   * @param {Number} [options.y]                         Spawn canvas y coordinate (mouse position used if x or y are null)
   * @param {Number} [options.z]                         Spawn canvas z coordinate (3D Canvas)
   * @param {Boolean} [options.snapToGrid]               If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]                   If 'true' preset will be spawned hidden.
   * @param {Boolean} [options.layerSwitch]              If 'true' the layer of the spawned preset will be activated.
   * @param {Boolean} [options.scaleToGrid]              If 'true' Tiles, Drawings, and Walls will be scaled relative to grid size.
   * @param {Boolean} [options.modifyPrompt]             If 'true' a field modification prompt will be shown if configured via `Preset Edit > Modify` form
   * @param {Boolean} [options.preview]                  If 'true' a preview will be shown allowing spawn position to be picked
   * @returns {Array[Document]}
   */
  static async spawnPreset({
    uuid,
    preset,
    name,
    type,
    folder,
    tags,
    random = false,
    x,
    y,
    z,
    preview = false,
    previewRestrictedDocuments = null,
    sceneId = canvas.scene.id,
    snapToGrid = true,
    hidden = false,
    layerSwitch = false,
    scaleToGrid = false,
    modifyPrompt = true,
    pivot = PIVOTS.TOP_LEFT,
    transform = {},
    previewOnly = false,
    flags,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(uuid || preset || name || type || folder || tags))
      throw Error('ID, Name, Folder, Tags, or Preset is needed to spawn it.');
    if (!preview && ((x == null && y != null) || (x != null && y == null)))
      throw Error('Need both X and Y coordinates to spawn a preset.');

    if (preset) await preset.load();
    preset = preset ?? (await PresetAPI.getPreset({ uuid, name, type, folder, tags, random }));
    if (!preset) throw Error(`No preset could be found matching: { uuid: "${uuid}", name: "${name}", type: "${type}"}`);

    let presetData = foundry.utils.deepClone(preset.data);

    // Instead of using the entire data group use only one random one
    if (preset.spawnRandom && presetData.length) {
      presetData = [presetData[Math.floor(Math.random() * presetData.length)]];
    }

    // Display prompt to modify data if needed
    if (modifyPrompt && preset.modifyOnSpawn?.length) {
      presetData = await Spawner.modifySpawnData(presetData, preset.modifyOnSpawn);
      // presetData being returned as null means that the modify field form has been canceled
      // in which case we should cancel spawning as well
      if (presetData == null) return;
    }

    // Populate preset data with default placeable data
    presetData = presetData.map((data) => {
      return mergePresetDataToDefaultDoc(preset, data);
    });
    presetData = presetData.map((d) => foundry.utils.flattenObject(d));
    if (!foundry.utils.isEmpty(preset.randomize)) await applyRandomization(presetData, null, preset.randomize); // Randomize data if needed
    await checkApplySpecialFields(preset.documentName, presetData, presetData); // Apply Special fields (TMFX)
    presetData = presetData.map((d) => foundry.utils.expandObject(d));

    let presetAttached = foundry.utils.deepClone(preset.attached);

    // Now that data is ready, execute the pre-spawn script to allow user modifications
    if (preset.preSpawnScript) {
      await executeScript(preset.preSpawnScript, { data: presetData, attached: presetAttached });
    }

    // Lets sort the preset data as well as any attached placeable data into document groups
    // documentName -> data array
    const docToData = new Map();
    docToData.set(preset.documentName, presetData);
    if (presetAttached) {
      for (const attached of presetAttached) {
        if (!docToData.get(attached.documentName)) docToData.set(attached.documentName, []);
        docToData.get(attached.documentName).push(attached.data);
      }
    }

    // Assign ownership to the user who triggered the spawn call, hide, apply flags, and re-generate links
    Spawner._autoModifyData(docToData, hidden, flags, preset.preserveLinks, sceneId);

    // =======================
    // Spawn position handling
    // =======================

    if (!preview) {
      const pos = Spawner._determineSpawnPosition(x, y, z, preset.documentName, snapToGrid);
      ({ x, y, z } = pos);
    }

    // Scale data relative to grid size
    if (scaleToGrid) {
      let scale = 1.0;

      if (Scenescape.active) {
        const size = preset.scenescapeSizeOverride();
        if (size) scale = ((100 / 6) * size) / getPresetDataBounds(docToData).height;

        if (!preview) {
          const params = Scenescape.getParallaxParameters({ x, y });
          scale *= params.scale;
        }
      } else {
        scale = canvas.grid.size / (preset.gridSize || 100);
      }

      DataTransformer.applyToMap(docToData, { x: 0, y: 0 }, { scale });
    }

    // Handle positioning of data around the spawn location
    if (!preview) {
      // Transform data to spawn position
      const posTransform = getTransformToOrigin(docToData);
      posTransform.x += x;
      posTransform.y += y;

      // 3D Support
      if (game.Levels3DPreview?._active) {
        if (z == null) posTransform.z = 0;
        else posTransform.z += z;
      } else delete posTransform.z;

      let offset = getPivotOffset(Scenescape.active ? PIVOTS.BOTTOM : pivot, docToData);
      posTransform.x -= offset.x;
      posTransform.y -= offset.y;

      DataTransformer.applyToMap(docToData, { x: 0, y: 0 }, posTransform);
    } else {
      // Display preview of the preset
      const coords = await new Promise(async (resolve) => {
        PreviewTransformer.activate(resolve, {
          docToData,
          snap: snapToGrid,
          restrict: previewRestrictedDocuments,
          pivot,
          preview: true,
          crosshair: !previewOnly,
          ...transform,
          spawner: true,
        });
      });
      if (coords == null) return [];
    }

    // ================================
    // end of - Spawn position handling
    // ================================

    // Switch active layer to the preset's base placeable type
    if (layerSwitch) {
      if (game.user.isGM || ['Token', 'MeasuredTemplate', 'Note'].includes(preset.documentName))
        canvas.getLayerByEmbeddedName(preset.documentName)?.activate();
    }

    // ================
    // Create Documents
    // ================
    const allDocuments = [];

    for (const [documentName, dataArr] of docToData.entries()) {
      const documents = await createDocuments(documentName, dataArr, sceneId, { spawnPreset: true });
      documents.forEach((d) => allDocuments.push(d));
    }

    // Execute post spawn script/function
    if (preset.postSpawnScript) {
      await executeScript(preset.postSpawnScript, {
        documents: allDocuments,
        objects: allDocuments.map((d) => d.object).filter(Boolean),
      });
    }
    await preset.callPostSpawnHooks({
      documents: allDocuments,
      objects: allDocuments.map((d) => d.object).filter(Boolean),
    });

    return allDocuments;
  }

  static _regenerateLinks(docToData) {
    const links = new Map();

    const newLinkId = function (oldId) {
      let id = links.get(oldId);
      if (!id) {
        if (oldId.startsWith('LinkTokenBehavior - ')) {
          id = 'LinkTokenBehavior - ' + foundry.utils.randomID(8);
        } else {
          id = foundry.utils.randomID();
        }
        links.set(oldId, id);
      }
      return id;
    };

    docToData.forEach((data) => {
      data.forEach((d) => {
        d.flags?.[MODULE_ID]?.links?.forEach((l) => {
          l.id = newLinkId(l.id);
        });
        d.behaviors?.forEach((b) => {
          if (b.system?.linkId) b.system.linkId = newLinkId(b.system.linkId);
        });
      });
    });
  }

  static _determineSpawnPosition(x, y, z, documentName, snapToGrid) {
    if (x == null || y == null) {
      if (game.Levels3DPreview?._active) {
        const pos3d = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
        x = pos3d.x;
        y = pos3d.y;
        z = pos3d.z;
      } else {
        x = canvas.mousePosition.x;
        y = canvas.mousePosition.y;

        if (documentName === 'Token' || documentName === 'Tile') {
          x -= canvas.dimensions.size / 2;
          y -= canvas.dimensions.size / 2;
        }
      }
    }

    if (!Scenescape.active && snapToGrid && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
      let pos = canvas.getLayerByEmbeddedName(documentName).getSnappedPoint({ x, y });
      x = pos.x;
      y = pos.y;
    }
    return { x, y, z };
  }

  /**
   * Assign ownership to the user who triggered the spawn, hide and apply flags if necessary
   * @param {*} docToData
   */
  static _autoModifyData(docToData, hidden, flags, preserveLinks, sceneId) {
    hidden = hidden || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);

    docToData.forEach((dataArr, documentName) => {
      dataArr.forEach((data) => {
        // Assign ownership for Drawings and MeasuredTemplates
        if (['Drawing', 'MeasuredTemplate'].includes(documentName)) {
          if (documentName === 'Drawing') data.author = game.user.id;
          else if (documentName === 'MeasuredTemplate') data.user = game.user.id;
        }

        // Hide
        if (hidden) data.hidden = true;

        // Apply flags
        if (flags) data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags);

        // Apply Tagger rules for Spawn Preset behaviors
        if (documentName === 'Region' && data.behaviors) {
          data.behaviors.forEach((b) => {
            if (b.system?.destinationTags?.length)
              b.system.destinationTags = applyTaggerTagRules(b.system.destinationTags);
          });
        }

        // TODO: REMOVE once Foundry implements bug fix for null flag override
        if (documentName === 'Token' && data.flags?.['token-attacher']?.attached === null) {
          delete data.flags['token-attacher'].attached;
        }
      });
    });

    // We need to make sure that newly spawned tiles are displayed above currently places ones
    if (docToData.get('Tile')) {
      const maxSort = Math.max(0, ...game.scenes.get(sceneId).tiles.map((d) => d.sort)) + 1;
      docToData
        .get('Tile')
        .sort((t1, t2) => (t1.sort ?? 0) - (t2.sort ?? 0))
        .forEach((d, i) => (d.sort = maxSort + i));
    }

    // Regenerate Linker links to ensure uniqueness on the spawned in scene
    if (!preserveLinks) Spawner._regenerateLinks(docToData);
  }

  /**
   * Opens a GenericMassEdit form to modify specific fields within the provided data
   * @param {Object} data            data to be modified
   * @param {Array[String]} toModify fields within data to be modified
   * @returns modified data or null if form was canceled
   */
  static async modifySpawnData(data, toModify) {
    const fields = {};
    const flatData = foundry.utils.flattenObject(data);
    for (const field of toModify) {
      if (field in flatData) {
        if (flatData[field] == null) fields[field] = '';
        else fields[field] = flatData[field];
      }
    }

    if (!foundry.utils.isEmpty(fields)) {
      await new Promise((resolve) => {
        showGenericForm(fields, 'PresetFieldModify', {
          callback: (modified) => {
            if (foundry.utils.isEmpty(modified)) {
              if (modified == null) data = null;
              resolve();
              return;
            }

            for (const [k, v] of Object.entries(modified)) {
              flatData[k] = v;
            }

            const tmpData = foundry.utils.expandObject(flatData);

            const reorganizedData = [];
            for (let i = 0; i < data.length; i++) {
              reorganizedData.push(tmpData[i]);
            }
            data = reorganizedData;
            resolve();
          },
          simplified: true,
          noTabs: true,
        });
      });
    }

    return data;
  }
}
