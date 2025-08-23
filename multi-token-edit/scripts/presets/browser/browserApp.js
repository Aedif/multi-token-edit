import { TokenDataAdapter } from '../../data/adapters.js';
import { copyToClipboard } from '../../../applications/formUtils.js';
import { countFolderItems, trackProgress } from '../../../applications/progressDialog.js';
import { importPresetFromJSONDialog } from '../../dialogs.js';
import { SortingHelpersFixed } from '../../fixedSort.js';
import { DragHoverOverlay, localFormat, localize, spawnSceneAsPreset } from '../../utils.js';
import { META_INDEX_ID, PresetAPI, PresetPackFolder, PresetStorage } from '../collection.js';
import { LinkerAPI } from '../../linker/linker.js';
import { DOC_ICONS, Preset } from '../preset.js';
import { exportPresets, parseSearchQuery, placeableToData } from '../utils.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, UI_DOCS } from '../../constants.js';
import { TagSelector } from './tagSelector.js';
import PresetBrowserSettings from './settingsApp.js';
import { PresetConfig } from '../editApp.js';
import { PresetContainerV2 } from '../containerAppV2.js';
import { uploadFiles } from '../../auxilaryFeatures/utils.js';
import { collapseFolders, getPresetPackTrees, searchNode } from './tree.js';

const SEARCH_MIN_CHAR = 2;

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

export function openPresetBrowser(documentName) {
  new PresetBrowser(null, null, documentName).render(true);
}

export class PresetBrowser extends PresetContainerV2 {
  static objectHover = false;
  static lastSearch;
  static CONFIG;

  static async setSetting(setting, value) {
    return await game.settings.set(MODULE_ID, 'presetBrowser', { ...PresetBrowser.CONFIG, [setting]: value });
  }

