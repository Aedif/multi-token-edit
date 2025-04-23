import { TokenDataAdapter } from '../../data/adapters.js';
import { copyToClipboard } from '../../../applications/formUtils.js';
import { countFolderItems, trackProgress } from '../../../applications/progressDialog.js';
import { importPresetFromJSONDialog } from '../../dialogs.js';
import { SortingHelpersFixed } from '../../fixedSort.js';
import { localFormat, localize, spawnSceneAsPreset } from '../../utils.js';
import { META_INDEX_ID, PresetAPI, PresetCollection, PresetPackFolder } from '../collection.js';
import { LinkerAPI } from '../../linker/linker.js';
import { DOC_ICONS, Preset } from '../preset.js';
import { exportPresets, FolderState, matchPreset, parseSearchQuery, placeableToData } from '../utils.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, UI_DOCS } from '../../constants.js';
import { PresetContainer } from '../containerApp.js';
import { PresetConfig } from '../editApp.js';
import { TagSelector } from '../tagSelector.js';
import PresetBrowserSettings from './settingsApp.js';

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

export function openPresetBrowser(documentName) {
  new PresetBrowser(null, null, documentName).render(true);
}

export class PresetBrowser extends PresetContainer {
  static objectHover = false;
  static lastSearch;
  static CONFIG;

  static async setSetting(setting, value) {
    return await game.settings.set(MODULE_ID, 'presetBrowser', { ...PresetBrowser.CONFIG, [setting]: value });
  }

  get lastSearch() {
    return this._lastSearch;
  }

  set lastSearch(val) {
    this._lastSearch = val;
    PresetBrowser.lastSearch = val;
  }

