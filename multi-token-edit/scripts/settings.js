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
import { MODULE_ID, SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES, THRESHOLDS } from './constants.js';
import { LinkerAPI } from './linker/linker.js';
import { PresetCollection } from './presets/collection.js';
import { openPresetBrowser, PresetBrowser } from './presets/browser/browserApp.js';
import { Preset } from './presets/preset.js';
import { Scenescape } from './scenescape/scenescape.js';
import { enablePixelPerfectSelect } from './tools/selectTool.js';
import { activeEffectPresetSelect, getDocumentName, localize, TagInput } from './utils.js';
import { editPreviewPlaceables, Transformer } from './transformer.js';

export function registerSettings() {
  // Register Settings

  game.settings.register(MODULE_ID, 'debug', {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
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
      PresetCollection.workingPack = val;
    },
  });
  PresetCollection.workingPack = game.settings.get(MODULE_ID, 'workingPack');

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
      searchMode: 'pf', // p = preset only | pf = preset & folder
      sortMode: 'manual', // manual | alphabetical
      autoScale: true,
      virtualDirectory: true,
      externalCompendiums: true,
      switchLayer: true,
      documentLock: '',
      dropdownDocuments: ['MeasuredTemplate', 'Note', 'Region'],
    },
    onChange: (val) => {
      PresetBrowser.CONFIG = val;
    },
  });
  PresetBrowser.CONFIG = game.settings.get(MODULE_ID, 'presetBrowser');

  /**
   * Preset bags
   */
  game.settings.register(MODULE_ID, 'bags', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  game.settings.register(MODULE_ID, 'presetFavorites', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  // Convert settings based bags to Preset Bags
  // TODO: Remove after sufficient time has passed for users to have run this
  // 25/11/2024
  const favorites = game.settings.get(MODULE_ID, 'presetFavorites');
  const bags = game.settings.get(MODULE_ID, 'bags');
  if (!foundry.utils.isEmpty(favorites)) {
    let sort = -1;
    const presets = Object.keys(favorites).map((uuid) => {
      sort++;
      return { uuid, sort };
    });

    bags['FAVORITES'] = { presets, name: 'FAVORITES' };
  }

  if (!foundry.utils.isEmpty(bags)) {
    const presets = [];
    for (let [id, bag] of Object.entries(bags)) {
      let searchesInclusive = [];
      if (bag.tags?.length) {
        searchesInclusive.push({
          terms: '#' + bag.tags.join(' #'),
          matchAll: false,
        });
      }

      presets.push(
        new Preset({
          name: 'Bag: ' + bag.name ?? id,
          tags: ['id-' + TagInput.simplifyString(id)],
          documentName: 'Bag',
          img: `icons/containers/bags/pack-engraved-leather-tan.webp`,
          data: [
            {
              uuids: bag.presets,
              searches: {
                inclusive: searchesInclusive,
                exclusive: [],
              },
              virtualDirectory: true,
            },
          ],
        })
      );
    }

    if (presets.length) {
      setTimeout(() => {
        if (game.user?.isGM) {
          PresetCollection.set(presets);
          game.settings.set(MODULE_ID, 'bags', {});
          game.settings.set(MODULE_ID, 'presetFavorites', {});
        }
      }, 10000);
    }
  }

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
    onChange: () => {
      ui.controls.controls = ui.controls._getControlButtons();
      ui.controls.render(true);
    },
  });

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
    name: 'Delete Selected: Ignore Links',
    hint: 'Deletes currently selected placeable without removing any placeables linked to it via the `Linker Menu`',
    editable: [
      {
        key: 'Delete',
        modifiers: ['Shift'],
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
        modifiers: ['Shift'],
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
          editing = await editPreviewPlaceables(canvas.tiles.controlled);
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
    onDown: () => Transformer.mirrorX(),
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
    onDown: () => Transformer.mirrorY(),
    restricted: false,
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
      const app = Object.values(ui.windows).find((w) => w instanceof PresetBrowser);
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
      const app = Object.values(ui.windows).find((w) => w instanceof PresetBrowser);
      if (app) {
        app.close(true);
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

  game.keybindings.register(MODULE_ID, 'autoScale', {
    name: 'Scenescape: Toggle Auto-scaling',
    hint: '',
    editable: [
      {
        key: 'KeyZ',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      if (Transformer.active()) {
        Scenescape.autoScale = !Scenescape.autoScale;
        ui.notifications.info('Scenescape: Autoscale => ' + (Scenescape.autoScale ? 'ON' : 'OFF'));
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
}
