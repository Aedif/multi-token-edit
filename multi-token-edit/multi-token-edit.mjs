import {
  getSelected,
  pasteData,
  showMassActorForm,
  showMassEdit,
  showMassSelect,
  showGenericForm,
} from './applications/multiConfig.js';
import CSSEdit, { STYLES } from './applications/cssEdit.js';
import { MassEditPresets, Preset, PresetAPI, PresetCollection } from './applications/presets.js';
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
  getDocumentName,
  resolveCreateDocumentRequest,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_HISTORY_DOCS,
  SUPPORTED_PLACEABLES,
} from './scripts/utils.js';
import { GeneralDataAdapter } from './applications/dataAdapters.js';
import { applyRandomization } from './scripts/randomizer/randomizerUtils.js';
import { IS_PRIVATE } from './scripts/randomizer/randomizerForm.js';
import { libWrapper } from './scripts/shim/shim.js';

export const HISTORY = {};

// Initialize module
Hooks.once('init', () => {
  // Register Settings
  game.settings.register('multi-token-edit', 'cssStyle', {
    scope: 'world',
    config: false,
    type: String,
    default: 'Default',
  });

  game.settings.register('multi-token-edit', 'cssCustom', {
    scope: 'world',
    config: false,
    type: String,
    default: STYLES.Default,
  });

  game.settings.registerMenu('multi-token-edit', 'cssEdit', {
    name: game.i18n.localize('multi-token-edit.settings.cssEdit.name'),
    hint: game.i18n.localize('multi-token-edit.settings.cssEdit.hint'),
    label: '',
    scope: 'world',
    icon: 'fas fa-cog',
    type: CSSEdit,
    restricted: true,
  });

  game.settings.register('multi-token-edit', 'singleDocDefaultConfig', {
    name: game.i18n.localize('multi-token-edit.settings.singleDocDefaultConfig.name'),
    hint: game.i18n.localize('multi-token-edit.settings.singleDocDefaultConfig.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'rangeToTextbox', {
    name: game.i18n.localize('multi-token-edit.settings.rangeToTextbox.name'),
    hint: game.i18n.localize('multi-token-edit.settings.rangeToTextbox.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // Deprecated
  game.settings.register('multi-token-edit', 'presets', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  // ===============
  // Preset Settings

  game.settings.register('multi-token-edit', 'workingPack', {
    scope: 'world',
    config: false,
    type: String,
    default: 'world.mass-edit-presets-main',
    onChange: (val) => {
      PresetCollection.workingPack = val;
    },
  });
  PresetCollection.workingPack = game.settings.get('multi-token-edit', 'workingPack');

  game.settings.register('multi-token-edit', 'docPresets', {
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  });

  // Temp setting needed for migration
  game.settings.register('multi-token-edit', 'presetsMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });

  // Temp setting needed for migration
  game.settings.register('multi-token-edit', 'presetsCompMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'presetDocLock', {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  game.settings.register('multi-token-edit', 'presetLayerSwitch', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register('multi-token-edit', 'presetExtComp', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register('multi-token-edit', 'presetSortMode', {
    scope: 'world',
    config: false,
    type: String,
    default: 'manual',
  });

  game.settings.register('multi-token-edit', 'presetSceneControl', {
    name: 'Scene Controls: Preset Button',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      ui.controls.render();
    },
  });

  // end of Preset Settings
  // ======================

  game.settings.register('multi-token-edit', 'pinnedFields', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register('multi-token-edit', 'customControls', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  // Disable until duplicate flag value bug is fixed
  // game.settings.register('multi-token-edit', 'enableFlagsTab', {
  //   name: game.i18n.localize('multi-token-edit.settings.enableFlagsTab.name'),
  //   hint: game.i18n.localize('multi-token-edit.settings.enableFlagsTab.hint'),
  //   scope: 'world',
  //   config: true,
  //   type: Boolean,
  //   default: true,
  // });

  game.settings.register('multi-token-edit', 'enableHistory', {
    name: game.i18n.localize('multi-token-edit.settings.enableHistory.name'),
    hint: game.i18n.localize('multi-token-edit.settings.enableHistory.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'historyMaxLength', {
    name: game.i18n.localize('multi-token-edit.settings.historyMaxLength.name'),
    hint: game.i18n.localize('multi-token-edit.settings.historyMaxLength.hint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 10,
  });

  if (IS_PRIVATE) {
    game.settings.register('multi-token-edit', 'autoSnap', {
      name: game.i18n.localize('multi-token-edit.settings.autoSnap.name'),
      hint: game.i18n.localize('multi-token-edit.settings.autoSnap.hint'),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  game.settings.register('multi-token-edit', 'panToSearch', {
    name: game.i18n.localize('multi-token-edit.settings.panToSearch.name'),
    hint: game.i18n.localize('multi-token-edit.settings.panToSearch.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  if (game.modules.get('tokenmagic')?.active) {
    game.settings.register('multi-token-edit', 'tmfxFieldsEnable', {
      name: game.i18n.localize('multi-token-edit.settings.tmfxFieldsEnable.name'),
      hint: game.i18n.localize('multi-token-edit.settings.tmfxFieldsEnable.hint'),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  // Register history related hooks
  if (game.settings.get('multi-token-edit', 'enableHistory'))
    SUPPORTED_HISTORY_DOCS.forEach((docName) => {
      Hooks.on(`preUpdate${docName}`, (doc, update, options, userId) => {
        updateHistory(doc, update, options, userId);
      });
    });

  game.keybindings.register('multi-token-edit', 'editKey', {
    name: game.i18n.localize('multi-token-edit.keybindings.editKey.name'),
    hint: game.i18n.localize('multi-token-edit.keybindings.editKey.hint'),
    editable: [
      {
        key: 'KeyE',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      showMassEdit();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'selectKey', {
    name: game.i18n.localize('multi-token-edit.keybindings.selectKey.name'),
    hint: game.i18n.localize('multi-token-edit.keybindings.selectKey.hint'),
    editable: [
      {
        key: 'KeyF',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      showMassSelect();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'presetApply', {
    name: game.i18n.localize('multi-token-edit.keybindings.presetApply.name'),
    hint: game.i18n.localize('multi-token-edit.keybindings.presetApply.hint'),
    editable: [
      {
        key: 'KeyX',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      const app = Object.values(ui.windows).find((w) => w instanceof MassEditPresets);
      if (app) {
        app.close(true);
        return;
      }

      // Special logic for populating Active Effect
      const aeConfig = Object.values(ui.windows).find((x) => x instanceof ActiveEffectConfig);
      if (aeConfig) {
        activeEffectPresetSelect(aeConfig);
        return;
      }

      const docName = canvas.activeLayer.constructor.documentName;
      if (!SUPPORTED_PLACEABLES.includes(docName)) return;

      new MassEditPresets(null, null, docName).render(true);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'genericFormKey', {
    name: game.i18n.localize('multi-token-edit.keybindings.genericForm.name'),
    hint: game.i18n.localize('multi-token-edit.keybindings.genericForm.hint'),
    editable: [
      {
        key: 'KeyR',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      let [target, selected] = getSelected(null, false);
      if (!target) return;
      const docName = getDocumentName(target);
      if (![...SUPPORTED_COLLECTIONS, 'Token'].includes(docName)) return;

      if (docName === 'Token') {
        showMassActorForm(selected, { massEdit: true });
      } else {
        new MassEditGenericForm(selected, { massEdit: true, documentName: docName }).render(true);
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  // Register copy-paste wrappers
  libWrapper.register(
    'multi-token-edit',
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
    'multi-token-edit',
    'ClientKeybindings._onPaste',
    function (wrapped, ...args) {
      if (pasteData()) return true;
      return wrapped(...args);
    },
    'MIXED'
  );

  // Intercept and prevent certain placeable drag and drop if they are hovering over the MassEditPresets form
  // passing on the placeable to it to perform preset creation.
  const dragDropHandler = function (wrapped, ...args) {
    if (MassEditPresets.objectHover) {
      this.mouseInteractionManager.cancel(...args);
      const app = Object.values(ui.windows).find((x) => x instanceof MassEditPresets);
      if (app) {
        const placeables = canvas.activeLayer.controlled.length
          ? [...canvas.activeLayer.controlled]
          : this;
        app.presetFromPlaceable(placeables, ...args);
      }
      // Pass in a fake event that hopefully is enough to allow other modules to function
      this._onDragLeftCancel(...args);
    } else {
      return wrapped(...args);
    }
  };

  SUPPORTED_PLACEABLES.forEach((name) => {
    libWrapper.register(
      'multi-token-edit',
      `${name}.prototype._onDragLeftDrop`,
      dragDropHandler,
      'MIXED'
    );
  });

  // Handle broadcasts
  // Needed to allow players to spawn Presets by delegating create document request to GMs
  game.socket?.on(`module.multi-token-edit`, async (message) => {
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
      game.socket.emit(`module.multi-token-edit`, message);
    } else if (message.handlerName === 'document' && message.type === 'RESOLVE') {
      resolveCreateDocumentRequest(args);
    }
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
  };

  game.modules.get('multi-token-edit').api = {
    ...globalThis.MassEdit,
    applyRandomization, // Deprecated
    applyAddSubtract, // Deprecated
    checkApplySpecialFields, // Deprecated
  };
});

// Preset Scene Control
Hooks.on('renderSceneControls', (sceneControls, html, options) => {
  if (!game.user.isGM) return;
  if (!game.settings.get('multi-token-edit', 'presetSceneControl')) return;

  const presetControl = $(`
<li class="scene-control mass-edit-scene-control" data-control="me-presets" aria-label="Mass Edit: Presets" role="tab" data-tooltip="Mass Edit: Presets">
<i class="fa-solid fa-books"></i>
</li>
  `);

  presetControl.on('click', () => {
    let docName = canvas.activeLayer.constructor.documentName;
    if (!SUPPORTED_PLACEABLES.includes(docName)) docName === 'ALL';

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
  if (!game.settings.get('multi-token-edit', 'presetsMigrated')) {
    const presets = game.settings.get('multi-token-edit', 'presets');
    if (getType(presets) === 'Object' && !isEmpty(presets)) {
      let newPresets = [];
      for (const documentName of Object.keys(presets)) {
        for (const name of Object.keys(presets[documentName])) {
          let oldPreset = presets[documentName][name];
          let newPreset = { id: randomID() };

          newPreset.name = name;
          newPreset.documentName = documentName;
          newPreset.color =
            oldPreset['mass-edit-preset-color'] !== '#ffffff'
              ? oldPreset['mass-edit-preset-color']
              : null;
          newPreset.order = oldPreset['mass-edit-preset-order'] ?? -1;
          newPreset.addSubtract = oldPreset['mass-edit-addSubtract'] ?? {};
          newPreset.randomize = oldPreset['mass-edit-randomize'] ?? {};

          delete oldPreset['mass-edit-preset-color'];
          delete oldPreset['mass-edit-preset-order'];
          delete oldPreset['mass-edit-addSubtract'];
          delete oldPreset['mass-edit-randomize'];
          delete oldPreset['mass-edit-keybind'];
          newPreset.data = deepClone(oldPreset);

          newPresets.push(newPreset);
        }
        game.settings.set('multi-token-edit', 'docPresets', newPresets);
      }
    }

    game.settings.set('multi-token-edit', 'presetsMigrated', true);
  }

  if (!game.settings.get('multi-token-edit', 'presetsCompMigrated')) {
    const docPresets = game.settings.get('multi-token-edit', 'docPresets');
    const presets = docPresets.map((p) => new Preset(p));
    if (presets.length) PresetCollection.set(presets);
    game.settings.set('multi-token-edit', 'presetsCompMigrated', true);
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
  const flatUpdate = flattenObject(update);
  const flatObjData = getObjFormData(obj, docName, protoData);
  const diff = diffObject(flatObjData, flatUpdate);

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
  if (game.user.id !== userId || !game.settings.get('multi-token-edit', 'enableHistory')) return;

  const historyItem = { timestamp: new Date().toLocaleTimeString(), ctrl: {} };
  ['mass-edit-randomize', 'mass-edit-addSubtract'].forEach((ctrl) => {
    if (ctrl in options) {
      historyItem.ctrl[ctrl] = options[ctrl][0];
    }
  });
  let cUpdate = deepClone(update);
  delete cUpdate._id;

  let docName = obj.document ? obj.document.documentName : obj.documentName;
  if (docName === 'Actor') {
    if (cUpdate.prototypeToken || cUpdate.token) {
      saveHistory(
        obj.prototypeToken ?? obj.token,
        cUpdate.prototypeToken ?? cUpdate.token,
        deepClone(historyItem),
        update._id,
        'Token'
      );
    }
  }

  saveHistory(obj, cUpdate, historyItem, update._id, docName);
}

function saveHistory(obj, update, historyItem, _id, docName) {
  if (!obj || isEmpty(update)) return;

  historyItem.update = flattenObject(update);
  historyItem.diff = getDiffData(obj, docName, update);
  historyItem._id = _id;

  const maxLength = game.settings.get('multi-token-edit', 'historyMaxLength') ?? 0;
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
    const me = $(
      '<i title="Apply \'Mass Edit\' preset" style="font-size:smaller;color:brown;"> <a>[ME]</a></i>'
    );
    me.on('click', () => activeEffectPresetSelect(app));
    el.append(me);
  }
});