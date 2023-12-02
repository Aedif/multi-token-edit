import { Brush } from '../scripts/brush.js';
import { importPresetFromJSONDialog } from '../scripts/dialogs.js';
import { SortingHelpersFixed } from '../scripts/fixedSort.js';
import { applyRandomization } from '../scripts/randomizer/randomizerUtils.js';
import { Picker, SUPPORTED_PLACEABLES, UI_DOCS, createDocuments, flattenToDepth } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';
import { showMassEdit } from './multiConfig.js';

const META_INDEX_FIELDS = ['id', 'img', 'documentName'];
const META_INDEX_ID = 'MassEditMetaData';
const DEFAULT_PACK = 'world.mass-edit-presets-main';

const DOCUMENT_FIELDS = ['id', 'name', 'sort', 'folder'];

// const FLAG_DATA = {
//   documentName: null,
//   data: null,
//   addSubtract: null,
//   randomize: null,
// };

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
  //'actor',
];

export class Preset {
  document;

  constructor(data) {
    this.id = data.id ?? data._id ?? randomID();
    this.name = data.name ?? 'Mass Edit Preset';
    this.documentName = data.documentName;
    this.sort = data.sort ?? 0;
    this.addSubtract =
      data.addSubtract instanceof Array ? Object.fromEntries(data.addSubtract) : deepClone(data.addSubtract ?? {});
    this.randomize =
      data.randomize instanceof Array ? Object.fromEntries(data.randomize) : deepClone(data.randomize ?? {});
    this.data = data.data ? deepClone(data.data) : null;
    this.img = data.img;
    this.folder = data.folder;
    this.uuid = data.uuid;
    // this.actor = data.actor;
    this._visible = true;
  }

  get icon() {
    return DOC_ICONS[this.documentName] ?? DOC_ICONS.DEFAULT;
  }

  get thumbnail() {
    return this.img || CONST.DEFAULT_TOKEN;
  }

  get pages() {
    if (this.document?.pages.size) return this.document.toJSON().pages;
    else if (this._pages) return this._pages;
    return null;
  }

