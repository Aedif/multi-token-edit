import { pasteData, showMassEdit, showGenericForm, getMassEditForm } from './applications/multiConfig.js';
import {
  activeEffectPresetSelect,
  createDocuments,
  isResponsibleGM,
  resolveCreateDocumentRequest,
  TagInput,
} from './scripts/utils.js';
import { libWrapper } from './scripts/shim/shim.js';
import { enableUniversalSelectTool } from './scripts/selectTool.js';
import { META_INDEX_ID, PresetAPI, PresetCollection } from './scripts/presets/collection.js';
import { registerPresetBrowserHooks } from './scripts/presets/forms.js';
import { registerKeybinds, registerSettings } from './scripts/settings.js';
import { Picker } from './scripts/picker.js';
import { BrushMenu, activateBrush, deactivateBush, openBrushMenu } from './scripts/brush.js';
import { V12Migrator } from './scripts/presets/migration.js';
import { deleteFromClipboard, performMassSearch, performMassUpdate } from './applications/formUtils.js';
import { registerSideBarPresetDropListener } from './scripts/presets/utils.js';
import { LinkerAPI, registerLinkerHooks } from './scripts/linker/linker.js';
import { MODULE_ID, SUPPORTED_SHEET_CONFIGS, SUPPORTED_PLACEABLES, UI_DOCS } from './scripts/constants.js';
import { registerSceneScapeHooks } from './scripts/scenescape.js';

// Initialize module
Hooks.once('init', () => {
  // We need to insert Region into relevant doc groups
  // TODO: Once we move to a dedicated v12 version of the module we can
  // make these groups static again
  if (foundry.utils.isNewerVersion(game.version, 12)) {
    SUPPORTED_PLACEABLES.unshift('Region');
    UI_DOCS.push('Region');
    SUPPORTED_SHEET_CONFIGS.push('Region');

    //Register region behaviors
    import('./scripts/behaviors/behaviors.js').then((module) => module.registerBehaviors());
  }

  // Allows users to drop AmbientSound presets onto playlists
  registerSideBarPresetDropListener();

  // Linker related hooks
  registerLinkerHooks();

  // SceneScape
  registerSceneScapeHooks();

  // TODO: Replace with core v12 implementation of tag HTML element
  TagInput.registerHandlebarsHelper();

  // Enable select tool for all layers
  enableUniversalSelectTool();

  // Settings/Keybindings
  registerSettings();
  registerKeybinds();

  // Register copy-paste wrappers
  libWrapper.register(
    MODULE_ID,
    'ClientKeybindings._onCopy',
    function (wrapped, ...args) {
      if (window.getSelection().toString() === '') {
        // Check if a Mass Config form is open and if so copy data from there
        const meForm = getMassEditForm();
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
        else if ((event.ctrlKey || event.metaKey) && event.shiftKey) BrushMenu.iterate(event.delta >= 0, true);
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

  registerPresetBrowserHooks();

  // Handle broadcasts
  // Needed to allow players to spawn Presets by delegating create document request to GMs
  game.socket?.on(`module.${MODULE_ID}`, async (message) => {
    const args = message.args;

    if (message.handlerName === 'document' && message.type === 'UPDATE') {
      if (!isResponsibleGM()) return;

      game.scenes.get(args.sceneID).updateEmbeddedDocuments(args.documentName, args.updates, args.context);
    } else if (message.handlerName === 'document' && message.type === 'CREATE') {
      if (!isResponsibleGM()) return;

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
    } else if (message.handlerName === 'document' && message.type === 'DELETE') {
      if (!isResponsibleGM()) return;
      game.scenes.get(args.sceneId).deleteEmbeddedDocuments(args.embedName, args.ids);
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
    migratePack: (pack, options = {}) => V12Migrator.migratePack(pack, options),
    migrateAllPacks: (options = {}) => V12Migrator.migrateAllPacks(options),
    linker: LinkerAPI,
  };

  game.modules.get(MODULE_ID).api = {
    ...globalThis.MassEdit,
  };
});

// Deactivate brush/picker on scene change

Hooks.on('canvasReady', () => {
  if (BrushMenu.isActive()) BrushMenu.close();
  else if (Picker.isActive()) Picker.destroy();
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

Hooks.on('renderActiveEffectConfig', (app) => {
  const el = $(app.form).find('.effects-header .key');
  if (el.length) {
    const me = $('<i title="Apply \'Mass Edit\' preset" style="font-size:smaller;color:brown;"> <a>[ME]</a></i>');
    me.on('click', () => activeEffectPresetSelect(app));
    el.append(me);
  }
});
