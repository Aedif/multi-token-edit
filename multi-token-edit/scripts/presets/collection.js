import { Brush } from '../brush.js';
import { MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { SeededRandom, applyPresetToScene, localize } from '../utils.js';
import { FileIndexer } from './fileIndexer.js';
import { PresetBrowser } from './browser/browserApp.js';
import { Preset, VirtualFilePreset } from './preset.js';
import { Spawner } from './spawner.js';
import { FolderState, decodeURIComponentSafely, placeableToData } from './utils.js';

const DEFAULT_PACK = 'world.mass-edit-presets-main';
export const META_INDEX_ID = 'MassEditMetaData';
export const META_INDEX_FIELDS = ['id', 'img', 'documentName', 'tags'];

export class PresetCollection {
  static presets;

  static workingPack;

  static async getTree(type, { externalCompendiums = true, virtualDirectory = true, setFormVisibility = false } = {}) {
    if (CONFIG.debug.MassEdit) console.time('getTree');

    let pack;
    let mainTree;
    try {
      pack = await this._initCompendium(this.workingPack);
      if (!pack) throw Error('Unable to retrieve working compendium.');
      mainTree = await PresetTree.init(pack, type, { forceLoad: true, setFormVisibility });
    } catch (e) {
      // Fail-safe. Return back to DEFAULT_PACK
      console.log(e);
      console.log(`FAILED TO LOAD WORKING COMPENDIUM {${this.workingPack}}`);
      console.log('RETURNING TO DEFAULT');
      await game.settings.set(MODULE_ID, 'workingPack', DEFAULT_PACK);
      this.workingPack = DEFAULT_PACK;
      pack = await this._initCompendium(this.workingPack);
      mainTree = await PresetTree.init(pack, type, { forceLoad: true, setFormVisibility });
    }

    const extFolders = [];

    if (externalCompendiums) {
      for (const p of game.packs) {
        if (p.collection !== this.workingPack && p.index.get(META_INDEX_ID)) {
          const tree = await PresetTree.init(p, type, { setFormVisibility });
          if (setFormVisibility && !tree.hasVisible) continue;

          const topFolder = new PresetPackFolder({ pack: p, tree });
          extFolders.push(topFolder);

          // Collate all folders with the main tree
          mainTree.allFolders.set(topFolder.uuid, topFolder);
          for (const [uuid, folder] of tree.allFolders) {
            mainTree.allFolders.set(uuid, folder);
          }
        }
      }
    }

    // Read File Index
    if (virtualDirectory) {
      const vTree = await FileIndexer.getVirtualDirectoryTree(type, { setFormVisibility });
      if (vTree?.hasVisible || !setFormVisibility) {
        const topFolder = new VirtualFileFolder({
          name: 'VIRTUAL DIRECTORY',
          children: vTree.folders,
          uuid: 'virtual_directory',
          color: '#1c5fa385',
        });
        extFolders.push(topFolder);

        // Collate all folders with the main tree
        mainTree.allFolders.set(topFolder.uuid, topFolder);
        for (const [uuid, folder] of vTree.allFolders) {
          mainTree.allFolders.set(uuid, folder);
        }
      }
    }

    mainTree.extFolders = this._groupExtFolders(extFolders, mainTree.allFolders);

    if (CONFIG.debug.MassEdit) console.timeEnd('getTree');
    return mainTree;
  }

  static _groupExtFolders(folders, allFolders) {
    folders = folders.sort((f1, f2) => f1.name.localeCompare(f2.name));

    const groups = {};
    const groupless = [];
    folders.forEach((f) => {
      if (f.group) {
        if (!(f.group in groups)) groups[f.group] = [];
        groups[f.group].push(f);
      } else {
        groupless.push(f);
      }
    });

    const newExtFolders = [];
    for (const [group, folders] of Object.entries(groups)) {
      const id = SeededRandom.randomID(group); // For export operation a real ID is needed. Lets keep it consistent by seeding
      const uuid = 'virtual@' + group; // faux uuid

      const groupFolder = new PresetVirtualFolder({
        id,
        uuid,
        name: group,
        children: folders,
        draggable: false,
      });

      allFolders.set(uuid, groupFolder);
      newExtFolders.push(groupFolder);
    }

    return newExtFolders.concat(groupless).sort((f1, f2) => f1.name.localeCompare(f2.name));
  }

  // Fixing meta index by removing loose indexes
  // 06/03/2024
  static async _cleanIndex(pack, metaDoc, metaIndex) {
    if (pack.locked || !metaDoc || foundry.utils.isEmpty(metaIndex)) return;
    const index = pack.index;

    const update = {};
    for (const idx of Object.keys(metaIndex)) {
      if (!index.has(idx)) update['-=' + idx] = null;
    }

    if (!foundry.utils.isEmpty(update)) {
      if (CONFIG.debug.MassEdit) console.log('Mass Edit - Index Cleanup', update);
      metaDoc.setFlag(MODULE_ID, 'index', update);
      delete PresetTree._packTrees[pack.metadata.name];
    }
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

    let metaIndex = (await pack.getDocument(META_INDEX_ID))?.getFlag(MODULE_ID, 'index');

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
      flags: { [MODULE_ID]: { preset: preset.toJSON() } },
    };
    const pages = preset.pages;
    if (pages) updateDoc.pages = pages;
    await doc.update(updateDoc);

    const metaDoc = await this._initMetaDocument(this.workingPack);
    const update = {};
    META_INDEX_FIELDS.forEach((f) => {
      update[f] = preset[f];
    });

    await metaDoc.setFlag(MODULE_ID, 'index', { [preset.id]: update });
    delete PresetTree._packTrees[compendium.metadata.name];
  }

  /**
   * Update multiple presets at the same time
   * @param {*} updates
   */
  static async updatePresets(updates, pack = this.workingPack) {
    // TODO update meta and preset itself
    await JournalEntry.updateDocuments(updates, { pack });
  }

  /**
   * Create presets within a pack
   * @param {Preset|Array[Preset]} presets
   * @param {String} pack
   */
  static async set(presets, pack) {
    if (!presets) throw new Error('Attempting to set invalid Preset/s', presets);
    if (!pack) pack = this.workingPack;
    if (!(presets instanceof Array)) presets = [presets];

    const compendium = await this._initCompendium(pack);

    const toCreatePresets = [];

    for (const preset of presets) {
      if (compendium.index.get(preset.id)) {
        await this.update(preset);
      } else toCreatePresets.push(preset);
    }

    if (!toCreatePresets.length) return;

    const data = toCreatePresets.map((preset) => {
      return {
        _id: preset.id,
        name: preset.name,
        pages: preset.pages ?? [],
        folder: preset.folder,
        flags: { [MODULE_ID]: { preset: preset.toJSON() } },
      };
    });

    const documents = await JournalEntry.createDocuments(data, {
      pack: pack,
      keepId: true,
    });

    for (const preset of toCreatePresets) {
      const document = documents.find((d) => d.id === preset.id);
      preset.uuid = document.uuid;
      await preset.load(false, document);
    }

    const metaDoc = await this._initMetaDocument(pack);
    const update = {};

    for (const preset of toCreatePresets) {
      const metaFields = {};
      META_INDEX_FIELDS.forEach((f) => {
        metaFields[f] = preset[f];
      });
      update[preset.id] = metaFields;
    }

    await metaDoc.setFlag(MODULE_ID, 'index', update);
    delete PresetTree._packTrees[pack];
  }

  static async get(uuid, { full = true } = {}) {
    if (uuid.startsWith('virtual@')) return this._constructVirtualFilePreset(uuid, { full });

    let { collection, documentId, documentType, embedded, doc } = foundry.utils.parseUuid(uuid);
    const index = collection.index.get(documentId);

    if (index) {
      const metaIndex = (await collection.getDocument(META_INDEX_ID))?.getFlag(MODULE_ID, 'index');
      const mIndex = metaIndex[index._id];

      const preset = new Preset({ ...index, ...mIndex, pack: collection.collection });
      if (full) await preset.load();
      return preset;
    }
    return null;
  }

  static async getBatch(uuids, { full = true }) {
    const presets = [];

    for (const uuid of uuids) {
      if (uuid.startsWith('virtual@')) presets.push(await this._constructVirtualFilePreset(uuid, { full: false }));
      else {
        let { collection, documentId } = foundry.utils.parseUuid(uuid);
        const index = collection.index.get(documentId);

        if (index) {
          const metaIndex = (await collection.getDocument(META_INDEX_ID))?.getFlag(MODULE_ID, 'index');
          const mIndex = metaIndex[index._id];
          const preset = new Preset({ ...index, ...mIndex });
          preset.pack = collection.collection;

          presets.push(preset);
        }
      }
    }

    if (full) {
      return this.batchLoadPresets(presets);
    }

    return presets;
  }

  /**
   * Batch load preset documents using pack.getDocuments({ _id__in: ids }) query.
   * @param {Array[Preset]} presets
   * @returns
   */
  static async batchLoadPresets(presets) {
    const collectionToPreset = new Map();

    for (const preset of presets) {
      if (preset.virtual) await preset.load();
      else {
        let { collection } = foundry.utils.parseUuid(preset.uuid);
        if (collectionToPreset.get(collection)) collectionToPreset.get(collection).push(preset);
        else collectionToPreset.set(collection, [preset]);
      }
    }

    for (const [collection, presets] of collectionToPreset) {
      const ids = presets.map((p) => p.id);
      const documents = await collection.getDocuments({ _id__in: ids });

      for (const preset of presets) {
        const d = documents.find((d) => d.id === preset.id);
        if (d) await preset.load(false, d);
      }
    }

    return presets;
  }

  static async _constructVirtualFilePreset(uuid, { full = true } = {}) {
    const src = uuid.substring(8);
    const preset = new VirtualFilePreset({ src });
    if (full) await preset.load();
    return preset;
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
      if (!collection) continue;
      collection = collection.collection;
      if (!sorted[collection]) sorted[collection] = [preset];
      else sorted[collection].push(preset);
    }

    for (const pack of Object.keys(sorted)) {
      const compendium = await game.packs.get(pack);
      if (!compendium) continue;

      const metaDoc = await this._initMetaDocument(pack);
      const metaUpdate = {};

      const deleteIds = [];
      for (const preset of sorted[pack]) {
        deleteIds.push(preset.id);
        metaUpdate['-=' + preset.id] = null;
      }

      const opts = { pack };
      opts.ids = deleteIds; // v12 fix
      await JournalEntry.deleteDocuments(deleteIds, opts);
      await metaDoc.setFlag(MODULE_ID, 'index', metaUpdate);
      delete PresetTree._packTrees[compendium.metadata.name];
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

      await this._initMetaDocument(pack);
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
          flags: { [MODULE_ID]: { index: {} } },
        },
      ],
      {
        pack: pack,
        keepId: true,
      }
    );
    return documents[0];
  }

  static async deleteFolder(uuid, deleteAll = false) {
    const folderDoc = await fromUuid(uuid);
    if (folderDoc.compendium.locked) return;

    if (deleteAll) {
      const metaDoc = folderDoc.compendium.get(META_INDEX_ID);
      if (!metaDoc) return;

      const metaUpdate = {};
      const traverseFolder = function (folder) {
        folder.contents.forEach((j) => (metaUpdate['-=' + j._id] = null));
        folder.children.forEach((c) => traverseFolder(c.folder));
      };
      traverseFolder(folderDoc);

      metaDoc.setFlag(MODULE_ID, 'index', metaUpdate);
    }

    delete PresetTree._packTrees[folderDoc.compendium.metadata.name];
    return await folderDoc.delete({ deleteSubfolders: deleteAll, deleteContents: deleteAll });
  }

  static _searchPresetTree(tree, options) {
    const presets = [];

    // Make sure terms are provided in lowercase
    if (options.terms) options.terms = options.terms.map((t) => t.toLowerCase());

    if (!options.folder) this._searchPresetList(tree.allPresets, presets, options);
    tree.allFolders.forEach((folder) => this._searchPresetFolder(folder, presets, options));

    return presets;
  }

  static _searchPresetFolder(folder, presets, options) {
    if (options.folder && folder.name !== options.folder) return;
    this._searchPresetList(folder.presets, presets, options, folder.name);
  }

  static _searchPresetList(toSearch, presets, { name, type, tags, terms } = {}) {
    for (const preset of toSearch) {
      let match = true;
      if (name && name !== preset.name) match = false;
      if (type && type !== preset.documentName) match = false;
      if (terms && !terms.every((t) => preset.name.toLowerCase().includes(t))) match = false;
      if (match && tags) {
        if (tags.matchAny) match = tags.tags.some((t) => preset.tags.includes(t));
        else match = tags.tags.every((t) => preset.tags.includes(t));
      }

      if (match) presets.push(preset);
    }
  }
  /**
   * Build preset index for 'Spotlight Omnisearch' module
   * @param {Array[CONFIG.SpotlightOmnisearch.SearchTerm]} soIndex
   */
  static async buildSpotlightOmnisearchIndex(soIndex) {
    const tree = await PresetCollection.getTree(null, { externalCompendiums: true });

    const SearchTerm = CONFIG.SpotlightOmnisearch.SearchTerm;

    const onClick = async function () {
      if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
        ui.spotlightOmnisearch?.setDraggingState(true);
        await Spawner.spawnPreset({
          preset: this.data,
          preview: true,
          scaleToGrid: PresetBrowser.CONFIG.autoScale,
        });
        ui.spotlightOmnisearch?.setDraggingState(false);
      }
    };

    const onDragEnd = function (event) {
      if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
        const { x, y } = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
        Spawner.spawnPreset({
          preset: this.data,
          x,
          y,
          scaleToGrid: PresetBrowser.CONFIG.autoScale,
        });
      } else if (this.data.documentName === 'Scene') {
        applyPresetToScene(this.data);
      }
    };

    const deactivateCallback = function () {
      ui.spotlightOmnisearch?.setDraggingState(false);
    };

    const getActions = function () {
      const actions = [
        {
          name: 'MassEdit.presets.open-journal',
          icon: '<i class="fas fa-book-open fa-fw"></i>',
          callback: () => {
            this.data.openJournal();
          },
        },
      ];
      if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
        actions.push({
          name: `MassEdit.presets.controls.activate-brush`,
          icon: '<i class="fas fa-paint-brush"></i>',
          callback: async () => {
            canvas.getLayerByEmbeddedName(this.data.documentName)?.activate();
            if (Brush.activate({ preset: await this.data.load(), deactivateCallback })) {
              ui.spotlightOmnisearch.setDraggingState(true);
            }
          },
        });
      }
      return actions;
    };

    const buildTerm = function (preset) {
      soIndex.push(
        new SearchTerm({
          name: preset.name,
          description: 'Mass Edit: Preset',
          type: preset.documentName + ' preset',
          img: preset.img,
          icon: ['fa-solid fa-books', preset.icon],
          keywords: preset.tags,
          onClick,
          onDragEnd,
          data: preset,
          actions: getActions,
        })
      );
    };

    tree.presets.forEach(buildTerm);
    tree.allFolders.forEach((f) => f.presets.forEach(buildTerm));
  }
}