  constructor(configApp, callback, documentName, options = {}) {
    // Restore position and dimensions the previously closed window
    if (!options.preventPositionOverride && PresetBrowser.previousPosition) {
      options = { ...options, ...PresetBrowser.previousPosition };
    }

    super({}, { ...options, sortable: true, duplicatable: true });
    this.callback = callback;

    if (!configApp && UI_DOCS.includes(documentName)) {
      this.documentName = PresetBrowser.CONFIG.documentLock || documentName;
    } else {
      this.configApp = configApp;
      this.documentName = documentName || this.configApp.documentName;
    }

    this.lastSearch = PresetBrowser.CONFIG.persistentSearch ? PresetBrowser.lastSearch : '';
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-window-fill'],
      template: `modules/${MODULE_ID}/templates/preset/browser.html`,
      resizable: true,
      minimizable: true,
      width: 377,
      height: 900,
      scrollY: ['.item-list'],
    });
  }

  get title() {
    let title = localize('presets.preset-browser');
    if (!UI_DOCS.includes(this.documentName)) title += ` [${this.documentName}]`;
    return title;
  }

  async getData(options) {
    const data = await super.getData(options);

    this.tree = await PresetCollection.getTree(this.documentName, {
      externalCompendiums: PresetBrowser.CONFIG.externalCompendiums,
      virtualDirectory: PresetBrowser.CONFIG.virtualDirectory,
      setFormVisibility: true,
    });
    this._tagSelector?.render(true);

    if (PresetBrowser.CONFIG.persistentSearch && this.lastSearch) {
      this._onSearch(this.lastSearch, { render: false });
      data.lastSearch = this.lastSearch;
    } else data.lastSearch = '';

    data.presets = this.tree.presets;
    data.folders = this.tree.folders;
    data.extFolders = this.tree.extFolders.length ? this.tree.extFolders : null;

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = SUPPORTED_PLACEABLES.includes(this.documentName) || this.documentName === 'ALL';
    data.allowDocumentSwap = UI_DOCS.includes(this.documentName) && !this.configApp;
    data.docLockActive = PresetBrowser.CONFIG.documentLock === this.documentName;
    data.layerSwitchActive = PresetBrowser.CONFIG.switchLayer;
    data.autoScale = PresetBrowser.CONFIG.autoScale;
    data.externalCompendiums = PresetBrowser.CONFIG.externalCompendiums;
    data.virtualDirectory = PresetBrowser.CONFIG.virtualDirectory;
    data.sortMode = SORT_MODES[PresetBrowser.CONFIG.sortMode];
    data.searchMode = SEARCH_MODES[PresetBrowser.CONFIG.searchMode];
    data.displayDragDropMessage =
      data.allowDocumentSwap && !(this.tree.presets.length || this.tree.folders.length || data.extFolders);

    data.docs = [];
    data.docsDropdown = PresetBrowser.CONFIG.dropdownDocuments.length ? [] : null;
    UI_DOCS.forEach((name) => {
      const doc = { name, icon: DOC_ICONS[name], tooltip: name === 'ALL' ? 'Placeables' : name };
      if (PresetBrowser.CONFIG.dropdownDocuments.includes(name)) data.docsDropdown.push(doc);
      else data.docs.push(doc);
    });

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
          PresetBrowser.objectHover = true;
        } else {
          hoverOverlay.hide();
          PresetBrowser.objectHover = false;
        }
      })
      .on('mouseout', () => {
        hoverOverlay.hide();
        PresetBrowser.objectHover = false;
      });

    // Create Preset from Selected
    html.find('.create-preset').on('click', () => {
      const controlled = canvas.activeLayer.controlled;
      if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
        this.dropPlaceable(controlled);
      }
    });

    // Create a Preset Bag
    html.find('.create-bag').on('click', this._createNewBag.bind(this));

    html.on('click', '.toggle-sort', this._onToggleSort.bind(this));
    html.on('click', '.toggle-doc-lock', this._onToggleLock.bind(this));
    html.on('click', '.toggle-setting', this._onToggleSetting.bind(this));
    html.on('click', '.document-select', this._onDocumentChange.bind(this));
    html.on('click', '.create-folder', this._onCreateFolder.bind(this));
    html.on('click', '.preset-create', this._onPresetCreate.bind(this));
    html.on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    html.on('click', '.preset-callback', this._onApplyPreset.bind(this));
    html.on('click', '.tagSelector', this._onToggleTagSelector.bind(this));

    const headerSearch = html.find('.header-search input');
    headerSearch.on('input', (event) => this._onSearchInput(event));

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

  async _onCreateFolder(event) {
    const types = [];
    if (SUPPORTED_PLACEABLES.includes(this.documentName)) {
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
      new PresetFolderConfig({ resolve, document: folder }).render(true);
    });

    this.render(true);
  }

  async _onFolderEdit(header) {
    header = $(header);
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
      folder = await fromUuid(header.closest('.folder').data('uuid'));
    }

    new Promise((resolve) => {
      const options = { resolve, ...header.offset(), folder: pFolder, document: folder };
      options.top += header.height();
      new PresetFolderConfig(options).render(true);
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
    this._searchTimer = setTimeout(() => this._onSearch(event.target.value, { event }), 250);
  }

  async _onSearch(query, { event, render = true } = {}) {
    let previousSearch = this.lastSearch || '';
    this.lastSearch = query;

    if (previousSearch.length >= SEARCH_MIN_CHAR && query.length < SEARCH_MIN_CHAR) {
      if (event) $(event.target).removeClass('active');
      this._resetSearchState();
      if (render) this._renderContent();
      return;
    }

    if (query.length < SEARCH_MIN_CHAR) return;

    const { search, negativeSearch } = parseSearchQuery(query, { matchAny: false });
    if (!(search || negativeSearch)) return;

    if (event) $(event.target).addClass('active');

    this._searchFoundPresets = [];
    this.tree.folders.forEach((f) => this._searchFolder(f, search, negativeSearch));
    this.tree.extFolders.forEach((f) => this._searchFolder(f, search, negativeSearch));
    this.tree.presets.forEach((p) => this._searchPreset(p, search, negativeSearch));

    if (render) this._renderContent();
  }

  _searchFolder(folder, search, negativeSearch, forceRender = false) {
    const folderName = folder.name.toLowerCase();
    let match = false;
    if (search) match = !search.tags && search.terms?.every((t) => folderName.includes(t));

    let childFolderMatch = false;
    for (const f of folder.children) {
      if (this._searchFolder(f, search, negativeSearch, match || forceRender)) childFolderMatch = true;
    }

    let presetMatch = false;
    for (const p of folder.presets) {
      if (this._searchPreset(p, search, negativeSearch, match || forceRender)) presetMatch = true;
    }

    const containsMatch = match || childFolderMatch || presetMatch;
    folder.expanded = childFolderMatch || presetMatch;
    folder.render = containsMatch || forceRender;

    return containsMatch;
  }

  _searchPreset(preset, search, negativeSearch, forceRender = false) {
    if (!preset._visible) return false;

    let matched = true;

    if (this._searchFoundPresets.length > SEARCH_FOUND_MAX_COUNT) matched = false;
    else matched = matchPreset(preset, search, negativeSearch);

    if (matched) {
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
    if (PresetBrowser.CONFIG.searchMode === 'p') {
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

    await super._renderContent(data);
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
    await PresetBrowser.setSetting('sortMode', PresetBrowser.CONFIG.sortMode === 'manual' ? 'alphabetical' : 'manual');
    this.render(true);
  }

  async _onToggleSearch(event, headerSearch) {
    const searchControl = $(event.target).closest('.toggle-search-mode');

    const currentMode = PresetBrowser.CONFIG.searchMode;
    const newMode = currentMode === 'p' ? 'pf' : 'p';
    await PresetBrowser.setSetting('searchMode', newMode);

    const mode = SEARCH_MODES[newMode];
    searchControl.attr('data-tooltip', mode.tooltip).html(mode.icon);

    if (this.lastSearch) headerSearch.trigger('input');
  }

  _onToggleLock(event) {
    const lockControl = $(event.target).closest('.toggle-doc-lock');

    let newLock = this.documentName;
    if (newLock !== PresetBrowser.CONFIG.documentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    PresetBrowser.setSetting('documentLock', newLock);
  }

  async _onToggleSetting(event) {
    const setting = $(event.currentTarget).data('setting');
    await PresetBrowser.setSetting(setting, !PresetBrowser.CONFIG[setting]);
    this.render(true);
  }

  _onDocumentChange(event) {
    const newDocumentName = $(event.target).closest('.document-select').data('name');
    if (newDocumentName != this.documentName) {
      this.documentName = newDocumentName;

      if (PresetBrowser.CONFIG.switchLayer)
        canvas.getLayerByEmbeddedName(this.documentName === 'Actor' ? 'Token' : this.documentName)?.activate();

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
  setPosition(...args) {
    const position = super.setPosition(...args);

    // Track position post window close
    if (!this.options.preventPositionOverride) {
      const { left, top, width, height } = position;
      PresetBrowser.previousPosition = { left, top, width, height };
    }

    // Return the updated position object
    return position;
  }

  async close(options = {}) {
    PresetBrowser.objectHover = false;
    this._tagSelector?.close();
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

  async _createNewBag() {
    const presetBag = new Preset({
      name: 'New Bag',
      documentName: 'Bag',
      img: `icons/containers/bags/pack-engraved-leather-tan.webp`,
      data: [
        {
          uuids: [],
          searches: {
            inclusive: [],
            exclusive: [],
          },
          virtualDirectory: true,
        },
      ],
    });
    await PresetCollection.set(presetBag);
    this.render(true);
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
      class: 'mass-edit-settings-config',
      tooltip: 'Configure browser settings.',
      icon: 'fas fa-gear',
      onclick: this._onSettingConfig.bind(this),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-change-compendium',
      tooltip: 'Change working compendium.',
      icon: 'fas fa-atlas',
      onclick: this._onWorkingPackChange.bind(this),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-indexer',
      tooltip: 'Perform directory indexing.',
      icon: 'fas fa-archive',
      onclick: this._onOpenIndexer.bind(this),
    });

    buttons.unshift({
      label: '',
      tooltip: 'Export presets as a JSON file.',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: this._onExport.bind(this),
    });
    buttons.unshift({
      label: '',
      tooltip: 'Import presets exported as a JSON file.',
      class: 'mass-edit-import',
      icon: 'fas fa-file-import',
      onclick: this._onImport.bind(this),
    });

    if (game.packs.get(PresetCollection.workingPack)?.locked) {
      buttons.unshift({
        label: '',
        tooltip: 'Un-lock working compendium.',
        class: 'mass-edit-toggle-lock',
        icon: 'fas fa-lock fa-fw',
        onclick: this._onToggleCompendiumLock.bind(this),
      });
    }

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

  _onSettingConfig() {
    new PresetBrowserSettings(this).render(true);
  }

  async _onToggleCompendiumLock(event) {
    const pack = game.packs.get(PresetCollection.workingPack);
    if (pack) {
      await pack.configure({ locked: false });
      $(event.currentTarget).remove();
    }
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

class PresetFolderConfig extends foundry.applications.sheets.FolderConfig {
  static name = 'PresetFolderConfig';

  constructor(options = {}) {
    options.classes = ['folder-edit'];
    super(options);
  }

  /** @override */
  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/preset/presetFolderEdit.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return this.document.id ? super.id : 'folder-create';
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if (this.document.id) return `${localize('FOLDER.Update', false)}: ${this.document.name}`;
    return localize('FOLDER.Create', false);
  }

  /** @override */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId === 'body') $(htmlElement).find('.document-select').on('click', this._onDocumentChange.bind(this));
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

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const folder = context.document;
    context.namePlaceholder = folder.constructor.defaultName({ pack: folder.pack });
    const submitText = localize(folder._id ? 'FOLDER.Update' : 'FOLDER.Create', false);
    context.buttons = [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: submitText }];

    let folderDocs = folder.flags[MODULE_ID]?.types ?? ['ALL'];

    // This is a non-placeable folder type, so we will not display controls to change types
    let docs;
    if (
      this.options?.folder instanceof PresetPackFolder ||
      (folderDocs.length === 1 && (folderDocs[0] === 'Bag' || !UI_DOCS.includes(folderDocs[0])))
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
    context.docs = docs;
    context.virtualPackFolder = this.options.folder instanceof PresetPackFolder;
    context.group = this.options.folder?.group;

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _processSubmitData(event, form, submitData, options) {
    if (this.displayTypes) {
      let visibleTypes = [];
      $(form)
        .find('.document-select.active')
        .each(function () {
          visibleTypes.push(this.dataset.name);
        });
      if (!visibleTypes.length) visibleTypes.push('ALL');

      submitData[`flags.${MODULE_ID}.types`] = visibleTypes;
    }

    if (this.options.folder instanceof PresetPackFolder) {
      // This is a virtual folder used to store Compendium contents,
      // update using the provided interface
      let update = {};
      ['name', 'color', 'group'].forEach((k) => {
        if (!submitData[k]?.trim()) update['-=' + k] = null;
        else update[k] = submitData[k].trim();
      });

      await this.options.folder.update(update);
    } else {
      // This is a real folder, update/create it
      if (!submitData.name?.trim()) submitData.name = Folder.implementation.defaultName();
      if (this.document.id) await this.document.update(submitData);
      else {
        this.document.updateSource(submitData);
        this.document = await Folder.create(this.document, { pack: this.document.pack });
      }
    }

    this.options.resolve?.(this.document);
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
  // Intercept and prevent certain placeable drag and drop if they are hovering over the PresetBrowser form
  // passing on the placeable to it to perform preset creation.
  const dragDropHandler = function (wrapped, ...args) {
    if (PresetBrowser.objectHover || PresetConfig.objectHover) {
      this.mouseInteractionManager.cancel(...args);
      const app = Object.values(ui.windows).find(
        (x) =>
          (PresetBrowser.objectHover && x instanceof PresetBrowser) ||
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
    libWrapper.register(
      MODULE_ID,
      `foundry.canvas.placeables.${name}.prototype._onDragLeftDrop`,
      dragDropHandler,
      'MIXED'
    );
  });

  // Scene Control to open preset browser
  Hooks.on('renderSceneControls', (sceneControls, html, data, options) => {
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, 'presetSceneControl')) return;

    if ($(html).find('.mass-edit-scene-control').length) return;

    const presetControl = $(
      `<li>
       <button type="button" class="control ui-control layer icon mass-edit-scene-control fa-solid fa-books" role="tab"  data-control="me-presets" data-tooltip="" aria-pressed="false" aria-label="Mass Edit: Presets" aria-controls="scene-controls-tools"></button>
   </li>`
    );

    presetControl.on('click', () => {
      let documentName = canvas.activeLayer.constructor.documentName;
      if (!SUPPORTED_PLACEABLES.includes(documentName)) documentName = 'ALL';

      const presetForm = Object.values(ui.windows).find((app) => app instanceof PresetBrowser);
      if (presetForm) {
        presetForm.close();
        return;
      }

      new PresetBrowser(null, null, documentName, {
        left: presetControl.position().left + presetControl.width() + 40,
      }).render(true);
    });

    presetControl.on('contextmenu', async () => {
      const macroUuid =
        game.settings.get(MODULE_ID, 'browserContextMacroUuid') ||
        'Compendium.baileywiki-nuts-and-bolts.macros.Macro.Ds6je9mUwVkEnb9f';
      const macro = await fromUuid(macroUuid);
      macro?.execute();
    });

    $(html).find('#scene-controls-layers').append(presetControl);
  });

  // Change default behavior of JournalEntry click and context menu within the CompendiumDirectory
  libWrapper.register(
    MODULE_ID,
    'foundry.applications.sidebar.tabs.CompendiumDirectory.prototype._getEntryContextOptions',
    function (wrapped, ...args) {
      const options = wrapped(...args);
      options.push({
        name: 'Open Journal Compendium',
        icon: '<i class="fas fa-book-open"></i>',
        condition: (li) => {
          const pack = game.packs.get(li.dataset.pack);
          return pack.metadata.type === 'JournalEntry' && pack.index.get(META_INDEX_ID);
        },
        callback: (li) => {
          const pack = game.packs.get(li.dataset.pack);
          pack.render(true);
        },
      });
      return options;
    },
    'WRAPPER'
  );

  libWrapper.register(
    MODULE_ID,
    'foundry.applications.sidebar.apps.Compendium.prototype._getEntryContextOptions',
    function (wrapped, ...args) {
      const options = wrapped(...args);

      if (this.collection.documentName !== 'Scene') return options;

      options.push({
        name: 'Spawn as Preset',
        icon: '<i class="fa-solid fa-books"></i>',
        callback: async (li) => {
          spawnSceneAsPreset(await this.collection.getDocument($(li).data('entryId')));
        },
      });
      return options;
    },
    'WRAPPER'
  );

  libWrapper.register(
    MODULE_ID,
    'foundry.applications.sidebar.tabs.SceneDirectory.prototype._getEntryContextOptions',
    function (wrapped, ...args) {
      const options = wrapped(...args);
      options.push({
        name: 'Spawn as Preset',
        icon: '<i class="fa-solid fa-books"></i>',
        condition: (li) => game.user.isGM && canvas.ready && $(li).data('entryId') !== canvas.scene?.id,
        callback: (li) => {
          spawnSceneAsPreset(game.scenes.get($(li).data('entryId')));
        },
      });
      return options;
    },
    'WRAPPER'
  );

  libWrapper.register(
    MODULE_ID,
    'foundry.applications.sidebar.tabs.CompendiumDirectory.prototype._onClickEntry',
    async function (wrapped, ...args) {
      const target = args[1];
      const packId = target.closest('[data-pack]').dataset.pack;
      const pack = game.packs.get(packId);
      if (pack.metadata.type === 'JournalEntry' && pack.index.get(META_INDEX_ID)) {
        openPresetBrowser('ALL');
        return;
      }
      return wrapped(...args);
    },
    'MIXED'
  );
}