  /**
   * Re-render currently active PresetBrowser instance.
   * Called after mutations are performed to preset compendiums
   */
  static async renderActiveBrowser() {
    foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id)?.render(true);
  }

  get lastSearch() {
    return this._lastSearch;
  }

  set lastSearch(val) {
    this._lastSearch = val;
    PresetBrowser.lastSearch = val;
  }

  constructor(configApp, callback, documentName, options = {}) {
    super({}, { ...options, sortable: true, duplicatable: true });
    this.callback = callback;

    if (!configApp && UI_DOCS.includes(documentName)) {
      this.documentName = PresetBrowser.CONFIG.documentLock || documentName;
    } else {
      this.configApp = configApp;
      this.documentName = documentName || this.configApp.documentName;
    }

    this.lastSearch = PresetBrowser.CONFIG.persistentSearch ? PresetBrowser.lastSearch : '';
    PresetBrowser._type = this.documentName;
  }

  static DEFAULT_OPTIONS = {
    id: 'mass-edit-presets',
    tag: 'form',
    classes: ['mass-edit-window-fill'],
    form: {
      handler: undefined,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 377,
      height: 900,
    },
    actions: {
      documentChange: PresetBrowser._onDocumentChange,
      toggleSetting: PresetBrowser._onToggleSetting,
      toggleLock: PresetBrowser._onToggleLock,
      toggleTagSelector: PresetBrowser._onToggleTagSelector,
      toggleSortMode: PresetBrowser._onToggleSortMode,
      createFolder: PresetBrowser._onCreateFolder,
      createPreset: PresetBrowser._onCreatePreset,
      openSettingConfig: PresetBrowser._onOpenSettingConfig,
      workingPackChange: PresetBrowser._onWorkingPackChange,
      exportPresets: PresetBrowser._onExportPresets,
      importPresets: PresetBrowser._onImportPresets,
      toggleCompendiumLock: PresetBrowser._onToggleCompendiumLock,
      createBag: PresetBrowser._onCreateBag,
      presetCreate: PresetBrowser._onPresetCreate,
      presetUpdate: PresetBrowser._onPresetUpdate,
      applyPreset: PresetBrowser._onApplyPreset,
    },
  };

  /** @override */
  static PARTS = {
    overlay: { template: `modules/${MODULE_ID}/templates/drag-hover-overlay.hbs` },
    main: { template: `modules/${MODULE_ID}/templates/preset/browser.hbs` },
  };

  get title() {
    let title = localize('presets.preset-browser');
    if (!UI_DOCS.includes(this.documentName)) title += ` [${this.documentName}]`;
    return title;
  }

  static async buildTree(
    type,
    { externalCompendiums = true, virtualDirectory = true, setFormVisibility = false } = {}
  ) {
    const { workingTree, externalTrees } = await getPresetPackTrees({ type, virtualDirectory, externalCompendiums });
    searchNode(workingTree, null, null, false, type, false);
    externalTrees.forEach((tree) => searchNode(tree, null, null, false, type, false));
    return { workingTree, externalTrees };
  }

  async _refreshTree() {
    this.tree = await PresetBrowser.buildTree(this.documentName, {
      externalCompendiums: PresetBrowser.CONFIG.externalCompendiums,
      virtualDirectory: PresetBrowser.CONFIG.virtualDirectory,
      setFormVisibility: true,
    });
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    await this._refreshTree();

    context.browser = true;
    context.workingTree = this.tree.workingTree;
    context.externalTrees = this.tree.externalTrees;

    this._tagSelector?.render(true);

    if (PresetBrowser.CONFIG.persistentSearch && this.lastSearch) {
      this._onSearch(this.lastSearch, { render: false });
      context.lastSearch = this.lastSearch;
    } else context.lastSearch = '';

    context.createEnabled = Boolean(this.configApp);
    context.isPlaceable = SUPPORTED_PLACEABLES.includes(this.documentName) || this.documentName === 'ALL';
    context.allowDocumentSwap = UI_DOCS.includes(this.documentName) && !this.configApp;
    context.docLockActive = PresetBrowser.CONFIG.documentLock === this.documentName;
    context.layerSwitchActive = PresetBrowser.CONFIG.switchLayer;
    context.autoScale = PresetBrowser.CONFIG.autoScale;
    context.externalCompendiums = PresetBrowser.CONFIG.externalCompendiums;
    context.virtualDirectory = PresetBrowser.CONFIG.virtualDirectory;
    context.sortMode = SORT_MODES[PresetBrowser.CONFIG.sortMode];
    context.displayDragDropMessage =
      context.allowDocumentSwap &&
      !(
        context.workingTree.folder.presets.length ||
        context.workingTree.children.length ||
        context.externalTrees?.length
      );

    context.docs = [];
    context.docsDropdown = PresetBrowser.CONFIG.dropdownDocuments.length ? [] : null;
    UI_DOCS.forEach((name) => {
      const doc = { name, icon: DOC_ICONS[name], tooltip: name === 'ALL' ? 'Placeables' : name };
      if (PresetBrowser.CONFIG.dropdownDocuments.includes(name)) context.docsDropdown.push(doc);
      else context.docs.push(doc);
    });

    context.documents = UI_DOCS;
    context.currentDocument = this.documentName;

    context.callback = Boolean(this.callback);

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);

    switch (partId) {
      case 'overlay':
        context.dragHoverOverlay = localize('presets.drag-over-message');
        break;
    }

    return context;
  }

  /** @override */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    switch (partId) {
      case 'overlay':
        DragHoverOverlay.attachListeners(element, {
          condition: () => {
            PresetBrowser.objectHover = canvas.activeLayer?.preview?.children.some(
              (c) => c._original?.mouseInteractionManager?.isDragging
            );
            return PresetBrowser.objectHover;
          },
          hoverOutCallback: () => (PresetBrowser.objectHover = false),
        });
        break;
      case 'main':
        $(element).find('.header-search input').on('input', this._onSearchInput.bind(this));
        break;
    }
  }

  /**
   * Process drag and drop of an Actor or Folder of actors
   * @param {*} event
   * @returns
   */
  _foundryDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
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
          if (preset) PresetStorage.createDocuments(preset);
        });
        return true;
      }

      return false;
    }
    return false;
  }

  /**
   * Process files being dropped into the container.
   * @param {DropEvent} event
   */
  async _fileDrop(event) {
    const files = event.dataTransfer.files;
    if (!files?.length) return {};

    let multiPreset = true;
    if (files.length > 1) {
      multiPreset = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'Should a preset be created for each file?' },
        content: '',
        yes: { label: 'Multiple Presets', default: false, icon: 'fa-solid fa-layer-group' },
        no: { label: 'Single Preset', default: true, icon: 'fa-solid fa-rectangle' },
      });
    }

    const presets = await uploadFiles(files, 'presets', !multiPreset);
    PresetStorage.createDocuments(presets);
    await this._refreshTree();

    return { type: 'preset', uuids: presets.map((p) => p.uuid), sortable: true };
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
      { pack: PresetStorage.workingPack }
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

    await PresetStorage.createDocuments(presets);
  }

  async _onExportFolder(uuid) {
    let { pack, keepId } = await getCompendiumDialog({ exportTo: true, keepIdSelect: true });

    if (pack && !this._importTracker?.active) {
      const folder = fromUuidSync(uuid);
      if (folder) {
        this._importTracker = await trackProgress({
          title: 'Exporting Folder',
          total: countFolderItems(fromUuidSync(uuid)),
        });
        await this._onCopyFolder(uuid, null, pack, true, keepId);
        this._importTracker?.stop();
      }
    }
  }

  async _onCopyFolder(uuid, parentId = null, pack, render = true, keepId = true) {
    if (!pack) pack = PresetStorage.workingPack;

    const folder = fromUuidSync(uuid);

    if (folder) {
      let types = folder.flags[MODULE_ID]?.types ?? ['ALL'];

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

      const presets = await PresetStorage.batchLoad(folder.presets);

      const toCreate = [];

      for (const preset of presets) {
        if (!this._importTracker?.active) break;
        const p = preset.clone();
        p.folder = nFolder.id;
        if (!keepId) p.id = foundry.utils.randomID();
        toCreate.push(p);
        this._importTracker?.incrementCount();
      }

      await PresetStorage.createDocuments(toCreate, pack);

      for (const child of folder.children) {
        if (!this._importTracker?.active) break;
        await this._onCopyFolder(child.folder.uuid, nFolder.id, pack, false, keepId);
      }

      if (render) this.render(true);
    }
  }

  async _onExportSelectedPresetsToComp() {
    let { pack, keepId } = await getCompendiumDialog({ exportTo: true, keepIdSelect: true });
    if (pack) this._onCopySelectedPresets({ pack, keepId });
  }

  async _onCopyPresetToClipboard() {
    const [selected, _] = await this._getSelectedPresets();
    if (selected.length) copyToClipboard(selected[0]);
  }

  static async _onCreateFolder() {
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
      { pack: PresetStorage.workingPack }
    );

    await new Promise((resolve) => {
      new PresetFolderConfig({ resolve, document: folder }).render(true);
    });

    this.render(true);
  }

  async _onFolderEdit(header) {
    const uuid = header.closest('.folder').dataset.uuid;
    const pFolder = fromUuidSync(uuid);

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
        { pack: pFolder.pack }
      );
    } else {
      folder = fromUuidSync(uuid);
    }

    new Promise((resolve) => {
      const options = { resolve, ...$(header).offset(), folder: pFolder, document: folder };
      options.top += $(header).height();
      new PresetFolderConfig(options).render(true);
    }).then(() => this.render(true));
  }

  async _onFolderDelete(uuid, { deleteAll = false } = {}) {
    const folder = fromUuidSync(uuid);
    if (folder) {
      let confirm;

      if (deleteAll) {
        // Construct warning count of what is about to be removed
        const count = { Folder: 0 };
        const traverseFolder = function (folder) {
          count.Folder += 1;
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

      if (confirm) await folder.delete({ deleteSubfolders: deleteAll, deleteContents: deleteAll });
      this.render(true);
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
      collapseFolders(this.tree.workingTree);
      this.tree.externalTrees.forEach((tree) => collapseFolders(tree));
      searchNode(this.tree.workingTree, null, null, false, this.documentName, false);
      this.tree.externalTrees.forEach((tree) => searchNode(tree, null, null, false, this.documentName, false));

      if (render) this._renderContent();
      return;
    }

    if (query.length < SEARCH_MIN_CHAR) return;

    const { search, negativeSearch } = parseSearchQuery(query, { matchAny: false });
    if (!(search || negativeSearch)) return;

    if (event) $(event.target).addClass('active');

    searchNode(this.tree.workingTree, search, negativeSearch, false, this.documentName, true);
    this.tree.externalTrees.forEach((f) => searchNode(f, search, negativeSearch, false, this.documentName, true));

    if (render) this._renderContent(true);
  }

  async _renderContent(search = false) {
    await super._renderContent({
      callback: Boolean(this.callback),
      presets: this.tree.workingTree.folder.presets,
      nodes: this.tree.workingTree.children,
      createEnabled: Boolean(this.configApp),
      externalTrees: this.tree.externalTrees.length ? this.tree.externalTrees : null,
      browser: true,
    });
    this._tagSelector?.render(true);
  }

  async _onFolderSort(sourceUuid, targetUuid, { inside = true, folderUuid = null } = {}) {
    let source = fromUuidSync(sourceUuid);
    let target = fromUuidSync(targetUuid);

    let folders;
    if (folderUuid) folders = fromUuidSync(folderUuid).children.map((ch) => ch.folder);
    else folders = this.tree.workingTree.children.map((ch) => ch.folder);

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
        update.folder = fromUuidSync(folderUuid)?.id ?? null;
        updates.push(update);

        ctrl.target.sort = update.sort;
      });
      await Folder.updateDocuments(updates, {
        pack: PresetStorage.workingPack,
      });
    }
    this.render(true);
  }

  async _onItemSort(sourceUuids, targetUuid, { before = true, folderUuid = null } = {}) {
    const sourceUuidsSet = new Set(sourceUuids);
    const sources = await PresetStorage.retrieve({ uuid: Array.from(sourceUuidsSet) });

    let target = targetUuid ? await PresetStorage.retrieveSingle({ uuid: targetUuid }) : null;

    // Determine siblings based on folder
    let presets;
    if (folderUuid) presets = fromUuidSync(folderUuid).presets;
    else presets = this.tree.workingTree.folder.presets;

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
      const folderId = fromUuidSync(folderUuid)?.id ?? null;
      result.forEach((ctrl) => {
        const update = ctrl.update;
        update._id = ctrl.target.id;
        update.folder = folderId;
        updates.push(update);
        ctrl.target.sort = update.sort;
      });

      await PresetStorage.updatePresets(updates);
    }

    this.render(true);
  }

  static async _onToggleSortMode() {
    await PresetBrowser.setSetting('sortMode', PresetBrowser.CONFIG.sortMode === 'manual' ? 'alphabetical' : 'manual');
    this.render(true);
  }

  static _onToggleLock(event, target) {
    const lockControl = $(target);

    let newLock = this.documentName;
    if (newLock !== PresetBrowser.CONFIG.documentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    PresetBrowser.setSetting('documentLock', newLock);
  }

  static async _onToggleSetting(event, element) {
    const setting = element.dataset.setting;
    await PresetBrowser.setSetting(setting, !PresetBrowser.CONFIG[setting]);
    this.render(true);
  }

  /**
   * Change currently selected document category
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static _onDocumentChange(event, target) {
    if (target.dataset.name != this.documentName) {
      this.documentName = target.dataset.name;
      PresetBrowser._type = this.documentName;

      if (PresetBrowser.CONFIG.switchLayer)
        canvas.getLayerByEmbeddedName(this.documentName === 'Actor' ? 'Token' : this.documentName)?.activate();

      this.render(true);
    }
  }

  static async _onApplyPreset(event) {
    if (this.callback) {
      const uuid = $(event.target).closest('.item').data('uuid');
      this.callback(await PresetStorage.retrieveSingle({ uuid, load: true }));
    }
  }

  static async _onToggleTagSelector(event) {
    if (this._tagSelector) {
      this._tagSelector.close(true);
      this._tagSelector = null;
    } else {
      this._tagSelector = new TagSelector(this);
      this._tagSelector.render(true);
    }
  }

  async close(options = {}) {
    PresetBrowser.objectHover = false;
    this._tagSelector?.close();

    return super.close(options);
  }

  static async _onPresetUpdate(event) {
    const preset = await PresetStorage.retrieveSingle({ uuid: event.target.closest('.item').dataset.uuid, load: true });
    if (!preset) return;

    const selectedFields = this.configApp.getSelectedFields();
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

  static async _onPresetCreate(event) {
    const selectedFields = this.configApp.getSelectedFields();
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

    await PresetStorage.createDocuments(preset);

    this._editPresets([preset], { isCreate: true }, event);
  }

  static async _onCreateBag() {
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
    await PresetStorage.createDocuments(presetBag);
  }

  /**
   * Handle creation of a new preset from the selected placeables
   */
  static _onCreatePreset() {
    // Create Preset from Selected
    const controlled = canvas.activeLayer.controlled;
    if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
      this.dropPlaceable(controlled);
    }
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

  _getHeaderControls() {
    const controls = super._getHeaderControls();

    if (game.packs.get(PresetStorage.workingPack)?.locked) {
      controls.push({
        label: 'Un-Lock Working Compendium',
        icon: 'fas fa-lock fa-fw',
        action: 'toggleCompendiumLock',
      });
    }

    controls.push({
      label: 'Compendium',
      icon: 'fas fa-atlas',
      action: 'workingPackChange',
    });

    controls.push({
      label: 'Directory Indexer',
      icon: 'fas fa-archive',
      action: 'openIndexer',
    });

    controls.push({
      label: 'Import Presets',
      icon: 'fas fa-file-import',
      action: 'importPresets',
    });

    controls.push({
      label: 'Export Presets',
      icon: 'fas fa-file-export',
      action: 'exportPresets',
    });

    controls.push({
      label: 'Browser Settings',
      icon: 'fas fa-gear',
      action: 'openSettingConfig',
    });

    return controls;
  }

  static async _onWorkingPackChange() {
    let { pack } = await getCompendiumDialog();
    if (pack && pack !== PresetStorage.workingPack) {
      const { metadataDocument } = await PresetStorage._initCompendium(pack);
      if (metadataDocument) {
        await game.settings.set(MODULE_ID, 'workingPack', pack);
        this.render(true);
      } else {
        ui.notifications.wan(`Unable to establish ${pack} as Mass Edit Preset compendium.`);
      }
    }
  }

  /**
   * Render PresetBrowser setting configuration form
   */
  static _onOpenSettingConfig() {
    new PresetBrowserSettings(this).render(true);
  }

  static async _onToggleCompendiumLock() {
    const pack = game.packs.get(PresetStorage.workingPack);
    if (pack) {
      await pack.configure({ locked: false });
      this.render(true);
    }
  }

  /**
   * Export all working pack presets as a JSON file
   */
  static async _onExportPresets() {
    const pack = game.packs.get(PresetStorage.workingPack);

    if (!pack._meIndex) await PresetStorage._loadIndex(pack._meIndex);
    const presets = pack._meIndex.contents;
    PresetStorage.batchLoad(presets);
    exportPresets(presets);
  }

  static async _onImportPresets() {
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

      await PresetStorage.createDocuments(presets);
    }

    ui.notifications.info(`Mass Edit: ${localFormat('presets.imported', { count: importCount })}`);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    if (this.callback) {
      this.callback(await PresetStorage.retrieveSingle({ uuid: event.submitter.data.id }));
    }
  }
}

