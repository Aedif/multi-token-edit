import { pasteDataUpdate } from '../../applications/formUtils.js';
import { BrushMenu } from '../brush.js';
import { MODULE_ID, PIVOTS, SUPPORTED_PLACEABLES } from '../constants.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { applyPresetToScene, isAudio, localFormat, localize, spawnSceneAsPreset } from '../utils.js';
import { PresetAPI, PresetCollection, PresetFolder, PresetPackFolder, VirtualFileFolder } from './collection.js';
import { PresetBrowser } from './browser/browserApp.js';
import { Preset } from './preset.js';
import { Spawner } from './spawner.js';
import { exportPresets, isVideo, sceneNotFoundError } from './utils.js';
import { FileIndexer, IndexerForm } from './fileIndexer.js';
import { PresetConfig } from './editApp.js';

export async function registerPresetHandlebarPartials() {
  await foundry.applications.handlebars.getTemplate(
    `modules/${MODULE_ID}/templates/preset/container/partials/preset.hbs`,
    'me-preset'
  );
  await foundry.applications.handlebars.getTemplate(
    `modules/${MODULE_ID}/templates/preset/container/partials/folder.hbs`,
    'me-preset-folder'
  );
  await foundry.applications.handlebars.getTemplate(
    `modules/${MODULE_ID}/templates/preset/container/partials/presetsContent.hbs`,
    'me-presets-content'
  );
  await foundry.applications.handlebars.getTemplate(
    `modules/${MODULE_ID}/templates/preset/container/partials/presetsTopList.hbs`,
    'me-preset-list'
  );

  Handlebars.registerHelper('meRender', function (item, ctx) {
    if (ctx.data.root.search) return item._meMatch;
    return true;
  });
}

