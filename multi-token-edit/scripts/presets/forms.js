import { TokenDataAdapter } from '../data/adapters.js';
import { copyToClipboard } from '../../applications/formUtils.js';
import { countFolderItems, trackProgress } from '../../applications/progressDialog.js';
import { importPresetFromJSONDialog } from '../dialogs.js';
import { SortingHelpersFixed } from '../fixedSort.js';
import { localFormat, localize } from '../utils.js';
import {
  VirtualFileFolder,
  META_INDEX_ID,
  PresetAPI,
  PresetCollection,
  PresetPackFolder,
  PresetFolder,
} from './collection.js';
import { FileIndexer, IndexerForm } from './fileIndexer.js';
import { LinkerAPI } from '../linker/linker.js';
import { DOC_ICONS, Preset } from './preset.js';
import { TagSelector } from './tagSelector.js';
import { exportPresets, FolderState, placeableToData, randomizeChildrenFolderColors } from './utils.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, UI_DOCS } from '../constants.js';
import { PresetContainer } from './containerApp.js';
import { PresetConfig } from './editApp.js';

const SEARCH_MIN_CHAR = 2;
const SEARCH_FOUND_MAX_COUNT = 1001;

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

export class MassEditPresets extends PresetContainer {
  static objectHover = false;
  static lastSearch;

  get lastSearch() {
    return this._lastSearch;
  }

  set lastSearch(val) {
    this._lastSearch = val;
    MassEditPresets.lastSearch = val;
  }

