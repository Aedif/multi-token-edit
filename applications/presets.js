import { Brush } from '../scripts/brush.js';
import { importPresetFromJSONDialog } from '../scripts/dialogs.js';
import { SortingHelpersFixed } from '../scripts/fixedSort.js';
import { SUPPORTED_PLACEABLES } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

// Create folder
// const folder = new Folder.implementation(foundry.utils.mergeObject({
//   name: Folder.defaultName(),
//   sorting: "a"
// }, {name: "Test Folder", type: "Cards"}), { pack: "world.mass-edit-presets" });
// Folder.create(folder, {pack: "world.mass-edit-presets"  })

const META_INDEX_FIELDS = ['id', 'img', 'documentName'];
const META_INDEX_ID = 'MassEditMetaData';
export const MAIN_PACK = 'world.mass-edit-presets';

const DOCUMENT_FIELDS = ['id', 'name', 'sort', 'folder'];

const FLAG_DATA = {
  documentName: null,
  data: null,
  addSubtract: null,
  randomize: null,
};

const PRESET_FIELDS = [
  'id',
  'name',
  'data',
  'sort',
  'folder',
  'uuid',
  'documentName',
  'addSubtract',
  'randomize',
  'img',
];

export class Preset {
  document;

  constructor(data) {
    this.id = data.id ?? data._id ?? randomID();
    this.name = data.name ?? 'Mass Edit Preset';
    this.documentName = data.documentName;
    this.sort = data.sort ?? 0;
    this.addSubtract = deepClone(data.addSubtract ?? {});
    this.randomize = deepClone(data.randomize ?? {});
    this.data = data.data ? deepClone(data.data) : null;
    this.img = data.img;
    this.folder = data.folder;
    this.uuid = data.uuid;
    this._visible = true;
  }

  get icon() {
    return DOC_ICONS[this.documentName] ?? DOC_ICONS.DEFAULT;
  }

  get thumbnail() {
    return this.img || CONST.DEFAULT_TOKEN;
  }

  async load() {
    if (!this.document && this.uuid) {
      this.document = await fromUuid(this.uuid);
      if (this.document) {
        const preset = this.document.getFlag('multi-token-edit', 'preset') ?? {};
        this.documentName = preset.documentName;
        this.img = preset.img;
        this.data = preset.data;
        this.randomize = preset.randomize;
        this.addSubtract = preset.addSubtract;
      }
    }
    return this;
  }

  async openJournal() {
    if (!this.document) await this.load();
    if (this.document) this.document.sheet.render(true);
  }

  async update(data) {
    if (this.document) {
      const flagUpdate = {};
      Object.keys(data).forEach((k) => {
        if (PRESET_FIELDS.includes(k) && data[k] !== this[k]) {
          flagUpdate[k] = data[k];
          this[k] = data[k];
        }
      });

      if (!isEmpty(flagUpdate)) {
        const update = { flags: { 'multi-token-edit': { preset: flagUpdate } } };
        DOCUMENT_FIELDS.forEach((field) => {
          if (field in flagUpdate && this.document[field] !== flagUpdate[field]) {
            update[field] = flagUpdate[field];
          }
        });

        await this.document.update(update);
      }
      await this._updateIndex(flagUpdate);
    } else {
      console.warn('Updating preset without document', this.id, this.uuid, this.name);
    }
  }

  async _updateIndex(data) {
    const update = {};

    META_INDEX_FIELDS.forEach((field) => {
      if (field in data) update[field] = data[field];
    });

    if (!isEmpty(update)) {
      const pack = game.packs.get(this.document.pack);
      const metaDoc = await pack.getDocument(META_INDEX_ID);
      if (metaDoc) {
        let tmp = {};
        tmp[this.id] = update;
        await metaDoc.setFlag('multi-token-edit', 'index', tmp);
      } else {
        console.warn(`META INDEX missing in ${this.document.pack}`);
        return;
      }
    }
  }

  toJSON() {
    let json = {};
    PRESET_FIELDS.forEach((field) => {
      json[field] = this[field];
    });
    if (this.document?.pages.size) {
      json.pages = this.document.toJSON().pages;
    }
    return json;
  }

  clone() {
    return new Preset(this.toJSON());
  }
}

export class PresetCollection {
  static presets;

  static async getTree(type, mainOnly = false) {
    const pack = game.packs.get(MAIN_PACK);
    const mainTree = await this.packToTree(pack, type);

    const staticFolders = [];

    if (!mainOnly) {
      let sort = 0;
      for (const p of game.packs) {
        if (p.collection !== MAIN_PACK && p.metadata.flags['multi-token-edit']?.presets) {
          const tree = await this.packToTree(p, type);
          if (!tree.hasVisible) continue;

          const topFolder = {
            id: p.collection,
            uuid: p.collection,
            name: p.title,
            sorting: sort,
            color: '#000000',
            sort: sort++,
            children: tree.folders.map((f) => {
              f.folder = p.collection;
              return f;
            }),
            presets: tree.presets,
            draggable: false,
            expanded: game.folders._expanded[p.collection],
            folder: null,
            visible: true,
          };

          staticFolders.push(topFolder);

          // Collate all folders with the main tree
          mainTree.allFolders.set(topFolder.uuid, topFolder);
          for (const [uuid, folder] of tree.allFolders) {
            mainTree.allFolders.set(uuid, folder);
          }
        }
      }
    }

    mainTree.staticFolders = staticFolders;

    return mainTree;
  }