export class PresetAPI {
  static name = 'PresetAPI';

  /**
   * Retrieve preset
   * @param {object} [options={}]
   * @param {String} [options.uuid]                      Preset UUID
   * @param {String} [options.name]                      Preset name
   * @param {String} [options.type]                      Preset type ("Token", "Tile", etc)
   * @param {Array[String]} [options.terms]              A list of terms to be matched against the preset name
   * @param {String|Array[String]|Object} [options.tags] Tags to match a preset against. Can be provided as an object containing 'tags' array and 'matchAny' flag.
   *                                                     Comma separated string, or a list of strings. In the latter 2 cases 'matchAny' is assumed true
   * @param {String} [options.folder]                    Folder name
   * @param {Boolean} [options.random]                   If multiple presets are found a random one will be chosen
   * @returns {Preset}
   */
  static async getPreset({
    uuid,
    name,
    type,
    terms,
    folder,
    tags,
    random = false,
    virtualDirectory = true,
    full = true,
  } = {}) {
    if (uuid) return await PresetCollection.get(uuid, { full });
    else if (!name && !type && !folder && !tags && !terms)
      throw Error('UUID, Name, Type, and/or Folder required to retrieve a Preset.');

    if (tags) {
      if (Array.isArray(tags)) tags = { tags, matchAny: true };
      else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny: true };
    }

