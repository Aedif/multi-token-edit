import { MODULE_ID } from '../constants.js';
import { SeededRandom, localize } from '../utils.js';
import { FileIndexer } from './fileIndexer.js';
import { PresetBrowser } from './browser/browserApp.js';
import { DOCUMENT_FIELDS, Preset, VirtualFilePreset } from './preset.js';
import { decodeURIComponentSafely, exportPresets, parseSearchQuery, placeableToData } from './utils.js';

export const META_INDEX_ID = 'MassEditMetaData';
export const META_INDEX_FIELDS = ['img', 'documentName', 'tags'];

export class PresetAPI {
  static name = 'PresetAPI';

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
      presets.push(preset);
    }

    await PresetStorage.createDocuments(presets);

    return presets;
  }

  /**
   * Update preset tags using provided uuid to tag mappings.
   * {
   *  "uuid1": ["tag1"],
   *  "uuid2": ["tag1", "tag2"],
   * }
   * @param {object} mappings
   */
  static async updateTags(mappings) {
    const uuids = Object.keys(mappings);
    const presets = await PresetStorage.retrieve({ uuid: uuids });
    for (const preset of presets) {
      let tags = mappings[preset.uuid];
      if (tags && Array.isArray(tags)) {
        tags = tags.map((t) => t.slugify({ strict: true })).filter(Boolean);
        if (tags.length) preset.update({ tags }, true);
      }
    }

    return Preset.processBatchUpdates();
  }
}

export class PresetFolder {
  constructor({
    id,
    name,
    sorting = 'm',
    color = '#000000',
    sort = 0,
    children = [],
    presets = [],
    folder = null,
    types = [],
  } = {}) {
    this.id = id;
    this.uuid = `ME-Folder.${this.id}`;
    this.name = name;
    this.sorting = sorting;
    this.color = color;
    this.sort = sort;
    this.children = children;
    this.presets = presets;

    this.folder = folder;
    this.types = types;
    this.flags = { [MODULE_ID]: { types } };

    if (!CONFIG['ME-Folder']) CONFIG['ME-Folder'] = { collection: { instance: new Collection() } };
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
    this.static = true;
  }

  async update(data) {}
}

export class VirtualFileFolder extends PresetVirtualFolder {
  constructor(options) {
    options.id = SeededRandom.randomID(options.path);
    super(options);
    if (!options.types) this.types = ['ALL'];
    this.bucket = options.bucket;
    this.source = options.source;
    this.name = decodeURIComponentSafely(this.name);
    this.icon = options.icon;
    this.subtext = options.subtext;
    this.path = options.path;
    if (options.source && ['data', 'forgevtt'].includes(options.source)) this.indexable = true;
  }
}

export class PresetPackFolder extends PresetVirtualFolder {
  constructor(compendium, metaDoc, children = []) {
    const packFolderData = metaDoc.flags[MODULE_ID]?.folder ?? {};
    const id = SeededRandom.randomID(compendium.collection);
    const uuid = `ME-Folder.${id}`;
    super({
      id,
      uuid,
      name: packFolderData.name ?? compendium.title,
      color: packFolderData.color ?? '#000000',
      children,
    });
    this.group = packFolderData.group;
    this.pack = compendium.collection;
    this.editDisabled = compendium.editDisabled;
    this.typeless = true;
  }

  async update(data = {}) {
    const pack = game.packs.get(this.pack);

    if (!pack || pack.locked) return;
    if (data.hasOwnProperty('name') && data.name === pack.title) delete data.name;
    if (foundry.utils.isEmpty(data)) return;

    const { metadataDocument } = await PresetStorage._initCompendium(this.pack);
    await metadataDocument.setFlag(MODULE_ID, 'folder', data);

    foundry.utils.mergeObject(this, data);
  }

  get _meMatch() {
    return this.children.some((ch) => ch.folder._meMatch) || this.presets.some((p) => p._meMatch);
  }

  set _meMatch(val) {}
}

export class PresetStorage {
  static DEFAULT_PACK = 'world.mass-edit-presets-main';

  /**
   * Revert the working compendium to default pack
   */
  static async fallbackToDefaultPack() {
    await game.settings.set(MODULE_ID, 'workingPack', PresetStorage.DEFAULT_PACK);
  }

