import { pasteDataUpdate } from '../../applications/formUtils.js';
import { getMassEditForm } from '../../applications/multiConfig.js';
import { BrushMenu } from '../brush.js';
import { MODULE_ID, PIVOTS, SUPPORTED_PLACEABLES } from '../constants.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { applyPresetToScene, isAudio, localFormat, localize, spawnSceneAsPreset } from '../utils.js';
import { PresetAPI, PresetCollection, PresetFolder, PresetPackFolder, VirtualFileFolder } from './collection.js';
import { PresetBrowser } from './browser/browserApp.js';
import { Preset } from './preset.js';
import { Spawner } from './spawner.js';
import { exportPresets, FolderState, isVideo, sceneNotFoundError } from './utils.js';
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
}

export class PresetContainerV2 extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static _oldPositions = {};

  constructor(opts1, opts2) {
    super(opts2);

    // Drag/Drop tracking
    this.dragType = null;
    this.dragData = null;
    this.draggedElements = null;

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
      this.dragType = 'item';

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
      this.dragData = uuids;
      this.draggedElements = itemList.find('.item.selected');

      if (event.originalEvent.dataTransfer) {
        event.originalEvent.dataTransfer.clearData();
        event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({ uuids }));
      }
    });

    if (this.presetsSortable) {
      html.on('dragleave', '.item.sortable', (event) => {
        $(event.target).closest('.item').removeClass('drag-bot').removeClass('drag-top');
      });

      html.on('dragover', '.item.sortable', (event) => {
        if (this.dragType !== 'item') return;
        if (!this.draggedElements.hasClass('sortable')) return;

        const targetItem = $(event.target).closest('.item');

        // Check that we're not above a selected item  (i.e. item being dragged)
        if (targetItem.hasClass('selected')) return;

        // Determine if mouse is hovered over top, middle, or bottom
        var domRect = event.currentTarget.getBoundingClientRect();
        let prc = event.offsetY / domRect.height;

        if (prc < 0.2) {
          targetItem.removeClass('drag-bot').addClass('drag-top');
        } else if (prc > 0.8) {
          targetItem.removeClass('drag-top').addClass('drag-bot');
        }
      });

      html.on('drop', '.item.sortable', (event) => {
        if (this.lastSearch?.length) return; // Prevent drops while searching
        if (this.dragType !== 'item') return;
        if (!this.draggedElements.hasClass('sortable')) return;

        const targetItem = $(event.target).closest('.item');

        const top = targetItem.hasClass('drag-top');
        targetItem.removeClass('drag-bot').removeClass('drag-top');

        const uuids = this.dragData;
        if (uuids) {
          if (!targetItem.hasClass('selected')) {
            // Move HTML Elements
            (top ? uuids : uuids.reverse()).forEach((uuid) => {
              const item = html.find(`.item[data-uuid="${uuid}"]`);
              if (item) {
                if (top) item.insertBefore(targetItem);
                else item.insertAfter(targetItem);
              }
            });

            this._onItemSort(uuids, targetItem.data('uuid'), {
              before: top,
              folderUuid: targetItem.closest('.folder').data('uuid'),
            });
          }
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
      });
    }

    html.on('dragend', '.item', (event) => {
      if (!checkMouseInWindow(event)) {
        this._onPresetDragOut(event);
      }
    });

    // ================
    // Folder Listeners

    if (this.presetsSortable) {
      html.on('dragstart', '.folder.sortable', (event) => {
        if (this.dragType == 'item') return;
        this.dragType = 'folder';

        const folder = $(event.target).closest('.folder');
        const uuids = [folder.data('uuid')];

        $(event.target)
          .find('.folder')
          .each(function () {
            uuids.push($(this).data('uuid'));
          });

        this.dragData = uuids;
      });

      html.on('dragleave', '.folder.sortable header', (event) => {
        $(event.target).closest('.folder').removeClass('drag-mid').removeClass('drag-top');
      });

      html.on('dragover', '.folder.sortable header', (event) => {
        const targetFolder = $(event.target).closest('.folder');

        if (this.dragType === 'folder') {
          // Check that we're not above folders being dragged
          if (this.dragData.includes(targetFolder.data('uuid'))) return;

          // Determine if mouse is hovered over top, middle, or bottom
          var domRect = event.currentTarget.getBoundingClientRect();
          let prc = event.offsetY / domRect.height;

          if (prc < 0.2) {
            targetFolder.removeClass('drag-mid').addClass('drag-top');
          } else {
            targetFolder.removeClass('drag-top').addClass('drag-mid');
          }
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          targetFolder.addClass('drag-mid');
        }
      });

      html.on('drop', '.folder.sortable header', (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching

        const targetFolder = $(event.target).closest('.folder');

        if (this.dragType === 'folder') {
          const top = targetFolder.hasClass('drag-top');
          targetFolder.removeClass('drag-mid').removeClass('drag-top');

          const uuids = this.dragData;
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
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          targetFolder.removeClass('drag-mid');
          const uuids = this.dragData;

          // Move HTML Elements
          const presetItems = targetFolder.children('.preset-items');
          uuids?.forEach((uuid) => {
            const item = html.find(`.item[data-uuid="${uuid}"]`);
            if (item.length) presetItems.append(item);
          });

          this._onItemSort(uuids, null, {
            folderUuid: targetFolder.data('uuid'),
          });
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
      });

      html.on('drop', '.top-level-preset-items', (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching
        if (this.dragType === 'folder') {
          // Move HTML Elements
          const target = html.find('.top-level-folder-items');
          const folder = html.find(`.folder[data-uuid="${this.dragData[0]}"]`);
          target.append(folder);

          this._onFolderSort(this.dragData[0], null);
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          const uuids = this.dragData;

          // Move HTML Elements
          const target = html.find('.top-level-preset-items');
          uuids?.forEach((uuid) => {
            const item = html.find(`.item[data-uuid="${uuid}"]`);
            if (item.length) target.append(item);
          });

          this._onItemSort(uuids, null);
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
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
          const folder = this.tree.allFolders.get($(header).closest('.folder').data('uuid'));
          return !folder.virtual || folder instanceof PresetPackFolder;
        },
        callback: (header) => this._onFolderEdit(header),
      },
      {
        name: 'Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) => this.tree.allFolders.get($(header).closest('.folder').data('uuid'))?.indexable,
        callback: (header) => {
          FileIndexer.saveFolderToCache(this.tree.allFolders.get($(header).closest('.folder').data('uuid')));
        },
      },
      {
        name: 'Auto-Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) =>
          this.tree.allFolders.get($(header).closest('.folder').data('uuid'))?.indexable &&
          !game.settings
            .get(MODULE_ID, 'presetBrowser')
            .autoSaveFolders?.includes($(header).closest('.folder').data('uuid')),
        callback: (header) => {
          const settings = game.settings.get(MODULE_ID, 'presetBrowser');
          settings.autoSaveFolders = [...(settings.autoSaveFolders ?? []), $(header).closest('.folder').data('uuid')];
          game.settings.set(MODULE_ID, 'presetBrowser', settings);
        },
      },
      {
        name: 'Disable Auto-Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) =>
          this.tree.allFolders.get($(header).closest('.folder').data('uuid'))?.indexable &&
          game.settings
            .get(MODULE_ID, 'presetBrowser')
            .autoSaveFolders?.includes($(header).closest('.folder').data('uuid')),
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
          const folder = this.tree.allFolders.get($(header).closest('.folder').data('uuid'));
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

  async _onPresetDragOut(event) {
    const uuid = $(event.originalEvent.target).closest('.item').data('uuid');
    const preset = await PresetCollection.get(uuid);
    if (!preset) return;

    // If released on top of a Mass Edit form, apply the preset to it instead of spawning it
    let form = getMassEditForm();
    if (form && form.documentName === preset.documentName && hoverForm(form, event.pageX, event.pageY)) {
      form._applyPreset(preset);
      return;
    }

    // If release on top of a Preset Bag, pass dragged UUIDs to it
    let forms = Array.from(foundry.applications.instances.values()).filter((w) => w.presetBag);
    for (const form of forms) {
      if (form && hoverForm(form, event.pageX, event.pageY)) {
        form._dropUuids(this.dragData);
        return;
      }
    }

    // If it's a scene preset apply it to the currently active scene
    if (preset.documentName === 'Scene') {
      applyPresetToScene(preset);
      return;
    }

    if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) return;

    // For some reason canvas.mousePosition does not get updated during drag and drop
    // Acquire the cursor position transformed to Canvas coordinates
    let mouseX;
    let mouseY;
    let mouseZ;

    if (game.Levels3DPreview?._active) {
      game.Levels3DPreview.interactionManager._onMouseMove(event, true);
      const { x, y, z } = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
      mouseX = x;
      mouseY = y;
      mouseZ = z;
    } else {
      const [x, y] = [event.clientX, event.clientY];
      const t = canvas.stage.worldTransform;

      mouseX = (x - t.tx) / canvas.stage.scale.x;
      mouseY = (y - t.ty) / canvas.stage.scale.y;

      if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
        mouseX -= canvas.dimensions.size / 2;
        mouseY -= canvas.dimensions.size / 2;
      }
    }

    this._onSpawnPreset(preset, { x: mouseX, y: mouseY, z: mouseZ, preview: false });
  }

  static _onFolderClick(event, target) {
    const folderElement = $(target).closest('.folder');

    const uuid = folderElement.data('uuid');

    const folder = this.tree.allFolders.get(uuid);
    if (folder.expanded) this._folderCollapse(folderElement, folder);
    else this._folderExpand(folderElement, folder);
  }

  async _folderExpand(folderElement, folder) {
    FolderState.setExpanded(folder.uuid, true);
    folder.expanded = true;

    if (folderElement.find('.folder-items').length) {
      folderElement.removeClass('collapsed');
      folderElement.find('header .folder-icon').first().removeClass('fa-folder-closed').addClass('fa-folder-open');
    } else {
      let content = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/preset/container/partials/folder.hbs`,
        {
          folder,
          createEnabled: Boolean(this.configApp),
          callback: Boolean(this.callback),
          sortable:
            !folder.uuid.startsWith('virtual@') && fromUuidSync(folder.uuid)?.pack === PresetCollection.workingPack,
        }
      );
      folderElement.replaceWith(content);
    }
  }

  _folderCollapse(folderElement, folder) {
    folderElement.addClass('collapsed');
    folderElement.find('header .folder-icon').first().removeClass('fa-folder-open').addClass('fa-folder-closed');

    FolderState.setExpanded(folder.uuid, false);
    folder.expanded = false;
  }

  async _renderContent({ callback = false, presets, folders, createEnabled = false, extFolders } = {}) {
    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/preset/container/partials/presetsContent.hbs`,
      {
        callback,
        presets,
        folders,
        createEnabled,
        extFolders,
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
 * Return true if mouse is hovering over the provided form
 * @param {Number} mouseX
 * @param {Number} mouseY
 * @returns {Application|null} MassEdit form
 */
function hoverForm(form, mouseX, mouseY) {
  if (!form) return false;

  const hitTest = function (app) {
    const position = app.position;
    const appX = position.left;
    const appY = position.top;
    const height = Number.isNumeric(position.height) ? position.height : $(app.element).height();
    const width = Number.isNumeric(position.width) ? position.width : $(app.element).width();

    if (mouseX > appX && mouseX < appX + width && mouseY > appY && mouseY < appY + height) return true;
    return false;
  };

  return hitTest(form);
}
