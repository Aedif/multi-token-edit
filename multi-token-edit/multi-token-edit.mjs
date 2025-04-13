import { pasteData, showMassEdit, showGenericForm, getMassEditForm } from './applications/multiConfig.js';
import {
  activeEffectPresetSelect,
  createDocuments,
  isResponsibleGM,
  resolveCreateDocumentRequest,
  TagInput,
} from './scripts/utils.js';
import { libWrapper } from './scripts/libs/shim/shim.js';
import { enableUniversalSelectTool } from './scripts/tools/selectTool.js';
import { META_INDEX_ID, PresetAPI, PresetCollection } from './scripts/presets/collection.js';
import { openPresetBrowser, registerPresetBrowserHooks } from './scripts/presets/browser/browserApp.js';
import { registerKeybinds, registerSettings } from './scripts/settings.js';
import { BrushMenu, activateBrush, deactivateBush, openBrushMenu } from './scripts/brush.js';
import { V12Migrator } from './scripts/presets/migration.js';
import { deleteFromClipboard, performMassSearch, performMassUpdate } from './applications/formUtils.js';
import { importSceneCompendium, registerSideBarPresetDropListener } from './scripts/presets/utils.js';
import { LinkerAPI, registerLinkerHooks } from './scripts/linker/linker.js';
import { MODULE_ID, PIVOTS } from './scripts/constants.js';
import { registerScenescapeHooks, Scenescape } from './scripts/scenescape/scenescape.js';
import { Spawner } from './scripts/presets/spawner.js';
import { registerBehaviors } from './scripts/behaviors/behaviors.js';
import { openBag } from './scripts/presets/bagApp.js';
import { openCategoryBrowser } from './scripts/presets/categoryBrowserApp.js';
import { PresetContainer, registerPresetHandlebarPartials } from './scripts/presets/containerApp.js';
import { FileIndexerAPI } from './scripts/presets/fileIndexer.js';
import { TransformBus, MassTransformer } from './scripts/transformer.js';

globalThis.MassTransformer = MassTransformer;

globalThis.MassEdit = {
  showGenericForm,
  performMassUpdate,
  performMassSearch,
  showMassEdit,
  getPreset: PresetAPI.getPreset,
  getPresets: PresetAPI.getPresets,
  createPreset: PresetAPI.createPreset,
  spawnPreset: Spawner.spawnPreset,
  activateBrush: activateBrush,
  openBag,
  openCategoryBrowser,
  deactivateBrush: deactivateBush,
  openBrushMenu: openBrushMenu,
  migratePack: (pack, options = {}) => V12Migrator.migratePack(pack, options),
  migrateAllPacks: (options = {}) => V12Migrator.migrateAllPacks(options),
  linker: LinkerAPI,
  PIVOTS: PIVOTS,
  PresetContainer,
  importSceneCompendium,
  openPresetBrowser,
  FileIndexer: FileIndexerAPI,
  sceneNotFoundMessages: [],
};

// Initialize module
Hooks.once('init', () => {
  game.modules.get(MODULE_ID).api = {
    ...globalThis.MassEdit,
  };

  //Register region behaviors
  registerBehaviors();

  // Allow users to drop AmbientSound presets onto playlists
  registerSideBarPresetDropListener();

  // Linker related hooks
  registerLinkerHooks();

  // TODO: Replace with core v12 implementation of tag HTML element
  TagInput.registerHandlebarsHelper();

  // Partials used for Preset rendering
  registerPresetHandlebarPartials();

  // Enable select tool for all layers
  enableUniversalSelectTool();

  // Settings/Keybindings
  registerSettings();
  registerKeybinds();

  // Scenescapes
  registerScenescapeHooks();

  // Register mouse wheel listener by inserting it just before the Foundry's MouseManager
  // If we're in some kind of placeable preview we want to handle preview transformations and
  // stop propagation to other wheel related functions
  libWrapper.register(
    MODULE_ID,
    'MouseManager.prototype._activateListeners',
    function (wrapped, ...args) {
      window.addEventListener(
        'wheel',
        (event) => {
          if (
            (TransformBus.active() || BrushMenu.isActive()) &&
            (event.ctrlKey ||
              event.shiftKey ||
              event.metaKey ||
              event.altKey ||
              game.keyboard.downKeys.has('KeyZ') ||
              game.keyboard.downKeys.has('Space'))
          ) {
            // Prevent zooming the entire browser window
            if (event.ctrlKey || event.altKey) event.preventDefault();

            let dy = (event.delta = event.deltaY);
            if (event.shiftKey && dy === 0) {
              dy = event.delta = event.deltaX;
            }
            if (dy === 0) return;

            if (event.altKey || game.keyboard.downKeys.has('Space'))
              TransformBus.addScaling(event.delta < 0 ? 0.05 : -0.05);
            else if ((event.ctrlKey || event.metaKey) && event.shiftKey) BrushMenu.iterate(event.delta >= 0, true);
            else if (event.ctrlKey || event.metaKey) TransformBus.addRotation(event.delta < 0 ? 2.5 : -2.5);
            else if (event.shiftKey) TransformBus.addRotation(event.delta < 0 ? 15 : -15);
            else if (game.keyboard.downKeys.has('KeyZ')) {
              let delta = event.delta < 0 ? 1 : -1;
              if (Scenescape.active) delta = delta * Scenescape.depth * 0.01;
              TransformBus.addElevation(delta);
            }

            event.stopImmediatePropagation();
          }
        },
        { passive: false }
      );

      return wrapped(...args);
    },
    'WRAPPER'
  );

  // Prevent placeable highlighting if a preview transformer is active
  libWrapper.register(
    MODULE_ID,
    'Canvas.prototype.highlightObjects',
    function (wrapped, ...args) {
      if (MassTransformer.active()) return;
      return wrapped(...args);
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
            const sceneId = $(li).attr('data-scene-id');
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

      const documents = await createDocuments(args.documentName, args.data, args.sceneID, args.options);
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
    if (!game.settings.get(MODULE_ID, 'disableOmniSearchIndex')) {
      const promise = PresetCollection.buildSpotlightOmnisearchIndex(INDEX);
      promises.push(promise);
    }
  });
});

// Deactivate brush/picker on scene change

Hooks.on('canvasReady', () => {
  BrushMenu.close();
  MassTransformer.destroyCrosshair();
  TransformBus.clear();
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