  /**
   * Construct a collection of presets representing the index of the passed in compendium
   * @param {Collection} pack
   * @returns
   */
  static async _loadIndex(pack, force = false) {
    if (pack._meIndex && !force) return pack._meIndex;
    const metadataDocument = await pack.getDocument(META_INDEX_ID);
    const rawIndex = metadataDocument.getFlag(MODULE_ID, 'index');

    const index = new Collection();
    for (const [id, content] of Object.entries(rawIndex)) {
      if (id !== META_INDEX_ID) {
        const i = pack.index.get(id);
        if (i) {
          const { folder, name, sort, uuid, _id } = i;
          index.set(id, new Preset({ ...content, folder, name, sort, uuid, _id }));
        }
      }
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
    if (!compendium && packId === PresetStorage.DEFAULT_PACK) {
      if (!this._creatingDefaultCompendium)
        this._creatingDefaultCompendium = foundry.documents.collections.CompendiumCollection.createCompendium({
          label: 'Mass Edit: Presets (MAIN)',
          type: 'JournalEntry',
          packageType: 'world',
        });

      compendium = await this._creatingDefaultCompendium;
    }

    // Get/Create metadata document
    let metadataDocument = await compendium?.getDocument(META_INDEX_ID);
    if (compendium && !metadataDocument) {
      if (!compendium._creatingMetadataDocument) {
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
      }

      const documents = await compendium._creatingMetadataDocument;
      metadataDocument = documents[0];
    }

    return { compendium, metadataDocument };
  }

  /**
   * Update multiple presets at the same time
   * @param {Array[]} updates
   */
  static async updatePresets(updates, pack = this.workingPack) {
    return game.packs.get(pack).documentClass.updateDocuments(updates, { pack });
  }

  /**
   * Creates a JournalEntry document representing the passed in preset/s
   * @param {Preset|Array[Preset]} presets
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
      await preset.load({ document });
    }

    return presets;
  }

  /**
   * Delete presets and their underlying documents
   * @param {Preset|Array[Preset]} presets
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

    // Delete in batches
    for (const pack of Object.keys(sorted)) {
      await JournalEntry.deleteDocuments(
        sorted[pack].map((p) => p.id),
        { pack }
      );
    }
  }

  // Initialize hooks to manage update, deletion, and creation of preset JournalEntry's,
  // hiding of managed compendiums
  static _init() {
    Hooks.on(`preUpdateJournalEntry`, this._preUpdate.bind(this));
    Hooks.on(`preCreateJournalEntry`, this._preCreate.bind(this));
    Hooks.on('updateCompendium', this._updateCompendium.bind(this));

    // Hide managed compendiums
    Hooks.on('activateCompendiumDirectory', (directory) => {
      const hide = Boolean(game.settings.get(MODULE_ID, 'hideManagedPacks'));
      game.packs
        .filter((p) => p.index.get(META_INDEX_ID))
        .forEach((pack) => {
          const el = directory.element.querySelector(`[data-pack="${pack.collection}"]`);
          if (hide) el?.setAttribute('hidden', true);
          else el?.removeAttribute('hidden');
        });
    });
  }

  static _updateCompendium(compendium, documents, operation, userId) {
    if (!compendium.index?.get(META_INDEX_ID)) return;

    if (operation.data) this._updateCompendiumCreate(compendium, documents, operation, userId);
    else if (operation.updates) this._updateCompendiumUpdate(compendium, documents, operation, userId);
    else if (operation.ids) this._updateCompendiumDelete(compendium, documents, operation, userId);

    // Re-render the Preset Browser if it's open to reflect the new changes
    foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id)?.render(true);
  }

  static _updateCompendiumCreate(compendium, documents, operation, userId) {
    if (documents[0] instanceof Folder) return;

    if (compendium._meIndex) {
      for (const data of operation.data) {
        const index_fields = { ...compendium.index.get(data._id) };
        const presetData = foundry.utils.getProperty(data, `flags.${MODULE_ID}.preset`) ?? {};
        META_INDEX_FIELDS.forEach((f) => {
          if (f in presetData) index_fields[f] = presetData[f];
        });
        compendium._meIndex.set(data._id, new Preset(index_fields));
      }
    }

    if (game.user.id === userId) {
      const indexUpdate = {};
      for (const data of operation.data) {
        // if (data._id === META_INDEX_ID) {
        //   // If a METADATA file has been created and there are existing documents within the compendium
        //   // we will attempt to reconstruct the index assuming that the documents present are Preset containers
        //   if (compendium.index.size > 1) this._recoverIndex(compendium);
        //   continue;
        // }

        const preset = foundry.utils.getProperty(data, `flags.${MODULE_ID}.preset`) ?? {};
        const index = {};
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
    if (!compendium.index.get(operation.updates[0]._id)) return; // Folder update

    const indexUpdate = {};
    for (const update of operation.updates) {
      if (update._id === META_INDEX_ID) continue;

      const preset = foundry.utils.getProperty(update, `flags.${MODULE_ID}.preset`);
      if (preset) {
        const indexChanges = {};
        META_INDEX_FIELDS.forEach((k) => {
          if (k in preset) indexChanges[k] = preset[k];
        });
        if (compendium._meIndex) {
          const preset = compendium._meIndex.get(update._id);
          Object.assign(preset, indexChanges);
          DOCUMENT_FIELDS.forEach((f) => {
            if (f in update) preset[f] = update[f];
          });
        }
        if (!foundry.utils.isEmpty(indexChanges))
          foundry.utils.setProperty(indexUpdate, `flags.${MODULE_ID}.index.${update._id}`, indexChanges);
      }
    }

    if (game.user.id === userId && !foundry.utils.isEmpty(indexUpdate)) {
      compendium.getDocument(META_INDEX_ID).then((metaDocument) => {
        metaDocument.update(indexUpdate);
      });
    }
  }

  // Document deletion within managed collection automatically remove it from the metadata document index
  static _updateCompendiumDelete(compendium, documents, operation, userId) {
    if (documents[0] instanceof Folder) return;
    if (compendium._meIndex) operation.ids.forEach((id) => compendium._meIndex.delete(id));

    if (game.user.id === userId) {
      const update = {};
      operation.ids.forEach((id) => {
        update[`flags.${MODULE_ID}.index.-=${id}`] = null;
      });
      compendium.getDocument(META_INDEX_ID).then((metaDocument) => {
        metaDocument.update(update).then(PresetBrowser.renderActiveBrowser());
      });
    }
  }

  // Re-construct preset index. This is called when a metadata document is created within a compendium
  // with other existing documents. It's possible that the metadata document has been deleted and the compendium
  // is now being attempted to be used as a Preset compendium again.
  static async _recoverIndex(packId) {
    const { compendium, metadataDocument } = await this._initCompendium(packId);
    if (!compendium) return;

    const indexUpdate = {};
    const documents = await compendium.getDocuments();
    for (const document of documents) {
      if (document.id === META_INDEX_ID) continue;

      const preset = document.getFlag(MODULE_ID, 'preset');
      if (preset) {
        const update = {};
        META_INDEX_FIELDS.forEach((k) => {
          if (k in preset) update[k] = preset[k];
        });

        foundry.utils.setProperty(indexUpdate, `flags.${MODULE_ID}.index.${document.id}`, update);
      }
    }

    if (!foundry.utils.isEmpty(indexUpdate)) {
      await metadataDocument.update(indexUpdate);
      await this._loadIndex(compendium, true);
      compendium.initializeTree?.();
    }
  }

  /**
   * Sync DOCUMENT_FIELDS updates with preset flag and document itself
   * @param {Document} document
   * @param {object} change
   * @param {object} options
   * @param {string} userId
   */
  static _preUpdate(document, change, options, userId) {
    if (document.collection.index?.get(META_INDEX_ID) && document.id !== META_INDEX_ID) {
      const preset = foundry.utils.getProperty(change, `flags.${MODULE_ID}.preset`) ?? {};
      DOCUMENT_FIELDS.forEach((f) => {
        if (f in change) foundry.utils.setProperty(change, `flags.${MODULE_ID}.preset.${f}`, change[f]);
        else if (f in preset) change[f] = preset[f];
      });
    }
  }

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

  // =========================================================================
  // Preset retrieval API

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
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async retrieve({
    uuid,
    name,
    types,
    query,
    matchAny = true,
    tags,
    virtualDirectory = true,
    externalCompendiums = true,
    full = undefined, // deprecated
    load = false,
    presets,
  } = {}) {
    if (full !== undefined) load = full;

    if (uuid) {
      const uuids = Array.isArray(uuid) ? uuid : [uuid];
      presets = await this.retrieveFromUUID(uuids, { load });
    } else if (!name && !types && !tags && !query)
      throw Error('UUID, Name, Type, Folder, Tags, and/or Query required to retrieve Presets.');
    else if (query && (types || tags || name))
      throw console.warn(`When 'query' is provided 'types', 'tags', and 'name' arguments are ignored.`);
    else {
      let search, negativeSearch;
      if (query) {
        ({ search, negativeSearch } = parseSearchQuery(query, { matchAny }));
      } else {
        if (tags) {
          if (Array.isArray(tags)) tags = { tags, matchAny };
          else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny };
        }

        search = { name, types, tags };
      }
      if (!search && !negativeSearch) return [];

      if (presets) presets = presets.filter((preset) => this._matchPreset(preset, search, negativeSearch));
      else presets = await this._search(search, negativeSearch, { virtualDirectory, externalCompendiums });
    }

    if (load) await this.batchLoad(presets);

    return presets;
  }

