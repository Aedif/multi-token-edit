import CSSEdit, { STYLES } from '../applications/cssEdit.js';
import { copyToClipboard, deleteFromClipboard } from '../applications/formUtils.js';
import { MassEditGenericForm } from '../applications/generic/genericForm.js';
import {
  getMassEditForm,
  getSelected,
  pasteData,
  showMassActorForm,
  showMassEdit,
  showMassSelect,
} from '../applications/multiConfig.js';
import { MODULE_ID, SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES, THRESHOLDS } from './constants.js';
import { LinkerAPI } from './linker/linker.js';
import { PresetStorage } from './presets/collection.js';
import { openPresetBrowser, PresetBrowser } from './presets/browser/browserApp.js';
import { Preset } from './presets/preset.js';
import { Scenescape } from './scenescape/scenescape.js';
import { enablePixelPerfectSelect } from './tools/selectTool.js';
import { getDocumentName, localize } from './utils.js';
import { editPreviewPlaceables, TransformBus } from './transformer.js';
import { DragUploadSettingsApp } from './auxilaryFeatures/dragUpload.js';

export function registerSettings() {
  // Register Settings

  game.settings.register(MODULE_ID, 'debug', {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, 'dragUpload', {
    scope: 'world',
    config: false,
    type: Object,
    default: {
      enabled: true,
      target: 'drag_uploads',
      source: 'data',
      bucket: '',
      presets: {},
    },
  });

  game.settings.registerMenu(MODULE_ID, 'dragUpload', {
    name: 'Drag Upload',
    label: '',
    scope: 'world',
    label: 'Configure',
    icon: 'fa-solid fa-folder-arrow-up',
    type: DragUploadSettingsApp,
    restricted: true,
  });

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
    name: 'CSS',
    label: 'Configure',
    scope: 'world',
    icon: 'fa-solid fa-palette',
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

  game.settings.register(MODULE_ID, 'pixelPerfectAlpha', {
    name: 'Pixel Perfect Hover: Alpha Threshold',
    hint: 'The lower the value the more transparent a pixel can be while still being recognised as hovered over.',
    scope: 'world',
    config: true,
    type: new foundry.data.fields.NumberField({
      required: true,
      min: 0.0,
      max: 1,
      step: 0.01,
      initial: THRESHOLDS.PIXEL_PERFECT_ALPHA,
    }),
    onChange: (val) => {
      THRESHOLDS.PIXEL_PERFECT_ALPHA = val;
    },
  });
  THRESHOLDS.PIXEL_PERFECT_ALPHA = game.settings.get(MODULE_ID, 'pixelPerfectAlpha');

  ['pixelPerfectTile', 'pixelPerfectToken'].forEach((setting) => {
    game.settings.register(MODULE_ID, setting, {
      scope: 'client',
      config: false,
      type: Boolean,
      default: false,
      onChange: enablePixelPerfectSelect,
    });
  });

  // ===============
  // Preset Settings

  game.settings.register(MODULE_ID, 'workingPack', {
    scope: 'world',
    config: false,
    type: String,
    default: 'world.mass-edit-presets-main',
    onChange: (val) => {
      PresetStorage.workingPack = val;
    },
  });
  PresetStorage.workingPack = game.settings.get(MODULE_ID, 'workingPack');

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

  // Consolidated preset browser settings
  game.settings.register(MODULE_ID, 'presetBrowser', {
    scope: 'world',
    config: false,
    type: Object,
    default: {
      dropdownDocuments: [],
      persistentSearch: true,
      sortMode: 'manual', // manual | alphabetical
      autoScale: true,
      virtualDirectory: true,
      externalCompendiums: true,
      switchLayer: true,
      documentLock: '',
      dropdownDocuments: ['MeasuredTemplate', 'Note', 'Region'],
      autoSaveFolders: [],
      searchLimit: 1001,
    },
    onChange: (val) => {
      PresetBrowser.CONFIG = val;
    },
  });
  PresetBrowser.CONFIG = game.settings.get(MODULE_ID, 'presetBrowser');
  if (!PresetBrowser.CONFIG.searchLimit) PresetBrowser.CONFIG.searchLimit = 1001;

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

  game.settings.register(MODULE_ID, 'disablePixelPerfectHoverButton', {
    name: `Pixel Perfect Hover: Remove Button`,
    hint: 'When enabled `Pixel Perfect Hover` toggle will be removed from Token and Tile layer controls.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });

  if (game.modules.get('spotlight-omnisearch')?.active) {
    game.settings.register(MODULE_ID, 'disableOmniSearchIndex', {
      name: `Disable preset inclusion within Spotlight Omnisearch`,
      hint: 'Presets will no longer be included when performing Spotlight Omnisearch searches.',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
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

  game.settings.register(MODULE_ID, 'browserContextMacroUuid', {
    name: `Preset Browser Right-Click macro`,
    hint: 'UUID of the macro to be ran when Preset Browser scene control button is right-clicked.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, 'hideManagedPacks', {
    name: `Hide Preset Compendiums`,
    hint: 'When enabled preset compendiums will not be shown in the sidebar.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });
}

export function registerKeybinds() {
  const { SHIFT, CONTROL, ALT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;

  game.keybindings.register(MODULE_ID, 'linker', {
    name: localize('keybindings.linkerMenu.name'),
    hint: localize('keybindings.linkerMenu.hint'),
    editable: [
      {
        key: 'KeyQ',
        modifiers: [SHIFT],
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
    name: 'Delete Selected: Ignore Links',
    hint: 'Deletes currently selected placeable without removing any placeables linked to it via the `Linker Menu`',
    editable: [
      {
        key: 'Delete',
        modifiers: [SHIFT],
      },
    ],
    onDown: () => {
      const selected = LinkerAPI._getSelected().map((s) => s.document);
      canvas.scene.deleteEmbeddedDocuments(
        selected[0].documentName,
        selected.map((s) => s.id),
        { linkerDelete: true }
      );
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
        modifiers: [SHIFT],
      },
    ],
    onDown: async (event) => {
      let editing = false;

      if (game.user.isGM) editing = await editPreviewPlaceables();
      else {
        // Move That For You module support
        if (
          canvas.tiles.controlled.length &&
          canvas.tiles.controlled.every((t) => t.document.allowPlayerMove?.() && t.document.allowPlayerRotate?.())
        ) {
          editing = await editPreviewPlaceables({ placeables: canvas.tiles.controlled });
        }
      }
      if (editing) event.event.preventDefault();
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
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
    onDown: () => TransformBus.mirrorX(),
    restricted: false,
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
    onDown: () => TransformBus.mirrorY(),
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'editKey', {
    name: localize('keybindings.editKey.name'),
    hint: localize('keybindings.editKey.hint'),
    editable: [
      {
        key: 'KeyE',
        modifiers: [SHIFT],
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
        modifiers: [SHIFT],
      },
    ],
    onDown: () => {
      // Check if a Mass Config form is open and if so copy data from there
      if (window.getSelection().toString() === '') {
        const app = Array.from(foundry.applications.instances.values()).find((app) => app.meObjects != null);
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
        modifiers: [SHIFT],
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
        modifiers: [SHIFT],
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
        modifiers: [SHIFT],
      },
    ],
    onDown: () => {
      const presetBrowser = foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id);
      if (presetBrowser) {
        presetBrowser.close(true);
        return;
      }

      const documentName = canvas.activeLayer.constructor.documentName;
      if (!SUPPORTED_PLACEABLES.includes(documentName)) return;
      openPresetBrowser(documentName);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register(MODULE_ID, 'presetApplyScene', {
    name: localize('keybindings.presetApplyScene.name'),
    hint: localize('keybindings.presetApplyScene.hint'),
    editable: [],
    onDown: () => {
      const presetBrowser = foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id);
      if (presetBrowser) {
        presetBrowser.close(true);
        return;
      }
      openPresetBrowser('Scene');
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
        modifiers: [SHIFT],
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

  game.keybindings.register(MODULE_ID, 'autoScale', {
    name: 'Scenescape: Toggle Auto-scaling',
    hint: '',
    editable: [
      {
        key: 'KeyZ',
        modifiers: [SHIFT],
      },
    ],
    onDown: () => {
      if (Scenescape.active) {
        Scenescape.autoScale = !Scenescape.autoScale;
        ui.notifications.info('Scenescape: Autoscale => ' + (Scenescape.autoScale ? 'ON' : 'OFF'));
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  // Mass Edit form Copy/Paste
  // May override core functions
  game.keybindings.register(MODULE_ID, 'onCopy', {
    name: 'KEYBINDINGS.Copy',
    uneditable: [{ key: 'KeyC', modifiers: [CONTROL] }],
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
    onDown: () => {
      if (window.getSelection().toString() === '') {
        // Check if a Mass Config form is open and if so copy data from there
        const meForm = getMassEditForm();
        if (meForm?.performMassCopy()) return true;
      }

      deleteFromClipboard(canvas.activeLayer.constructor.documentName);
    },
  });
  game.keybindings.register(MODULE_ID, 'onPaste', {
    name: 'KEYBINDINGS.Paste',
    uneditable: [{ key: 'KeyV', modifiers: [CONTROL] }],
    precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
    onDown: () => {
      if (pasteData()) return true;
    },
    reservedModifiers: [ALT, SHIFT],
  });
}
