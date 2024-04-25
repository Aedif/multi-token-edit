import { pasteData, showMassEdit, showGenericForm } from './applications/multiConfig.js';

import {
  checkApplySpecialFields,
  deleteFromClipboard,
  getObjFormData,
  performMassSearch,
  performMassUpdate,
} from './applications/forms.js';
import { MassEditGenericForm } from './applications/generic/genericForm.js';
import {
  activeEffectPresetSelect,
  applyAddSubtract,
  createDocuments,
  flagCompare,
  MODULE_ID,
  resolveCreateDocumentRequest,
  SUPPORTED_HISTORY_DOCS,
  SUPPORTED_PLACEABLES,
  TagInput,
} from './scripts/utils.js';
import { GeneralDataAdapter } from './applications/dataAdapters.js';
import { applyRandomization } from './scripts/randomizer/randomizerUtils.js';
import { libWrapper } from './scripts/shim/shim.js';
import { enableUniversalSelectTool } from './scripts/selectTool.js';
import { Preset } from './scripts/presets/preset.js';
import { DEFAULT_PACK, META_INDEX_ID, PresetAPI, PresetCollection } from './scripts/presets/collection.js';
import { MassEditPresets, PresetConfig } from './scripts/presets/forms.js';
import { registerKeybinds, registerSettings } from './scripts/settings.js';
import { Picker } from './scripts/picker.js';
import { BrushMenu, activateBrush, deactivateBush, openBrushMenu } from './scripts/brush.js';

export const HISTORY = {};