  /**
   * Retrieve a single preset that matches the provided criteria
   * See retrieve(...)
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
    const packs = [];

    if (externalCompendiums) {
      for (const pack of game.packs) {
        if (pack.index.get(META_INDEX_ID)) packs.push(pack);
      }
    } else {
      const workingPack = game.packs.find((pack) => pack.collection === this.workingPack);
      if (workingPack) packs.push(workingPack);
    }

    if (virtualDirectory) {
      const virtualPack = await FileIndexer.collection();
      if (virtualPack) packs.push(virtualPack);
    }

    const results = [];
    for (const pack of packs) {
      if (!pack._meIndex) await this._loadIndex(pack);

      for (const entry of pack._meIndex) {
        if (this._matchPreset(entry, search, negativeSearch)) results.push(entry);
      }
    }

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
      else if (types && !types.includes(entry.documentName)) match = false;
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
      else if (types && types.includes(entry.documentName)) match = false;
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
  static async retrieveFromUUID(uuids, { load = true }) {
    if (!Array.isArray(uuids)) uuids = [uuids];
    const presets = [];

    for (const uuid of uuids) {
      if (uuid.startsWith('virtual@')) {
        presets.push(await FileIndexer.retrieve(uuid));
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

    if (load) return this.batchLoad(presets);
    return presets;
  }

  /**
   * Batch load preset documents using pack.getDocuments({ _id__in: ids }) query.
   * @param {Array[Preset]} presets to be loaded with their document
   * @returns {Array[Preset]}
   */
  static async batchLoad(presets) {
    // Organize presets according to their packs
    const packToPreset = {};
    for (const preset of presets) {
      if (preset instanceof VirtualFilePreset) continue;

      if (!preset.document && preset.uuid) {
        const { collection, documentId } = foundry.utils.parseUuid(preset.uuid);
        const pack = collection.collection;
        if (!packToPreset[pack]) packToPreset[pack] = {};
        packToPreset[pack][documentId] = preset;
      }
    }

    // Load documents from each pack and assign them to entries
    for (const [pack, idToPresets] of Object.entries(packToPreset)) {
      const documents = await game.packs.get(pack).getDocuments({ _id__in: Object.keys(idToPresets) });
      for (const document of documents) {
        await idToPresets[document.id].load({ document });
      }
    }

    return presets;
  }