export class PresetContainerV2 extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static _oldPositions = {};

  constructor(opts1, opts2 = {}) {
    super(opts2);

    this.presetsSortable = opts2.sortable;
    this.presetsDuplicatable = opts2.duplicatable;
    this.presetsForceAllowDelete = opts2.forceAllowDelete;
    this.presetsDisableDelete = opts2.disableDelete;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    actions: {
      itemClick: PresetContainerV2._onItemClick, // Multi-select
      folderClick: PresetContainerV2._onFolderClick,
      openIndexer: PresetContainerV2._onOpenIndexer,
    },
    position: {
      width: 600,
    },
    window: {
      contentClasses: ['standard-form'],
    },
  };

  /** @override */
  setPosition(...args) {
    const position = super.setPosition(...args);

    const { left, top, width, height } = position;
    PresetContainerV2._oldPositions[this.id] = { left, top, width, height };

    return position;
  }

  /** @override */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);

    if (!options.preventPositionOverride) {
      const oldPosition = PresetContainerV2._oldPositions[options.id];
      if (oldPosition && options.position) Object.assign(options.position, oldPosition);
    }

    return options;
  }

  /**
   * Handle mouse click on a preset
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns
   */
  static _onItemClick(event, target) {
    if (event.detail === 1) {
      itemSelect(event, target);
    } else {
      this._onDoubleClickPreset(event, target);
    }
  }

  /** @override */
  _attachFrameListeners() {
    super._attachFrameListeners();
    const html = $(this.element);

    this._attachPreviewListeners(html);
    this._attachDragDropListeners(html);
    this._contextMenu(html);
  }

  /**
   * Manage video/sound preview playing on mouse enter and leave
   * @param {JQuery} html
   */
  _attachPreviewListeners(html) {
    html.on('mouseenter', '.item', (event) => {
      this._playPreview(event);
    });
    html.on('mouseleave', '.item', (event) => {
      this._endPreview();
    });
  }

  /**
   * Manage preset drag and drop listeners
   * @param {JQuery} html
   */
  _attachDragDropListeners(html) {
    html.on('dragstart', '.item', (event) => {
      const item = $(event.target).closest('.item');
      const itemList = html.find('.item-list');

      // Drag has been started on an item that hasn't been selected
      // Assume that this is the only item to be dragged and select it
      if (!item.hasClass('selected')) {
        itemList.find('.item.selected').removeClass('selected').removeClass('last-selected');
        item.addClass('selected').addClass('last-selected');
      }

      const uuids = [];
      itemList.find('.item.selected').each(function () {
        uuids.push($(this).data('uuid'));
      });

      event.originalEvent.dataTransfer.clearData();
      event.originalEvent.dataTransfer.setData(
        'text/plain',
        JSON.stringify({ uuids, sortable: itemList.find('.item.selected').hasClass('sortable'), type: 'preset' })
      );
    });

    if (this.presetsSortable) {
      html.on('dragleave', '.item.sortable', (event) => {
        const item = event.target.closest('.item');
        item.classList.remove('drag-bot');
        item.classList.remove('drag-top');
      });

      html.on('dragover', '.item.sortable', (event) => {
        // Determine if mouse is hovered over top, middle, or bottom
        var domRect = event.currentTarget.getBoundingClientRect();
        let prc = event.offsetY / domRect.height;

        const targetItem = event.target.closest('.item');
        if (prc < 0.2) {
          targetItem.classList.remove('drag-bot');
          targetItem.classList.add('drag-top');
        } else if (prc > 0.8) {
          targetItem.classList.remove('drag-top');
          targetItem.classList.add('drag-bot');
        }
      });

      html.on('drop', '.item.sortable', async (event) => {
        if (this.lastSearch?.length) return; // Prevent drops while searching

        let dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
        if (foundry.utils.isEmpty(dragData)) dragData = (await this._fileDrop?.(event.originalEvent)) ?? {};

        const targetItem = event.target.closest('.item');
        if (dragData.type === 'preset' && dragData.sortable) {
          const top = targetItem.classList.contains('drag-top');

          const uuids = dragData.uuids;
          if (uuids) {
            if (!targetItem.classList.contains('selected')) {
              this._onItemSort(uuids, targetItem.dataset.uuid, {
                before: top,
                folderUuid: targetItem.closest('.folder')?.dataset.uuid,
              });
            }
          }
        }
        targetItem.classList.remove('drag-bot');
        targetItem.classList.remove('drag-top');
      });
    }

    // ================
    // Folder Listeners

    if (this.presetsSortable) {
      html.on('dragstart', '.folder.sortable header', (event) => {
        const folder = $(event.target).closest('.folder');
        const uuids = [folder.data('uuid')];

        $(event.target)
          .find('.folder')
          .each(function () {
            uuids.push($(this).data('uuid'));
          });

        event.originalEvent.dataTransfer.clearData();
        event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({ uuids, type: 'folder' }));
      });

      html.on('dragleave', '.folder.sortable header', (event) => {
        const folder = event.target.closest('.folder');
        folder.classList.remove('drag-mid');
        folder.classList.remove('drag-top');
      });

      html.on('dragover', '.folder.sortable header', (event) => {
        const folder = event.target.closest('.folder');

        // Determine if mouse is hovered over top, middle, or bottom
        var domRect = event.currentTarget.getBoundingClientRect();
        let prc = event.offsetY / domRect.height;

        if (prc < 0.2) {
          folder.classList.remove('drag-mid');
          folder.classList.add('drag-top');
        } else {
          folder.classList.remove('drag-top');
          folder.classList.add('drag-mid');
        }
      });

      html.on('drop', '.folder.sortable header', async (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching

        let dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
        if (foundry.utils.isEmpty(dragData)) dragData = (await this._fileDrop?.(event.originalEvent)) ?? {};

        const targetFolder = $(event.target).closest('.folder');

        if (dragData.type === 'folder') {
          const top = targetFolder.hasClass('drag-top');
          targetFolder.removeClass('drag-mid').removeClass('drag-top');

          const uuids = dragData.uuids;
          if (uuids) {
            if (uuids.includes(targetFolder.data('uuid'))) return;

            const uuid = uuids[0];
            const folder = html.find(`.folder[data-uuid="${uuid}"]`);
            if (folder) {
              // Move HTML Elements
              if (top) folder.insertBefore(targetFolder);
              else targetFolder.find('.folder-items').first().append(folder);

              if (top) {
                this._onFolderSort(uuid, targetFolder.data('uuid'), {
                  inside: false,
                  folderUuid: targetFolder.parent().closest('.folder').data('uuid') ?? null,
                });
              } else {
                this._onFolderSort(uuid, null, {
                  inside: true,
                  folderUuid: targetFolder.data('uuid'),
                });
              }
            }
          }
        } else if (dragData.type === 'preset' && dragData.sortable) {
          targetFolder.removeClass('drag-mid');
          const uuids = dragData.uuids;
          this._onItemSort(uuids, null, {
            folderUuid: targetFolder.data('uuid'),
          });
        } else {
          targetFolder.removeClass('drag-mid');
        }
      });

      html.on('drop', '.top-level-preset-items', (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching

        const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
        if (dragData.type === 'folder') {
          // Move HTML Elements
          const target = html.find('.top-level-folder-items');
          const folder = html.find(`.folder[data-uuid="${dragData.uuids[0]}"]`);
          target.append(folder);

          this._onFolderSort(dragData.uuids[0], null);
        } else if (dragData.type === 'item' && dragData.sortable) {
          const uuids = dragData.uuids;

          // Move HTML Elements
          const target = html.find('.top-level-preset-items');
          uuids?.forEach((uuid) => {
            const item = html.find(`.item[data-uuid="${uuid}"]`);
            if (item.length) target.append(item);
          });

          this._onItemSort(uuids, null);
        }
      });
    }
    // End of Folder Listeners
    // ================
  }

  /**
   * Handle mouse double-click on a preset
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @returns
   */
  async _onDoubleClickPreset(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    let preset = await PresetAPI.getPreset({ uuid });
    if (!preset) return;

    BrushMenu.close();

    if (preset.documentName === 'Scene') {
      ui.notifications.info(`Mass Edit: ${localize('common.apply')} [${preset.name}]`);
      applyPresetToScene(preset);
    } else if (preset.documentName === 'Bag') {
      this._onOpenBag(preset.uuid);
    } else if (preset.documentName === 'FauxScene') {
      const scene = await fromUuid(preset.data[0].uuid);
      if (scene) scene.sheet.render(true);
      else sceneNotFoundError(preset);
    }

    if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) return;

    ui.notifications.info(`Mass Edit: ${localize('presets.spawning')} [${preset.name}]`);

    // Spawn Preset
    this._setInteractivityState(false);
    await this._onSpawnPreset(preset);
    this._setInteractivityState(true);
  }

  /**
   * Opens directory indexer
   */
  static async _onOpenIndexer() {
    if (FileIndexer._buildingIndex) {
      ui.notifications.warn('Index Build In-Progress. Wait for it to finish before attempting it again.');
      return;
    }
    new IndexerForm().render(true);
  }

  async _onSpawnPreset(preset, options = {}) {
    return await Spawner.spawnPreset({
      preset,
      preview: true,
      layerSwitch: PresetBrowser.CONFIG.switchLayer,
      scaleToGrid: PresetBrowser.CONFIG.autoScale || Scenescape.active,
      pivot: PIVOTS.CENTER,
      ...options,
    });
  }

  async _onRightClickPreset(eventTarget) {
    const item = $(eventTarget).closest('.item');

    // If right-clicked item is not selected, de-select the others and select it
    if (!item.hasClass('selected')) {
      item.closest('.item-list').find('.item.selected').removeClass('selected').removeClass('last-selected');
      item.addClass('selected').addClass('last-selected');
    }
  }

  /**
   * Sets the window app as translucent and inactive to mouse pointer events
   * @param {Boolean} state true = active, false = inactive
   */
  _setInteractivityState(state) {
    if (state) $(this.form).removeClass('mass-edit-inactive');
    else $(this.form).addClass('mass-edit-inactive');
  }

  _contextMenu() {
    this._createContextMenu(this._getItemContextOptions, '.item', {
      hookName: 'getPresetContextOptions',
      parentClassHook: false,
      onOpen: this._onRightClickPreset.bind(this),
    });

    this._createContextMenu(this._getFolderContextOptions, '.folder header', {
      hookName: 'getPresetFolderContextOptions',
    });
  }

  _getItemContextOptions() {
    return [
      {
        name: 'Open Bag',
        icon: '<i class="fas fa-edit"></i>',
        condition: (item) => item.dataset.docName === 'Bag',
        callback: (item) => this._onOpenBag(),
        sort: 0,
      },
      {
        name: 'Import Scene',
        icon: '<i class="fas fa-download fa-fw"></i>',
        condition: (item) => item.dataset.docName === 'FauxScene',
        callback: this._onImportFauxScene,
        sort: 50,
      },
      {
        name: 'Spawn Scene',
        icon: '<i class="fa-solid fa-books"></i>',
        condition: (item) => item.dataset.docName === 'FauxScene',
        callback: this._onSpawnScene,
        sort: 51,
      },
      {
        name: localize('CONTROLS.CommonEdit', false),
        icon: '<i class="fas fa-edit"></i>',
        condition: (item) => game.user.isGM && Preset.isEditable(item.dataset.uuid),
        callback: (item) => this._onEditSelectedPresets(item),
        sort: 100,
      },
      {
        name: 'Brush',
        icon: '<i class="fa-solid fa-paintbrush"></i>',
        condition: (item) => game.user.isGM && SUPPORTED_PLACEABLES.includes(item.dataset.docName),
        callback: (item) => this._onActivateBrush(item),
        sort: 200,
      },
      {
        name: localize('presets.open-journal'),
        icon: '<i class="fas fa-book-open"></i>',
        condition: (item) => !item.classList.contains('virtual'),
        callback: (item) => this._onOpenJournal(item),
        sort: 300,
      },
      {
        name: localize('presets.apply-to-selected'),
        icon: '<i class="fas fa-arrow-circle-right"></i>',
        condition: (item) =>
          game.user.isGM &&
          SUPPORTED_PLACEABLES.includes(item.dataset.docName) &&
          canvas.getLayerByEmbeddedName(item.dataset.docName).controlled.length,
        callback: (item) => this._onApplyToSelected(item),
        sort: 400,
      },
      {
        name: localize('Duplicate', false),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) =>
          game.user.isGM &&
          this.presetsDuplicatable &&
          Preset.isEditable(item.dataset.uuid) &&
          !item.classList.contains('virtual'),
        callback: (item) =>
          this._onCopySelectedPresets(null, {
            keepFolder: true,
            keepId: false,
          }),
        sort: 500,
      },
      {
        name: localize('presets.copy-source-to-clipboard'),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => item.dataset.uuid.startsWith('virtual@'),
        callback: (item) => game.clipboard.copyPlainText(item.dataset.uuid.substring(8)),
        sort: 600,
      },
      {
        name: localize('presets.copy-to-clipboard'),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => game.user.isGM && $(this.form).find('.item-list').find('.item.selected').length === 1,
        callback: (item) => this._onCopyPresetToClipboard(),
        sort: 700,
      },
      {
        name: 'Copy UUID',
        icon: '<i class="fa-solid fa-passport"></i>',
        condition: () => game.user.isGM,
        callback: (item) => this._onCopyUUID(item),
        sort: 800,
      },
      {
        name: localize('presets.export-as-json'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: (item) => this._onExportSelectedPresets(),
        sort: 900,
      },
      {
        name: localize('presets.export-to-compendium'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: () => game.user.isGM && this.presetsDuplicatable,
        callback: (item) => this._onExportSelectedPresetsToComp(),
        sort: 1000,
      },
      {
        name: localize('CONTROLS.CommonDelete', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (item) =>
          game.user.isGM &&
          !this.presetsDisableDelete &&
          (this.presetsForceAllowDelete ||
            (Preset.isEditable(item.dataset.uuid) && !item.classList.contains('virtual'))),
        callback: (item) => this._onDeleteSelectedPresets(item),
        sort: 1100,
      },
    ];
  }

  async _onImportFauxScene(item) {
    const preset = await PresetAPI.getPreset({ uuid: item.dataset.uuid });
    const scene = await fromUuid(preset.data[0].uuid);
    if (scene) game.scenes.importFromCompendium(scene.compendium, scene.id, {}, { renderSheet: true });
    else sceneNotFoundError(preset);
  }

  async _onSpawnScene(item) {
    const preset = await PresetAPI.getPreset({ uuid: item.dataset.uuid });
    const scene = await fromUuid(preset.data[0].uuid);
    if (scene) return spawnSceneAsPreset(scene);
    else sceneNotFoundError(preset);
  }

  _getFolderContextOptions() {
    return [
      {
        name: 'Edit',
        icon: '<i class="fas fa-edit"></i>',
        condition: (header) => {
          const uuid = header.closest('.folder').dataset.uuid;
          const folder = fromUuidSync(uuid);
          return !folder.virtual || folder instanceof PresetPackFolder;
        },
        callback: (header) => this._onFolderEdit(header),
      },
      {
        name: 'Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) => {
          const uuid = header.closest('.folder').dataset.uuid;
          const folder = fromUuidSync(uuid);
          return folder.indexable;
        },
        callback: (header) => {
          FileIndexer.saveFolderToCache(this.tree.allFolders.get($(header).closest('.folder').data('uuid')));
        },
      },
      {
        name: 'Auto-Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) => {
          const uuid = header.closest('.folder').dataset.uuid;
          const folder = fromUuidSync(uuid);
          return folder.indexable && !game.settings.get(MODULE_ID, 'presetBrowser').autoSaveFolders?.includes(uuid);
        },
        callback: (header) => {
          const settings = game.settings.get(MODULE_ID, 'presetBrowser');
          settings.autoSaveFolders = [...(settings.autoSaveFolders ?? []), $(header).closest('.folder').data('uuid')];
          game.settings.set(MODULE_ID, 'presetBrowser', settings);
        },
      },
      {
        name: 'Disable Auto-Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) => {
          const uuid = header.closest('.folder').dataset.uuid;
          const folder = fromUuidSync(uuid);
          return (
            folder.indexable &&
            game.settings
              .get(MODULE_ID, 'presetBrowser')
              .autoSaveFolders?.includes($(header).closest('.folder').data('uuid'))
          );
        },
        callback: (header) => {
          const settings = game.settings.get(MODULE_ID, 'presetBrowser');
          const uuid = $(header).closest('.folder').data('uuid');
          settings.autoSaveFolders = (settings.autoSaveFolders ?? []).filter((i) => i !== uuid);
          game.settings.set(MODULE_ID, 'presetBrowser', settings);
        },
      },
      {
        name: 'Export to Compendium',
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: (header) => {
          const uuid = header.closest('.folder').dataset.uuid;
          const folder = fromUuidSync(uuid);
          return !(folder instanceof VirtualFileFolder);
        },
        callback: (header) => {
          this._onExportFolder($(header).closest('.folder').data('uuid'));
        },
      },
      {
        name: localize('FOLDER.Remove', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (header) => PresetFolder.isEditable($(header).closest('.folder').data('uuid')),
        callback: (header) => this._onFolderDelete($(header).closest('.folder').data('uuid')),
      },
      {
        name: localize('FOLDER.Delete', false),
        icon: '<i class="fas fa-dumpster"></i>',
        condition: (header) => PresetFolder.isEditable($(header).closest('.folder').data('uuid')),
        callback: (header) =>
          this._onFolderDelete($(header).closest('.folder').data('uuid'), {
            deleteAll: true,
          }),
      },
      {
        name: 'Randomize Child Folder Colors',
        icon: '<i class="fas fa-dice"></i>',
        condition: () => game.settings.get(MODULE_ID, 'debug'),
        callback: (header) =>
          randomizeChildrenFolderColors($(header).closest('.folder').data('uuid'), this.tree, () => this.render(true)),
      },
    ];
  }

  async _onApplyToSelected(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    if (!selected.length) return;

    // Confirm that all presets are of the same document type
    const types = new Set();
    for (const s of selected) {
      types.add(s.documentName);
      if (types.size > 1) {
        ui.notifications.warn(localize('presets.apply-to-selected-warn'));
        return;
      }
    }

    const controlled = canvas.getLayerByEmbeddedName(selected[0].documentName).controlled;
    if (!controlled.length) return;

    for (const s of selected) {
      pasteDataUpdate(controlled, s, false, true);
    }
  }

  async _onCopySelectedPresets(pack, { keepFolder = false, keepId = true } = {}) {
    const [selected, _] = await this._getSelectedPresets();

    const presets = selected.map((s) => {
      const p = s.clone();
      if (!keepFolder) p.folder = null;
      if (!keepId) p.id = foundry.utils.randomID();
      return p;
    });

    await PresetCollection.set(presets, pack);

    if (selected.length) this.render(true);
  }

  async _onActivateBrush(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    BrushMenu.addPresets(selected);
  }

  /**
   * Open journals of selected presets.
   */
  async _onOpenJournal() {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    selected.forEach((p) => p.openJournal());
  }

  /**
   * Open PresetConfig form to edit all selected presets.
   * @param {HTMLElement} item
   */
  async _onEditSelectedPresets(item) {
    const [selected, _] = await this._getSelectedPresets({
      virtualOnly: item.classList.contains('virtual'),
      editableOnly: true,
    });
    if (selected.length) {
      // Position edit window just bellow the item
      item = $(item);
      const options = item.offset();
      options.top += item.height();

      this._editPresets(selected, options);
    }
  }

  /**
   * Returns an array of selected presets and their elements
   * @param {Boolean} editableOnly filter and return editable presets only
   * @param {Boolean} virtualOnly filter and return virtual presets only
   * @param {Boolean} full load preset data before returning
   * @returns {Array[Array[Preset], Array[Jquery]}
   */
  async _getSelectedPresets({ editableOnly = false, virtualOnly = false, full = true } = {}) {
    const uuids = [];
    let selector = '.item.selected';
    if (virtualOnly) selector += '.virtual';

    let items = $(this.form).find('.item-list').find(selector);
    if (editableOnly)
      items = items.filter(function () {
        return Preset.isEditable($(this).data('uuid'));
      });

    items.each(function () {
      const uuid = $(this).data('uuid');
      uuids.push(uuid);
    });

    const selected = await PresetCollection.getBatch(uuids, { full });
    return [selected, items];
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    if (!('left' in options) && event) {
      options.left = event.originalEvent.x - PresetConfig.DEFAULT_OPTIONS.position.width / 2;
      options.top = event.originalEvent.y;
    }

    new PresetConfig(presets, options).render(true);
  }

  async _playPreview(event) {
    clearTimeout(this._previewTimeout);
    this._previewTimeout = setTimeout(() => this._renderPlayPreview(event), 200);
  }

  async _endPreview() {
    clearTimeout(this._previewTimeout);
    game.audio.playing.forEach((s) => {
      if (s._mePreview) s.stop();
    });
    if (this._previewElement) {
      this._previewElement.remove();
      this._previewElement = null;
    }
  }

  async _renderPlayPreview(event) {
    await this._endPreview();
    const uuid = $(event.currentTarget).data('uuid');
    if (!uuid) return;

    const addClearPreviewElement = () => {
      if (!this._previewElement) {
        this._previewElement = $('<div class="mePreviewElement"></div>');
        $(document.body).append(this._previewElement);
      } else {
        this._previewElement.empty();
      }
    };

    const preset = await PresetCollection.get(uuid, { full: false });
    if (preset.documentName === 'AmbientSound') {
      const src = isAudio(preset.img) ? preset.img : (await preset.load()).data[0]?.path;
      if (!src) return;
      const sound = await game.audio.play(src);
      sound._mePreview = true;

      addClearPreviewElement();
      this._previewElement.append(`<img width="320" height="320" src='icons/svg/sound.svg'></img>`);
    } else if (preset.documentName === 'Tile' && preset.thumbnail === 'icons/svg/video.svg') {
      await preset.load();
      const src = preset.data[0].texture?.src;
      if (src && isVideo(src)) {
        addClearPreviewElement();
        const ratio = visualViewport.width / 1024;
        this._previewElement.append(
          `<video width="${320 * ratio}" height="${240 * ratio}" autoplay loop><source src="${src}" type="video/${src
            .split('.')
            .pop()
            .toLowerCase()}"></video>`
        );
      }
    }
  }

  // TODO confirm if this is correct way to handle APP v2
  async close(options = {}) {
    this._endPreview();
    return super.close(options);
  }

  static _onFolderClick(event, target) {
    const folderElement = $(target).closest('.folder');

    const uuid = folderElement.data('uuid');

    const folder = fromUuidSync(uuid);
    if (folder.expanded) this._folderCollapse(folderElement, folder);
    else this._folderExpand(folderElement, folder);
  }

  async _folderExpand(folderElement, folder) {
    game.folders._expanded[folder.uuid] = true;

    if (folderElement.find('.folder-items').length) {
      folderElement.removeClass('collapsed');
      folderElement.find('header .folder-icon').first().removeClass('fa-folder-closed').addClass('fa-folder-open');
    } else {
      const content = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/preset/container/partials/folder.hbs`,
        {
          folder,
          createEnabled: Boolean(this.configApp),
          callback: Boolean(this.callback),
          sortable: !folder.uuid.startsWith('virtual@') && folder.pack === PresetCollection.workingPack,
        }
      );
      folderElement.replaceWith(content);
    }
  }

  _folderCollapse(folderElement, folder) {
    folderElement.addClass('collapsed');
    folderElement.find('header .folder-icon').first().removeClass('fa-folder-open').addClass('fa-folder-closed');
    game.folders._expanded[folder.uuid] = false;
  }

  async _renderContent({
    callback = false,
    presets,
    nodes,
    createEnabled = false,
    externalTrees,
    search = false,
  } = {}) {
    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/preset/container/partials/presetsContent.hbs`,
      {
        callback,
        presets,
        nodes,
        createEnabled,
        externalTrees,
        search,
      }
    );
    $(this.form).find('.item-list').html(content);
  }

  _onCopyUUID(item) {
    game.clipboard.copyPlainText(item.dataset.uuid);
    ui.notifications.info(
      game.i18n.format('DOCUMENT.IdCopiedClipboard', {
        label: item.attributes.name,
        type: 'uuid',
        id: item.dataset.uuid,
      })
    );
  }

  async _onItemSort(sourceUuids, targetUuid, { before = true, folderUuid = null } = {}) {
    throw new Error('A subclass of the PresetContainer must implement the _onItemSort method.');
  }

  async _onFolderDelete(uuid, { render = true, deleteAll = false } = {}) {
    throw new Error('A subclass of the PresetContainer must implement the _onFolderDelete method.');
  }

  async _onExportSelectedPresets() {
    const [selected, _] = await this._getSelectedPresets();
    exportPresets(selected);
  }

  async _onExportSelectedPresetsToComp() {
    throw new Error('A subclass of the PresetContainer must implement the _onExportSelectedPresetsToComp method.');
  }

  async _onDeleteSelectedPresets(item) {
    const [selected, items] = await this._getSelectedPresets({
      editableOnly: true,
      full: false,
    });

    if (selected.length) {
      const confirm =
        selected.length === 0
          ? true
          : await Dialog.confirm({
              title: `${localize('common.delete')} [ ${selected.length} ]`,
              content: `<p>${localize('AreYouSure', false)}</p><p>${localFormat('presets.delete-presets-warn', {
                count: selected.length,
              })}</p>`,
            });

      if (confirm) {
        await PresetCollection.delete(selected);
        items.remove();
      }
    }
  }

  async _onOpenBag(uuid) {
    if (!uuid) {
      let [selected, _] = await this._getSelectedPresets({
        editableOnly: false,
      });

      if (selected.length) {
        const module = await import('./bagApp.js');
        selected.filter((p) => p.documentName === 'Bag').forEach((p) => module.openBag(p.uuid));
      }
    } else {
      const module = await import('./bagApp.js');
      module.openBag(uuid);
    }
  }
}

