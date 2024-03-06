import { TokenDataAdapter } from '../../applications/dataAdapters.js';
import { copyToClipboard, pasteDataUpdate } from '../../applications/forms.js';
import { showMassEdit } from '../../applications/multiConfig.js';
import { countFolderItems, trackProgress } from '../../applications/progressDialog.js';
import { Brush } from '../brush.js';
import { importPresetFromJSONDialog } from '../dialogs.js';
import { SortingHelpersFixed } from '../fixedSort.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, UI_DOCS, applyPresetToScene, localFormat, localize } from '../utils.js';
import { PresetAPI, PresetCollection } from './collection.js';
import { DOC_ICONS } from './preset.js';
import { FolderState, mergePresetDataToDefaultDoc, placeableToData } from './utils.js';

const SEARCH_MIN_CHAR = 2;

// const FLAG_DATA = {
//   documentName: null,
//   data: null,
//   addSubtract: null,
//   randomize: null,
// };

const SORT_MODES = {
  manual: {
    get tooltip() {
      return localize('SIDEBAR.SortModeManual', false);
    },
    icon: '<i class="fa-solid fa-arrow-down-short-wide"></i>',
  },
  alphabetical: {
    get tooltip() {
      return localize('SIDEBAR.SortModeAlpha', false);
    },
    icon: '<i class="fa-solid fa-arrow-down-a-z"></i>',
  },
};

const SEARCH_MODES = {
  p: {
    get tooltip() {
      return localize('presets.search-presets');
    },
    icon: '<i class="fas fa-search"></i>',
  },
  pf: {
    get tooltip() {
      return localize('presets.search-presets-folders');
    },
    icon: '<i class="fa-solid fa-folder-magnifying-glass"></i>',
  },
};

export class MassEditPresets extends FormApplication {
  static objectHover = false;
  static lastSearch;