  /**
   * Mass export presets
   * @param {object} options
   * @param {boolean} options.workingCompendium
   * @param {boolean} options.externalCompendiums
   * @param {boolean} options.virtualDirectory
   * @param {boolean} options.json
   * @returns
   */
  static async exportPresets({
    workingCompendium = false,
    externalCompendiums = false,
    virtualDirectory = false,
    query = '',
    json = false,
  } = {}) {
    let toExport = [];
    let packs = [];

    if (workingCompendium) {
      const pack = game.packs.get(PresetStorage.workingPack);
      if (pack) packs.push(pack);
    }

    if (externalCompendiums) {
      for (const pack of game.packs) {
        if (!pack.index.get(META_INDEX_ID)) continue;
        if (externalCompendiums && pack.collection !== PresetStorage.workingPack) packs.push(pack);
      }
    }

    for (const pack of packs) {
      if (!pack._meIndex) await PresetStorage._loadIndex(pack);
      toExport = toExport.concat(pack._meIndex.contents);
    }

    // Filter via query
    if (query) toExport = await PresetStorage.retrieve({ query, presets: toExport });

    await PresetStorage.batchLoad(toExport);

    if (virtualDirectory) {
      const virtualPack = await FileIndexer.collection();
      if (virtualPack) {
        if (!virtualPack._meIndex) await PresetStorage._loadIndex(virtualPack);
        let virtualPresets = virtualPack._meIndex.contents;

        // Filter via query
        if (query) virtualPresets = await PresetStorage.retrieve({ query, presets: virtualPresets });

        toExport = toExport.concat(virtualPresets);
      }
    }

    if (toExport.length) return exportPresets(toExport, { load: false, json });
  }
}
