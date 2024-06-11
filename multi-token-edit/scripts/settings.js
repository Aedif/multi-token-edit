import CSSEdit, { STYLES } from '../applications/cssEdit.js';
import { MassEditGenericForm } from '../applications/generic/genericForm.js';
import {
  getSelected,
  pasteData,
  showMassActorForm,
  showMassEdit,
  showMassSelect,
} from '../applications/multiConfig.js';
import { editPreviewPlaceables } from './picker.js';
import { PresetCollection } from './presets/collection.js';
import { MassEditPresets } from './presets/forms.js';
import {
  MODULE_ID,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_PLACEABLES,
  activeEffectPresetSelect,
  getDocumentName,
  localize,
} from './utils.js';

export function registerSettings() {
  // Register Settings
  game.settings.register(MODULE_ID, 'cssStyle', {
    scope: 'world',
    config: false,
    type: String,
    default: 'Solid Background',
  });

  game.settings.register(MODULE_ID, 'cssCustom', {
    scope: 'world',
    config: false,
    type: String,
    default: STYLES.Default,
  });

  game.settings.registerMenu(MODULE_ID, 'cssEdit', {
    name: localize('settings.cssEdit.name'),
    hint: localize('settings.cssEdit.hint'),
    label: '',
    scope: 'world',
    icon: 'fas fa-cog',
    type: CSSEdit,
    restricted: true,
  });

  game.settings.register(MODULE_ID, 'singleDocDefaultConfig', {
    name: localize('settings.singleDocDefaultConfig.name'),
    hint: localize('settings.singleDocDefaultConfig.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, 'rangeToTextbox', {
    name: localize('settings.rangeToTextbox.name'),
    hint: localize('settings.rangeToTextbox.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, 'indexer', {
    scope: 'world',
    config: false,
    type: Object,
    default: {
      indexDirs: [
        { target: 'modules', source: 'data' },
        { target: 'sounds', source: 'public' },
      ],
      cacheDir: { target: '', source: 'data' },
      overrideTags: false,
      ignoreExternal: false,
      fileFilters: ['Thumb', '-thumb', 'Thumbnail', 'thumbnail'],
      folderFilters: ['Thumb', 'thumb'],
    },
  });

  // ===============
  // Preset Settings

  game.settings.register(MODULE_ID, 'workingPack', {
    scope: 'world',
    config: false,
    type: String,
    default: 'world.mass-edit-presets-main',
    onChange: (val) => {
      PresetCollection.workingPack = val;
    },
  });
  PresetCollection.workingPack = game.settings.get(MODULE_ID, 'workingPack');

  game.settings.register(MODULE_ID, 'docPresets', {
    scope: 'world',
    config: false,
    type: Array,
    default: [],
  });

  // Temp setting needed for migration
  game.settings.register(MODULE_ID, 'presetsMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });

  // Temp setting needed for migration
  game.settings.register(MODULE_ID, 'presetsCompMigrated', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, 'presetDocLock', {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, 'presetLayerSwitch', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'presetExtComp', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'presetVirtualDir', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'presetScaling', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'presetSortMode', {
    scope: 'world',
    config: false,
    type: String,
    default: 'manual',
  });

  // p = preset only
  // pf = preset & folder
  game.settings.register(MODULE_ID, 'presetSearchMode', {
    scope: 'world',
    config: false,
    type: String,
    default: 'pf',
  });

  game.settings.register(MODULE_ID, 'presetSceneControl', {
    name: 'Scene Controls: Preset Button',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      ui.controls.render();
    },
  });

  game.settings.register(MODULE_ID, 'presetFavorites', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  // end of Preset Settings
  // ======================

  game.settings.register(MODULE_ID, 'pinnedFields', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, 'customControls', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  // Disable until duplicate flag value bug is fixed
  // game.settings.register(MODULE_ID, 'enableFlagsTab', {
  //   name: localize('settings.enableFlagsTab.name'),
  //   hint: localize('settings.enableFlagsTab.hint'),
  //   scope: 'world',
  //   config: true,
  //   type: Boolean,
  //   default: true,
  // });

  game.settings.register(MODULE_ID, 'autoSnap', {
    name: localize('settings.autoSnap.name'),
    hint: localize('settings.autoSnap.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, 'panToSearch', {
    name: localize('settings.panToSearch.name'),
    hint: localize('settings.panToSearch.hint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  if (game.modules.get('tokenmagic')?.active) {
    game.settings.register(MODULE_ID, 'tmfxFieldsEnable', {
      name: localize('settings.tmfxFieldsEnable.name'),
      hint: localize('settings.tmfxFieldsEnable.hint'),
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  }

  game.settings.register(MODULE_ID, 'brush', {
    scope: 'world',
    config: false,
    type: Object,
    default: {
      scale: [1, 1],
      rotation: [0, 0],
      random: true,
      group: false,
      spawner: true,
      eraser: false,
      lock: false,
      snap: false,
      scaleToGrid: true,
    },
  });
}

export function registerKeybinds() {
  game.keybindings.register(MODULE_ID, 'placeablePreviewEdit', {
    name: 'Select Edit Placeables',
    hint: '',
    editable: [
      {
        key: 'KeyD',
        modifiers: ['Shift'],
      },
    ],
    onDown: editPreviewPlaceables,
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'editKey', {
    name: localize('keybindings.editKey.name'),
    hint: localize('keybindings.editKey.hint'),
    editable: [
      {
        key: 'KeyE',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      const app = Object.values(ui.windows).find((w) => w.meObjects);
      if (app) {
        app.close();
        return;
      }
      showMassEdit();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'copyKey', {
    name: 'Copy',
    hint: '',
    editable: [
      {
        key: 'KeyC',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      // Check if a Mass Config form is open and if so copy data from there
      if (window.getSelection().toString() === '') {
        Object.values(ui.windows)
          .find((app) => app.meObjects != null)
          ?.performMassCopy();
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'pasteKey', {
    name: 'Paste',
    hint: '',
    editable: [
      {
        key: 'KeyV',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      pasteData();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'selectKey', {
    name: localize('keybindings.selectKey.name'),
    hint: localize('keybindings.selectKey.hint'),
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

  game.keybindings.register(MODULE_ID, 'presetApply', {
    name: localize('keybindings.presetApply.name'),
    hint: localize('keybindings.presetApply.hint'),
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

      const documentName = canvas.activeLayer.constructor.documentName;
      if (!SUPPORTED_PLACEABLES.includes(documentName)) return;
      new MassEditPresets(null, null, documentName).render(true);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'presetApplyScene', {
    name: localize('keybindings.presetApplyScene.name'),
    hint: localize('keybindings.presetApplyScene.hint'),
    editable: [],
    onDown: () => {
      const app = Object.values(ui.windows).find((w) => w instanceof MassEditPresets);
      if (app) {
        app.close(true);
        return;
      }
      new MassEditPresets(null, null, 'Scene').render(true);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'genericFormKey', {
    name: localize('keybindings.genericForm.name'),
    hint: localize('keybindings.genericForm.hint'),
    editable: [
      {
        key: 'KeyR',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      let [target, selected] = getSelected(null, false);
      if (!target) return;
      const documentName = getDocumentName(target);
      if (![...SUPPORTED_COLLECTIONS, 'Token'].includes(documentName)) return;

      if (documentName === 'Token') {
        showMassActorForm(selected, { massEdit: true });
      } else {
        new MassEditGenericForm(selected, { massEdit: true, documentName }).render(true);
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
}