  constructor(configApp, callback, docName, options = {}) {
    if (!options.preventPositionOverride && MassEditPresets.lastPositionLeft) {
      options.left = MassEditPresets.lastPositionLeft;
      options.top = MassEditPresets.lastPositionTop;
    }

    super({}, options);
    this.callback = callback;

    // Drag/Drop tracking
    this.dragType = null;
    this.dragData = null;
    this.draggedElements = null;

    if (!configApp && UI_DOCS.includes(docName)) {
      const docLock = game.settings.get(MODULE_ID, 'presetDocLock');
      this.docName = docLock || docName;
    } else {
      this.configApp = configApp;
      this.docName = docName || this.configApp.documentName;
    }

    this.canvas3dActive = Boolean(game.Levels3DPreview?._active);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet'],
      template: `modules/${MODULE_ID}/templates/preset/presets.html`,
      resizable: true,
      minimizable: true,
      width: 350,
      height: 900,
      scrollY: ['ol.item-list'],
    });
  }

  get title() {
    let title = localize('common.presets');
    if (!UI_DOCS.includes(this.docName)) title += ` [${this.docName}]`;
    else title += ` [${localize('common.placeable')}]`;
    return title;
  }

  async getData(options) {
    const data = super.getData(options);
    // If we're re-rendering deactivate the brush
    if (this._activeBrush) Brush.deactivate();

    // Cache partials
    await getTemplate(`modules/${MODULE_ID}/templates/preset/preset.html`, 'me-preset');
    await getTemplate(`modules/${MODULE_ID}/templates/preset/presetFolder.html`, 'me-preset-folder');
    await getTemplate(`modules/${MODULE_ID}/templates/preset/presetsContent.html`, 'me-presets-content');

    const displayExtCompendiums = game.settings.get(MODULE_ID, 'presetExtComp');

    this.tree = await PresetCollection.getTree(this.docName, !displayExtCompendiums);
    data.presets = this.tree.presets;
    data.folders = this.tree.folders;
    data.staticFolders = this.tree.staticFolders.length ? this.tree.staticFolders : null;

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = SUPPORTED_PLACEABLES.includes(this.docName) || this.docName === 'ALL';
    data.allowDocumentSwap = UI_DOCS.includes(this.docName) && !this.configApp;
    data.docLockActive = game.settings.get(MODULE_ID, 'presetDocLock') === this.docName;
    data.layerSwitchActive = game.settings.get(MODULE_ID, 'presetLayerSwitch');
    data.scaling = game.settings.get(MODULE_ID, 'presetScaling');
    data.extCompActive = displayExtCompendiums;
    data.sortMode = SORT_MODES[game.settings.get(MODULE_ID, 'presetSortMode')];
    data.searchMode = SEARCH_MODES[game.settings.get(MODULE_ID, 'presetSearchMode')];
    data.displayDragDropMessage = data.allowDocumentSwap && !(this.tree.presets.length || this.tree.folders.length);
    data.canvas3dActive = this.canvas3dActive;

    data.lastSearch = MassEditPresets.lastSearch;

    data.docs = UI_DOCS.reduce((obj, key) => {
      return {
        ...obj,
        [key]: DOC_ICONS[key],
      };
    }, {});

    data.documents = UI_DOCS;
    data.currentDocument = this.docName;

    data.callback = Boolean(this.callback);

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    const hoverOverlay = html.closest('.window-content').find('.drag-drop-overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (canvas.activeLayer?.preview?.children.some((c) => c._original?.mouseInteractionManager?.isDragging)) {
          hoverOverlay.show();
          MassEditPresets.objectHover = true;
        } else {
          hoverOverlay.hide();
          MassEditPresets.objectHover = false;
        }
      })
      .on('mouseout', () => {
        hoverOverlay.hide();
        MassEditPresets.objectHover = false;
      });

    // Create Preset from Selected
    html.find('.create-preset').on('click', () => {
      const controlled = canvas.activeLayer.controlled;
      if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
        this.dropPlaceable(controlled);
      }
    });

    // =====================
    // Preset multi-select & drag Listeners
    const itemList = html.find('.item-list');

    // Multi-select
    html.on('click', '.item', (event) => {
      itemSelect(event, itemList);
      if (this._activeBrush) this._toggleBrush(event);
    });
    html.on('dragstart', '.item', (event) => {
      this.dragType = 'item';

      const item = $(event.target).closest('.item');

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
    });
    html.on('dragleave', '.item.editable', (event) => {
      $(event.target).closest('.item').removeClass('drag-bot').removeClass('drag-top');
    });

    html.on('dragover', '.item.editable', (event) => {
      if (this.dragType !== 'item') return;
      if (!this.draggedElements.hasClass('editable')) return;

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

    html.on('drop', '.item.editable', (event) => {
      if (this.dragType !== 'item') return;
      if (!this.draggedElements.hasClass('editable')) return;

      const targetItem = $(event.target).closest('.item');

      const top = targetItem.hasClass('drag-top');
      targetItem.removeClass('drag-bot').removeClass('drag-top');

      const uuids = this.dragData;
      if (uuids) {
        if (!targetItem.hasClass('selected')) {
          // Move HTML Elements
          (top ? uuids : uuids.reverse()).forEach((uuid) => {
            const item = itemList.find(`.item[data-uuid="${uuid}"]`);
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

    html.on('dragend', '.item', (event) => {
      if (!checkMouseInWindow(event)) {
        this._onPresetDragOut(event);
      }
    });

    // ================
    // Folder Listeners
    html.on('click', '.folder > header', (event) => this._folderToggle($(event.target).closest('.folder')));

    html.on('dragstart', '.folder.editable', (event) => {
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

    html.on('dragleave', '.folder.editable header', (event) => {
      $(event.target).closest('.folder').removeClass('drag-mid').removeClass('drag-top');
    });

    html.on('dragover', '.folder.editable header', (event) => {
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
      } else if (this.dragType === 'item' && this.draggedElements.hasClass('editable')) {
        targetFolder.addClass('drag-mid');
      }
    });

    html.on('drop', '.folder.editable header', (event) => {
      if (this._foundryDrop(event)) return;
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
      } else if (this.dragType === 'item' && this.draggedElements.hasClass('editable')) {
        targetFolder.removeClass('drag-mid');
        const uuids = this.dragData;

        // Move HTML Elements
        const presetItems = targetFolder.children('.preset-items');
        uuids?.forEach((uuid) => {
          const item = itemList.find(`.item[data-uuid="${uuid}"]`);
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
      if (this._foundryDrop(event)) return;
      if (this.dragType === 'folder') {
        // Move HTML Elements
        const target = html.find('.top-level-folder-items');
        const folder = html.find(`.folder[data-uuid="${this.dragData[0]}"]`);
        target.append(folder);

        this._onFolderSort(this.dragData[0], null);
      } else if (this.dragType === 'item' && this.draggedElements.hasClass('editable')) {
        const uuids = this.dragData;

        // Move HTML Elements
        const target = html.find('.top-level-preset-items');
        uuids?.forEach((uuid) => {
          const item = itemList.find(`.item[data-uuid="${uuid}"]`);
          if (item.length) target.append(item);
        });

        this._onItemSort(uuids, null);
      }

      this.dragType = null;
      this.dragData = null;
      this.draggedElements = null;
    });
    // End of Folder Listeners
    // ================

    html.on('click', '.toggle-sort', this._onToggleSort.bind(this));
    html.on('click', '.toggle-search-mode', this._onToggleSearch.bind(this));
    html.on('click', '.toggle-doc-lock', this._onToggleLock.bind(this));
    html.on('click', '.toggle-ext-comp', this._onToggleExtComp.bind(this));
    html.on('click', '.toggle-scaling', this._onToggleScaling.bind(this));
    html.on('click', '.toggle-layer-switch', this._onToggleLayerSwitch.bind(this));
    html.on('click', '.document-select', this._onDocumentChange.bind(this));
    html.on('dblclick', '.item', this._onDoubleClickPreset.bind(this));
    html.on('click', '.create-folder', this._onCreateFolder.bind(this));
    html.on('click', '.preset-create', this._onPresetCreate.bind(this));
    html.on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    html.on('click', '.preset-brush', this._toggleBrush.bind(this));
    html.on('click', '.preset-callback', this._onApplyPreset.bind(this));

    const headerSearch = html.find('.header-search input');
    headerSearch.on('input', (event) => this._onSearchInput(event));
    if ((MassEditPresets.lastSearch?.length ?? 0) >= SEARCH_MIN_CHAR) headerSearch.trigger('input');

    // Activate context menu
    this._contextMenu(html.find('.item-list'));
  }

  _folderToggle(folderElement) {
    const uuid = folderElement.data('uuid');

    let folder = this.tree.allFolders.get(uuid);
    let editable = true;
    if (!folder) {
      folder = this.tree.staticFolders.get(uuid);
      editable = false;
    }

    if (folder.expanded) {
      this._folderCollapse(folderElement, folder);
    } else {
      this._folderExpand(folderElement, folder, editable);
    }
  }

  async _folderExpand(folderElement, folder, editable) {
    FolderState.setExpanded(folder.uuid, true);
    folder.expanded = true;

    if (folderElement.find('.folder-items').length) {
      folderElement.removeClass('collapsed');
      folderElement.find('header h3 i').first().removeClass('fa-folder-closed').addClass('fa-folder-open');
    } else {
      let content = await renderTemplate(`modules/${MODULE_ID}/templates/preset/presetFolder.html`, {
        folder,
        createEnabled: Boolean(this.configApp),
        callback: Boolean(this.callback),
        editable: fromUuidSync(folder.uuid)?.pack === PresetCollection.workingPack,
      });
      folderElement.replaceWith(content);
    }
  }

  _folderCollapse(folderElement, folder) {
    folderElement.addClass('collapsed');
    folderElement.find('header h3 i').first().removeClass('fa-folder-open').addClass('fa-folder-closed');

    FolderState.setExpanded(folder.uuid, false);
    folder.expanded = false;
  }

  /**
   * Process drag and drop of an Actor or Folder of actors
   * @param {*} event
   * @returns
   */
  _foundryDrop(event) {
    const data = TextEditor.getDragEventData(event.originalEvent);
    if (!isEmpty(data)) {
      if (data.type === 'Folder') {
        const folder = fromUuidSync(data.uuid);
        if (folder.type !== 'Actor') return false;
        if (this._importTracker?.active) return false;

        trackProgress({
          title: 'Converting Actors',
          total: countFolderItems(folder),
        }).then(async (tracker) => {
          this._importTracker = tracker;
          await this._importActorFolder(folder, null, { keepId: true });
          this._importTracker?.stop();
        });
        return true;
      } else if (data.type === 'Actor') {
        PresetAPI.createPresetFromActorUuid(data.uuid, { keepId: true }).then((preset) => {
          if (preset) this.render(true);
        });
        return true;
      }

      return false;
    }
    return false;
  }

  async _importActorFolder(folder, parentFolder = null, options = {}) {
    let nFolder = new Folder.implementation(
      {
        _id: options.keepId ? folder.id : null,
        name: folder.name,
        type: 'JournalEntry',
        sorting: folder.sorting,
        folder: parentFolder,
        color: folder.color ?? '#000000',
        flags: { [MODULE_ID]: { types: ['ALL', 'Token'] } },
      },
      { pack: PresetCollection.workingPack }
    );

    nFolder = await Folder.create(nFolder, { pack: nFolder.pack, keepId: options.keepId });

    for (const child of folder.children) {
      if (!this._importTracker?.active) break;
      await this._importActorFolder(child.folder, nFolder.id, options);
    }

    for (const actor of folder.contents) {
      if (!this._importTracker?.active) break;
      await PresetAPI.createPresetFromActorUuid(actor.uuid, { folder: nFolder.id, keepId: options.keepId });
      this._importTracker.incrementCount();
    }

    this.render(true);
  }

  async _onDoubleClickPreset(event) {
    if (this.canvas3dActive) return;
    const uuid = $(event.target).closest('.item').data('uuid');
    if (!uuid) return;

    const preset = await PresetAPI.getPreset({ uuid });
    if (!preset) return;

    if (preset.documentName === 'Scene') {
      ui.notifications.info(`Mass Edit: ${localize('common.apply')} [${preset.name}]`);
      applyPresetToScene(preset);
    }

    if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) return;

    ui.notifications.info(`Mass Edit: ${localize('presets.spawning')} [${preset.name}]`);
    PresetAPI.spawnPreset({
      preset,
      coordPicker: true,
      taPreview: 'ALL',
      layerSwitch: game.settings.get(MODULE_ID, 'presetLayerSwitch'),
      scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
    });
  }

  _contextMenu(html) {
    ContextMenu.create(this, html, '.item', this._getItemContextOptions(), {
      hookName: 'MassEditPresetContext',
      onOpen: this._onRightClickPreset.bind(this),
    });
    ContextMenu.create(this, html, '.folder header', this._getFolderContextOptions(), {
      hookName: 'MassEditFolderContext',
    });
  }

  _getItemContextOptions() {
    return [
      {
        name: localize('CONTROLS.CommonEdit', false),
        icon: '<i class="fas fa-edit"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onEditSelectedPresets(item),
      },
      {
        name: localize('presets.open-journal'),
        icon: '<i class="fas fa-book-open"></i>',
        callback: (item) => this._onOpenJournal(item),
      },
      {
        name: localize('presets.apply-to-selected'),
        icon: '<i class="fas fa-arrow-circle-right"></i>',
        condition: (item) =>
          SUPPORTED_PLACEABLES.includes(item.data('doc-name')) &&
          canvas.getLayerByEmbeddedName(item.data('doc-name')).controlled.length,
        callback: (item) => this._onApplyToSelected(item),
      },
      {
        name: localize('Duplicate', false),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onCopySelectedPresets(null, { keepFolder: true, keepId: false }),
      },
      {
        name: localize('presets.copy-to-clipboard'),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => $(this.form).find('.item-list').find('.item.selected').length === 1,
        callback: (item) => this._onCopyPresetToClipboard(),
      },
      {
        name: localize('presets.export-as-json'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        callback: (item) => this._onExportSelectedPresets(),
      },
      {
        name: localize('presets.export-to-compendium'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        callback: (item) => this._onExportSelectedPresetsToComp(),
      },
      {
        name: localize('CONTROLS.CommonDelete', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onDeleteSelectedPresets(item),
      },
    ];
  }

  _getFolderContextOptions() {
    return [
      {
        name: 'Edit',
        icon: '<i class="fas fa-edit"></i>',
        condition: (header) => header.closest('.folder').hasClass('editable'),
        callback: (header) => this._onFolderEdit(header),
      },
      {
        name: 'Export to Compendium',
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        callback: (header) => this._onExportFolder(header.closest('.folder').data('uuid')),
      },
      {
        name: localize('FOLDER.Remove', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (header) => header.closest('.folder').hasClass('editable'),
        callback: (header) => this._onFolderDelete(header.closest('.folder').data('uuid')),
      },
      {
        name: localize('FOLDER.Delete', false),
        icon: '<i class="fas fa-dumpster"></i>',
        condition: (header) => header.closest('.folder').hasClass('editable'),
        callback: (header) =>
          this._onFolderDelete(header.closest('.folder').data('uuid'), {
            deleteAll: true,
          }),
      },
    ];
  }

  async _onExportFolder(uuid) {
    let { pack, keepId } = await new Promise((resolve) =>
      getCompendiumDialog(resolve, { exportTo: true, keepIdSelect: true })
    );
    if (pack && !this._importTracker?.active) {
      const folderDoc = await fromUuid(uuid);
      if (folderDoc) {
        this._importTracker = await trackProgress({
          title: 'Exporting Folder',
          total: countFolderItems(this.tree.allFolders.get(uuid)),
        });
        await this._onCopyFolder(uuid, null, pack, true, keepId);
        this._importTracker?.stop();
      }
    }
  }

  async _onCopyFolder(uuid, parentId = null, pack, render = true, keepId = true) {
    if (!pack) pack = PresetCollection.workingPack;

    const folder = this.tree.allFolders.get(uuid);
    const folderDoc = await fromUuid(uuid);

    if (folder) {
      let types;
      if (folderDoc) types = folderDoc.flags[MODULE_ID]?.types ?? ['ALL'];
      else types = ['ALL'];

      const data = {
        _id: keepId ? folder.id : null,
        name: folder.name,
        color: folder.color,
        sorting: folder.sorting,
        folder: parentId,
        flags: { [MODULE_ID]: { types } },
        type: 'JournalEntry',
      };
      const nFolder = await Folder.create(data, { pack, keepId });

      for (const preset of folder.presets) {
        if (!this._importTracker?.active) break;
        const p = (await preset.load()).clone();
        p.folder = nFolder.id;
        if (!keepId) p.id = foundry.utils.randomID();
        await PresetCollection.set(p, pack);
        this._importTracker?.incrementCount();
      }

      for (const child of folder.children) {
        if (!this._importTracker?.active) break;
        await this._onCopyFolder(child.uuid, nFolder.id, pack, false, keepId);
      }

      if (render) this.render(true);
    }
  }

  async _onExportSelectedPresetsToComp() {
    let { pack, keepId } = await new Promise((resolve) =>
      getCompendiumDialog(resolve, { exportTo: true, keepIdSelect: true })
    );
    if (pack) this._onCopySelectedPresets(pack, { keepId });
  }

  async _onCopySelectedPresets(pack, { keepFolder = false, keepId = true } = {}) {
    const [selected, _] = await this._getSelectedPresets();
    for (const preset of selected) {
      const p = preset.clone();
      if (!keepFolder) p.folder = null;
      if (!keepId) p.id = foundry.utils.randomID();
      await PresetCollection.set(p, pack);
    }
    if (selected.length) this.render(true);
  }

  async _onCopyPresetToClipboard() {
    const [selected, _] = await this._getSelectedPresets();
    if (selected.length) copyToClipboard(selected[0]);
  }

  async _getSelectedPresets({ editableOnly = false, full = true } = {}) {
    const uuids = [];
    const items = this.element.find('.item-list').find('.item.selected' + (editableOnly ? '.editable' : ''));
    items.each(function () {
      const uuid = $(this).data('uuid');
      uuids.push(uuid);
    });

    const selected = [];
    for (const uuid of uuids) {
      const preset = await PresetCollection.get(uuid, { full });
      if (preset) selected.push(preset);
    }
    return [selected, items];
  }

  async _onExportSelectedPresets() {
    const [selected, _] = await this._getSelectedPresets();
    exportPresets(selected);
  }

  async _onEditSelectedPresets(item) {
    const [selected, _] = await this._getSelectedPresets({ editableOnly: true });
    if (selected.length) {
      // Position edit window just bellow the item
      const options = item.offset();
      options.top += item.height();

      this._editPresets(selected, options);
    }
  }

  async _onDeleteSelectedPresets(item) {
    const [selected, items] = await this._getSelectedPresets({ editableOnly: true, full: false });
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

  async _onOpenJournal(item) {
    const [selected, _] = await this._getSelectedPresets({ editableOnly: false });
    selected.forEach((p) => p.openJournal());
  }

  async _onApplyToSelected(item) {
    const [selected, _] = await this._getSelectedPresets({ editableOnly: false });
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

  async _onCreateFolder(event) {
    const types = [];
    if (this.docName === 'ALL') {
      types.push('ALL');
    } else if (UI_DOCS.includes(this.docName)) {
      types.push('ALL', this.docName);
    } else {
      types.push(this.docName);
    }

    const folder = new Folder.implementation(
      {
        name: Folder.defaultName(),
        type: 'JournalEntry',
        sorting: 'm',
        flags: { [MODULE_ID]: { types } },
      },
      { pack: PresetCollection.workingPack }
    );

    await new Promise((resolve) => {
      new PresetFolderConfig(folder, { resolve }).render(true);
    });

    this.render(true);
  }

  async _onFolderEdit(header) {
    const folder = await fromUuid($(header).closest('.folder').data('uuid'));

    new Promise((resolve) => {
      const options = { resolve, ...header.offset() };
      options.top += header.height();

      new PresetFolderConfig(folder, options).render(true);
    }).then(() => this.render(true));
  }

  async _onFolderDelete(uuid, { render = true, deleteAll = false } = {}) {
    const folder = this.tree.allFolders.get(uuid);
    if (folder) {
      let confirm;

      if (deleteAll) {
        confirm = await Dialog.confirm({
          title: `${localize('FOLDER.Delete', false)}: ${folder.name}`,
          content: `<div style="color:red;"><h4>${localize('AreYouSure', false)}</h4><p>${localize(
            'FOLDER.DeleteWarning',
            false
          )}</p></div>`,
        });
      } else {
        confirm = await Dialog.confirm({
          title: `${localize('FOLDER.Remove', false)}: ${folder.name}`,
          content: `<h4>${localize('AreYouSure', false)}</h4><p>${localize('FOLDER.RemoveWarning', false)}</p>`,
        });
      }

      if (confirm) {
        await PresetCollection.deleteFolder(uuid, deleteAll);
        if (render) this.render(true);
      }
    }
  }

  // Throttle input and perform preset search
  _onSearchInput(event) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._onSearch(event), 250);
  }

  async _onSearch(event) {
    let newSearch = event.target.value;
    let previousSearch = MassEditPresets.lastSearch || '';
    MassEditPresets.lastSearch = newSearch;

    if (previousSearch.length >= SEARCH_MIN_CHAR && newSearch.length < SEARCH_MIN_CHAR) {
      $(event.target).removeClass('active');
      this._resetSearchState();
      this._renderContent();
      return;
    }

    if (newSearch.length < SEARCH_MIN_CHAR) return;

    const filter = event.target.value.trim().toLowerCase();
    $(event.target).addClass('active');

    this.tree.folders.forEach((f) => this._searchFolder(filter, f));
    this.tree.staticFolders.forEach((f) => this._searchFolder(filter, f));
    this.tree.presets.forEach((p) => this._searchPreset(filter, p));

    this._renderContent();
  }

  _searchFolder(filter, folder, forceRender = false) {
    let match = folder.name.toLowerCase().includes(filter);

    let childFolderMatch = false;
    for (const f of folder.children) {
      if (this._searchFolder(filter, f, match || forceRender)) childFolderMatch = true;
    }

    let presetMatch = false;
    for (const p of folder.presets) {
      if (this._searchPreset(filter, p, match || forceRender)) presetMatch = true;
    }

    const containsMatch = match || childFolderMatch || presetMatch;
    folder.expanded = childFolderMatch || presetMatch;
    folder.render = containsMatch || forceRender;

    return containsMatch;
  }

  _searchPreset(filter, preset, forceRender = false) {
    if (preset.name.toLowerCase().includes(filter)) {
      preset._render = true;
      return true;
    } else {
      preset._render = false || forceRender;
      return false;
    }
  }

  _resetSearchState() {
    this.tree.folders.forEach((f) => this._resetSearchStateFolder(f));
    this.tree.staticFolders.forEach((f) => this._resetSearchStateFolder(f));
    this.tree.presets.forEach((p) => this._resetSearchStatePreset(p));
  }

  _resetSearchStateFolder(folder) {
    folder.expanded = FolderState.expanded(folder.uuid);
    folder.render = true;
    folder.children.forEach((f) => this._resetSearchStateFolder(f));
    folder.presets.forEach((p) => this._resetSearchStatePreset(p));
  }

  _resetSearchStatePreset(preset) {
    preset._render = true;
  }

  async _renderContent() {
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/preset/presetsContent.html`, {
      callback: Boolean(this.callback),
      presets: this.tree.presets,
      folders: this.tree.folders,
      createEnabled: Boolean(this.configApp),
      staticFolders: this.tree.staticFolders.length ? this.tree.staticFolders : null,
    });
    this.element.find('.item-list').html(content);
  }

  async _onFolderSort(sourceUuid, targetUuid, { inside = true, folderUuid = null } = {}) {
    let source = this.tree.allFolders.get(sourceUuid);
    let target = this.tree.allFolders.get(targetUuid);

    let folders;
    if (folderUuid) folders = this.tree.allFolders.get(folderUuid).children;
    else folders = this.tree.folders;

    const siblings = [];
    for (const folder of folders) {
      if (folder.uuid !== sourceUuid) siblings.push(folder);
    }

    const result = SortingHelpersFixed.performIntegerSort(source, {
      target,
      siblings,
      sortBefore: true,
    });

    if (result.length) {
      const updates = [];
      result.forEach((ctrl) => {
        const update = ctrl.update;
        update._id = ctrl.target.id;
        update.folder = this.tree.allFolders.get(folderUuid)?.id ?? null;
        updates.push(update);

        ctrl.target.sort = update.sort;
      });
      await Folder.updateDocuments(updates, { pack: PresetCollection.workingPack });
    }
    this.render(true);
  }

  async _onItemSort(sourceUuids, targetUuid, { before = true, folderUuid = null } = {}) {
    const sourceUuidsSet = new Set(sourceUuids);
    const sources = this.tree.allPresets.filter((p) => sourceUuidsSet.has(p.uuid));

    let target = this.tree.allPresets.find((p) => p.uuid === targetUuid);

    // Determine siblings based on folder
    let presets;
    if (folderUuid) presets = this.tree.allFolders.get(folderUuid).presets;
    else presets = this.tree.presets;

    const siblings = [];
    for (const preset of presets) {
      if (!sourceUuidsSet.has(preset.uuid)) siblings.push(preset);
    }

    const result = SortingHelpersFixed.performIntegerSortMulti(sources, {
      target,
      siblings,
      sortBefore: before,
    });

    if (result.length) {
      const updates = [];
      result.forEach((ctrl) => {
        const update = ctrl.update;
        update._id = ctrl.target.id;
        update.folder = this.tree.allFolders.get(folderUuid)?.id ?? null;
        updates.push(update);

        ctrl.target.sort = update.sort;
      });
      await PresetCollection.updatePresets(updates);
    }

    this.render(true);
  }

  async _onToggleSort(event) {
    const currentSort = game.settings.get(MODULE_ID, 'presetSortMode');
    const newSort = currentSort === 'manual' ? 'alphabetical' : 'manual';
    await game.settings.set(MODULE_ID, 'presetSortMode', newSort);

    this.render(true);
  }

  async _onToggleSearch(event) {
    const searchControl = $(event.target).closest('.toggle-search-mode');

    const currentMode = game.settings.get(MODULE_ID, 'presetSearchMode');
    const newMode = currentMode === 'p' ? 'pf' : 'p';
    await game.settings.set(MODULE_ID, 'presetSearchMode', newMode);

    const mode = SEARCH_MODES[newMode];
    searchControl.attr('data-tooltip', mode.tooltip).html(mode.icon);

    $(this.form).find('.header-search input').trigger('input');
  }

  _onToggleLock(event) {
    const lockControl = $(event.target).closest('.toggle-doc-lock');

    let currentLock = game.settings.get(MODULE_ID, 'presetDocLock');
    let newLock = this.docName;

    if (newLock !== currentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    game.settings.set(MODULE_ID, 'presetDocLock', newLock);
  }

  _onToggleLayerSwitch(event) {
    const switchControl = $(event.target).closest('.toggle-layer-switch');

    const value = !game.settings.get(MODULE_ID, 'presetLayerSwitch');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    game.settings.set(MODULE_ID, 'presetLayerSwitch', value);
  }

  async _onToggleExtComp(event) {
    const switchControl = $(event.target).closest('.toggle-ext-comp');

    const value = !game.settings.get(MODULE_ID, 'presetExtComp');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    await game.settings.set(MODULE_ID, 'presetExtComp', value);
    this.render(true);
  }

  async _onToggleScaling(event) {
    const switchControl = $(event.target).closest('.toggle-scaling');

    const value = !game.settings.get(MODULE_ID, 'presetScaling');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    game.settings.set(MODULE_ID, 'presetScaling', value);
  }

  _onDocumentChange(event) {
    const newDocName = $(event.target).closest('.document-select').data('name');
    if (newDocName != this.docName) {
      this.docName = newDocName;

      if (this.docName !== 'ALL') {
        if (game.settings.get(MODULE_ID, 'presetLayerSwitch'))
          canvas.getLayerByEmbeddedName(this.docName === 'Actor' ? 'Token' : this.docName)?.activate();
      }

      this.render(true);
    }
  }

  async _onRightClickPreset(eventTarget) {
    const item = $(eventTarget).closest('.item');

    // If right-clicked item is not selected, de-select the others and select it
    if (!item.hasClass('selected')) {
      item.closest('.item-list').find('.item.selected').removeClass('selected').removeClass('last-selected');
      item.addClass('selected').addClass('last-selected');
    }
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    if (!('left' in options) && event) {
      options.left = event.originalEvent.x - PresetConfig.defaultOptions.width / 2;
      options.top = event.originalEvent.y;
    }
    new PresetConfig(presets, options).render(true);
  }

  async _onApplyPreset(event) {
    if (this.callback) {
      const uuid = $(event.target).closest('.item').data('uuid');
      this.callback(await PresetCollection.get(uuid));
    }
  }

  async _onPresetDragOut(event) {
    const uuid = $(event.originalEvent.target).closest('.item').data('uuid');
    const preset = await PresetCollection.get(uuid);
    if (!preset) return;

    // If released on top of a Mass Edit form, apply the preset to it instead of spawning it
    const form = hoverMassEditForm(event.pageX, event.pageY, preset.documentName);
    if (form) {
      form._applyPreset(preset);
      return;
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

    if (this.canvas3dActive) {
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

    PresetAPI.spawnPreset({
      preset,
      x: mouseX,
      y: mouseY,
      z: mouseZ,
      mousePosition: false,
      layerSwitch: game.settings.get(MODULE_ID, 'presetLayerSwitch'),
      scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
    });
  }

  async _toggleBrush(event) {
    const item = $(event.target).closest('.item');
    const brushControl = item.find('.preset-brush');

    if (brushControl.hasClass('active')) {
      Brush.deactivate();
      this._onPresetBrushDeactivate();
    } else {
      const uuid = item.data('uuid');
      const preset = await PresetCollection.get(uuid);
      if (!preset) {
        Brush.deactivate();
        this._onPresetBrushDeactivate();
        return;
      }

      if (this._activeBrush) Brush.deactivate();

      const activated = Brush.activate({
        preset,
        deactivateCallback: this._onPresetBrushDeactivate.bind(this),
      });

      if (activated) {
        brushControl.addClass('active').addClass('fa-bounce');
        this._activeBrush = true;
      } else {
        this._onPresetBrushDeactivate();
      }
    }
  }

  _onPresetBrushDeactivate() {
    $(this.form).find('.preset-brush').removeClass('active').removeClass('fa-bounce');
    this._activeBrush = false;
  }

  /**
   * @override
   * Application.setPosition(...) has been modified to use css transform for window translation across the screen
   * instead of top/left css properties which force full-window style recomputation
   */
  setPosition({ left, top, width, height, scale } = {}) {
    if (!this.popOut && !this.options.resizable) return; // Only configure position for popout or resizable apps.
    const el = this.element[0];
    const currentPosition = this.position;
    const pop = this.popOut;
    const styles = window.getComputedStyle(el);
    if (scale === null) scale = 1;
    scale = scale ?? currentPosition.scale ?? 1;

    // If Height is "auto" unset current preference
    if (height === 'auto' || this.options.height === 'auto') {
      el.style.height = '';
      height = null;
    }

    // Update width if an explicit value is passed, or if no width value is set on the element
    if (!el.style.width || width) {
      const tarW = width || el.offsetWidth;
      const minW = parseInt(styles.minWidth) || (pop ? MIN_WINDOW_WIDTH : 0);
      const maxW = el.style.maxWidth || window.innerWidth / scale;
      currentPosition.width = width = Math.clamped(tarW, minW, maxW);
      el.style.width = `${width}px`;
      if (width * scale + currentPosition.left > window.innerWidth) left = currentPosition.left;
    }
    width = el.offsetWidth;

    // Update height if an explicit value is passed, or if no height value is set on the element
    if (!el.style.height || height) {
      const tarH = height || el.offsetHeight + 1;
      const minH = parseInt(styles.minHeight) || (pop ? MIN_WINDOW_HEIGHT : 0);
      const maxH = el.style.maxHeight || window.innerHeight / scale;
      currentPosition.height = height = Math.clamped(tarH, minH, maxH);
      el.style.height = `${height}px`;
      if (height * scale + currentPosition.top > window.innerHeight + 1) top = currentPosition.top - 1;
    }
    height = el.offsetHeight;

    let leftT, topT;
    // Update Left
    if ((pop && !this.posSet) || Number.isFinite(left)) {
      const scaledWidth = width * scale;
      const tarL = Number.isFinite(left) ? left : (window.innerWidth - scaledWidth) / 2;
      const maxL = Math.max(window.innerWidth - scaledWidth, 0);
      currentPosition.left = left = Math.clamped(tarL, 0, maxL);
      leftT = left;
    }

    // Update Top
    if ((pop && !this.posSet) || Number.isFinite(top)) {
      const scaledHeight = height * scale;
      const tarT = Number.isFinite(top) ? top : (window.innerHeight - scaledHeight) / 2;
      const maxT = Math.max(window.innerHeight - scaledHeight, 0);
      currentPosition.top = Math.clamped(tarT, 0, maxT);

      topT = currentPosition.top;
    }

    let transform = '';

    // Update Scale
    if (scale) {
      currentPosition.scale = Math.max(scale, 0);

      if (scale === 1) transform += ``;
      else transform += `scale(${scale})`;
    }

    if (leftT || topT) {
      this.posSet = true;
      transform += 'translate(' + leftT + 'px,' + topT + 'px)';
    }

    if (transform) {
      el.style.transform = transform;
    }

    // Track position post window close
    if (!this.options.preventPositionOverride) {
      MassEditPresets.lastPositionLeft = this.position.left;
      MassEditPresets.lastPositionTop = this.position.top;
    }

    // Return the updated position object
    return currentPosition;
  }

  async close(options = {}) {
    if (!Boolean(this.configApp)) Brush.deactivate();
    MassEditPresets.objectHover = false;
    return super.close(options);
  }

  async _onPresetUpdate(event) {
    const preset = await PresetCollection.get($(event.target).closest('.item').data('uuid'));
    if (!preset) return;

    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
    if (!selectedFields || foundry.utils.isEmpty(selectedFields)) {
      ui.notifications.warn(localize('presets.warn-no-fields'));
      return;
    }

    const randomize = foundry.utils.deepClone(this.configApp.randomizeFields || {});
    const addSubtract = foundry.utils.deepClone(this.configApp.addSubtractFields || {});

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomize);
    }

    preset.update({ data: selectedFields, randomize, addSubtract });

    ui.notifications.info(`Preset "${preset.name}" updated`);

    this.render(true);
  }

  async _onPresetCreate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
    if (!selectedFields || foundry.utils.isEmpty(selectedFields)) {
      ui.notifications.warn(localize('presets.warn-no-fields'));
      return;
    }

    const preset = new Preset({
      name: localize('presets.default-name'),
      documentName: this.docName,
      data: selectedFields,
      addSubtract: this.configApp.addSubtractFields,
      randomize: this.configApp.randomizeFields,
    });

    await PresetCollection.set(preset);
    this.render(true);

    this._editPresets([preset], { isCreate: true }, event);
  }

  /**
   * Create a preset from placeables dragged and dropped on the form
   * @param {Array[Placeable]} placeables
   * @param {Event} event
   */
  async dropPlaceable(placeables, event) {
    const presets = await PresetAPI.createPreset(placeables);

    // Switch to just created preset's category before rendering if not set to 'ALL'
    const documentName = placeables[0].document.documentName;
    if (this.docName !== 'ALL' && this.docName !== documentName) this.docName = documentName;

    const options = { isCreate: true };
    options.left = this.position.left + this.position.width + 20;
    options.top = this.position.top;

    this._editPresets(presets, options, event);
    this.render(true);
  }

  async actorToPreset(actor) {
    const presets = await PresetAPI.createPreset(placeables);
  }

  _getActiveEffectFields() {
    return { changes: foundry.utils.deepClone(this.configApp.object.changes ?? []) };
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-change-compendium',
      icon: 'fa-solid fa-gear',
      onclick: (ev) => this._onWorkingPackChange(),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: (ev) => this._onExport(ev),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-import',
      icon: 'fas fa-file-import',
      onclick: (ev) => this._onImport(ev),
    });

    return buttons;
  }

  async _onWorkingPackChange() {
    let pack = await new Promise((resolve) => getCompendiumDialog(resolve, {}));
    if (pack && pack !== PresetCollection.workingPack) {
      await game.settings.set(MODULE_ID, 'workingPack', pack);
      this.render(true);
    }
  }

  async _onExport() {
    const tree = await PresetCollection.getTree(null, true);
    exportPresets(tree.allPresets);
  }

  async _onImport() {
    const json = await importPresetFromJSONDialog();
    if (!json) return;

    let importCount = 0;

    if (foundry.utils.getType(json) === 'Array') {
      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || foundry.utils.isEmpty(p.data)) continue;

        const preset = new Preset(p);
        preset._pages = p.pages;

        await PresetCollection.set(preset);
        importCount++;
      }
    }

    ui.notifications.info(`Mass Edit: ${localFormat('presets.imported', { count: importCount })}`);

    if (importCount) this.render(true);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    if (this.callback) {
      this.callback(await PresetCollection.get(event.submitter.data.id));
    }
  }
}

async function exportPresets(presets, fileName) {
  if (!presets.length) return;

  for (const preset of presets) {
    await preset.load();
  }

  presets = presets.map((p) => {
    const preset = p.clone();
    preset.folder = null;
    preset.uuid = null;
    return preset;
  });

  saveDataToFile(JSON.stringify(presets, null, 2), 'text/json', (fileName ?? 'mass-edit-presets') + '.json');
}

export class PresetConfig extends FormApplication {
  static name = 'PresetConfig';

  /**
   * @param {Array[Preset]} presets
   */
  constructor(presets, options) {
    super({}, options);
    this.presets = presets;
    this.callback = options.callback;
    this.isCreate = options.isCreate;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet'],
      template: `modules/${MODULE_ID}/templates/preset/presetEdit.html`,
      width: 360,
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return 'mass-edit-preset-edit';
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if (this.presets.length > 1) return `Presets [${this.presets.length}]`;
    else return `Preset: ${this.presets[0].name.substring(0, 20)}${this.presets[0].name.length > 20 ? '...' : ''}`;
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: (ev) => this._onExport(ev),
    });
    return buttons;
  }

  _onExport() {
    let fileName;
    if (this.presets.length === 1) {
      fileName = 'mass-edit-preset-' + this.presets[0].name.replace(' ', '_').replace(/\W/g, '');
    }
    exportPresets(this.presets, fileName);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    if (!this.options.submitOnClose) this.options.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options = {}) {
    const data = {};
    data.advancedOpen = this.advancedOpen;

    data.preset = {};
    if (this.presets.length === 1) {
      data.preset = this.presets[0];
      data.displayFieldDelete = true;
      data.displayFieldModify = true;

      data.attached = this.attached || data.preset.attached;
      if (data.attached) {
        data.attached = data.attached.map((at) => {
          let tooltip = at.documentName;
          if (at.documentName === 'Token' && at.data.name) tooltip += ': ' + at.data.name;
          return {
            icon: DOC_ICONS[at.documentName] ?? DOC_ICONS.DEFAULT,
            tooltip,
          };
        });
      }
    }

    data.minlength = this.presets.length > 1 ? 0 : 1;
    data.tva = game.modules.get('token-variants')?.active;

    if (this.data && !(this.data instanceof Array)) {
      data.modifyDisabled = true;
      data.deleteDisabled = true;
    }

    // Check if all presets are for the same document type and thus can be edited using a Mass Edit form
    const docName = this.presets[0].documentName;
    if (docName !== 'Actor' && this.presets.every((p) => p.documentName === docName)) {
      data.documentEdit = docName;
      data.isPlaceable = SUPPORTED_PLACEABLES.includes(docName);
    }

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

    html.find('.edit-document').on('click', this._onEditDocument.bind(this));
    html.find('.assign-document').on('click', this._onAssignDocument.bind(this));
    html.find('.delete-fields').on('click', this._onDeleteFields.bind(this));
    html.find('.spawn-fields').on('click', this._onSpawnFields.bind(this));
    html.find('summary').on('click', () => setTimeout(() => this.setPosition({ height: 'auto' }), 30));
    html.find('.attached').on('click', this.onAttachedRemove.bind(this));
    html.find('.attach-selected').on('click', () => {
      const controlled = canvas.activeLayer.controlled;
      if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
        this.dropPlaceable(controlled);
      }
    });

    // TVA Support
    const tvaButton = html.find('.token-variants-image-select-button');
    tvaButton.on('click', (event) => {
      game.modules.get('token-variants').api.showArtSelect('Preset', {
        callback: (imgSrc, name) => {
          tvaButton.siblings(`[name="${tvaButton.data('target')}"]`).val(imgSrc);
        },
        searchType: 'Item',
      });
    });

    // Advanced Options tracking between renders
    html.find('details').on('toggle', (event) => {
      this.advancedOpen = Boolean($(event.target).attr('open'));
    });

    //Hover
    const hoverOverlay = html.closest('.window-content').find('.drag-drop-overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (this.presets.length !== 1) return;
        if (canvas.activeLayer?.preview?.children.some((c) => c._original?.mouseInteractionManager?.isDragging)) {
          hoverOverlay.show();
          PresetConfig.objectHover = true;
        } else {
          hoverOverlay.hide();
          PresetConfig.objectHover = false;
        }
      })
      .on('mouseout', () => {
        if (this.presets.length !== 1) return;
        hoverOverlay.hide();
        PresetConfig.objectHover = false;
      });
  }

  /**
   * Create a preset from placeables dragged and dropped ont he form
   * @param {Array[Placeable]} placeables
   * @param {Event} event
   */
  async dropPlaceable(placeables, event) {
    this.advancedOpen = true;

    if (!this.attached) this.attached = deepClone(this.presets[0].attached ?? []);
    placeables.forEach((p) => this.attached.push({ documentName: p.document.documentName, data: placeableToData(p) }));

    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async onAttachedRemove(event) {
    const index = $(event.target).closest('.attached').data('index');
    this.attached = this.attached || deepClone(this.presets[0].attached);
    this.attached.splice(index, 1);
    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async _onSpawnFields() {
    new PresetFieldModify(
      this.data ?? this.presets[0].data,
      (modifyOnSpawn) => {
        this.modifyOnSpawn = modifyOnSpawn;
      },
      this.modifyOnSpawn ?? this.presets[0].modifyOnSpawn
    ).render(true);
  }

  async _onDeleteFields() {
    new PresetFieldDelete(this.data ?? this.presets[0].data, (data) => {
      this.data = data;
    }).render(true);
  }

  async _onAssignDocument() {
    const layer = canvas.getLayerByEmbeddedName(this.presets[0].documentName);
    if (!layer) return;

    const data = layer.controlled.map((p) => placeableToData(p));
    if (data.length) {
      this.data = data;
      ui.notifications.info(
        localFormat('presets.assign', {
          count: data.length,
          document: this.presets[0].documentName,
        })
      );
      this.gridSize = canvas.grid.size;
      this.modifyOnSpawn = [];
      this.render(true);
    }
  }

  async _onEditDocument() {
    const documents = [];
    const cls = CONFIG[this.presets[0].documentName].documentClass;

    for (const p of this.presets) {
      p.data.forEach((d) => documents.push(new cls(mergePresetDataToDefaultDoc(p, d))));
    }

    const app = await showMassEdit(documents, null, {
      presetEdit: true,
      callback: (obj) => {
        this.addSubtract = {};
        this.randomize = {};
        for (const k of Object.keys(obj.data)) {
          if (k in obj.randomize) this.randomize[k] = obj.randomize[k];
          if (k in obj.addSubtract) this.addSubtract[k] = obj.addSubtract[k];
        }
        this.data = obj.data;
        this.render(true);
      },
      forceForm: true,
    });

    // For randomize and addSubtract only take into account the first preset
    // and apply them to the form
    const preset = new Preset({
      data: {},
      randomize: this.presets[0].randomize,
      addSubtract: this.presets[0].addSubtract,
    });
    setTimeout(() => {
      app._applyPreset(preset);
    }, 400);
  }

  async _updatePresets(formData) {
    formData.name = formData.name.trim();
    formData.img = formData.img.trim() || null;
    formData.preSpawnScript = formData.preSpawnScript?.trim();
    formData.postSpawnScript = formData.postSpawnScript?.trim();

    for (const preset of this.presets) {
      let update;
      if (this.isCreate) {
        update = {
          name: formData.name || preset.name || localize('presets.default-name'),
          img: formData.img ?? preset.img,
        };
      } else {
        update = {
          name: formData.name || preset.name,
          img: formData.img || preset.img,
        };
      }

      if (this.data) update.data = this.data;
      if (this.addSubtract) update.addSubtract = this.addSubtract;
      if (this.randomize) update.randomize = this.randomize;
      if (this.modifyOnSpawn) update.modifyOnSpawn = this.modifyOnSpawn;
      if (this.gridSize) update.gridSize = this.gridSize;
      if (this.attached) update.attached = this.attached;
      if (formData.preSpawnScript != null) update.preSpawnScript = formData.preSpawnScript;
      if (formData.postSpawnScript != null) update.postSpawnScript = formData.postSpawnScript;
      if (formData.spawnRandom != null) update.spawnRandom = formData.spawnRandom;

      await preset.update(update);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    await this._updatePresets(formData);

    if (this.callback) this.callback(this.presets);
    return this.presets;
  }

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    this._createDocumentIdLink(html);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create an ID link button in the header which displays the JournalEntry ID and copies it to clipboard
   * @param {jQuery} html
   * @protected
   */
  _createDocumentIdLink(html) {
    const title = html.find('.window-title');
    const label = localize('DOCUMENT.JournalEntry', false);
    const idLink = document.createElement('a');
    idLink.classList.add('document-id-link');
    idLink.setAttribute('alt', 'Copy document id');
    idLink.dataset.tooltip = `${label}: ${this.presets.map((p) => p.id).join(', ')}`;
    idLink.dataset.tooltipDirection = 'UP';
    idLink.innerHTML = '<i class="fa-solid fa-passport"></i>';
    idLink.addEventListener('click', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.id).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'id',
          id: this.presets.map((p) => p.id).join(', '),
        })
      );
    });
    idLink.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.uuid).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'uuid',
          id: this.presets.map((p) => p.uuid).join(', '),
        })
      );
    });
    title.append(idLink);
  }
}

class PresetFieldSelect extends FormApplication {
  static name = 'PresetFieldSelect';

  constructor(data, callback) {
    super();
    this.presetData = data;
    this.isObject = !(data instanceof Array);
    this.callback = callback;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'preset-field-select'],
      template: `modules/${MODULE_ID}/templates/preset/presetFieldSelect.html`,
      width: 600,
      resizable: false,
    });
  }

  /* -------------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.item').on('click', this._onFieldClick);
  }

  _onFieldClick(e) {
    itemSelect(e, $(e.target).closest('.preset-field-list'));
  }

  /** @override */
  async getData(options = {}) {
    let data = foundry.utils.flattenObject(this.presetData);

    const singleData = !this.isObject && this.presetData.length === 1;

    let index;
    let fields = [];
    for (const [k, v] of Object.entries(data)) {
      if (!singleData) {
        const i = k.split('.')[0];
        if (!index) {
          fields.push({ header: true, index: 0 });
        } else if (i !== index) {
          fields.push({ header: true, index: i });
        }
        index = i;
      }

      let label = k;
      if (singleData) label = label.substring(label.indexOf('.') + 1);

      let value;
      const t = foundry.utils.getType(v);
      if (t === 'Object' || t === 'Array' || t === 'null') value = JSON.stringify(v);
      else value = v;

      fields.push({ name: k, label, value, selected: false });
    }

    return { fields };
  }
}

class PresetFieldDelete extends PresetFieldSelect {
  static name = 'PresetFieldDelete';

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return localize('presets.select-delete');
  }

  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    data.button = { icon: '<i class="fas fa-trash"></i>', text: localize('common.delete') };
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let data = foundry.utils.flattenObject(this.presetData);

    const form = $(event.target).closest('form');
    form.find('.item.selected').each(function () {
      const name = $(this).attr('name');
      delete data[name];
    });
    data = expandObject(data);

    if (!this.isObject) {
      let reorganizedData = [];
      for (let i = 0; i < this.presetData.length; i++) {
        if (!data[i]) continue;
        reorganizedData.push(data[i]);
      }
      data = reorganizedData;
    }

    this.callback(data);
  }
}

class PresetFieldModify extends PresetFieldSelect {
  static name = 'PresetFieldModify';

  constructor(data, callback, modifyOnSpawn) {
    super(data, callback);
    this.modifyOnSpawn = modifyOnSpawn ?? [];
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return localize('presets.select-modify');
  }

  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    data.button = { icon: '<i class="fas fa-check"></i>', text: localize('CONTROLS.CommonSelect', false) };
    for (const field of data.fields) {
      if (this.modifyOnSpawn.includes(field.name)) field.selected = true;
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const form = $(event.target).closest('form');
    const modifyOnSpawn = [];
    form.find('.item.selected').each(function () {
      let name = $(this).attr('name');
      modifyOnSpawn.push(name);
    });

    this.callback(modifyOnSpawn);
  }
}

class PresetFolderConfig extends FolderConfig {
  static name = 'PresetFolderConfig';

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'folder-edit'],
      template: `modules/${MODULE_ID}/templates/preset/presetFolderEdit.html`,
      width: 360,
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return this.object.id ? super.id : 'folder-create';
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if (this.object.id) return `${localize('FOLDER.Update', false)}: ${this.object.name}`;
    return localize('FOLDER.Create', false);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.document-select').on('click', this._onDocumentChange.bind(this));
  }

  _onDocumentChange(event) {
    $(event.target).closest('.document-select').toggleClass('active');
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    if (!this.options.submitOnClose) this.options.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options = {}) {
    const folder = this.document.toObject();
    const label = localize(Folder.implementation.metadata.label, false);

    let folderDocs = folder.flags[MODULE_ID]?.types ?? ['ALL'];

    let docs;
    // This is a non-placeable folder type, so we will not display controls to change types
    if (folderDocs.length === 1 && !UI_DOCS.includes(folderDocs[0])) {
      this.nonPlaceable = true;
    } else {
      docs = [];
      UI_DOCS.forEach((type) => {
        docs.push({ name: type, icon: DOC_ICONS[type], active: folderDocs.includes(type) });
      });
    }

    return {
      folder: folder,
      name: folder._id ? folder.name : '',
      newName: localFormat('DOCUMENT.New', { type: label }, false),
      safeColor: folder.color ?? '#000000',
      sortingModes: { a: 'FOLDER.SortAlphabetical', m: 'FOLDER.SortManual' },
      submitText: localize(folder._id ? 'FOLDER.Update' : 'FOLDER.Create', false),
      docs,
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if (!this.nonPlaceable) {
      let visibleTypes = [];
      $(this.form)
        .find('.document-select.active')
        .each(function () {
          visibleTypes.push($(this).data('name'));
        });
      if (!visibleTypes.length) visibleTypes.push('ALL');

      formData[`flags.${MODULE_ID}.types`] = visibleTypes;
    }

    let doc = this.object;
    if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName();
    if (this.object.id) await this.object.update(formData);
    else {
      this.object.updateSource(formData);
      doc = await Folder.create(this.object, { pack: this.object.pack });
    }
    this.options.resolve?.(doc);
    return doc;
  }
}

function checkMouseInWindow(event) {
  let app = $(event.target).closest('.window-app');
  var offset = app.offset();
  let appX = offset.left;
  let appY = offset.top;
  let appW = app.width();
  let appH = app.height();

  var mouseX = event.pageX;
  var mouseY = event.pageY;

  if (mouseX > appX && mouseX < appX + appW && mouseY > appY && mouseY < appY + appH) {
    return true;
  }
  return false;
}

function getCompendiumDialog(resolve, { excludePack, exportTo = false, keepIdSelect = false } = {}) {
  let config;
  if (exportTo) {
    config = {
      title: localize('presets.select-compendium'),
      message: localize('presets.export-directory-message'),
      buttonLabel: localize('FOLDER.Export', false),
    };
  } else {
    config = {
      title: localize('presets.select-compendium'),
      message: localize('presets.working-directory-message'),
      buttonLabel: localize('common.swap'),
    };
  }

  let options = '';
  for (const p of game.packs) {
    if (!p.locked && p.documentName === 'JournalEntry') {
      if (p.collection === excludePack) continue;
      const workingPack = p.collection === PresetCollection.workingPack;
      options += `<option value="${p.collection}" ${workingPack ? 'selected="selected"' : ''}>${p.title}</option>`;
    }
  }

  let content = `
  <p style="color: orangered;">${config.message}</p>
  <div class="form-group">
    <label>${localize('PACKAGE.TagCompendium', false)}</label>
    <div class="form-fields">
      <select style="width: 100%; margin-bottom: 10px;">${options}</select>
    </div>
  </div>`;

  if (keepIdSelect) {
    content += `
<div class="form-group">
    <label>${localize('presets.keep-ids')}</label>
    <input type="checkbox" name="keepId" checked>
    <p style="font-size: smaller;">${localize('presets.keep-ids-hint')}</p>
</div>`;
  }

  new Dialog({
    title: config.title,
    content: content,
    buttons: {
      export: {
        label: config.buttonLabel,
        callback: (html) => {
          const pack = $(html).find('select').val();
          if (keepIdSelect) resolve({ pack, keepId: $(html).find('[name="keepId"]').is(':checked') });
          else resolve(pack);
        },
      },
      cancel: {
        label: localize('Cancel', false),
        callback: () => resolve(keepIdSelect ? {} : null),
      },
    },
    close: () => resolve(keepIdSelect ? {} : null),
    default: 'cancel',
  }).render(true);
}

/**
 * Controls select/multi-select flow for item lists
 * @param {*} e item click event
 * @param {*} itemList list of items that this item exists within
 */
function itemSelect(e, itemList) {
  const item = $(e.target).closest('.item');
  const items = itemList.find('.item');
  const lastSelected = items.filter('.last-selected');

  if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
    lastSelected.removeClass('last-selected');
    items.removeClass('selected');
    item.addClass('selected').addClass('last-selected');
  } else if (e.ctrlKey || e.metaKey) {
    item.toggleClass('selected');
    if (item.hasClass('selected')) {
      lastSelected.removeClass('last-selected');
      item.addClass('last-selected');
    } else item.removeClass('last-index');
  } else if (e.shiftKey) {
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
 * Return Mass Edit form that the mouse is over if any
 * @param {Number} mouseX
 * @param {Number} mouseY
 * @param {String} documentName
 * @returns {Application|null} MassEdit form
 */
function hoverMassEditForm(mouseX, mouseY, documentName) {
  const hitTest = function (app) {
    const position = app.position;
    const appX = position.left;
    const appY = position.top;

    if (mouseX > appX && mouseX < appX + position.width && mouseY > appY && mouseY < appY + position.height)
      return true;
    return false;
  };

  return Object.values(ui.windows).find((app) => app.meForm && app.documentName === documentName && hitTest(app));
}