  static async packToTree(pack, type) {
    if (!pack) return null;

    // Setup folders ready for parent/children processing
    const folders = new Map();
    const topLevelFolders = new Map();
    const folderContents = pack.folders.contents;
    for (const f of folderContents) {
      folders.set(f.uuid, {
        id: f._id,
        uuid: f.uuid,
        name: f.name,
        sorting: f.sorting,
        color: f.color,
        sort: f.sort,
        children: [],
        presets: [],
        draggable: f.pack === MAIN_PACK,
        expanded: game.folders._expanded[f.uuid],
        folder: f.folder?.uuid,
        visible: type ? (f.flags['multi-token-edit']?.types || ['ALL']).includes(type) : true,
      });
      topLevelFolders.set(f.uuid, folders.get(f.uuid));
    }

    // If folders have parent folders add them as children and remove them as a top level folder
    for (const f of folderContents) {
      if (f.folder) {
        const parent = folders.get(f.folder.uuid);
        parent.children.push(folders.get(f.uuid));
        topLevelFolders.delete(f.uuid);
      }
    }

    // Process presets
    const allPresets = [];
    const topLevelPresets = [];
    let hasVisible = false; // tracks whether there exists at least one visible preset within this tree
    let metaIndex = (await pack.getDocument(META_INDEX_ID))?.getFlag('multi-token-edit', 'index');

    const index = pack.index.contents;
    for (const idx of index) {
      if (idx._id === META_INDEX_ID) continue;
      const mIndex = metaIndex[idx._id];
      const preset = new Preset({ ...idx, ...mIndex, pack: pack.collection });
      if (preset.folder) {
        for (const [uuid, folder] of folders) {
          if (folder.id === preset.folder) {
            folder.presets.push(preset);
            break;
          }
        }
      } else topLevelPresets.push(preset);

      if (type) {
        if (type === 'ALL') {
          if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) preset._visible = false;
        } else if (preset.documentName !== type) preset._visible = false;
      }

      allPresets.push(preset);
      hasVisible |= preset._visible;
    }

    // Sort folders
    const sorting =
      game.settings.get('multi-token-edit', 'presetSortMode') === 'manual' ? 'm' : 'a';
    const sortedFolders = this._sortFolders(Array.from(topLevelFolders.values()), sorting);
    const sortedPresets = this._sortPresets(topLevelPresets, sorting);