  constructor(configApp, callback, documentName, options = {}) {
    // Restore position and dimensions the previously closed window
    if (!options.preventPositionOverride && MassEditPresets.previousPosition) {
      options = { ...options, ...MassEditPresets.previousPosition };
    }

    super({}, { ...options, sortable: true, duplicable: true });
    this.callback = callback;

    if (!configApp && UI_DOCS.includes(documentName)) {
      const docLock = game.settings.get(MODULE_ID, 'presetDocLock');
      this.documentName = docLock || documentName;
    } else {
      this.configApp = configApp;
      this.documentName = documentName || this.configApp.documentName;
    }

    this.lastSearch = MassEditPresets.lastSearch;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-window-fill'],
      template: `modules/${MODULE_ID}/templates/preset/presets.html`,
      resizable: true,
      minimizable: true,
      width: 377,
      height: 900,
      scrollY: ['.item-list'],
    });
  }

  get title() {
    let title = localize('common.presets');
    if (!UI_DOCS.includes(this.documentName)) title += ` [${this.documentName}]`;
    else title += ` [${localize('common.placeable')}]`;
    return title;
  }

  async getData(options) {
    const data = await super.getData(options);

    const displayExtCompendiums = game.settings.get(MODULE_ID, 'presetExtComp');
    const displayVirtualDirectory = game.settings.get(MODULE_ID, 'presetVirtualDir');

    this.tree = await PresetCollection.getTree(this.documentName, {
      externalCompendiums: displayExtCompendiums,
      virtualDirectory: displayVirtualDirectory,
      setFormVisibility: true,
    });
    this._tagSelector?.render(true);

    data.presets = this.tree.presets;
    data.folders = this.tree.folders;
    data.extFolders = this.tree.extFolders.length ? this.tree.extFolders : null;

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = SUPPORTED_PLACEABLES.includes(this.documentName) || this.documentName === 'ALL';
    data.allowDocumentSwap = UI_DOCS.includes(this.documentName) && !this.configApp;
    data.docLockActive = game.settings.get(MODULE_ID, 'presetDocLock') === this.documentName;
    data.layerSwitchActive = game.settings.get(MODULE_ID, 'presetLayerSwitch');
    data.scaling = game.settings.get(MODULE_ID, 'presetScaling');
    data.extCompActive = displayExtCompendiums;
    data.virtDirActive = displayVirtualDirectory;
    data.sortMode = SORT_MODES[game.settings.get(MODULE_ID, 'presetSortMode')];
    data.searchMode = SEARCH_MODES[game.settings.get(MODULE_ID, 'presetSearchMode')];
    data.displayDragDropMessage =
      data.allowDocumentSwap && !(this.tree.presets.length || this.tree.folders.length || data.extFolders);

    data.lastSearch = this.lastSearch;

    data.docs = UI_DOCS.reduce((obj, key) => {
      return {
        ...obj,
        [key]: DOC_ICONS[key],
      };
    }, {});

    data.documents = UI_DOCS;
    data.currentDocument = this.documentName;

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

    html.on('click', '.toggle-sort', this._onToggleSort.bind(this));
    html.on('click', '.toggle-doc-lock', this._onToggleLock.bind(this));
    html.on('click', '.toggle-ext-comp', this._onToggleExtComp.bind(this));
    html.on('click', '.toggle-virtual-dir', this._onToggleVirtDir.bind(this));
    html.on('click', '.toggle-scaling', this._onToggleScaling.bind(this));
    html.on('click', '.toggle-layer-switch', this._onToggleLayerSwitch.bind(this));
    html.on('click', '.document-select', this._onDocumentChange.bind(this));
    html.on('click', '.create-folder', this._onCreateFolder.bind(this));
    html.on('click', '.preset-create', this._onPresetCreate.bind(this));
    html.on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    html.on('click', '.preset-callback', this._onApplyPreset.bind(this));
    html.on('click', '.tagSelector', this._onToggleTagSelector.bind(this));

    const headerSearch = html.find('.header-search input');
    headerSearch.on('input', (event) => this._onSearchInput(event));
    if ((this.lastSearch?.length ?? 0) >= SEARCH_MIN_CHAR) headerSearch.trigger('input');

    html.on('click', '.toggle-search-mode', (event) => {
      this._onToggleSearch(event, headerSearch);
    });
  }

  /**
   * Process drag and drop of an Actor or Folder of actors
   * @param {*} event
   * @returns
   */
  _foundryDrop(event) {
    const data = TextEditor.getDragEventData(event.originalEvent);
    if (!foundry.utils.isEmpty(data)) {
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
          if (preset)
            PresetCollection.set(preset).then(() => {
              this.render(true);
            });
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

    nFolder = await Folder.create(nFolder, {
      pack: nFolder.pack,
      keepId: options.keepId,
    });

    for (const child of folder.children) {
      if (!this._importTracker?.active) break;
      await this._importActorFolder(child.folder, nFolder.id, options);
    }

    const presets = [];

    for (const actor of folder.contents) {
      if (!this._importTracker?.active) break;
      presets.push(
        await PresetAPI.createPresetFromActorUuid(actor.uuid, {
          folder: nFolder.id,
          keepId: options.keepId,
        })
      );
      this._importTracker.incrementCount();
    }

    await PresetCollection.set(presets);

    this.render(true);
  }

  _getFolderContextOptions() {
    return [
      {
        name: 'Edit',
        icon: '<i class="fas fa-edit"></i>',
        condition: (header) => {
          const folder = this.tree.allFolders.get(header.closest('.folder').data('uuid'));
          return !folder.virtual || folder instanceof PresetPackFolder;
        },
        callback: (header) => this._onFolderEdit(header),
      },
      {
        name: 'Save Index',
        icon: '<i class="fas fa-file-search"></i>',
        condition: (header) => {
          const folder = this.tree.allFolders.get(header.closest('.folder').data('uuid'));
          return folder.indexable;
        },
        callback: (header) => {
          FileIndexer.saveFolderToCache(this.tree.allFolders.get(header.closest('.folder').data('uuid')));
        },
      },
      {
        name: 'Export to Compendium',
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: (header) => {
          const folder = this.tree.allFolders.get(header.closest('.folder').data('uuid'));
          return !(folder instanceof VirtualFileFolder);
        },
        callback: (header) => {
          this._onExportFolder(header.closest('.folder').data('uuid'));
        },
      },
      {
        name: localize('FOLDER.Remove', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (header) => PresetFolder.isEditable(header.closest('.folder').data('uuid')),
        callback: (header) => this._onFolderDelete(header.closest('.folder').data('uuid')),
      },
      {
        name: localize('FOLDER.Delete', false),
        icon: '<i class="fas fa-dumpster"></i>',
        condition: (header) => PresetFolder.isEditable(header.closest('.folder').data('uuid')),
        callback: (header) =>
          this._onFolderDelete(header.closest('.folder').data('uuid'), {
            deleteAll: true,
          }),
      },
      {
        name: 'Randomize Child Folder Colors',
        icon: '<i class="fas fa-dice"></i>',
        condition: () => game.settings.get(MODULE_ID, 'debug'),
        callback: (header) =>
          randomizeChildrenFolderColors(header.closest('.folder').data('uuid'), this.tree, () => this.render(true)),
      },
    ];
  }

  async _onExportFolder(uuid) {
    let { pack, keepId } = await new Promise((resolve) =>
      getCompendiumDialog(resolve, { exportTo: true, keepIdSelect: true })
    );
    if (pack && !this._importTracker?.active) {
      const folder = this.tree.allFolders.get(uuid);
      if (folder) {
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

      const presets = await PresetCollection.batchLoadPresets(folder.presets);

      const toCreate = [];

      for (const preset of presets) {
        if (!this._importTracker?.active) break;
        const p = preset.clone();
        p.folder = nFolder.id;
        if (!keepId) p.id = foundry.utils.randomID();
        toCreate.push(p);
        this._importTracker?.incrementCount();
      }

      await PresetCollection.set(toCreate, pack);

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

  async _onCopyPresetToClipboard() {
    const [selected, _] = await this._getSelectedPresets();
    if (selected.length) copyToClipboard(selected[0]);
  }

  async _onExportSelectedPresets() {
    const [selected, _] = await this._getSelectedPresets();
    exportPresets(selected);
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

  _onCopyUUID(item) {
    item.data('uuid');

    game.clipboard.copyPlainText(item.data('uuid'));
    ui.notifications.info(
      game.i18n.format('DOCUMENT.IdCopiedClipboard', {
        label: item.attr('name'),
        type: 'uuid',
        id: item.data('uuid'),
      })
    );
  }

  async _onCreateFolder(event) {
    const types = [];
    if (this.documentName === 'ALL') {
      types.push('ALL');
    } else if (UI_DOCS.includes(this.documentName)) {
      types.push('ALL', this.documentName);
    } else {
      types.push(this.documentName);
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
    const uuid = $(header).closest('.folder').data('uuid');
    const pFolder = this.tree.allFolders.get(uuid);

    let folder;
    if (pFolder instanceof PresetPackFolder) {
      // This is a virtual pack folder
      folder = new Folder.implementation(
        {
          _id: pFolder.id,
          name: pFolder.name,
          type: 'JournalEntry',
          color: pFolder.color,
          sorting: pFolder.sorting,
        },
        { pack: pFolder.uuid }
      );
    } else {
      folder = await fromUuid($(header).closest('.folder').data('uuid'));
    }

    new Promise((resolve) => {
      const options = { resolve, ...header.offset(), folder: pFolder };
      options.top += header.height();

      new PresetFolderConfig(folder, options).render(true);
    }).then(() => this.render(true));
  }

  async _onFolderDelete(uuid, { render = true, deleteAll = false } = {}) {
    const folder = this.tree.allFolders.get(uuid);
    if (folder) {
      let confirm;

      if (deleteAll) {
        // Construct warning count of what is about to be removed
        const count = { Folder: 0 };
        const traverseFolder = function (folder) {
          count['Folder'] += 1;
          folder.presets?.forEach((p) => {
            count[p.documentName] = (count[p.documentName] ?? 0) + 1;
          });
          folder.children?.forEach((c) => traverseFolder(c));
        };
        traverseFolder(folder);

        let countWarning = '';
        if (Object.keys(count).length) {
          countWarning += '<table>';
          Object.keys(count).forEach((name) => {
            countWarning += `<tr><td>${name}s</td><td>${count[name]}</td></tr>`;
          });
          countWarning += '</table>';
        }
        // end of constructing warning

        confirm = await Dialog.confirm({
          title: `${localize('FOLDER.Delete', false)}: ${folder.name}`,
          content: `<div style="color:red;"><h4>${localize('AreYouSure', false)}</h4><p>${localize(
            'FOLDER.DeleteWarning',
            false
          )}</p>${countWarning}</div>`,
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
    let previousSearch = this.lastSearch || '';
    this.lastSearch = newSearch;

    if (previousSearch.length >= SEARCH_MIN_CHAR && newSearch.length < SEARCH_MIN_CHAR) {
      $(event.target).removeClass('active');
      this._resetSearchState();
      this._renderContent();
      return;
    }

    if (newSearch.length < SEARCH_MIN_CHAR) return;

    let filter = event.target.value
      .trim()
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length >= SEARCH_MIN_CHAR);
    if (!filter.length) return;
    $(event.target).addClass('active');

    const tags = filter.filter((f) => f.startsWith('#')).map((f) => f.substring(1));
    filter = filter.filter((f) => !f.startsWith('#'));

    this._searchFoundPresets = [];
    this.tree.folders.forEach((f) => this._searchFolder(filter, tags, f));
    this.tree.extFolders.forEach((f) => this._searchFolder(filter, tags, f));
    this.tree.presets.forEach((p) => this._searchPreset(filter, tags, p));

    this._renderContent();
  }

  _searchFolder(filter, tags, folder, forceRender = false) {
    const folderName = folder.name.toLowerCase();
    let match = !tags.length && filter.every((k) => folderName.includes(k));

    let childFolderMatch = false;
    for (const f of folder.children) {
      if (this._searchFolder(filter, tags, f, match || forceRender)) childFolderMatch = true;
    }

    let presetMatch = false;
    for (const p of folder.presets) {
      if (this._searchPreset(filter, tags, p, match || forceRender)) presetMatch = true;
    }

    const containsMatch = match || childFolderMatch || presetMatch;
    folder.expanded = childFolderMatch || presetMatch;
    folder.render = containsMatch || forceRender;

    return containsMatch;
  }

  _searchPreset(filter, tags, preset, forceRender = false) {
    if (!preset._visible) return false;

    const presetName = preset.name.toLowerCase();
    if (
      this._searchFoundPresets.length < SEARCH_FOUND_MAX_COUNT &&
      filter.every((k) => presetName.includes(k) || preset.tags.includes(k)) &&
      tags.every((k) => preset.tags.includes(k))
    ) {
      preset._render = true;
      this._searchFoundPresets.push(preset);
      return preset._render;
    } else {
      preset._render = false || forceRender;
      return false;
    }
  }

  _resetSearchState() {
    this._searchFoundPresets = [];
    this.tree.folders.forEach((f) => this._resetSearchStateFolder(f));
    this.tree.extFolders.forEach((f) => this._resetSearchStateFolder(f));
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
    let data;
    if (game.settings.get(MODULE_ID, 'presetSearchMode') === 'p') {
      data = {
        callback: Boolean(this.callback),
        presets: this._searchFoundPresets,
        folders: [],
        createEnabled: Boolean(this.configApp),
        extFolders: null,
      };
    } else {
      data = {
        callback: Boolean(this.callback),
        presets: this.tree.presets,
        folders: this.tree.folders,
        createEnabled: Boolean(this.configApp),
        extFolders: this.tree.extFolders.length ? this.tree.extFolders : null,
      };
    }

    const content = await renderTemplate(`modules/${MODULE_ID}/templates/preset/presetsContent.html`, data);
    this.element.find('.item-list').html(content);

    this._tagSelector?.render(true);
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
      await Folder.updateDocuments(updates, {
        pack: PresetCollection.workingPack,
      });
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

        // update preset object itself
        // TODO: improve, this is done so that preset/pack does not need to get reloaded
        const p = presets.find((p) => p.id === update._id);
        if (p) {
          p.folder = update.folder;
          p.sort = update.sort;
        }

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

  async _onToggleSearch(event, headerSearch) {
    const searchControl = $(event.target).closest('.toggle-search-mode');

    const currentMode = game.settings.get(MODULE_ID, 'presetSearchMode');
    const newMode = currentMode === 'p' ? 'pf' : 'p';
    await game.settings.set(MODULE_ID, 'presetSearchMode', newMode);

    const mode = SEARCH_MODES[newMode];
    searchControl.attr('data-tooltip', mode.tooltip).html(mode.icon);

    if (this.lastSearch) headerSearch.trigger('input');
  }

  _onToggleLock(event) {
    const lockControl = $(event.target).closest('.toggle-doc-lock');

    let currentLock = game.settings.get(MODULE_ID, 'presetDocLock');
    let newLock = this.documentName;

    if (newLock !== currentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    game.settings.set(MODULE_ID, 'presetDocLock', newLock);
  }

  _onToggleLayerSwitch(event) {
    const switchControl = $(event.currentTarget);

    const value = !game.settings.get(MODULE_ID, 'presetLayerSwitch');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    game.settings.set(MODULE_ID, 'presetLayerSwitch', value);
  }

  async _onToggleVirtDir(event) {
    const switchControl = $(event.currentTarget);

    const value = !game.settings.get(MODULE_ID, 'presetVirtualDir');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    await game.settings.set(MODULE_ID, 'presetVirtualDir', value);
    this.render(true);
  }

  async _onToggleExtComp(event) {
    const switchControl = $(event.currentTarget);

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
    const newDocumentName = $(event.target).closest('.document-select').data('name');
    if (newDocumentName != this.documentName) {
      this.documentName = newDocumentName;

      if (game.settings.get(MODULE_ID, 'presetLayerSwitch'))
        canvas.getLayerByEmbeddedName(this.documentName === 'Actor' ? 'Token' : this.documentName)?.activate();

      if (this.lastSearch) {
        this.lastSearch = '';
        this._resetSearchState();
      }

      this.render(true);
    }
  }

  async _onApplyPreset(event) {
    if (this.callback) {
      const uuid = $(event.target).closest('.item').data('uuid');
      this.callback(await PresetCollection.get(uuid));
    }
  }

  async _onToggleTagSelector(event) {
    if (this._tagSelector) {
      this._tagSelector.close(true);
      this._tagSelector = null;
    } else {
      this._tagSelector = new TagSelector(this);
      this._tagSelector.render(true);
    }
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
      currentPosition.width = width = Math.clamp
        ? Math.clamp(tarW, minW, maxW) // v12
        : Math.clamped(tarW, minW, maxW);
      el.style.width = `${width}px`;
      if (width * scale + currentPosition.left > window.innerWidth) left = currentPosition.left;
    }
    width = el.offsetWidth;

    // Update height if an explicit value is passed, or if no height value is set on the element
    if (!el.style.height || height) {
      const tarH = height || el.offsetHeight + 1;
      const minH = parseInt(styles.minHeight) || (pop ? MIN_WINDOW_HEIGHT : 0);
      const maxH = el.style.maxHeight || window.innerHeight / scale;
      currentPosition.height = height = Math.clamp
        ? Math.clamp(tarH, minH, maxH) // v12
        : Math.clamped(tarH, minH, maxH);
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
      currentPosition.left = left = Math.clamp
        ? Math.clamp(tarL, 0, maxL) // v12
        : Math.clamped(tarL, 0, maxL);
      leftT = left;
    }

    // Update Top
    if ((pop && !this.posSet) || Number.isFinite(top)) {
      const scaledHeight = height * scale;
      const tarT = Number.isFinite(top) ? top : (window.innerHeight - scaledHeight) / 2;
      const maxT = Math.max(window.innerHeight - scaledHeight, 0);
      currentPosition.top = Math.clamp
        ? Math.clamp(tarT, 0, maxT) // v12
        : Math.clamped(tarT, 0, maxT);

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
      const { left, top, width, height } = this.position;
      MassEditPresets.previousPosition = { left, top, width, height };
    }

    // Return the updated position object
    return currentPosition;
  }

  async close(options = {}) {
    MassEditPresets.objectHover = false;
    this._tagSelector?.close();
    this._endPreview();
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
    if (this.documentName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomize);
    }

    preset.update({ data: selectedFields, randomize, addSubtract });

    ui.notifications.info(`Preset "${preset.name}" updated`);
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
      documentName: this.documentName,
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
    if (this.documentName !== 'ALL' && this.documentName !== documentName) this.documentName = documentName;

    const options = { isCreate: true };
    options.left = this.position.left + this.position.width + 20;
    options.top = this.position.top;

    const linked = LinkerAPI.getLinkedDocuments(placeables.map((p) => p.document));
    if (linked.size) {
      const response = await new Promise((resolve) => {
        Dialog.confirm({
          title: 'Attach Linked',
          content: `<p>Linked placeables have been detected [<b>${linked.size}</b>].</p><p>Should they be included as <b>Attached</b>?</p>`,
          yes: () => resolve(true),
          no: () => resolve(false),
          defaultYes: false,
        });
      });
      if (response) {
        options.attached = Array.from(linked).map((l) => {
          return { documentName: l.documentName, data: placeableToData(l) };
        });
      }
    }

    this._editPresets(presets, options, event);
    this.render(true);
  }

  async actorToPreset(actor) {
    const presets = await PresetAPI.createPreset(placeables);
  }

  _getActiveEffectFields() {
    return {
      changes: foundry.utils.deepClone(this.configApp.object.changes ?? []),
    };
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
      class: 'mass-edit-indexer',
      icon: 'fas fa-archive',
      onclick: (ev) => this._onOpenIndexer(),
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

    if (game.settings.get(MODULE_ID, 'debug')) {
      buttons.unshift({
        label: 'Debug',
        class: 'mass-edit-debug',
        icon: 'fas fa-bug',
        onclick: (ev) => {
          console.log({
            index: game.packs.get(PresetCollection.workingPack).get(META_INDEX_ID)?.flags[MODULE_ID]?.index,
            tree: this.tree,
          });
        },
      });
    }

    return buttons;
  }

  async _onWorkingPackChange() {
    let pack = await new Promise((resolve) => getCompendiumDialog(resolve, {}));
    if (pack && pack !== PresetCollection.workingPack) {
      await game.settings.set(MODULE_ID, 'workingPack', pack);
      this.render(true);
    }
  }

  async _onOpenIndexer() {
    if (FileIndexer._buildingIndex) {
      ui.notifications.warn('Index Build In-Progress. Wait for it to finish before attempting it again.');
      return;
    }
    new IndexerForm().render(true);
  }

  /**
   * Export all working pack presets as as JSON file
   */
  async _onExport() {
    const pack = game.packs.get(PresetCollection.workingPack);
    await pack.getDocuments();
    const tree = await PresetCollection.getTree(null, { externalCompendiums: false, virtualDirectory: false });
    exportPresets(tree.allPresets);
  }

  async _onImport() {
    const json = await importPresetFromJSONDialog();
    if (!json) return;

    let importCount = 0;

    if (foundry.utils.getType(json) === 'Array') {
      const presets = [];

      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || foundry.utils.isEmpty(p.data)) continue;

        const preset = new Preset(p);
        preset._pages = p.pages;

        presets.push(preset);

        importCount++;
      }

      await PresetCollection.set(presets);
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
    if (
      this.options?.folder instanceof PresetPackFolder ||
      (folderDocs.length === 1 && !UI_DOCS.includes(folderDocs[0]))
    ) {
      this.displayTypes = false;
    } else {
      this.displayTypes = true;
      docs = [];
      UI_DOCS.forEach((type) => {
        docs.push({
          name: type,
          icon: DOC_ICONS[type],
          active: folderDocs.includes(type),
        });
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
      virtualPackFolder: this.options.folder instanceof PresetPackFolder,
      group: this.options.folder?.group,
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if (this.displayTypes) {
      let visibleTypes = [];
      $(this.form)
        .find('.document-select.active')
        .each(function () {
          visibleTypes.push($(this).data('name'));
        });
      if (!visibleTypes.length) visibleTypes.push('ALL');

      formData[`flags.${MODULE_ID}.types`] = visibleTypes;
    }

    let document = this.object;
    if (this.options.folder instanceof PresetPackFolder) {
      // This is a virtual folder used to store Compendium contents within
      // Update using the provided interface
      let update = {};
      ['name', 'color', 'group'].forEach((k) => {
        if (!formData[k]?.trim()) update['-=' + k] = null;
        else update[k] = formData[k].trim();
      });

      await this.options.folder.update(update);
    } else {
      // This is a real folder, update/create it
      if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName();
      if (this.object.id) await this.object.update(formData);
      else {
        this.object.updateSource(formData);
        document = await Folder.create(this.object, { pack: this.object.pack });
      }
    }

    this.options.resolve?.(document);
    return document;
  }
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
          if (keepIdSelect)
            resolve({
              pack,
              keepId: $(html).find('[name="keepId"]').is(':checked'),
            });
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

export function registerPresetBrowserHooks() {
  // Intercept and prevent certain placeable drag and drop if they are hovering over the MassEditPresets form
  // passing on the placeable to it to perform preset creation.
  const dragDropHandler = function (wrapped, ...args) {
    if (MassEditPresets.objectHover || PresetConfig.objectHover) {
      this.mouseInteractionManager.cancel(...args);
      const app = Object.values(ui.windows).find(
        (x) =>
          (MassEditPresets.objectHover && x instanceof MassEditPresets) ||
          (PresetConfig.objectHover && x instanceof PresetConfig)
      );
      if (app) {
        const placeables = canvas.activeLayer.controlled.length ? [...canvas.activeLayer.controlled] : [this];
        app.dropPlaceable(placeables, ...args);
      }
      // Pass in a fake event that hopefully is enough to allow other modules to function
      this._onDragLeftCancel(...args);
    } else {
      return wrapped(...args);
    }
  };

  SUPPORTED_PLACEABLES.forEach((name) => {
    libWrapper.register(MODULE_ID, `${name}.prototype._onDragLeftDrop`, dragDropHandler, 'MIXED');
  });

  // Scene Control to open preset browser
  Hooks.on('renderSceneControls', (sceneControls, html, options) => {
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'presetSceneControl')) return;

    const presetControl = $(`
<li class="scene-control mass-edit-scene-control" data-control="me-presets" aria-label="Mass Edit: Presets" role="tab" data-tooltip="Mass Edit: Presets">
  <i class="fa-solid fa-books"></i>
</li>
  `);

    presetControl.on('click', () => {
      let documentName = canvas.activeLayer.constructor.documentName;
      if (!SUPPORTED_PLACEABLES.includes(documentName)) documentName = 'ALL';

      const presetForm = Object.values(ui.windows).find((app) => app instanceof MassEditPresets);
      if (presetForm) {
        presetForm.close();
        return;
      }

      new MassEditPresets(null, null, documentName, {
        left: presetControl.position().left + presetControl.width() + 40,
      }).render(true);
    });

    html.find('.control-tools').find('.scene-control').last().after(presetControl);
  });

  // Change default behavior of JournalEntry click and context menu within the CompendiumDirectory
  libWrapper.register(
    MODULE_ID,
    'CompendiumDirectory.prototype._getEntryContextOptions',
    function (wrapped, ...args) {
      const options = wrapped(...args);
      options.push({
        name: 'Open Journal Compendium',
        icon: '<i class="fas fa-book-open"></i>',
        condition: (li) => {
          const pack = game.packs.get(li.data('pack'));
          return pack.metadata.type === 'JournalEntry' && pack.index.get(META_INDEX_ID);
        },
        callback: (li) => {
          const pack = game.packs.get(li.data('pack'));
          pack.render(true);
        },
      });
      return options;
    },
    'WRAPPER'
  );
  libWrapper.register(
    MODULE_ID,
    'CompendiumDirectory.prototype._onClickEntryName',
    async function (wrapped, event) {
      const element = event.currentTarget;
      const packId = element.closest('[data-pack]').dataset.pack;
      const pack = game.packs.get(packId);
      if (pack.metadata.type === 'JournalEntry' && pack.index.get(META_INDEX_ID)) {
        new MassEditPresets(null, null, 'ALL').render(true);
        return;
      }
      return wrapped(event);
    },
    'MIXED'
  );
}