  async load() {
    if (!this.document && this.uuid) {
      this.document = await fromUuid(this.uuid);
      if (this.document) {
        const preset = this.document.getFlag('multi-token-edit', 'preset') ?? {};
        this.documentName = preset.documentName;
        this.img = preset.img;
        this.data = preset.data;
        this.randomize =
          getType(preset.randomize) === 'Object' ? preset.randomize : Object.fromEntries(preset.randomize ?? []);
        this.addSubtract =
          getType(preset.addSubtract) === 'Object' ? preset.addSubtract : Object.fromEntries(preset.addSubtract ?? []);
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
        if (k === 'randomize' || k === 'addSubtract') {
          flagUpdate[k] = Object.entries(data[k]);
          this[k] = data[k];
        } else if (k === 'data' && !(data.data instanceof Array)) {
          if (this.data instanceof Array) {
            flagUpdate.data = this.data.map((d) => {
              return mergeObject(d, data.data);
            });
            this.data = flagUpdate.data;
          } else {
            this.data = mergeObject(this.data, data.data);
            flagUpdate.data = data.data;
          }
        } else if (PRESET_FIELDS.includes(k) && data[k] !== this[k]) {
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

    json.randomize = Object.entries(json.randomize ?? {});
    json.addSubtract = Object.entries(json.addSubtract ?? []);
    const pages = this.pages;
    if (pages) json.pages = pages;

    return json;
  }

  clone() {
    const clone = new Preset(this.toJSON());
    clone.document = this.document;
    return clone;
  }
}

export class PresetCollection {
  static presets;

  static workingPack;

  static async getTree(type, mainOnly = false) {
    const pack = await this._initCompendium(this.workingPack);
    const mainTree = await this.packToTree(pack, type);

    const staticFolders = [];

    if (!mainOnly) {
      let sort = 0;
      for (const p of game.packs) {
        if (p.collection !== this.workingPack && p.index.get(META_INDEX_ID)) {
          const tree = await this.packToTree(p, type);
          if (!tree.hasVisible) continue;

          const topFolder = {
            id: p.collection,
            uuid: p.collection,
            name: p.title,
            sorting: 'm',
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
        draggable: f.pack === this.workingPack,
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

      // If no document name is available (missing metadata) attempt to load the preset to retrieve it
      // If still no name is found, skip it
      if (!preset.documentName) {
        console.log(`Missing MetaData. Attempting document load: ${preset.id} | ${preset.name}`);
        await preset.load();
        if (!preset.documentName) continue;
      }

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
          if (!UI_DOCS.includes(preset.documentName)) preset._visible = false;
        } else if (preset.documentName !== type) preset._visible = false;
      }

      allPresets.push(preset);
      hasVisible |= preset._visible;
    }

    // Sort folders
    const sorting = game.settings.get('multi-token-edit', 'presetSortMode') === 'manual' ? 'm' : 'a';
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

    if (sorting === 'a') return folders.sort((f1, f2) => f1.name.localeCompare(f2.name, 'en', { numeric: true }));
    else return folders.sort((f1, f2) => f1.sort - f2.sort);
  }

  static _sortPresets(presets, sorting = 'a') {
    if (sorting === 'a') return presets.sort((p1, p2) => p1.name.localeCompare(p2.name, 'en', { numeric: true }));
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
    const compendium = await this._initCompendium(this.workingPack);
    const doc = await compendium.getDocument(preset.id);
    const updateDoc = {
      name: preset.name,
      flags: { 'multi-token-edit': { preset: preset.toJSON() } },
    };
    const pages = preset.pages;
    if (pages) updateDoc.pages = pages;
    await doc.update(updateDoc);

    const metaDoc = await this._initMetaDocument(this.workingPack);
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
    await JournalEntry.updateDocuments(updates, { pack: this.workingPack });
  }

  /**
   * @param {Preset|Array[Preset]} preset
   */
  static async set(preset, pack) {
    if (!pack) pack = this.workingPack;

    if (preset instanceof Array) {
      for (const p of preset) {
        await PresetCollection.set(p, pack);
      }
      return;
    }

    const compendium = await this._initCompendium(pack);
    if (compendium.index.get(preset.id)) {
      await this.update(preset);
      return;
    }

    const documents = await JournalEntry.createDocuments(
      [
        {
          _id: preset.id,
          name: preset.name,
          pages: preset.pages ?? [],
          folder: preset.folder,
          flags: { 'multi-token-edit': { preset: preset.toJSON() } },
        },
      ],
      {
        pack: pack,
        keepId: true,
      }
    );

    preset.uuid = documents[0].uuid;
    preset.document = documents[0];

    const metaDoc = await this._initMetaDocument(pack);
    const update = {};
    update[preset.id] = {
      id: preset.id,
      img: preset.img,
      documentName: preset.documentName,
    };

    await metaDoc.setFlag('multi-token-edit', 'index', update);
  }

  static async get(uuid, { full = true } = {}) {
    let { collection, documentId, documentType, embedded, doc } = foundry.utils.parseUuid(uuid);
    const index = collection.index.get(documentId);

    if (index) {
      const metaIndex = (await collection.getDocument(META_INDEX_ID))?.getFlag('multi-token-edit', 'index');
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

    // Sort by compendium
    const sorted = {};
    for (const preset of presets) {
      let { collection } = foundry.utils.parseUuid(preset.uuid);
      collection = collection.collection;
      if (!sorted[collection]) sorted[collection] = [preset];
      else sorted[collection].push(preset);
    }

    for (const pack of Object.keys(sorted)) {
      const compendium = await game.packs.get(pack);
      if (!compendium) continue;

      const metaDoc = await this._initMetaDocument(pack);
      const metaUpdate = {};

      for (const preset of sorted[pack]) {
        if (compendium.index.get(preset.id)) {
          const document = await compendium.getDocument(preset.id);
          await document.delete();
        }
        metaUpdate['-=' + preset.id] = null;
      }

      metaDoc.setFlag('multi-token-edit', 'index', metaUpdate);
    }
  }

  static async _initCompendium(pack) {
    let compendium = game.packs.get(pack);
    if (!compendium && pack === DEFAULT_PACK) {
      compendium = await CompendiumCollection.createCompendium({
        label: 'Mass Edit: Presets (MAIN)',
        type: 'JournalEntry',
        ownership: {
          GAMEMASTER: 'NONE',
          PLAYER: 'NONE',
          ASSISTANT: 'NONE',
        },
        packageType: 'world',
      });

      await this._initMetaDocument(DEFAULT_PACK);
    }

    return compendium;
  }

  static async _initMetaDocument(pack) {
    const compendium = game.packs.get(pack);
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
        pack: pack,
        keepId: true,
      }
    );
    return documents[0];
  }

  static _searchPresetTree(tree, options) {
    const presets = [];

    if (!options.folder) this._searchPresetList(tree.allPresets, presets, options);
    tree.allFolders.forEach((folder) => this._searchPresetFolder(folder, presets, options));

    return presets;
  }

  static _searchPresetFolder(folder, presets, options) {
    if (options.folder && folder.name !== options.folder) return;
    this._searchPresetList(folder.presets, presets, options, folder.name);
  }

  static _searchPresetList(toSearch, presets, { name = null, type = null } = {}, folderName) {
    for (const preset of toSearch) {
      preset._folderName = folderName;
      if (name && type) {
        if (name === preset.name && type === preset.documentName) presets.push(preset);
      } else if (name) {
        if (name === preset.name) presets.push(preset);
      } else if (type) {
        if (type === preset.documentName) presets.push(preset);
      } else {
        presets.push(preset);
      }
    }
  }
}

export class PresetAPI {
  /**
   * Retrieve preset
   * @param {object} [options={}]
   * @param {String} [options.uuid]    Preset UUID
   * @param {String} [options.name]    Preset name
   * @param {String} [options.type]    Preset type ("Token", "Tile", etc)
   * @param {String} [options.folder]  Folder name
   * @returns {Preset}
   */
  static async getPreset({ uuid, name, type, folder } = {}) {
    if (uuid) return await PresetCollection.get(uuid);
    else if (!name && !type && !folder) throw Error('UUID, Name, Type, and/or Folder required to retrieve a Preset.');

    const presets = PresetCollection._searchPresetTree(await PresetCollection.getTree(), {
      name,
      type,
      folder,
    });

    const preset = presets[Math.floor(Math.random() * presets.length)];
    return preset?.clone().load();
  }

  /**
   * Retrieve presets
   * @param {object} [options={}]
   * @param {String} [options.uuid]    Preset UUID
   * @param {String} [options.name]    Preset name
   * @param {String} [options.type]    Preset type ("Token", "Tile", etc)
   * @param {String} [options.folder]  Folder name
   * @param {String} [options.format]  The form to return placeables in ('preset', 'name', 'nameAndFolder')
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async getPresets({ uuid, name, type, folder, format = 'preset' } = {}) {
    if (uuid) return await PresetCollection.get(uuid);
    else if (!name && !type && !folder) throw Error('UUID, Name, Type, and/or Folder required to retrieve a Preset.');

    const presets = PresetCollection._searchPresetTree(await PresetCollection.getTree(), {
      name,
      type,
      folder,
    });

    if (format === 'name') return presets.map((p) => p.name);
    else if (format === 'nameAndFolder')
      return presets.map((p) => {
        return { name: p.name, folder: p._folderName };
      });
    return presets;
  }

  /**
   * Create Presets from passed in placeables
   * @param {PlaceableObject|Array[PlaceableObject]} placeables Placeable/s to create the presets from.
   * @param {object} [options={}]                               Optional Preset information
   * @param {String} [options.name]                             Preset name
   * @param {String} [options.img]                              Preset thumbnail image
   * @returns {Preset|Array[Preset]}
   */
  static async createPreset(placeables, options = {}) {
    if (!placeables) return;
    if (!(placeables instanceof Array)) placeables = [placeables];

    // Alike placeables will be made into single presets. Lets batch them up together.

    const groups = {};
    for (const placeable of placeables) {
      const docName = placeable.document.documentName;
      if (!groups.hasOwnProperty(docName)) groups[docName] = [];
      groups[docName].push(placeable);
    }

    const presets = [];
    for (const [docName, placeables] of Object.entries(groups)) {
      const data = [];
      for (const placeable of placeables) {
        data.push(placeableToData(placeable));
      }

      // Preset data before merging with user provided
      const defPreset = {
        name: 'New Preset',
        documentName: docName,
        data: data.length > 1 ? data : data[0],
      };

      switch (defPreset.documentName) {
        case 'Token':
          defPreset.name = data[0].name;
        case 'Tile':
        case 'Note':
          defPreset.img = data[0].texture.src;
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
   * By default the current mouse position is used.
   * @param {object} [options={}]
   * @param {Preset} [options.preset]             Preset
   * @param {String} [options.uuid]               Preset UUID
   * @param {String} [options.name]               Preset name
   * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
   * @param {Number} [options.x]                  Spawn canvas x coordinate (mouse position used if x or y are null)
   * @param {Number} [options.y]                  Spawn canvas y coordinate (mouse position used if x or y are null)
   * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
   * @param {Boolean} [options.layerSwitch]       If 'true' the layer of the spawned preset will be activated.
   * @param {Boolean} [options.coordPicker]       If 'true' a crosshair and preview will be enabled allowing spawn position to be picked
   * @param {String} [options.pickerLabel]          Label displayed above crosshair when `coordPicker` is enabled
   * @param {String} [options.taPreview]            Designates the preview placeable when spawning a `Token Attacher` prefab.
   *                                                Accepted values are "ALL" for all elements and document name optionally followed by an index number
   *                                                 e.g. "ALL", "Tile", "AmbientLight.1"
   * @returns {Array[Document]}
   */
  static async spawnPreset({
    uuid,
    preset,
    name,
    type,
    folder,
    x,
    y,
    coordPicker = false,
    pickerLabel,
    taPreview,
    snapToGrid = true,
    hidden = false,
    layerSwitch = false,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(uuid || preset || name || type || folder)) throw Error('ID, Name, Folder, or Preset is needed to spawn it.');
    if (!coordPicker && ((x == null && y != null) || (x != null && y == null)))
      throw Error('Need both X and Y coordinates to spawn a preset.');

    if (preset) await preset.load();
    preset = preset ?? (await PresetAPI.getPreset({ uuid, name, type, folder }));
    if (!preset) throw Error(`No preset could be found matching: { uuid: "${uuid}", name: "${name}", type: "${type}"}`);

    let dataArray = preset.data instanceof Array ? preset.data : [preset.data];

    let toCreate = [];

    for (let presetData of dataArray) {
      const data = mergePresetDataToDefaultDoc(preset, presetData);
      toCreate.push(flattenObject(data));
    }

    const randomizer = preset.randomize;
    if (!isEmpty(randomizer)) {
      applyRandomization(toCreate, null, randomizer);
    }

    // ==================
    // Determine spawn position
    if (coordPicker) {
      const coords = await new Promise(async (resolve) => {
        Picker.activate(resolve, {
          documentName: preset.documentName,
          snap: snapToGrid,
          previewData: expandObject(toCreate),
          label: pickerLabel,
          taPreview: taPreview,
        });
      });
      if (coords == null) return [];
      x = coords.end.x;
      y = coords.end.y;
    } else if (x == null || y == null) {
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

    // Set positions taking into account relative distances between each object
    let diffX = 0;
    let diffY = 0;

    if (preset.documentName === 'Wall') {
      if (toCreate[0].c) {
        diffX = pos.x - toCreate[0].c[0];
        diffY = pos.y - toCreate[0].c[1];
      } else {
        diffX = pos.x;
        diffY = pos.y;
      }
    } else {
      if (toCreate[0].x && toCreate[0].y) {
        diffX = pos.x - toCreate[0].x;
        diffY = pos.y - toCreate[0].y;
      } else {
        diffX = pos.x;
        diffY = pos.y;
      }
    }

    for (const data of toCreate) {
      if (preset.documentName === 'Wall') {
        if (!data.c) data.c = [pos.x, pos.y, pos.x + canvas.grid.w * 2, pos.y];
        else {
          data.c[0] += diffX;
          data.c[1] += diffY;
          data.c[2] += diffX;
          data.c[3] += diffY;
        }
      } else {
        data.x = data.x != null ? data.x + diffX : diffX;
        data.y = data.y != null ? data.y + diffY : diffY;
      }

      if (hidden || game.keyboard.downKeys.has('AltLeft')) {
        data.hidden = true;
      }
    }
    // ================

    if (layerSwitch) {
      if (game.user.isGM || ['Token', 'MeasuredTemplate', 'Note'].includes(preset.documentName))
        canvas.getLayerByEmbeddedName(preset.documentName)?.activate();
    }

    return await createDocuments(preset.documentName, toCreate, canvas.scene.id);
  }

  static async listPresets() {
    let { allPresets } = await PresetCollection.getTree();
    if (type) allPresets = allPresets.filter((p) => p.documentName === type);
    return allPresets
      .find((p) => p.name.toLowerCase() === name)
      ?.clone()
      .load();
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
      height: 900,
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

    const displayExtCompendiums = game.settings.get('multi-token-edit', 'presetExtComp');

    this.tree = await PresetCollection.getTree(this.docName, !displayExtCompendiums);
    data.presets = this.tree.presets;
    data.folders = this.tree.folders;
    data.staticFolders = this.tree.staticFolders.length ? this.tree.staticFolders : null;

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = SUPPORTED_PLACEABLES.includes(this.docName);
    data.allowDocumentSwap = UI_DOCS.includes(this.docName) && !this.configApp;
    data.docLockActive = game.settings.get('multi-token-edit', 'presetDocLock') === this.docName;
    data.layerSwitchActive = game.settings.get('multi-token-edit', 'presetLayerSwitch');
    data.extCompActive = displayExtCompendiums;
    data.sortMode = SORT_MODES[game.settings.get('multi-token-edit', 'presetSortMode')];
    data.displayDragDropMessage = data.allowDocumentSwap && !(this.tree.presets.length || this.tree.folders.length);

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

    const hoverOverlay = html.closest('.window-content').find('.overlay');
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

    // =====================
    // Preset multi-select & drag Listeners
    const itemList = html.find('.item-list');

    // Multi-select
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

    // const form = html.closest('.mass-edit-preset-form');

    // form.on('dragover', (event) => {
    //   console.log('FORM DRAGOVER', event);
    // });

    // form.on('drop', (event) => {
    //   const data = TextEditor.getDragEventData(event.originalEvent);
    //   if (data.type === 'Actor') {
    //     console.log(data.uuid);
    //   }
    // });

    html.find('.toggle-sort').on('click', this._onToggleSort.bind(this));
    html.find('.toggle-doc-lock').on('click', this._onToggleLock.bind(this));
    html.find('.toggle-ext-comp').on('click', this._onToggleExtComp.bind(this));
    html.find('.toggle-layer-switch').on('click', this._onToggleLayerSwitch.bind(this));
    html.find('.document-select').on('click', this._onDocumentChange.bind(this));
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
    if (html.find('.item').length)
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
        name: 'Open Journal',
        icon: '<i class="fas fa-book-open"></i>',
        callback: (item) => this._onOpenJournal(item),
      },
      {
        name: 'Copy',
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => !item.hasClass('editable'),
        callback: (item) => this._onCopySelectedPresets(),
      },
      {
        name: 'Duplicate',
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => item.hasClass('editable'),
        callback: (item) => this._onCopySelectedPresets(null, { keepFolder: true, keepId: false }),
      },
      {
        name: 'Export as JSON',
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        callback: (item) => this._onExportSelectedPresets(),
      },
      {
        name: 'Export to Compendium',
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        callback: (item) => this._onExportSelectedPresetsToComp(),
      },
      {
        name: 'Delete',
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
        name: 'Copy',
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (header) => !header.closest('.folder').hasClass('editable'),
        callback: (header) => this._onCopyFolder(header.closest('.folder').data('uuid')),
      },
      {
        name: 'Delete',
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (header) => header.closest('.folder').hasClass('editable'),
        callback: (header) => this._onFolderDelete(header.closest('.folder').data('uuid')),
      },
    ];
  }

  async _onExportFolder(uuid) {
    let pack = await new Promise((resolve) => getCompendiumDialog(resolve, { exportTo: true }));
    if (pack) this._onCopyFolder(uuid, null, pack);
  }

  async _onCopyFolder(uuid, parentId = null, pack, render = true) {
    if (!pack) pack = PresetCollection.workingPack;

    const folder = this.tree.allFolders.get(uuid);
    const folderDoc = await fromUuid(uuid);

    if (folder) {
      let types;
      if (folderDoc) types = folderDoc.flags['multi-token-edit']?.types ?? ['ALL'];
      else types = ['ALL'];

      const data = {
        name: folder.name,
        color: folder.color,
        sorting: folder.sorting,
        folder: parentId,
        flags: { 'multi-token-edit': { types } },
        type: 'JournalEntry',
      };

      const nFolder = await Folder.create(data, { pack });

      for (const preset of folder.presets) {
        const p = await preset.load();
        p.folder = nFolder.id;
        await PresetCollection.set(p, pack);
      }

      for (const child of folder.children) {
        await this._onCopyFolder(child.uuid, nFolder.id, pack, false);
      }

      if (render) this.render(true);
    }
  }

  async _onExportSelectedPresetsToComp() {
    let pack = await new Promise((resolve) => getCompendiumDialog(resolve, { exportTo: true }));
    if (pack) this._onCopySelectedPresets(pack);
  }

  async _onCopySelectedPresets(pack, { keepFolder = false, keepId = true } = {}) {
    const [selected, _] = await this._getSelectedPresets();
    for (const preset of selected) {
      const p = preset.clone();
      if (!keepFolder) p.folder = null;
      if (!keepId) p.id = randomID();
      await PresetCollection.set(p, pack);
    }
    if (selected.length) this.render(true);
  }

  async _getSelectedPresets({ editableOnly = false } = {}) {
    const uuids = [];
    const items = $(this.form)
      .find('.item-list')
      .find('.item.selected' + (editableOnly ? '.editable' : ''));
    items.each(function () {
      const uuid = $(this).data('uuid');
      uuids.push(uuid);
    });

    const selected = [];
    for (const uuid of uuids) {
      const preset = await PresetCollection.get(uuid);
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
    const [selected, items] = await this._getSelectedPresets({ editableOnly: true });
    if (selected.length) {
      await PresetCollection.delete(selected);
      items.remove();
    }
  }

  async _onOpenJournal(item) {
    const [selected, _] = await this._getSelectedPresets({ editableOnly: false });
    selected.forEach((p) => p.openJournal());
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
        flags: { 'multi-token-edit': { types } },
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

  async _onFolderDelete(uuid, render = true) {
    const folder = this.tree.allFolders.get(uuid);
    if (folder) {
      await PresetCollection.delete(folder.presets);
      for (const c of folder.children) {
        await this._onFolderDelete(c.uuid, false);
      }

      const folderDoc = await fromUuid(uuid);
      await folderDoc.delete();

      if (render) this.render(true);
    }
  }

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
      await Folder.updateDocuments(updates, { pack: PresetCollection.workingPack });
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

  async _onToggleExtComp(event) {
    const switchControl = $(event.target).closest('.toggle-ext-comp');

    const value = !game.settings.get('multi-token-edit', 'presetExtComp');
    if (value) switchControl.addClass('active');
    else switchControl.removeClass('active');

    await game.settings.set('multi-token-edit', 'presetExtComp', value);
    this.render(true);
  }

  _onDocumentChange(event) {
    const newDocName = $(event.target).closest('.document-select').data('name');
    if (newDocName != this.docName) {
      this.docName = newDocName;

      if (this.docName !== 'ALL') {
        if (game.settings.get('multi-token-edit', 'presetLayerSwitch'))
          canvas.getLayerByEmbeddedName(this.docName === 'Actor' ? 'Token' : this.docName)?.activate();
      }

      this.render(true);
    }
  }

  async _onRightClickPreset(event) {
    const item = $(event.target).closest('.item');

    // If right-clicked item is not selected, de-select the others and select it
    if (!item.hasClass('selected')) {
      item.closest('.item-list').find('.item.selected').removeClass('selected').removeClass('last-selected');
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
      canvas.getLayerByEmbeddedName(preset.documentName === 'Actor' ? 'Token' : preset.documentName)?.activate();

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
    const uuid = $(event.target).closest('.item').data('uuid');
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
          if (Brush.activate({ preset, deactivateCallback: this._onPresetBrushDeactivate.bind(this) })) {
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

  async _onPresetUpdate(event) {
    const preset = await PresetCollection.get($(event.target).closest('.item').data('uuid'));
    if (!preset) return;

    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
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

    preset.update({ data: selectedFields, randomize, addSubtract });

    ui.notifications.info(`Preset "${preset.name}" updated`);

    this.render(true);
  }

  async _onPresetCreate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
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
    if (!(placeables instanceof Array)) placeables = [placeables];
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
    let pack = await new Promise((resolve) =>
      getCompendiumDialog(resolve, { preselectPack: PresetCollection.workingPack })
    );
    if (pack && pack !== PresetCollection.workingPack) {
      await game.settings.set('multi-token-edit', 'workingPack', pack);
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

    if (getType(json) === 'Array') {
      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || isEmpty(p.data)) continue;

        const preset = new Preset(p);
        preset._pages = p.pages;

        await PresetCollection.set(preset);
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

  presets = presets.map((p) => {
    const preset = p.clone();
    preset.folder = null;
    preset.uuid = null;
    return preset;
  });

  saveDataToFile(JSON.stringify(presets, null, 2), 'text/json', (fileName ?? 'mass-edit-presets') + '.json');
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
    console.log(presets);
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

    // Check if all presets are for the same document type and thus can be edited using a Mass Edit form
    const docName = this.presets[0].documentName;
    if (docName !== 'Actor' && this.presets.every((p) => p.documentName === docName)) {
      data.documentEdit = docName;
    }

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

    html.find('.edit-document').on('click', this._onEditDocument.bind(this));
    html.find('.assign-document').on('click', this._onAssignDocument.bind(this));

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

  async _onAssignDocument() {
    const layer = canvas.getLayerByEmbeddedName(this.presets[0].documentName);
    if (!layer) return;

    const data = layer.controlled.map((p) => placeableToData(p));
    if (data.length) {
      this.data = data;
      ui.notifications.info(`Assigned ${data.length} ${this.presets[0].documentName}s to preset.`);
    }
  }

  async _onEditDocument() {
    const documents = [];
    const cls = CONFIG[this.presets[0].documentName].documentClass;

    for (const p of this.presets) {
      let data = p.data instanceof Array ? p.data : [p.data];
      data.forEach((d) => documents.push(new cls(mergePresetDataToDefaultDoc(p, d))));
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
      },
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

    if (this.isCreate) {
      for (const preset of this.presets) {
        const update = {
          name: formData.name || preset.name || 'New Preset',
          img: formData.img ?? preset.img,
        };
        if (this.data) update.data = this.data;
        if (this.addSubtract) update.addSubtract = this.addSubtract;
        if (this.randomize) update.randomize = this.randomize;

        await preset.update(update);
      }
    } else {
      for (const preset of this.presets) {
        const update = {
          name: formData.name || preset.name,
          img: formData.img || preset.img,
        };
        if (this.data) update.data = this.data;
        if (this.addSubtract) update.addSubtract = this.addSubtract;
        if (this.randomize) update.randomize = this.randomize;

        await preset.update(update);
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
    UI_DOCS.forEach((type) => {
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

function getCompendiumDialog(resolve, { exportTo = false, preselectPack = '' } = {}) {
  let config;
  if (exportTo) {
    config = {
      title: 'Select Export Target',
      message:
        'This operation will make the destination into a Mass Edit preset compendium. Make sure it does not contain Journals that are not presets to avoid unexpected problems.',
      buttonLabel: 'Export',
    };
  } else {
    config = {
      title: 'Select New Working Compendium',
      message:
        'Change the compendium the module will store and edit presets within. Make sure it does not contains Journals that are not presets to avoid unexpected problems.',
      buttonLabel: 'Change',
    };
  }

  let options = '';
  for (const p of game.packs) {
    if (!p.locked && p.documentName === 'JournalEntry') {
      options += `<option value="${p.collection}" ${preselectPack === p.collection ? 'selected="selected"' : ''}>${
        p.title
      }</option>`;
    }
  }

  let content = `
  <p style="color: orangered;">${config.message}</p>
  <div class="form-group">
    <label>Compendium</label>
    <div class="form-fields">
      <select style="width: 100%; margin-bottom: 10px;">${options}</select>
    </div>
  </div>`;

  new Dialog({
    title: config.title,
    content: content,
    buttons: {
      export: {
        label: config.buttonLabel,
        callback: (html) => resolve($(html).find('select').val()),
      },
      cancel: {
        label: 'Cancel',
        callback: () => resolve(null),
      },
    },
    close: () => resolve(null),
    default: 'cancel',
  }).render(true);
}

function mergePresetDataToDefaultDoc(preset, presetData) {
  let data;
  presetData = flattenObject(presetData);

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
    case 'Drawing':
      data = { 'shape.width': canvas.grid.w * 2, 'shape.height': canvas.grid.h * 2 };
      break;
    case 'MeasuredTemplate':
      data = { distance: 10 };
      break;
    case 'AmbientLight':
      if (!('config.dim' in presetData) && !('config.bright' in presetData)) {
        data = { 'config.dim': 20, 'config.bright': 10 };
        break;
      }
    default:
      data = {};
  }

  return mergeObject(data, presetData);
}

function placeableToData(placeable) {
  const data = placeable.document.toCompendium();

  // Check if `Token Attacher` has attached elements to this token
  if (placeable.document.documentName === 'Token' && tokenAttacher?.generatePrototypeAttached) {
    const attached = data.flags?.['token-attacher']?.attached || {};
    if (!isEmpty(attached)) {
      const prototypeAttached = tokenAttacher.generatePrototypeAttached(data, attached);
      setProperty(data, 'flags.token-attacher.attached', null);
      setProperty(data, 'flags.token-attacher.prototypeAttached', prototypeAttached);
      setProperty(data, 'flags.token-attacher.grid', {
        size: canvas.grid.size,
        w: canvas.grid.w,
        h: canvas.grid.h,
      });
    }
  }

  return data;
}