    return {
      folders: sortedFolders,
      presets: sortedPresets,
      allPresets,
      allFolders: folders,
      hasVisible,
    };
  }

  static _sortFolders(folders, sorting = 'a') {
    for (const folder of folders) {
      folder.children = this._sortFolders(folder.children, folder.sorting);
      folder.presets = this._sortPresets(folder.presets, folder.sorting);
    }

    if (sorting === 'a')
      return folders.sort((f1, f2) => f1.name.localeCompare(f2.name, 'en', { numeric: true }));
    else return folders.sort((f1, f2) => f1.sort - f2.sort);
  }

  static _sortPresets(presets, sorting = 'a') {
    if (sorting === 'a')
      return presets.sort((p1, p2) => p1.name.localeCompare(p2.name, 'en', { numeric: true }));
    else return presets.sort((p1, p2) => p1.sort - p2.sort);
  }

  static async packToPresets(pack) {
    if (!pack) return [];

    const presets = [];

    let metaIndex = (await pack.getDocument(META_INDEX_ID))?.getFlag('multi-token-edit', 'index');

    const index = pack.index.contents;
    for (const idx of index) {
      if (idx._id === META_INDEX_ID) continue;
      const mIndex = metaIndex[idx._id];
      const preset = new Preset({ ...idx, ...mIndex, pack: pack.collection });
      presets.push(preset);
    }

    return presets;
  }

  static async update(preset) {
    const compendium = await this._initCompendium();
    const doc = await compendium.getDocument(preset.id);
    const updateDoc = {
      name: preset.name,
      flags: { 'multi-token-edit': { preset: preset.toJSON() } },
    };
    if (preset.pages) updateDoc.pages = preset.pages;
    await doc.update(updateDoc);

    const metaDoc = await this._initMetaDocument();
    const update = {};
    update[preset.id] = {
      id: preset.id,
      img: preset.img,
      documentName: preset.documentName,
    };

    await metaDoc.setFlag('multi-token-edit', 'index', update);
  }

  /**
   * Update multiple presets at the same time
   * @param {*} updates
   */
  static async updatePresets(updates) {
    // TODO update meta and preset itself
    await JournalEntry.updateDocuments(updates, { pack: MAIN_PACK });
  }

  /**
   * @param {Preset|Array[Preset]} preset
   */
  static async set(preset) {
    if (preset instanceof Array) {
      for (const p of preset) {
        await PresetCollection.set(p);
      }
      return;
    }

    const compendium = await this._initCompendium();
    if (compendium.index.get(preset.id)) {
      this.update(preset);
      return;
    }

    const documents = await JournalEntry.createDocuments(
      [
        {
          _id: preset.id,
          name: preset.name,
          pages: preset.pages ?? [],
          flags: { 'multi-token-edit': { preset: preset.toJSON() } },
        },
      ],
      {
        pack: MAIN_PACK,
        keepId: true,
      }
    );

    preset.uuid = documents[0].uuid;
    preset.document = documents[0];

    const metaDoc = await this._initMetaDocument();
    const update = {};
    update[preset.id] = {
      id: preset.id,
      img: preset.img,
      documentName: preset.documentName,
    };

    metaDoc.setFlag('multi-token-edit', 'index', update);
  }

  static async get(uuid, { full = true } = {}) {
    let { collection, documentId, documentType, embedded, doc } = foundry.utils.parseUuid(uuid);
    const index = collection.index.get(documentId);

    if (index) {
      const metaIndex = (await collection.getDocument(META_INDEX_ID))?.getFlag(
        'multi-token-edit',
        'index'
      );
      const mIndex = metaIndex[index._id];

      const preset = new Preset({ ...index, ...mIndex, pack: collection.collection });
      if (full) await preset.load();
      return preset;
    }
    return null;
  }

  /**
   * @param {Preset|Array[Preset]} preset
   */
  static async delete(presets) {
    if (!presets) return;
    if (!(presets instanceof Array)) presets = [presets];

    const compendium = await this._initCompendium();

    const metaDoc = await this._initMetaDocument();
    const metaUpdate = {};

    for (const preset of presets) {
      if (compendium.index.get(preset.id)) {
        const document = await compendium.getDocument(preset.id);
        await document.delete();
      }
      metaUpdate['-=' + preset.id] = null;
    }

    metaDoc.setFlag('multi-token-edit', 'index', metaUpdate);
  }

  static async _initCompendium() {
    let compendium = game.packs.get(MAIN_PACK);
    if (!compendium) {
      compendium = await CompendiumCollection.createCompendium({
        label: 'Mass Edit: Presets',
        type: 'JournalEntry',
        ownership: {
          GAMEMASTER: 'OWNER',
          PLAYER: 'NONE',
          ASSISTANT: 'NONE',
        },
        flags: { 'multi-token-edit': { presets: true } },
        packageType: 'world',
      });

      await this._initMetaDocument();
    }

    return compendium;
  }

  static async _initMetaDocument() {
    const compendium = game.packs.get(MAIN_PACK);
    const metaDoc = await compendium.getDocument(META_INDEX_ID);
    if (metaDoc) return metaDoc;

    const documents = await JournalEntry.createDocuments(
      [
        {
          _id: META_INDEX_ID,
          name: '!!! METADATA: DO NOT DELETE !!!',
          flags: { 'multi-token-edit': { index: {} } },
        },
      ],
      {
        pack: MAIN_PACK,
        keepId: true,
      }
    );
    return documents[0];
  }
}

export class PresetAPI {
  /**
   * Retrieve saved preset
   * @param {object} [options={}]
   * @param {String} [options.id]   Preset ID
   * @param {String} [options.name] Preset name
   * @param {String} [options.type] Preset type ("Token", "Tile", etc)
   * @returns {Preset}
   */
  static async getPreset({ uuid = null, name = null, type = null } = {}) {
    if (uuid) return await PresetCollection.get(uuid);
    else if (!name) throw Error('UUID or Name required to retrieve a Preset.');

    let { allPresets } = await PresetCollection.getTree();
    if (type) allPresets = allPresets.filter((p) => p.documentName === type);

    return allPresets
      .find((p) => p.name === name)
      ?.clone()
      .load();
  }