class PresetFolderConfig extends foundry.applications.sheets.FolderConfig {
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
    return localize('SIDEBAR.ACTIONS.CREATE.Folder', false);
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
    const submitText = localize(folder._id ? 'FOLDER.Update' : 'SIDEBAR.ACTIONS.CREATE.Folder', false);
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

    let document = this.document;
    if (this.options.folder instanceof PresetPackFolder) {
      // This is a virtual folder used to store Compendium contents,
      // update using the provided interface
      let update = {};
      submitData.group = $(form).find('[name="group"]').val();

      ['name', 'color', 'group'].forEach((k) => {
        if (!submitData[k]?.trim()) update['-=' + k] = null;
        else update[k] = submitData[k].trim();
      });

      await this.options.folder.update(update);
    } else {
      // This is a real folder, update/create it
      if (!submitData.name?.trim()) submitData.name = Folder.implementation.defaultName();
      if (document.id) await document.update(submitData);
      else {
        document.updateSource(submitData);
        document = await Folder.create(document, { pack: document.pack });
      }
    }

    this.options.resolve?.(document);
  }
}

async function getCompendiumDialog({ excludePack, exportTo = false, keepIdSelect = false } = {}) {
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
      const workingPack = p.collection === PresetStorage.workingPack;
      options += `<option value="${p.collection}" ${workingPack ? 'selected="selected"' : ''}>${p.title}</option>`;
    }
  }

  let html = `
  <p style="color: orangered;">${config.message}</p>
  <div class="form-group">
    <label>${localize('PACKAGE.TagCompendium', false)}</label>
    <div class="form-fields">
      <select style="width: 100%; margin-bottom: 10px;" name="pack">${options}</select>
    </div>
  </div>`;

  if (keepIdSelect) {
    html += `
<div class="form-group">
    <label>${localize('presets.keep-ids')}</label>
    <input type="checkbox" name="keepId" checked>
    <p class="hint">${localize('presets.keep-ids-hint')}</p>
</div>`;
  }

  const content = document.createElement('div');
  content.innerHTML = html;

  let result = {};
  await foundry.applications.api.DialogV2.wait({
    window: { title: config.title, icon: 'fas fa-atlas' },
    content,
    position: { width: 400 },
    buttons: [
      {
        action: 'ok',
        label: config.buttonLabel,
        icon: '',
        callback: (event, button) => {
          const fd = new foundry.applications.ux.FormDataExtended(button.form);
          result = {
            pack: fd.object.pack,
            keepId: fd.object.keepId,
          };
        },
      },
      {
        action: 'cancel',
        label: 'Cancel',
      },
    ],
  });

  return result;
}

export function registerPresetBrowserHooks() {
  // Intercept and prevent certain placeable drag and drop if they are hovering over the PresetBrowser form
  // passing on the placeable to it to perform preset creation.
  const dragDropHandler = function (wrapped, ...args) {
    if (PresetBrowser.objectHover || PresetConfig.objectHover) {
      this.mouseInteractionManager.cancel(...args);
      let app;

      if (PresetBrowser.objectHover) app = foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id);
      else if (PresetConfig.objectHover) app = foundry.applications.instances.get('mass-edit-preset-edit');

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

      const presetForm = foundry.applications.instances.get('mass-edit-presets');
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
        'Compendium.baileywiki-nuts-and-bolts.macros.Macro.gjVoFJiIoKerEcB2';
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

  libWrapper.register(
    MODULE_ID,
    'foundry.documents.collections.CompendiumCollection.prototype.maxFolderDepth',
    function (wrapped) {
      const depth = wrapped();
      return this.index.get(META_INDEX_ID) ? 100 : depth;
    },
    'WRAPPER'
  );
}
