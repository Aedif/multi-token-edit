import CSSEdit, { STYLES } from '../applications/cssEdit.js';
import { copyToClipboard } from '../applications/formUtils.js';
import { MassEditGenericForm } from '../applications/generic/genericForm.js';
import {
  getMassEditForm,
  getSelected,
  pasteData,
  showMassActorForm,
  showMassEdit,
  showMassSelect,
} from '../applications/multiConfig.js';
import { MODULE_ID, SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES } from './constants.js';
import { LinkerAPI } from './linker/linker.js';
import { editPreviewPlaceables, Picker } from './picker.js';
import { PresetCollection } from './presets/collection.js';
import { MassEditPresets } from './presets/forms.js';
import { Preset } from './presets/preset.js';
import { enablePixelPerfectTileSelect } from './tools/selectTool.js';
import { activeEffectPresetSelect, getDocumentName, localize } from './utils.js';

export function registerSettings() {
  // Register Settings
  game.settings.register(MODULE_ID, 'cssStyle', {
    scope: 'world',
    config: false,
    type: String,
    default: 'Default',
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

  game.settings.register(MODULE_ID, 'pixelPerfect', {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: enablePixelPerfectTileSelect,
  });
  enablePixelPerfectTileSelect();

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

  game.settings.register(MODULE_ID, 'preSelectAutoApply', {
    name: 'Pre-Select Auto-apply',
    hint: 'Should the auto-apply button be ticked by default on Mass Edit forms.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
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
  game.keybindings.register(MODULE_ID, 'linker', {
    name: localize('keybindings.linkerMenu.name'),
    hint: localize('keybindings.linkerMenu.hint'),
    editable: [
      {
        key: 'KeyQ',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      LinkerAPI.openMenu();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'smartLink', {
    name: 'Smart Link',
    hint: 'Initiate smart document linking.',
    editable: [
      {
        key: 'KeyL',
        modifiers: [],
      },
    ],
    onDown: () => {
      LinkerAPI.smartLink({ multiLayer: !Boolean(LinkerAPI._getSelected().length) });
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'smartUnlink', {
    name: 'Smart Un-Link',
    hint: 'Initiate smart document un-linking.',
    editable: [
      {
        key: 'KeyU',
        modifiers: [],
      },
    ],
    onDown: () => {
      LinkerAPI.removeLinksFromSelected({ notification: true, multiLayer: !Boolean(LinkerAPI._getSelected().length) });
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'deleteAllLinked', {
    name: 'Delete Selected & Linked',
    hint: 'Deletes currently selected placeable and all placeables linked to it via the `Linker Menu`',
    editable: [
      {
        key: 'Delete',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      LinkerAPI.deleteSelectedLinkedPlaceables();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'placeablePreviewEdit', {
    name: localize('keybindings.placeableEdit.name'),
    hint: localize('keybindings.placeableEdit.hint'),
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

  game.keybindings.register(MODULE_ID, 'mirrorX', {
    name: 'Mirror Preview Horizontally',
    hint: '',
    editable: [
      {
        key: 'KeyH',
        modifiers: [],
      },
    ],
    onDown: () => Picker.mirrorX(),
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'mirrorY', {
    name: 'Mirror Preview Vertically',
    hint: '',
    editable: [
      {
        key: 'KeyV',
        modifiers: [],
      },
    ],
    onDown: () => Picker.mirrorY(),
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
      const app = getMassEditForm();
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
    name: localize('common.copy'),
    hint: 'Copy data from within an opened Mass Edit form OR the selected and all linked placeables.',
    editable: [
      {
        key: 'KeyC',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      // Check if a Mass Config form is open and if so copy data from there
      if (window.getSelection().toString() === '') {
        const app = Object.values(ui.windows).find((app) => app.meObjects != null);
        if (app) return app.performMassCopy();
      }

      // If no form is open attempt to copy the selected placeable and its linked placeables
      const selected = LinkerAPI._getSelected().map((s) => s.document);
      if (selected.length) {
        const linked = Array.from(
          LinkerAPI.getHardLinkedDocuments(selected).filter((l) => !selected.find((s) => s.id === l.id))
        );

        const preset = new Preset({
          documentName: selected[0].documentName,
          data: selected.map((s) => s.toObject()),
          attached: linked.map((l) => {
            return { documentName: l.documentName, data: l.toObject() };
          }),
        });
        copyToClipboard(preset);
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'pasteKey', {
    name: localize('common.paste'),
    hint: 'Paste data onto selected placeables or spawn it as a new placeable.',
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