    const presets = PresetCollection._searchPresetTree(
      await PresetCollection.getTree(type, { externalCompendiums: true, virtualDirectory }),
      {
        name,
        type,
        terms,
        folder,
        tags,
      }
    );

    let preset = random ? presets[Math.floor(Math.random() * presets.length)] : presets[0];
    if (preset) {
      preset = preset.clone();
      if (full) await preset.load();
    }
    return preset;
  }

  /**
   * Retrieve presets
   * @param {object} [options={}]
   * @param {String|Array[String]} [options.uuid]        Preset UUID/s
   * @param {String} [options.name]                      Preset name
   * @param {String} [options.type]                      Preset type ("Token", "Tile", etc)
   * @param {Array[String]} [options.terms]              A list of terms to be matched against the preset name
   * @param {String} [options.folder]                    Folder name
   * @param {String|Array[String]|Object} [options.tags] See PresetAPI.getPreset
   * @param {String} [options.format]                    The form to return placeables in ('preset', 'name', 'nameAndFolder')
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async getPresets({
    uuid,
    name,
    type,
    terms,
    folder,
    format = 'preset',
    tags,
    virtualDirectory = true,
    full = true,
  } = {}) {
    let presets;
    if (uuid) {
      presets = [];
      const uuids = Array.isArray(uuid) ? uuid : [uuid];
      presets = await PresetCollection.getBatch(uuids, { full });
    } else if (!name && !type && !folder && !tags && !terms) {
      throw Error('UUID, Name, Type, Folder and/or Tags required to retrieve a Preset.');
    } else {
      if (tags) {
        if (Array.isArray(tags)) tags = { tags, matchAny: true };
        else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny: true };
      }

      presets = PresetCollection._searchPresetTree(
        await PresetCollection.getTree(type, { externalCompendiums: true, virtualDirectory }),
        {
          name,
          type,
          terms,
          folder,
          tags,
        }
      );
    }

    if (format === 'name') return presets.map((p) => p.name);
    else if (format === 'nameAndFolder')
      return presets.map((p) => {
        return { name: p.name, folder: p._folderName };
      });
    return presets;
  }

  /**
   * Create a Token preset from the provided Actor
   */
  static async createPresetFromActor(actor, { keepId = false, folder } = {}) {
    if (!actor || actor.documentName !== 'Actor') return;

    const presetData = {
      id: keepId ? actor.id : null,
      name: actor.name,
      documentName: 'Token',
      img: actor.img,
      data: [actor.prototypeToken.toJSON()],
      folder: folder,
    };

    presetData.gridSize = canvas.scene.grid.size;

    const preset = new Preset(presetData);
    return preset;
  }

  static async createPresetFromActorUuid(uuid, options = {}) {
    const actor = await fromUuid(uuid);
    if (!actor.documentName === 'Actor') return;

    return await this.createPresetFromActor(actor, options);
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
      const documentName = placeable.document.documentName;
      if (!groups.hasOwnProperty(documentName)) groups[documentName] = [];
      groups[documentName].push(placeable);
    }

    const presets = [];
    for (const [documentName, placeables] of Object.entries(groups)) {
      const data = [];
      for (const placeable of placeables) {
        data.push(placeableToData(placeable));
      }

      // Preset data before merging with user provided
      const defPreset = {
        name: localize('presets.default-name'),
        documentName,
        data: data,
      };

      // Assign preset image
      switch (defPreset.documentName) {
        case 'Token':
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

      //  Assign preset name
      switch (defPreset.documentName) {
        case 'Token':
          defPreset.name = data[0].name;
          break;
        default:
          const taggerTag = data[0].flags?.tagger?.tags?.[0];
          if (taggerTag) defPreset.name = taggerTag;
          break;
      }

      defPreset.gridSize = placeables[0].document.parent.grid.size;

      foundry.utils.mergeObject(defPreset, options, { inplace: true });

      const preset = new Preset(defPreset);
      await PresetCollection.set(preset);
      presets.push(preset);
    }

    return presets;
  }
}