  /**
   * Create Presets from passed in placeables
   * @param {PlaceableObject|Array[PlaceableObject]} placeables Placeable/s to create the presets from.
   * @param {object} [options={}] Optional Preset information
   * @param {String} [options.name] Preset name
   * @param {String} [options.img] Preset thumbnail image
   * @returns {Preset|Array[Preset]}
   */
  static async createPreset(placeables, options = {}) {
    if (!placeables) return;
    if (!(placeables instanceof Array)) placeables = [placeables];

    const presets = [];

    for (const placeable of placeables) {
      let data = placeable.document.toCompendium();
      delete data.x;
      delete data.y;

      // Preset data before merging with user provided
      const defPreset = { name: 'New Preset', documentName: placeable.document.documentName, data };
      if (defPreset.documentName === 'Wall') delete data.c;

      switch (defPreset.documentName) {
        case 'Token':
          defPreset.name = data.name;
        case 'Tile':
        case 'Note':
          defPreset.img = data.texture.src;
          break;
        case 'AmbientSound':
          defPreset.img = 'icons/svg/sound.svg';
          break;
        case 'AmbientLight':
          defPreset.img = 'icons/svg/light.svg';
          break;
        case 'Drawing':
          defPreset.img = 'icons/svg/acid.svg';
          break;
        case 'MeasuredTemplate':
          defPreset.img = 'icons/svg/circle.svg';
          break;
      }

      mergeObject(defPreset, options, { inplace: true });

      const preset = new Preset(defPreset);
      await PresetCollection.set(preset);
      presets.push(preset);
    }

    return presets;
  }

  /**
   * Spawn a preset on the scene (id, name or preset itself are required).
   * @param {object} [options={}]
   * @param {Preset} [options.preset]             Preset
   * @param {String} [options.id]                 Preset ID
   * @param {String} [options.name]               Preset name
   * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
   * @param {Number} [options.x]                  Spawn canvas x coordinate (required if spawnOnMouse is false)
   * @param {Number} [options.y]                  Spawn canvas y coordinate (required if spawnOnMouse is false)
   * @param {Boolean} [options.spawnOnMouse]      If 'true' current mouse position will be used as the spawn position
   * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
   *
   */
  static spawnPreset({
    uuid = null,
    preset = null,
    name = null,
    type = null,
    x = null,
    y = null,
    spawnOnMouse = true,
    snapToGrid = true,
    hidden = false,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(uuid || preset || name)) throw Error('ID, Name, or Preset is needed to spawn it.');
    if (!spawnOnMouse && (x == null || y == null))
      throw Error(
        'X and Y coordinates have to be provided or spawnOnMouse set to true for a preset to be spawned.'
      );

    preset = preset ?? PresetAPI.getPreset({ uuid, name, type });
    if (!preset)
      throw Error(
        `No preset could be found matching: { uuid: "${uuid}", name: "${name}", type: "${type}"}`
      );

    if (spawnOnMouse && x == null) {
      x = canvas.mousePosition.x;
      y = canvas.mousePosition.y;

      if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
        x -= canvas.dimensions.size / 2;
        y -= canvas.dimensions.size / 2;
      }
    }

    let pos = { x, y };

    if (snapToGrid) {
      pos = canvas.grid.getSnappedPosition(
        pos.x,
        pos.y,
        canvas.getLayerByEmbeddedName(preset.documentName).gridPrecision
      );
    }

    const randomizer = preset.randomize;
    if (!isEmpty(randomizer)) {
      applyRandomization([preset.data], null, randomizer);
    }

    let data;

    // Set default values if needed
    switch (preset.documentName) {
      case 'Token':
        data = { name: preset.name };
        break;
      case 'Tile':
        data = { width: canvas.grid.w, height: canvas.grid.h };
        break;
      case 'AmbientSound':
        data = { radius: 20 };
        break;
      case 'Wall':
        data = { c: [pos.x, pos.y, pos.x + canvas.grid.w, pos.y] };
        break;
      case 'Drawing':
        data = { 'shape.width': canvas.grid.w * 2, 'shape.height': canvas.grid.h * 2 };
        break;
      case 'MeasuredTemplate':
        data = { distance: 10 };
        break;
      case 'AmbientLight':
        if (!('config.dim' in preset.data) && !('config.bright' in preset.data)) {
          data = { 'config.dim': 20, 'config.bright': 10 };
          break;
        }
      default:
        data = {};
    }

    mergeObject(data, preset.data);
    mergeObject(data, pos);

    if (hidden || game.keyboard.downKeys.has('AltLeft')) {
      data.hidden = true;
    }

    canvas.scene.createEmbeddedDocuments(preset.documentName, [data]);
  }
}

const DOC_ICONS = {
  ALL: 'fas fa-globe',
  Token: 'fas fa-user-circle',
  MeasuredTemplate: 'fas fa-ruler-combined',
  Tile: 'fa-solid fa-cubes',
  Drawing: 'fa-solid fa-pencil-alt',
  Wall: 'fa-solid fa-block-brick',
  AmbientLight: 'fa-regular fa-lightbulb',
  AmbientSound: 'fa-solid fa-music',
  Note: 'fa-solid fa-bookmark',
  Actor: 'fas fa-user-alt',
  DEFAULT: 'fa-solid fa-question',
};

const SORT_MODES = {
  manual: { tooltip: 'Sort Manually', icon: '<i class="fa-solid fa-arrow-down-short-wide"></i>' },
  alphabetical: {
    tooltip: 'Sort Alphabetically',
    icon: '<i class="fa-solid fa-arrow-down-a-z"></i>',
  },
};