// Initialize module
Hooks.once('init', () => {
  TagInput.registerHandlebarsHelper();

  registerSettings();
  registerKeybinds();
  enableUniversalSelectTool(); // Enable select tool for all layers

  // Register history related hooks
  if (game.settings.get(MODULE_ID, 'enableHistory'))
    SUPPORTED_HISTORY_DOCS.forEach((docName) => {
      Hooks.on(`preUpdate${docName}`, (doc, update, options, userId) => {
        updateHistory(doc, update, options, userId);
      });
    });

  // Register copy-paste wrappers
  libWrapper.register(
    MODULE_ID,
    'ClientKeybindings._onCopy',
    function (wrapped, ...args) {
      if (window.getSelection().toString() === '') {
        // Check if a Mass Config form is open and if so copy data from there
        const meForm = Object.values(ui.windows).find((app) => app.meObjects != null);
        if (meForm?.performMassCopy()) return true;
      }

      const result = wrapped(...args);
      // Clear Mass Edit clipboard to allows core pasting again
      if (result) deleteFromClipboard(canvas.activeLayer.constructor.documentName);
      return result;
    },
    'MIXED'
  );
  libWrapper.register(
    MODULE_ID,
    'ClientKeybindings._onPaste',
    function (wrapped, ...args) {
      if (pasteData()) return true;
      return wrapped(...args);
    },
    'MIXED'
  );

  // Register mouse wheel wrapper to scale/rotate preset previews
  libWrapper.register(
    MODULE_ID,
    'MouseManager.prototype._onWheel',
    function (wrapped, ...args) {
      const event = args[0];

      if (
        (Picker.isActive() || BrushMenu.isActive()) &&
        (event.ctrlKey || event.shiftKey || event.metaKey || event.altKey)
      ) {
        // Prevent zooming the entire browser window
        if (event.ctrlKey) event.preventDefault();

        let dy = (event.delta = event.deltaY);
        if (event.shiftKey && dy === 0) {
          dy = event.delta = event.deltaX;
        }
        if (dy === 0) return;

        if (event.altKey) Picker.addScaling(event.delta < 0 ? 0.05 : -0.05);
        else if ((event.ctrlKey || event.metaKey) && event.shiftKey) BrushMenu.iterate(event.delta >= 0);
        else if (event.ctrlKey || event.metaKey) Picker.addRotation(event.delta < 0 ? 2.5 : -2.5);
        else if (event.shiftKey) Picker.addRotation(event.delta < 0 ? 15 : -15);
        return;
      }

      const result = wrapped(...args);
      return result;
    },
    'MIXED'
  );

  // Add SceneControl option to open Mass Edit form
  if (game.settings.get(MODULE_ID, 'presetSceneControl')) {
    libWrapper.register(
      MODULE_ID,
      'SceneNavigation.prototype._getContextMenuOptions',
      function (wrapped, ...args) {
        const options = wrapped(...args);
        options.push({
          name: 'Mass Edit',
          icon: '<i class="fa-solid fa-pen-to-square"></i>',
          condition: game.user.isGM,
          callback: (li) => {
            const sceneId = li.attr('data-scene-id');
            showMassEdit(game.scenes.get(sceneId));
          },
        });
        return options;
      },
      'WRAPPER'
    );
  }

  // Intercept and prevent certain placeable drag and drop if they are hovering over the MassEditPresets form
  // passing on the placeable to it to perform preset creation.
  const dragDropHandler = function (wrapped, ...args) {
    if (MassEditPresets.objectHover || PresetConfig.objectHover) {
      this.mouseInteractionManager.cancel(...args);
      const app = Object.values(ui.windows).find(
        (x) =>
          (MassEditPresets.objectHover && x instanceof MassEditPresets) ||
          (PresetConfig.objectHover && x instanceof PresetConfig)
      );
      if (app) {
        const placeables = canvas.activeLayer.controlled.length ? [...canvas.activeLayer.controlled] : [this];
        app.dropPlaceable(placeables, ...args);
      }
      // Pass in a fake event that hopefully is enough to allow other modules to function
      this._onDragLeftCancel(...args);
    } else {
      return wrapped(...args);
    }
  };

  SUPPORTED_PLACEABLES.forEach((name) => {
    libWrapper.register(MODULE_ID, `${name}.prototype._onDragLeftDrop`, dragDropHandler, 'MIXED');
  });

  // Handle broadcasts
  // Needed to allow players to spawn Presets by delegating create document request to GMs
  game.socket?.on(`module.${MODULE_ID}`, async (message) => {
    const args = message.args;

    if (message.handlerName === 'document' && message.type === 'CREATE') {
      const isResponsibleGM = !game.users
        .filter((user) => user.isGM && (user.active || user.isActive))
        .some((other) => other.id < game.user.id);
      if (!isResponsibleGM) return;

      const documents = await createDocuments(args.documentName, args.data, args.sceneID);
      const documentIDs = documents.map((d) => d.id);

      const message = {
        handlerName: 'document',
        args: {
          requestID: args.requestID,
          sceneID: args.sceneID,
          documentName: args.documentName,
          documentIDs,
        },
        type: 'RESOLVE',
      };
      game.socket.emit(`module.${MODULE_ID}`, message);
    } else if (message.handlerName === 'document' && message.type === 'RESOLVE') {
      resolveCreateDocumentRequest(args);
    }
  });

  // 'Spotlight Omnisearch' support
  Hooks.on('spotlightOmnisearch.indexBuilt', (INDEX, promises) => {
    if (!game.user.isGM) return;
    // First turn-off preset compendium from being included in omnisearch indexing
    const old = game.settings.get('spotlight-omnisearch', 'compendiumConfig');
    game.packs
      .filter((p) => p.documentName === 'JournalEntry' && p.index.get(META_INDEX_ID))
      .forEach((p) => (old[p.collection] = false));
    game.settings.set('spotlight-omnisearch', 'compendiumConfig', old);

    // Insert preset index
    const promise = PresetCollection.buildSpotlightOmnisearchIndex(INDEX);
    promises.push(promise);
  });

  globalThis.MassEdit = {
    GeneralDataAdapter,
    MassEditGenericForm,
    showGenericForm,
    performMassUpdate,
    performMassSearch,
    showMassEdit,
    getPreset: PresetAPI.getPreset,
    getPresets: PresetAPI.getPresets,
    createPreset: PresetAPI.createPreset,
    spawnPreset: PresetAPI.spawnPreset,
    activateBrush: activateBrush,
    deactivateBrush: deactivateBush,
    openBrushMenu: openBrushMenu,
  };

  game.modules.get(MODULE_ID).api = {
    ...globalThis.MassEdit,
    applyRandomization, // Deprecated
    applyAddSubtract, // Deprecated
    checkApplySpecialFields, // Deprecated
  };
});