export class PresetFolder {
  static isEditable(uuid) {
    const { collection } = foundry.utils.parseUuid(uuid);
    return collection && !collection.locked;
  }

  constructor({
    id,
    uuid,
    name,
    sorting = 'm',
    color = '#000000',
    sort = 0,
    children = [],
    presets = [],
    draggable = true,
    folder = null,
    visible = true,
    render = true,
    types = [],
  } = {}) {
    this.id = id;
    this.uuid = uuid;
    this.name = name;
    this.sorting = sorting;
    this.color = color;
    this.sort = sort;
    this.children = children;
    this.children.forEach((c) => {
      c.folder = this.id;
    });
    this.presets = presets;
    this.draggable = draggable;
    this.folder = folder;
    this.visible = visible;
    this.render = render;
    this.expanded = FolderState.expanded(this.uuid);
    this.types = types;
  }

  async update(data) {
    const doc = await fromUuid(this.uuid);
    if (doc) {
      foundry.utils.mergeObject(this, data);
      await doc.update(data);
    }
  }
}

export class PresetVirtualFolder extends PresetFolder {
  constructor(options) {
    super(options);
    this.virtual = true;
    this.draggable = false;
  }

  async update(data) {}
}

export class VirtualFileFolder extends PresetVirtualFolder {
  constructor(options) {
    super(options);
    this.id = foundry.utils.randomID();
    if (!options.types) this.types = ['ALL'];
    this.bucket = options.bucket;
    this.source = options.source;
    this.name = decodeURIComponentSafely(this.name);
    this.icon = options.icon;
    this.subtext = options.subtext;
    if (options.source && ['data', 'forgevtt'].includes(options.source)) this.indexable = true;
  }
}

