import { Brush } from '../brush.js';
import { MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { SeededRandom, applyPresetToScene, localize } from '../utils.js';
import { FileIndexer } from './fileIndexer.js';
import { PresetBrowser } from './browser/browserApp.js';
import { Preset, VirtualFilePreset } from './preset.js';
import { Spawner } from './spawner.js';
import { decodeURIComponentSafely, matchPreset, parseSearchQuery, placeableToData } from './utils.js';

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

    return pack.tree;

    // const extFolders = [];

    // if (externalCompendiums) {
    //   for (const p of game.packs) {
    //     if (p.collection !== this.workingPack && p.index.get(META_INDEX_ID)) {
    //       const tree = await PresetTree.init(p, type, { setFormVisibility });
    //       if (setFormVisibility && !tree.hasVisible) continue;

    //       const topFolder = new PresetPackFolder({ pack: p, tree });
    //       extFolders.push(topFolder);

    //       // Collate all folders with the main tree
    //       mainTree.allFolders.set(topFolder.uuid, topFolder);
    //       for (const [uuid, folder] of tree.allFolders) {
    //         mainTree.allFolders.set(uuid, folder);
    //       }
    //     }
    //   }
    // }

    // // Read File Index
    // if (virtualDirectory) {
    //   const vTree = await FileIndexer.getVirtualDirectoryTree(type, { setFormVisibility });
    //   if (vTree && (vTree.hasVisible || !setFormVisibility)) {
    //     const topFolder = new VirtualFileFolder({
    //       name: 'VIRTUAL DIRECTORY',
    //       children: vTree.folders,
    //       uuid: 'virtual_directory',
    //       color: '#00739f',
    //     });
    //     extFolders.push(topFolder);

    //     // Collate all folders with the main tree
    //     mainTree.allFolders.set(topFolder.uuid, topFolder);
    //     for (const [uuid, folder] of vTree.allFolders) {
    //       mainTree.allFolders.set(uuid, folder);
    //     }
    //   }
    // }

    //mainTree.extFolders = this._groupExtFolders(extFolders, mainTree.allFolders);

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
      delete PresetTree._packTrees[pack.metadata.id];
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
    delete PresetTree._packTrees[compendium.metadata.id];
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
    let preset = await FileIndexer.getPreset(uuid);
    if (!preset) preset = new VirtualFilePreset({ src: uuid.substring(8) });

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
      delete PresetTree._packTrees[compendium.metadata.id];
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

    delete PresetTree._packTrees[folderDoc.compendium.metadata.id];
    return await folderDoc.delete({ deleteSubfolders: deleteAll, deleteContents: deleteAll });
  }

  static _searchPresetTree(tree, search, negativeSearch) {
    const presets = [];

    if (!search?.folder) this._searchPresetList(tree.allPresets, presets, search, negativeSearch);
    tree.allFolders.forEach((folder) => this._searchPresetFolder(folder, presets, search, negativeSearch));

    return presets;
  }

  static _searchPresets(presets, search, negativeSearch) {
    const results = [];
    this._searchPresetList(presets, results, search, negativeSearch);
    return results;
  }

  static _searchPresetFolder(folder, presets, search, negativeSearch) {
    if (search?.folder && folder.name !== search.folder) return;
    this._searchPresetList(folder.presets, presets, search, negativeSearch);
  }

  static _searchPresetList(toSearch, presets, search, negativeSearch) {
    for (const preset of toSearch) {
      if (matchPreset(preset, search, negativeSearch)) presets.push(preset);
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
   * @param {Array[String]} [options.types]              Preset types ("Token", "Tile", etc)
   * @param {String} [options.query]                     Search query to be ran. Format: "blue #castle @AmbientLight"
   *                                                     Terms: blue, Tags: castle, Type: AmbientLight
   *                                                     None, or all component of the query can be provided or excluded
   * @param {String|Array[String]|Object} [options.tags] Tags to match a preset against. Can be provided as an object containing 'tags' array and 'matchAny' flag.
   *                                                     Comma separated string, or a list of strings. In the latter 2 cases 'matchAny' is assumed true
   * @param {String} [options.folder]                    Folder name
   * @param {Boolean} [options.random]                   If multiple presets are found a random one will be chosen
   * @returns {Preset}
   */
  static async getPreset({
    uuid,
    name,
    types,
    folder,
    tags,
    query,
    matchAny = true,
    random = false,
    virtualDirectory = true,
    externalCompendiums = true,
    full = true,
  } = {}) {
    if (uuid) return await PresetCollection.get(uuid, { full });
    else if (!name && !types && !folder && !tags && !query)
      throw Error('UUID, Name, Types, Folder, and/or Query required to retrieve a Preset.');
    else if (query && (types || folder || tags || name))
      throw console.warn(`When 'query' is provided 'types', 'folder', 'tags', and 'name' arguments are ignored.`);

    let search, negativeSearch;
    if (query) {
      ({ search, negativeSearch } = parseSearchQuery(query, { matchAny }));
    } else {
      if (tags) {
        if (Array.isArray(tags)) tags = { tags, matchAny };
        else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny };
      }

      search = { name, types, folder, tags };
    }
    if (!search && !negativeSearch) return null;

    const tree = await PresetCollection.getTree(null, { externalCompendiums, virtualDirectory });
    const presets = PresetCollection._searchPresetTree(tree, search, negativeSearch);

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
   * @param {Array[String]} [options.types]              Preset types ("Token", "Tile", etc)
   * @param {String} [options.query]                     See PresetAPI.getPreset
   * @param {String} [options.folder]                    Folder name
   * @param {String|Array[String]|Object} [options.tags] See PresetAPI.getPreset
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async getPresets({
    uuid,
    name,
    types,
    query,
    matchAny = true,
    folder,
    tags,
    virtualDirectory = true,
    externalCompendiums = true,
    full = true,
    presets,
  } = {}) {
    if (uuid) {
      const uuids = Array.isArray(uuid) ? uuid : [uuid];
      presets = await PresetCollection.getBatch(uuids, { full });
    } else if (!name && !types && !folder && !tags && !query)
      throw Error('UUID, Name, Type, Folder, Tags, and/or Query required to retrieve Presets.');
    else if (query && (types || folder || tags || name))
      throw console.warn(`When 'query' is provided 'types', 'folder', 'tags', and 'name' arguments are ignored.`);
    else {
      let search, negativeSearch;
      if (query) {
        ({ search, negativeSearch } = parseSearchQuery(query, { matchAny }));
      } else {
        if (tags) {
          if (Array.isArray(tags)) tags = { tags, matchAny };
          else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny };
        }

        search = { name, types, folder, tags };
      }
      if (!search && !negativeSearch) return [];

      if (presets) {
        presets = PresetCollection._searchPresets(presets, search, negativeSearch);
      } else {
        presets = PresetCollection._searchPresetTree(
          await PresetCollection.getTree(null, { externalCompendiums, virtualDirectory }),
          search,
          negativeSearch
        );
      }
    }

    // Incase these presets are to be rendered, we set the _render and _visible flags to true
    // as we might be re-using presets that have been utilized by other forms and had these flags
    // toggled
    presets.forEach((p) => {
      p._render = true;
      p._visible = true;
    });

    if (full) await PresetCollection.batchLoadPresets(presets);

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
    draggable = true,
    folder = null,
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

    this.draggable = draggable;
    this.folder = folder;
    this.types = types;
    this.flags = { [MODULE_ID]: { types } };

    if (!CONFIG['ME-Folder']) {
      CONFIG['ME-Folder'] = { collection: { instance: new Collection() } };
    }
    CONFIG['ME-Folder'].collection.instance.set(this.id, this);
  }

  async update(data) {
    const doc = await fromUuid(this.uuid);
    if (doc) {
      foundry.utils.mergeObject(this, data);
      await doc.update(data);
    }
  }

  get expanded() {
    return Boolean(game.folders._expanded[this.uuid]);
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
  constructor(compendium, metaDoc, types) {
    const packFolderData = metaDoc.getFlag(MODULE_ID, 'folder') ?? {};
    const id = SeededRandom.randomID(compendium.collection);
    const uuid = `ME-Folder.${id}`;
    super({
      id,
      uuid,
      name: packFolderData.name ?? compendium.title,
      draggable: false,
      color: packFolderData.color ?? '#000000',
      types,
    });
    this.group = packFolderData.group;
    this.pack = compendium.collection;
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
    if (!forceLoad && PresetTree._packTrees[pack.metadata.id]) {
      const tree = PresetTree._packTrees[pack.metadata.id];
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

    PresetTree._packTrees[pack.metadata.id] = tree;

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

export class PresetStorage {
  /**
   * Construct a collection of presets representing the index of the passed in compendium
   * @param {Collection} pack
   * @returns
   */
  static async _loadIndex(pack) {
    if (pack._meIndex) return pack._meIndex;
    const metadataDocument = await pack.getDocument(META_INDEX_ID);
    const rawIndex = metadataDocument.getFlag(MODULE_ID, 'index');

    const index = new Collection();
    for (const [id, content] of Object.entries(rawIndex)) {
      index.set(id, new Preset({ id, uuid: pack.getUuid(id), ...content }));
    }

    pack._meIndex = index;
    return index;
  }

  /**
   * Retrieves a compendium and create a metadata document within it
   * If it's a DEFAULT_PACK and does not exist it will be created
   * @param {string} packId
   * @returns
   */
  static async _initCompendium(packId) {
    // Get/Create compendium
    let compendium = game.packs.get(packId);
    if (!compendium && packId === DEFAULT_PACK) {
      if (!this._creatingDefaultCompendium)
        this._creatingDefaultCompendium = CompendiumCollection.createCompendium({
          label: 'Mass Edit: Presets (MAIN)',
          type: 'JournalEntry',
          ownership: {
            GAMEMASTER: 'NONE',
            PLAYER: 'NONE',
            ASSISTANT: 'NONE',
          },
          packageType: 'world',
        });

      compendium = await this._creatingDefaultCompendium;
    }

    // Get/Create metadata document
    let metadataDocument = await compendium?.getDocument(this.META_INDEX_ID);
    if (compendium && !metadataDocument) {
      if (!compendium._creatingMetadataDocument)
        compendium._creatingMetadataDocument = compendium.documentClass.createDocuments(
          [
            {
              _id: META_INDEX_ID,
              name: '!!! METADATA: DO NOT DELETE !!!',
              flags: { [MODULE_ID]: { index: {} } },
            },
          ],
          {
            pack: packId,
            keepId: true,
          }
        );

      const documents = await compendium._creatingMetadataDocument;
      metadataDocument = documents[0];
    }

    return { compendium, metadataDocument };
  }

  /**
   * Creates a JournalEntry document representing the passed in preset
   * @param {Preset|Array[Preset]} preset
   */
  static async createDocuments(presets, pack = this.workingPack) {
    if (!Array.isArray(presets)) presets = [presets];

    const compendium = game.packs.get(pack);

    presets = presets.filter((p) => !compendium.index.get(p.id));
    if (!presets.length) return;

    const data = presets.map((preset) => {
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

    for (const preset of presets) {
      const document = documents.find((d) => d.id === preset.id);
      preset.uuid = document.uuid;
      await preset.load(false, document);
    }

    return presets;
  }

  static _assignPresetsToTree(index, tree) {
    if (tree.folder) tree.folder.presets = tree.entries.map((entry) => index.get(entry._id));
    else tree.presets = tree.entries.map((entry) => index.get(entry._id));
    for (const child of tree.children) {
      this._assignPresetsToTree(index, child);
    }
  }

  // Initialize hooks to manage update, deletion, and creation of preset JournalEntry's,
  // hiding of managed compendiums
  static _init() {
    CompendiumCollection.prototype.presetTree = async function () {
      console.log(this);
      const tree = this.tree;
      if (!tree.meTree) {
        const index = await PresetStorage._loadIndex(this);
        PresetStorage._assignPresetsToTree(index, tree);
        tree.meTree = true;
      }
      return tree;
    };

    // Hooks.on(`preUpdate${documentType}`, this._preUpdate.bind(this));
    // Hooks.on(`update${documentType}`, this._update.bind(this));
    // Hooks.on(`delete${documentType}`, this._delete.bind(this));
    Hooks.on(`preCreateJournalEntry`, this._preCreate.bind(this));
    // Hooks.on(`create${documentType}`, this._create.bind(this));
    Hooks.on('updateCompendium', this._updateCompendium.bind(this));

    // Hooks.on('activateCompendiumDirectory', (directory) => {
    //   //if (game.settings.get(MODULE_ID, 'hideManagedPacks'))
    //   game.packs
    //     .filter((p) => p.index.get(META_INDEX_ID))
    //     .forEach((pack) => {
    //       directory.element.querySelector(`[data-pack="${pack.collection}"]`)?.setAttribute('hidden', true);
    //     });
    // });
  }

  static _updateCompendium(compendium, documents, operation, userId) {
    console.log('updateCompendium', { compendium, documents, operation, userId });
    if (!compendium.index?.get(META_INDEX_ID)) return;

    const action = operation.action;
    if (action === 'create') return this._updateCompendiumCreate(compendium, documents, operation, userId);
    else if (action === 'update') return this._updateCompendiumUpdate(compendium, documents, operation, userId);
    else if (action === 'delete') return this._updateCompendiumDelete(compendium, documents, operation, userId);
  }

  static _updateCompendiumCreate(compendium, documents, operation, userId) {
    if (compendium._meIndex) {
      for (const data of operation.data) {
        compendium._meIndex.set(
          data._id,
          new Preset({
            id: data._id,
            uuid: compendium.getUuid(data._id),
            ...(foundry.utils.getProperty(data, `flags.${MODULE_ID}.preset`) ?? {}),
          })
        );
      }
    }

    if (game.user.id === userId) {
      const indexUpdate = {};
      for (const data of operation.data) {
        const preset = foundry.utils.getProperty(data, `flags.${MODULE_ID}.preset`) ?? {};
        const index = { id: data._id };
        META_INDEX_FIELDS.forEach((k) => {
          if (k in preset) index[k] = preset[k];
        });

        foundry.utils.setProperty(indexUpdate, `flags.${MODULE_ID}.index.${data._id}`, index);
      }

      compendium.getDocument(META_INDEX_ID).then((metaDocument) => {
        metaDocument.update(indexUpdate);
      });
    }
  }

  // Sync document update with index
  static _updateCompendiumUpdate(compendium, documents, operation, userId) {
    const indexUpdate = {};
    for (const update of operation.updates) {
      if (update._id === META_INDEX_ID) continue;
      const preset = foundry.utils.getProperty(change, `flags.${MODULE_ID}.preset`);
      if (preset) {
        const indexChanges = {};
        META_INDEX_FIELDS.forEach((k) => {
          if (k in preset) indexChanges[k] = preset[k];
        });
        if ('name' in update) indexChanges.name = update.name;
        if (compendium._meIndex) Object.assign(compendium._meIndex.get(update._id), indexChanges);
        if (!foundry.utils.isEmpty(indexChanges))
          foundry.utils.setProperty(indexUpdate, `flags.${MODULE_ID}.index.${update._id}`, indexChanges);
      }
    }

    if (game.user.id !== userId) return;

    if (!foundry.utils.isEmpty(indexUpdate))
      document.collection.getDocument(META_INDEX_ID).then((metaDocument) => {
        metaDocument.update(indexUpdate);
      });
  }

  // Document deletion within managed collection automatically remove it from the metadata document index
  static _updateCompendiumDelete(compendium, documents, operation, userId) {
    if (compendium._meIndex) operation.ids.forEach((id) => compendium._meIndex.delete(id));

    if (game.user.id === userId) {
      const update = {};
      operation.ids.forEach((id) => {
        update[`flags.${MODULE_ID}.index.-=${id}`] = null;
      });
      document.collection.getDocument(META_INDEX_ID).then((metaDocument) => {
        metaDocument.update(update).then(PresetBrowser.renderActiveBrowser());
      });
    }
  }
  // /**
  //  * Sync Document and index names
  //  * @param {Document} document
  //  * @param {object} change
  //  * @param {object} options
  //  * @param {string} userId
  //  */
  // static _preUpdate(document, change, options, userId) {
  //   if (
  //     document.collection.index?.get(META_INDEX_ID) &&
  //     document.id !== META_INDEX_ID &&
  //     ('name' in change || foundry.utils.getProperty(change, `flags.${MODULE_ID}.index.name`) != null)
  //   ) {
  //     if ('name' in change) foundry.utils.setProperty(change, `flags.${MODULE_ID}.preset.name`, change.name);
  //     else change.name = change.flags[MODULE_ID].index.name;
  //   }
  // }

  /**
   * If a Document has been created within a managed compendium without the use of MassEdit API default preset data will be inserted here.
   * @param {Document} document
   * @param {object} data
   * @param {object} options
   * @param {object} userId
   */
  static _preCreate(document, data, options, userId) {
    if (
      document.collection.index?.get(META_INDEX_ID) &&
      !foundry.utils.getProperty(data, `flags.${MODULE_ID}.preset`)
    ) {
      foundry.utils.setProperty(
        data,
        `flags.${MODULE_ID}.preset`,
        new Preset({ name: document.name, data: [{}] }).toJSON()
      );
    }
  }

  /**
   * Newly created documents within managed compendiums automatically update metadata document index
   * @param {Document} document
   * @param {object} options
   * @param {string} userId
   * @returns
   */
  static _create(document, options, userId) {
    if (game.user.id === userId && document.collection.index?.get(META_INDEX_ID)) {
      document.collection.getDocument(META_INDEX_ID).then((metaDocument) => {
        const preset = document.getFlag(MODULE_ID, 'preset');
        const index = {};
        META_INDEX_FIELDS.forEach((k) => {
          if (k in preset) index[k] = preset[k];
        });

        metaDocument.setFlag(MODULE_ID, 'index', { [document.id]: index });
      });
    }
  }

  // =========================================================================
  // Preset retrieval API

  /**
   * Retrieve presets
   * @param {object} [options={}]
   * @param {String|Array[String]} [options.uuid]        Preset UUID/s
   * @param {String} [options.name]                      Preset name
   * @param {Array[String]} [options.types]              Preset types ("Token", "Tile", etc)
   * @param {String} [options.query]                     See PresetAPI.getPreset
   * @param {String} [options.folder]                    Folder name
   * @param {String|Array[String]|Object} [options.tags] See PresetAPI.getPreset
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async retrieve({
    uuid,
    name,
    types,
    query,
    matchAny = true,
    folder,
    tags,
    virtualDirectory = true,
    externalCompendiums = true,
    full = true, // deprecated
    load = false,
    presets,
  } = {}) {
    if (full !== undefined) load = full;

    if (uuid) {
      const uuids = Array.isArray(uuid) ? uuid : [uuid];
      presets = await this.getPresetsFromUUID(uuids, { load });
    } else if (!name && !types && !folder && !tags && !query)
      throw Error('UUID, Name, Type, Folder, Tags, and/or Query required to retrieve Presets.');
    else if (query && (types || folder || tags || name))
      throw console.warn(`When 'query' is provided 'types', 'folder', 'tags', and 'name' arguments are ignored.`);
    else {
      let search, negativeSearch;
      if (query) {
        ({ search, negativeSearch } = parseSearchQuery(query, { matchAny }));
      } else {
        if (tags) {
          if (Array.isArray(tags)) tags = { tags, matchAny };
          else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny };
        }

        search = { name, types, folder, tags };
      }
      if (!search && !negativeSearch) return [];

      if (presets) presets = presets.filter((preset) => this._matchPreset(preset, search, negativeSearch));
      else presets = await this._search(search, negativeSearch, { virtualDirectory, externalCompendiums });
    }

    // Incase these presets are to be rendered, we set the _render and _visible flags to true
    // as we might be re-using presets that have been utilized by other forms and had these flags
    // toggled
    presets.forEach((p) => {
      p._render = true;
      p._visible = true;
    });

    if (load) await this._batchLoadPresets(presets);

    return presets;
  }

  /**
   * Retrieve a single preset that matches the provided criteria
   * See getPresets(...)
   * @returns {Preset}
   */
  static async retrieveSingle(options = {}) {
    const presets = await this.retrieve({ ...options, load: false });

    const preset = options.random ? presets[Math.floor(Math.random() * presets.length)] : presets[0];
    if (preset && options.load) await preset.load();

    return preset;
  }

  /**
   * Search all managed packs
   * @param {object} search
   * @param {object} negativeSearch
   * @returns
   */
  static async _search(search, negativeSearch, { virtualDirectory, externalCompendiums } = {}) {
    const results = [];
    for (const pack of game.packs) {
      if (!pack.index.get(META_INDEX_ID)) continue;
      if (!pack._meIndex) await this._loadIndex(pack);

      for (const entry of pack._meIndex) {
        if (this._matchPreset(entry, search, negativeSearch)) results.push(entry);
      }
    }

    // TODO: virtualDirectory, externalCompendiums

    return results;
  }

  /**
   * Match an entry against the provided search and negativeSearch
   * @param {Entry} entry
   * @param {object} search
   * @param {object} negativeSearch
   */
  static _matchPreset(entry, search, negativeSearch) {
    let match = true;

    if (search) {
      const { name, terms, types, tags } = search;
      if (name && name !== entry.name) match = false;
      else if (types && !types.includes(entry.type)) match = false;
      else if (terms && !terms.every((t) => entry.name.toLowerCase().includes(t))) match = false;
      else if (tags) {
        if (tags.noTags) match = !entry.tags.length;
        else if (tags.matchAnyTag) match = tags.tags.some((t) => entry.tags.includes(t));
        else match = tags.tags.every((t) => entry.tags.includes(t));
      }
    }
    if (match && negativeSearch) {
      const { name, terms, types, tags } = negativeSearch;
      if (name && name === entry.name) match = false;
      else if (types && types.includes(entry.type)) match = false;
      else if (terms && !terms.every((t) => !entry.name.toLowerCase().includes(t))) match = false;
      else if (tags) {
        if (tags.noTags) match = !!entry.tags.length;
        else if (tags.matchAnyTag) match = tags.tags.some((t) => !entry.tags.includes(t));
        else match = tags.tags.every((t) => !entry.tags.includes(t));
      }
    }

    return match;
  }

  /**
   * Returns provided UUIDs as Presets
   * @param {Array[string]|string} uuids
   * @param {object} [options]
   * @param {boolean} [options.load] Should the associated entry documents be immediately loaded?
   * @returns {Array[Entry]}
   */
  static async getPresetsFromUUID(uuids, { load = true }) {
    if (!Array.isArray(uuids)) uuids = [uuids];
    const presets = [];

    for (const uuid of uuids) {
      if (uuid.startsWith('virtual@')) {
        presets.push(await this._constructVirtualFilePreset(uuid));
        continue;
      }

      const { collection, documentId } = foundry.utils.parseUuid(uuid);
      if (!collection) {
        console.warn('Invalid UUID: ', uuid);
        continue;
      }
      const index = collection.index.get(documentId);

      if (index) {
        if (!collection._meIndex) await this._loadIndex(collection);
        presets.push(collection._meIndex.get(documentId));
      }
    }

    if (load) return this._batchLoadPresets(presets);
    return presets;
  }

  static async _constructVirtualFilePreset(uuid) {
    let preset = await FileIndexer.getPreset(uuid);
    if (!preset) preset = new VirtualFilePreset({ src: uuid.substring(8) });
    return preset;
  }

  /**
   * Batch load preset documents using pack.getDocuments({ _id__in: ids }) query.
   * @param {Array[Preset]} presets to be loaded with their document
   * @returns {Array[Preset]}
   */
  static async _batchLoadPresets(presets) {
    // Organize presets according to their packs
    const packToPreset = {};
    for (const preset of presets) {
      if (preset instanceof VirtualFilePreset) {
        await preset.load();
        continue;
      }

      if (!preset.document) {
        const { collection, documentId } = foundry.utils.parseUuid(preset.uuid);
        if (!packToPreset[collection]) packToPreset[collection] = {};
        packToPreset[collection][documentId] = preset;
      }
    }

    // Load documents from each pack and assign them to entries
    for (const [pack, idToPresets] of Object.entries(packToPreset)) {
      const documents = await pack.getDocuments({ _id__in: Object.keys(idToPresets) });
      for (const document of documents) {
        idToPresets[document.id].load(false, document);
      }
    }

    return presets;
  }
}

// TODO, re-use CompendiumCollection (pack) tree to do rendering and search
// hook into 'updateCompendium' hook to update the _meIndex/Preset on changes
// When searching the tree use the _id in the normal index to query the _meIndex for the additional fields

// search:
// search all presets and return via  _getVisibleTreeContents
// simple wrap of DirectoryCollectionMixin, return only matched presets and Folders
// let the DirectoryCollectionMixin to construct the tree to be rendered