export class MassEditPresets extends FormApplication {
  static objectHover = false;
  static lastSearch;

  constructor(configApp, callback, docName, options = {}) {
    super({}, options);
    this.callback = callback;

    // Drag/Drop tracking
    this.dragType = null;
    this.dragData = null;
    this.draggedElements = null;

    if (!configApp) {
      const docLock = game.settings.get('multi-token-edit', 'presetDocLock');
      this.docName = docLock || docName;
    } else {
      this.configApp = configApp;
      this.docName = docName || this.configApp.documentName;
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/presets.html',
      resizable: true,
      minimizable: false,
      title: `Presets`,
      width: 350,
      height: 'auto',
      scrollY: ['ol.item-list'],
    });
  }

  get title() {
    return `${game.i18n.localize('multi-token-edit.common.presets')}`;
  }

  async getData(options) {
    const data = super.getData(options);

    // Cache partials
    await getTemplate('modules/multi-token-edit/templates/generic/preset.html');
    await getTemplate('modules/multi-token-edit/templates/generic/presetFolder.html');

    this.tree = await PresetCollection.getTree(this.docName);
    data.presets = this.tree.presets;
    data.folders = this.tree.folders;
    data.staticFolders = this.tree.staticFolders.length ? this.tree.staticFolders : null;

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = this.docName === 'ALL' || SUPPORTED_PLACEABLES.includes(this.docName);
    data.allowDocumentSwap = data.isPlaceable && !this.configApp;
    data.docLockActive = game.settings.get('multi-token-edit', 'presetDocLock') === this.docName;
    data.layerSwitchActive = game.settings.get('multi-token-edit', 'presetLayerSwitch');

    data.sortMode = SORT_MODES[game.settings.get('multi-token-edit', 'presetSortMode')];

    // const aeModeString = function (mode) {
    //   let s = Object.keys(CONST.ACTIVE_EFFECT_MODES).find(
    //     (k) => CONST.ACTIVE_EFFECT_MODES[k] === mode
    //   );
    //   return s ?? mode;
    // };

    // Process presets

    // for (const p of presetList) {
    //   const fields = p.data;

    //   let title = p.documentName;

    //   if (p.documentName === 'ActiveEffect') {
    //     title = '';
    //     for (const k of Object.keys(fields)) {
    //       if (k in p.randomize) {
    //         title += `${k}: {{randomized}}\n`;
    //       } else if (k in p.addSubtract) {
    //         const val = 'value' in p.addSubtract[k] ? p.addSubtract[k].value : fields[k];
    //         title += `${k}: ${p.addSubtract[k].method === 'add' ? '+' : '-'}${val}\n`;
    //       } else if (k === 'changes' && this.docName === 'ActiveEffect') {
    //         fields[k].forEach((c) => {
    //           title += `${c.key} | ${aeModeString(c.mode)} | ${c.value} | ${c.priority}\n`;
    //         });
    //       } else {
    //         title += `${k}: ${fields[k]}\n`;
    //       }
    //     }
    //   }

    //   // Convert color to CSS rgba with opacity <1
    //   let color;
    //   try {
    //     if (p.color) color = new PIXI.Color(p.color);
    //   } catch (e) {}
    //   if (color) {
    //     color = color.toUint8RgbArray();
    //     color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3)`;
    //   }

    //   data.presets.push({
    //     uuid: p.uuid,
    //     name: p.name,
    //     img: p.img || CONST.DEFAULT_TOKEN,
    //     title: title,
    //     color: color,
    //     icon: DOC_ICONS[p.documentName] ?? DOC_ICONS.DEFAULT,
    //   });
    // }

    data.displayDragDropMessage = data.allowDocumentSwap && !Boolean(this.tree.allPresets.length);

    data.lastSearch = MassEditPresets.lastSearch;

    data.docs = ['ALL', ...SUPPORTED_PLACEABLES].reduce((obj, key) => {
      return {
        ...obj,
        [key]: DOC_ICONS[key],
      };
    }, {});

    data.documents = ['ALL', ...SUPPORTED_PLACEABLES];
    data.currentDocument = this.docName;

    data.callback = Boolean(this.callback);

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    const hoverOverlay = html.closest('.window-content').find('.overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (
          canvas.activeLayer?.preview?.children.some(
            (c) => c._original?.mouseInteractionManager?.isDragging
          )
        ) {
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

    // =====================
    // Preset multi-select & drag Listeners
    const itemList = html.find('.item-list');

    // Multi-select
    // TODO: do not let editable and non-editable items to be selected together
    html.on('click', '.item', (e) => {
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
              for (let i = lastSelectedIndex; i <= itemIndex; i++)
                $(itemArr[i]).addClass('selected');
            } else {
              for (let i = lastSelectedIndex; i >= itemIndex; i--)
                $(itemArr[i]).addClass('selected');
            }
          }
        } else {
          lastSelected.removeClass('last-selected');
          item.toggleClass('selected');
          if (item.hasClass('selected')) item.addClass('last-selected');
        }
      }
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
    html.on('click', '.folder > header', (event) => {
      const folder = $(event.target).closest('.folder');
      const uuid = folder.data('uuid');
      const icon = folder.find('header h3 i').first();

      if (!game.folders._expanded[uuid]) {
        game.folders._expanded[uuid] = true;
        folder.removeClass('collapsed');
        icon.removeClass('fa-folder-closed').addClass('fa-folder-open');
      } else {
        game.folders._expanded[uuid] = false;
        folder.addClass('collapsed');
        icon.removeClass('fa-folder-open').addClass('fa-folder-closed');
      }
    });

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

    html.find('.toggle-sort').on('click', this._onToggleSort.bind(this));
    html.find('.toggle-doc-lock').on('click', this._onToggleLock.bind(this));
    html.find('.toggle-layer-switch').on('click', this._onToggleLayerSwitch.bind(this));
    html.find('.document-select').on('click', this._onDocumentChange.bind(this));
    html.find('.item').on('dblclick ', this._onDoubleClickPreset.bind(this));
    html.find('.item').on('contextmenu', this._onRightClickPreset.bind(this));
    html.find('.create-folder').on('click', this._onCreateFolder.bind(this));
    html.on('click', '.preset-create', this._onPresetCreate.bind(this));
    html.on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    html.on('click', '.preset-brush', this._onPresetBrush.bind(this));
    html.on('click', '.preset-callback', this._onApplyPreset.bind(this));

    const headerSearch = html.find('.header-search input');
    const items = html.find('.item');
    const folders = html.find('.folder');
    headerSearch.on('input', (event) => this._onSearchInput(event, items, folders));
    if (MassEditPresets.lastSearch) headerSearch.trigger('input');

    // Activate context menu
    this._contextMenu(html.find('.item-list'));
  }

  _contextMenu(html) {
    ContextMenu.create(this, html, '.item', this._getItemContextOptions(), {
      hookName: 'MassEditPresetContext',
    });
    ContextMenu.create(this, html, '.folder header', this._getFolderContextOptions(), {
      hookName: 'MassEditFolderContext',
    });
  }

  _getItemContextOptions() {
    return [
      {
        name: 'Edit',
        icon: '<i class="fas fa-edit"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onEditSelectedPresets(item),
      },
      {
        name: 'Delete',
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onDeleteSelectedPresets(item),
      },
      {
        name: 'Import',
        icon: '<i class="fas fa-file-import fa-fw"></i>',
        condition: (item) => !item.hasClass('editable'),
        callback: (item) => console.log(item),
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
        name: 'Delete',
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (header) => header.closest('.folder').hasClass('editable'),
        callback: (header) => this._onFolderDelete(header),
      },
      {
        name: 'Import',
        icon: '<i class="fas fa-file-import fa-fw"></i>',
        condition: (header) => !header.closest('.folder').hasClass('editable'),
        callback: (header) => console.log(header),
      },
    ];
  }

  async _onEditSelectedPresets(item) {
    const uuids = [];
    $(item)
      .closest('.item-list')
      .find('.item.editable.selected')
      .each(function () {
        const uuid = $(this).data('uuid');
        uuids.push(uuid);
      });

    const selected = [];
    for (const uuid of uuids) {
      const preset = await PresetCollection.get(uuid);
      if (preset) selected.push(preset);
    }

    if (selected.length) {
      // Position edit window just bellow the item
      const options = item.offset();
      options.top += item.height();

      this._editPresets(selected, options);
    }
  }

  async _onDeleteSelectedPresets(item) {
    const uuids = [];
    const items = $(item).closest('.item-list').find('.item.editable.selected');
    items.each(function () {
      uuids.push($(this).data('uuid'));
    });

    const selected = [];
    for (const uuid of uuids) {
      const preset = await PresetCollection.get(uuid);
      if (preset) selected.push(preset);
    }

    if (selected.length) {
      await PresetCollection.delete(selected);
      items.remove();
    }
  }

  async _onCreateFolder(event) {
    const types = [];
    if (this.docName === 'ALL') {
      types.push('ALL');
    } else if (SUPPORTED_PLACEABLES.includes(this.docName)) {
      types.push('ALL', this.docName);
    } else {
      types.push(this.docName);
    }

    const folder = new Folder.implementation(
      {
        name: Folder.defaultName(),
        type: 'JournalEntry',
        sorting: 'a',
        flags: { 'multi-token-edit': { types } },
      },
      { pack: MAIN_PACK }
    );

    await new Promise((resolve) => {
      new PresetFolderConfig(folder, { resolve }).render(true);
    });

    this.render(true);
  }

  async _onDoubleClickPreset(event) {
    const preset = await PresetCollection.get($(event.target).closest('.item').data('uuid'));
    if (preset) preset.openJournal();
  }

  async _onFolderEdit(header) {
    const folder = await fromUuid($(header).closest('.folder').data('uuid'));

    new Promise((resolve) => {
      const options = { resolve, ...header.offset() };
      options.top += header.height();

      new PresetFolderConfig(folder, options).render(true);
    }).then(() => this.render(true));
  }

  async _onFolderDelete(header) {
    const folder = await fromUuid($(header).closest('.folder').data('uuid'));
    if (folder) {
      await folder.delete();
      this.render(true);
    }
  }

  // TODO: Needs to work with static folders
  _onSearchInput(event, items, folder) {
    MassEditPresets.lastSearch = event.target.value;

    if (!MassEditPresets.lastSearch) {
      this.render(true);
      return;
    }

    const matchedFolderUuids = new Set();
    const filter = event.target.value.trim().toLowerCase();

    // First hide/show items
    const app = this;
    items.each(function () {
      const item = $(this);
      if (item.attr('name').toLowerCase().includes(filter)) {
        item.show();
        let folderUuid = item.closest('.folder').data('uuid');
        while (folderUuid) {
          matchedFolderUuids.add(folderUuid);
          const folder = app.tree.allFolders.get(folderUuid);
          if (folder.folder) folderUuid = folder.folder;
          else folderUuid = null;
        }
      } else {
        item.hide();
      }
    });

    // Next hide/show folders depending on whether they contained matched items
    folder.each(function () {
      const folder = $(this);
      if (matchedFolderUuids.has(folder.data('uuid'))) {
        folder.removeClass('collapsed');
        folder.show();
      } else {
        folder.hide();
      }
    });
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
      await Folder.updateDocuments(updates, { pack: MAIN_PACK });
    }
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

    // this.render(true);
  }

  async _onToggleSort(event) {
    const currentSort = game.settings.get('multi-token-edit', 'presetSortMode');
    const newSort = currentSort === 'manual' ? 'alphabetical' : 'manual';
    await game.settings.set('multi-token-edit', 'presetSortMode', newSort);

    this.render(true);
  }

  _onToggleLock(event) {
    const lockControl = $(event.target).closest('.toggle-doc-lock');

    let currentLock = game.settings.get('multi-token-edit', 'presetDocLock');
    let newLock = this.docName;

    if (newLock !== currentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    game.settings.set('multi-token-edit', 'presetDocLock', newLock);
  }

  _onToggleLayerSwitch(event) {
    const switchControl = $(event.target).closest('.toggle-layer-switch');

    const value = !game.settings.get('multi-token-edit', 'presetLayerSwitch');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    game.settings.set('multi-token-edit', 'presetLayerSwitch', value);
  }

  _onDocumentChange(event) {
    const newDocName = $(event.target).closest('.document-select').data('name');
    if (newDocName != this.docName) {
      this.docName = newDocName;

      if (this.docName !== 'ALL') {
        if (game.settings.get('multi-token-edit', 'presetLayerSwitch'))
          canvas.getLayerByEmbeddedName(this.docName)?.activate();
      }

      this.render(true);
    }
  }

  async _onRightClickPreset(event) {
    const item = $(event.target).closest('.item');

    // If right-clicked item is not selected, de-select the others and select it
    if (!item.hasClass('selected')) {
      item
        .closest('.item-list')
        .find('.item.selected')
        .removeClass('selected')
        .removeClass('last-selected');
      item.addClass('selected').addClass('last-selected');
    }
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    if (!('left' in options)) {
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

    if (game.settings.get('multi-token-edit', 'presetLayerSwitch'))
      canvas.getLayerByEmbeddedName(preset.documentName)?.activate();

    // For some reason canvas.mousePosition does not get updated during drag and drop
    // Acquire the cursor position transformed to Canvas coordinates
    const [x, y] = [event.clientX, event.clientY];
    const t = canvas.stage.worldTransform;
    let mouseX = (x - t.tx) / canvas.stage.scale.x;
    let mouseY = (y - t.ty) / canvas.stage.scale.y;

    if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
      mouseX -= canvas.dimensions.size / 2;
      mouseY -= canvas.dimensions.size / 2;
    }

    PresetAPI.spawnPreset({ preset, x: mouseX, y: mouseY, mousePosition: false });
  }

  async _onPresetBrush(event) {
    const id = $(event.target).closest('.item').data('uuid');
    const preset = await PresetCollection.get(uuid);
    if (preset) {
      let activated = Brush.activate({
        preset,
        deactivateCallback: this._onPresetBrushDeactivate.bind(this),
      });

      const brushControl = $(event.target).closest('.preset-brush');
      if (brushControl.hasClass('active')) {
        brushControl.removeClass('active');
      } else {
        $(event.target).closest('form').find('.preset-brush').removeClass('active');
        if (!activated) {
          if (
            Brush.activate({ preset, deactivateCallback: this._onPresetBrushDeactivate.bind(this) })
          ) {
            brushControl.addClass('active');
          }
        } else {
          brushControl.addClass('active');
        }
      }
    }
  }

  _onPresetBrushDeactivate() {
    $(this.form).find('.preset-brush').removeClass('active');
  }

  async close(options = {}) {
    if (!Boolean(this.configApp)) Brush.deactivate();
    MassEditPresets.objectHover = false;
    return super.close(options);
  }

  // async render(force = false, options = {}) {
  //   console.log('RENDER');
  //   return super.render(force, options);
  // }

  async _onPresetUpdate(event) {
    const uuid = $(event.target).closest('.item').data('uuid');
    if (!uuid) return;

    const preset = await PresetCollection.get(uuid);
    if (!preset) return;

    const selectedFields =
      this.configApp instanceof ActiveEffectConfig
        ? this._getActiveEffectFields()
        : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected, unable to update.');
      return;
    }

    const randomize = deepClone(this.configApp.randomizeFields || {});
    const addSubtract = deepClone(this.configApp.addSubtractFields || {});

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomize);
    }

    preset.data = selectedFields;
    preset.randomize = randomize;
    preset.addSubtract = addSubtract;

    ui.notifications.info(`Preset "${preset.name}" updated`);

    this.render(true);
  }

  async _onPresetCreate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig
        ? this._getActiveEffectFields()
        : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected.');
      return;
    }

    const preset = new Preset({
      name: 'New Preset',
      documentName: this.docName,
      data: selectedFields,
      addSubtract: this.configApp.addSubtractFields,
      randomize: this.configApp.randomizeFields,
    });

    await PresetCollection.set(preset);
    this.render(true);

    this._editPresets([preset], { isCreate: true }, event);
  }

  async presetFromPlaceable(placeables, event) {
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

  _getActiveEffectFields() {
    return { changes: deepClone(this.configApp.object.changes ?? []) };
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

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

  async _onExport() {
    const tree = await PresetCollection.getTree(null, true);
    exportPresets(tree.allPresets);
  }

  async _onImport() {
    const json = await importPresetFromJSONDialog();
    if (!json) return;

    let importCount = 0;

    if (getType(json) === 'Array') {
      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || isEmpty(p.data)) continue;

        const preset = new Preset(p);
        preset.pages = p.pages;

        PresetCollection.set(preset);
        importCount++;
      }
    }

    ui.notifications.info(`Mass Edit: Imported ${importCount} presets.`);

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

  saveDataToFile(
    JSON.stringify(presets, null, 2),
    'text/json',
    (fileName ?? 'mass-edit-presets') + '.json'
  );
}