export class PresetPackFolder extends PresetVirtualFolder {
  constructor(options) {
    const tree = options.tree;
    const pack = options.pack;
    const packFolderData = tree.metaDoc.getFlag(MODULE_ID, 'folder') ?? {};
    const uuid = pack.collection;
    super({
      uuid,
      id: SeededRandom.randomID(uuid),
      name: packFolderData.name ?? pack.title,
      children: tree.folders,
      presets: tree.presets,
      draggable: false,
      color: packFolderData.color ?? '#000000',
    });
    this.group = packFolderData.group;
  }

  get pack() {
    return this.uuid;
  }

  async update(data = {}) {
    const pack = game.packs.get(this.pack);
    if (pack.locked) return;
    if (data.hasOwnProperty('name') && data.name === pack.title) delete data.name;
    if (foundry.utils.isEmpty(data)) return;

    const metaDoc = await PresetCollection._initMetaDocument(this.pack);
    await metaDoc.setFlag(MODULE_ID, 'folder', data);

    foundry.utils.mergeObject(this, data);
  }
}

export class PresetTree {
  static _packTrees = {};

  static async init(pack, type, { forceLoad = false, setFormVisibility = false } = {}) {
    if (!pack) return null;

    if (CONFIG.debug.MassEdit) console.time(pack.title);

    // Re-use tree if already parsed
    if (!forceLoad && PresetTree._packTrees[pack.metadata.name]) {
      const tree = PresetTree._packTrees[pack.metadata.name];
      if (setFormVisibility) tree.setVisibility(type);
      if (CONFIG.debug.MassEdit) console.timeEnd(pack.title);
      return tree;
    }

    // Setup folders ready for parent/children processing
    const folders = new Map();
    const topLevelFolders = new Map();
    const folderContents = pack.folders.contents;
    for (const f of folderContents) {
      const folder = new PresetFolder({
        id: f._id,
        uuid: f.uuid,
        name: f.name,
        sorting: f.sorting,
        color: f.color,
        sort: f.sort,
        draggable: f.pack === PresetCollection.workingPack,
        folder: f.folder?.uuid,
        types: f.flags[MODULE_ID]?.types || ['ALL'],
      });

      folders.set(folder.uuid, folder);
      topLevelFolders.set(f.uuid, folder);
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
    const metaDoc = await pack.getDocument(META_INDEX_ID);
    let metaIndex = metaDoc?.getFlag(MODULE_ID, 'index');

    const index = pack.index.contents;

    // TEMP - 06/03/2024
    // Due to poor implementation of Folder+Folder Content delete, there are likely to be some indexes which were not removed
    // Lets clean them up here for now
    PresetCollection._cleanIndex(pack, metaDoc, metaIndex);
    // Remove after sufficient enough time has passed to have reasonable confidence that All/Most users have executed this ^

    for (const idx of index) {
      if (idx._id === META_INDEX_ID) continue;
      const mIndex = metaIndex[idx._id];
      const preset = new Preset({ ...idx, ...mIndex, pack: pack.collection });

      // If no document name is available (missing metadata) attempt to load the preset to retrieve it
      // If still no name is found, skip it
      if (!preset.documentName) {
        console.log(`Missing MetaData. Attempting document load: ${preset.id} | ${preset.name}`);
        await preset.load(true);
        if (!preset.documentName) continue;
        console.log(`MetaData. Found for: ${preset.id} | ${preset.name}`);
        if (!pack.locked) await preset._updateIndex(preset); // Insert missing preset into metadata index
      }

      if (preset.folder) {
        let matched = false;
        for (const [uuid, folder] of folders) {
          if (folder.id === preset.folder) {
            folder.presets.push(preset);
            matched = true;
            break;
          }
        }
        if (!matched) topLevelPresets.push(preset);
      } else topLevelPresets.push(preset);

      allPresets.push(preset);
      hasVisible |= preset._visible;
    }

    // Sort folders
    const sorting = PresetBrowser.CONFIG.sortMode === 'manual' ? 'm' : 'a';
    const sortedFolders = PresetCollection._sortFolders(Array.from(topLevelFolders.values()), sorting);
    const sortedPresets = PresetCollection._sortPresets(topLevelPresets, sorting);

    if (CONFIG.debug.MassEdit) console.timeEnd(pack.title);

    const tree = new PresetTree({
      folders: sortedFolders,
      presets: sortedPresets,
      allPresets,
      allFolders: folders,
      hasVisible,
      metaDoc,
      pack,
    });

    if (setFormVisibility) tree.setVisibility(type);
    PresetTree._packTrees[pack.metadata.name] = tree;

    return tree;
  }

  constructor({ folders, presets, allPresets, allFolders, hasVisible, metaDoc, pack } = {}) {
    this.folders = folders;
    this.presets = presets;
    this.allPresets = allPresets;
    this.allFolders = allFolders;
    this.hasVisible = hasVisible;
    this.metaDoc = metaDoc;
    this.pack = pack;
  }

  setVisibility(type) {
    this.allFolders.forEach((f) => {
      f.render = true;
      f.visible = type ? f.types.includes(type) : true;
    });

    this.hasVisible = false;

    for (const preset of this.allPresets) {
      preset._visible = true;
      preset._render = true;
      if (type) {
        if (type === 'ALL') {
          if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) preset._visible = false;
        } else if (preset.documentName !== type) preset._visible = false;
      }

      this.hasVisible = this.hasVisible || preset._visible;
    }
  }

  _setChildAndParentFoldersVisible(folder) {
    folder.visible = true;
    if (folder.folder) {
      for (const [uuid, f] of this.allFolders.entries()) {
        if (f.id === folder.folder) return this._setChildAndParentFoldersVisible(f);
      }
    }
  }
}