/**
 * Controls select/multi-select flow for item lists
 * @param {*} e item click event
 * @param {*} itemList list of items that this item exists within
 */
export function itemSelect(event, element, itemList) {
  if (!itemList) itemList = $(element).closest('.item-list');
  const item = $(element);
  const items = itemList.find('.item');
  const lastSelected = items.filter('.last-selected');

  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    lastSelected.removeClass('last-selected');
    const wasSelected = item.hasClass('selected');
    items.removeClass('selected');
    if (!wasSelected) item.addClass('selected').addClass('last-selected');
  } else if (event.ctrlKey || event.metaKey) {
    item.toggleClass('selected');
    if (item.hasClass('selected')) {
      lastSelected.removeClass('last-selected');
      item.addClass('last-selected');
    } else item.removeClass('last-index');
  } else if (event.shiftKey) {
    if (lastSelected.length) {
      let itemIndex = items.index(item);
      let lastSelectedIndex = items.index(lastSelected);

      if (itemIndex === lastSelectedIndex) {
        item.toggleClass('selected');
        if (item.hasClass('selected')) item.addClass('last-selected');
        else lastSelected.removeClass('last-selected');
      } else {
        let itemArr = items.toArray();
        if (itemIndex > lastSelectedIndex) {
          for (let i = lastSelectedIndex; i <= itemIndex; i++) $(itemArr[i]).addClass('selected');
        } else {
          for (let i = lastSelectedIndex; i >= itemIndex; i--) $(itemArr[i]).addClass('selected');
        }
      }
    } else {
      lastSelected.removeClass('last-selected');
      item.toggleClass('selected');
      if (item.hasClass('selected')) item.addClass('last-selected');
    }
  }
}