// Deactivate brush/picker on scene change

Hooks.on('canvasReady', () => {
  if (BrushMenu.isActive()) BrushMenu.close();
  else if (Picker.isActive()) Picker.destroy();
});

// Preset Scene Control
Hooks.on('renderSceneControls', (sceneControls, html, options) => {
  if (!game.user.isGM) return;
  if (!game.settings.get(MODULE_ID, 'presetSceneControl')) return;

  const presetControl = $(`
<li class="scene-control mass-edit-scene-control" data-control="me-presets" aria-label="Mass Edit: Presets" role="tab" data-tooltip="Mass Edit: Presets">
  <i class="fa-solid fa-books"></i>
</li>
  `);

  presetControl.on('click', () => {
    let docName = canvas.activeLayer.constructor.documentName;
    if (!SUPPORTED_PLACEABLES.includes(docName)) docName = 'ALL';

    const presetForm = Object.values(ui.windows).find((app) => app instanceof MassEditPresets);
    if (presetForm) {
      presetForm.close();
      return;
    }

    new MassEditPresets(null, null, docName, {
      left: presetControl.position().left + presetControl.width() + 40,
    }).render(true);
  });

  html.find('.control-tools').find('.scene-control').last().after(presetControl);
});

// Migrate Presets (02/11/2023)
Hooks.on('ready', async () => {
  if (!game.packs.get(PresetCollection.workingPack)) {
    game.settings.set(MODULE_ID, 'workingPack', DEFAULT_PACK);
  }

  if (!game.settings.get(MODULE_ID, 'presetsMigrated')) {
    const presets = game.settings.get(MODULE_ID, 'presets');
    if (foundry.utils.getType(presets) === 'Object' && !foundry.utils.isEmpty(presets)) {
      let newPresets = [];
      for (const documentName of Object.keys(presets)) {
        for (const name of Object.keys(presets[documentName])) {
          let oldPreset = presets[documentName][name];
          let newPreset = { id: foundry.utils.randomID() };

          newPreset.name = name;
          newPreset.documentName = documentName;
          newPreset.color =
            oldPreset['mass-edit-preset-color'] !== '#ffffff' ? oldPreset['mass-edit-preset-color'] : null;
          newPreset.order = oldPreset['mass-edit-preset-order'] ?? -1;
          newPreset.addSubtract = oldPreset['mass-edit-addSubtract'] ?? {};
          newPreset.randomize = oldPreset['mass-edit-randomize'] ?? {};

          delete oldPreset['mass-edit-preset-color'];
          delete oldPreset['mass-edit-preset-order'];
          delete oldPreset['mass-edit-addSubtract'];
          delete oldPreset['mass-edit-randomize'];
          delete oldPreset['mass-edit-keybind'];
          newPreset.data = foundry.utils.deepClone(oldPreset);

          newPresets.push(newPreset);
        }
        game.settings.set(MODULE_ID, 'docPresets', newPresets);
      }
    }

    game.settings.set(MODULE_ID, 'presetsMigrated', true);
  }

  if (!game.settings.get(MODULE_ID, 'presetsCompMigrated')) {
    const docPresets = game.settings.get(MODULE_ID, 'docPresets');
    const presets = docPresets.map((p) => new Preset(p));
    if (presets.length) PresetCollection.set(presets);
    game.settings.set(MODULE_ID, 'presetsCompMigrated', true);
  }
});