class PresetConfig extends FormApplication {
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
      template: 'modules/multi-token-edit/templates/presetEdit.html',
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
    else return `Preset: ${this.presets[0].name}`;
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

    data.preset = {};
    if (this.presets.length === 1) data.preset = this.presets[0];

    data.minlength = this.presets.length > 1 ? 0 : 1;

    data.tva = game.modules.get('token-variants')?.active;

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

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
  }

  async _updatePresets(formData) {
    formData.name = formData.name.trim();
    formData.img = formData.img.trim() || null;

    if (this.isCreate) {
      for (const preset of this.presets) {
        await preset.update({
          name: formData.name || preset.name || 'New Preset',
          img: formData.img ?? preset.img,
        });
      }
    } else {
      for (const preset of this.presets) {
        await preset.update({
          name: formData.name || preset.name,
          img: formData.img || preset.img,
        });
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    await this._updatePresets(formData);

    if (this.callback) this.callback(this.presets);
    return this.presets;
  }
}

class PresetFolderConfig extends FolderConfig {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'folder-edit'],
      template: 'modules/multi-token-edit/templates/presetFolderEdit.html',
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
    if (this.object.id) return `${game.i18n.localize('FOLDER.Update')}: ${this.object.name}`;
    return game.i18n.localize('FOLDER.Create');
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
    const label = game.i18n.localize(Folder.implementation.metadata.label);

    let folderDocs = folder.flags['multi-token-edit']?.types ?? ['ALL'];
    let docs = [];
    ['ALL', ...SUPPORTED_PLACEABLES].forEach((type) => {
      docs.push({ name: type, icon: DOC_ICONS[type], active: folderDocs.includes(type) });
    });

    return {
      folder: folder,
      name: folder._id ? folder.name : '',
      newName: game.i18n.format('DOCUMENT.New', { type: label }),
      safeColor: folder.color ?? '#000000',
      sortingModes: { a: 'FOLDER.SortAlphabetical', m: 'FOLDER.SortManual' },
      submitText: game.i18n.localize(folder._id ? 'FOLDER.Update' : 'FOLDER.Create'),
      docs,
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let visibleTypes = [];
    $(this.form)
      .find('.document-select.active')
      .each(function () {
        visibleTypes.push($(this).data('name'));
      });
    if (!visibleTypes.length) visibleTypes.push('ALL');

    formData['flags.multi-token-edit.types'] = visibleTypes;

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