/**
 * Check if mouse is currently within bound of an application
 * @param {*} event
 * @returns
 */
function checkMouseInWindow(event) {
  let inWindow = false;

  if (ui.sidebar?.element?.length) {
    inWindow = _coordOverElement(event.pageX, event.pageY, $(ui.sidebar.element));
  }
  if (!inWindow) {
    inWindow = _coordOverElement(event.pageX, event.pageY, $(event.target).closest('.application'));
  }

  return inWindow;
}

function _coordOverElement(x, y, element) {
  var offset = element.offset();
  let appX = offset.left;
  let appY = offset.top;
  let appW = element.width();
  let appH = element.height();

  if (x > appX && x < appX + appW && y > appY && y < appY + appH) {
    return true;
  }
  return false;
}

/**
 * Handle preset being dragged out onto the canvas
 */
export function registerPresetDragDropHooks() {
  Hooks.on('dropCanvasData', async (canvas, point, event) => {
    const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (dragData.type !== 'preset') return;

    const preset = await MassEdit.getPreset({ uuid: dragData.uuids[0] });
    if (preset.documentName === 'Scene') {
      applyPresetToScene(preset);
    } else if (SUPPORTED_PLACEABLES.includes(preset.documentName)) {
      MassEdit.spawnPreset({
        preset,
        ...point,
        layerSwitch: PresetBrowser.CONFIG.switchLayer,
        scaleToGrid: PresetBrowser.CONFIG.autoScale || Scenescape.active,
        pivot: PIVOTS.CENTER,
      });
    }
  });
}