// Attach Mass Config buttons to Token and Tile HUDs

Hooks.on('renderTokenHUD', (hud, html, tokenData) => {
  if (canvas.tokens.controlled.length >= 2) {
    $(html)
      .find('.control-icon[data-action="config"]')
      .after(
        `<div class="control-icon" data-action="massConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="massConfig"]', () => {
      showMassEdit();
    });
  }
});
Hooks.on('renderTileHUD', (hud, html, tileData) => {
  const controlledTiles = canvas.background
    ? canvas.background.controlled.concat(canvas.foreground.controlled)
    : canvas.tiles.controlled;

  if (controlledTiles.length >= 2) {
    $(html)
      .find('.control-icon[data-action="underfoot"]')
      .after(
        `<div class="control-icon" data-action="massConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="massConfig"]', () => {
      showMassEdit();
    });
  }
});

//
// History Utilities
//

// Retrieve only the data that is different
function getDiffData(obj, docName, update, protoData = true) {
  const flatUpdate = foundry.utils.flattenObject(update);
  const flatObjData = getObjFormData(obj, docName, protoData);
  const diff = foundry.utils.diffObject(flatObjData, flatUpdate);

  for (const [k, v] of Object.entries(diff)) {
    // Special handling for empty/undefined data
    if ((v === '' || v == null) && (flatObjData[k] === '' || flatObjData[k] == null)) {
      // matches
      delete diff[k];
    }

    if (k.startsWith('flags.'))
      if (flagCompare(flatObjData, k, v)) {
        delete diff[k];
      }

    if (docName === 'Token' && ['light.angle', 'rotation'].includes(k)) {
      if (v % 360 === flatObjData[k] % 360) {
        delete diff[k];
      }
    }
  }

  return diff;
}

function updateHistory(obj, update, options, userId) {
  if (game.user.id !== userId || !game.settings.get(MODULE_ID, 'enableHistory')) return;

  const historyItem = { timestamp: new Date().toLocaleTimeString(), ctrl: {} };
  ['mass-edit-randomize', 'mass-edit-addSubtract'].forEach((ctrl) => {
    if (ctrl in options) {
      historyItem.ctrl[ctrl] = options[ctrl][0];
    }
  });
  let cUpdate = foundry.utils.deepClone(update);
  delete cUpdate._id;

  let docName = obj.document ? obj.document.documentName : obj.documentName;
  if (docName === 'Actor') {
    if (cUpdate.prototypeToken || cUpdate.token) {
      saveHistory(
        obj.prototypeToken ?? obj.token,
        cUpdate.prototypeToken ?? cUpdate.token,
        foundry.utils.deepClone(historyItem),
        update._id,
        'Token'
      );
    }
  }

  saveHistory(obj, cUpdate, historyItem, update._id, docName);
}

function saveHistory(obj, update, historyItem, _id, docName) {
  if (!obj || foundry.utils.isEmpty(update)) return;

  historyItem.update = foundry.utils.flattenObject(update);
  historyItem.diff = getDiffData(obj, docName, update);
  historyItem._id = _id;

  const maxLength = game.settings.get(MODULE_ID, 'historyMaxLength') ?? 0;
  const docHistory = HISTORY[docName] ?? [];
  docHistory.push(historyItem);

  if (docHistory.length > maxLength) {
    docHistory.splice(0, 1);
  }

  HISTORY[docName] = docHistory;
}

Hooks.on('renderActiveEffectConfig', (app) => {
  const el = $(app.form).find('.effects-header .key');
  if (el.length) {
    const me = $('<i title="Apply \'Mass Edit\' preset" style="font-size:smaller;color:brown;"> <a>[ME]</a></i>');
    me.on('click', () => activeEffectPresetSelect(app));
    el.append(me);
  }
});
