import { checkApplySpecialFields } from '../../applications/formUtils.js';
import { Brush } from '../brush.js';
import { DataTransform, Picker } from '../picker.js';
import { applyRandomization } from '../randomizer/randomizerUtils.js';
import {
  MODULE_ID,
  SUPPORTED_PLACEABLES,
  SeededRandom,
  UI_DOCS,
  applyPresetToScene,
  createDocuments,
  executeScript,
  localize,
} from '../utils.js';
import { FileIndexer } from './fileIndexer.js';
import { Preset, VirtualFilePreset } from './preset.js';
import {
  FolderState,
  decodeURIComponentSafely,
  getPresetDataCenterOffset,
  getTransformToOrigin,
  mergePresetDataToDefaultDoc,
  modifySpawnData,
  placeableToData,
} from './utils.js';

export const DEFAULT_PACK = 'world.mass-edit-presets-main';
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
          if (!tree.hasVisible) continue;

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
      if (vTree?.hasVisible) {
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
          flags: { [MODULE_ID]: { preset: preset.toJSON() } },
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

    META_INDEX_FIELDS.forEach((f) => {
      update[f] = preset[f];
    });

    await metaDoc.setFlag(MODULE_ID, 'index', { [preset.id]: update });
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

    if (!options.folder) this._searchPresetList(tree.allPresets, presets, options);
    tree.allFolders.forEach((folder) => this._searchPresetFolder(folder, presets, options));

    return presets;
  }

  static _searchPresetFolder(folder, presets, options) {
    if (options.folder && folder.name !== options.folder) return;
    this._searchPresetList(folder.presets, presets, options, folder.name);
  }

  static _searchPresetList(toSearch, presets, { name, type, tags } = {}, folderName) {
    for (const preset of toSearch) {
      let match = true;
      if (name && name !== preset.name) match = false;
      if (type && type !== preset.documentName) match = false;
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
        await PresetAPI.spawnPreset({
          preset: this.data,
          coordPicker: true,
          taPreview: 'ALL',
          scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
        });
        ui.spotlightOmnisearch?.setDraggingState(false);
      }
    };

    const onDragEnd = function (event) {
      if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
        const { x, y } = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
        PresetAPI.spawnPreset({
          preset: this.data,
          x,
          y,
          scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
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
   * @param {String|Array[String]|Object} [options.tags] Tags to match a preset against. Can be provided as an object containing 'tags' array and 'match' any flag.
   *                                                     Comma separated string, or a list of strings. In the latter 2 case 'matchAny' is assumed true
   * @param {String} [options.folder]                    Folder name
   * @param {Boolean} [options.random]                   If multiple presets are found a random one will be chosen
   * @returns {Preset}
   */
  static async getPreset({ uuid, name, type, folder, tags, random = false, full = true } = {}) {
    if (uuid) return await PresetCollection.get(uuid, { full });
    else if (!name && !type && !folder && !tags)
      throw Error('UUID, Name, Type, and/or Folder required to retrieve a Preset.');

    if (tags) {
      if (Array.isArray(tags)) tags = { tags, matchAny: true };
      else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny: true };
    }

    const presets = PresetCollection._searchPresetTree(
      await PresetCollection.getTree(type, { externalCompendiums: true, virtualDirectory: true }),
      {
        name,
        type,
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
   * @param {String} [options.folder]                    Folder name
   * @param {String|Array[String]|Object} [options.tags] See PresetAPI.getPreset
   * @param {String} [options.format]                    The form to return placeables in ('preset', 'name', 'nameAndFolder')
   * @returns {Array[Preset]|Array[String]|Array[Object]}
   */
  static async getPresets({ uuid, name, type, folder, format = 'preset', tags, full = true } = {}) {
    let presets;
    if (uuid) {
      presets = [];
      const uuids = Array.isArray(uuid) ? uuid : [uuid];
      for (const uuid of uuids) {
        const preset = await PresetCollection.get(uuid, { full });
        if (preset) presets.push(preset);
      }
    } else if (!name && !type && !folder && !tags) {
      throw Error('UUID, Name, Type, Folder and/or Tags required to retrieve a Preset.');
    } else {
      if (tags) {
        if (Array.isArray(tags)) tags = { tags, matchAny: true };
        else if (typeof tags === 'string') tags = { tags: tags.split(','), matchAny: true };
      }

      presets = PresetCollection._searchPresetTree(
        await PresetCollection.getTree(type, { externalCompendiums: true, virtualDirectory: true }),
        {
          name,
          type,
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
    await PresetCollection.set(preset);
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

  /**
   * Spawn a preset on the scene (uuid, name or preset itself are required).
   * By default the current mouse position is used.
   * @param {object} [options={}]
   * @param {Preset} [options.preset]                    Preset
   * @param {String} [options.uuid]                      Preset UUID
   * @param {String} [options.name]                      Preset name
   * @param {String} [options.type]                      Preset type ("Token", "Tile", etc)
   * @param {String|Array[String]|Object} [options.tags] Preset tags, See PresetAPI.getPreset
   * @param {Boolean} [options.random]                   If a unique preset could not be found, a random one will be chosen from the matched list
   * @param {Number} [options.x]                         Spawn canvas x coordinate (mouse position used if x or y are null)
   * @param {Number} [options.y]                         Spawn canvas y coordinate (mouse position used if x or y are null)
   * @param {Number} [options.z]                         Spawn canvas z coordinate (3D Canvas)
   * @param {Boolean} [options.snapToGrid]               If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]                   If 'true' preset will be spawned hidden.
   * @param {Boolean} [options.layerSwitch]              If 'true' the layer of the spawned preset will be activated.
   * @param {Boolean} [options.scaleToGrid]              If 'true' Tiles, Drawings, and Walls will be scaled relative to grid size.
   * @param {Boolean} [options.modifyPrompt]             If 'true' a field modification prompt will be shown if configured via `Preset Edit > Modify` form
   * @param {Boolean} [options.coordPicker]              If 'true' a crosshair and preview will be enabled allowing spawn position to be picked
   * @param {String} [options.pickerLabel]               Label displayed above crosshair when `coordPicker` is enabled
   * @param {String} [options.taPreview]                 Designates the preview placeable when spawning a `Token Attacher` prefab.
   *                                                      Accepted values are "ALL" (for all elements) and document name optionally followed by an index number
   *                                                      e.g. "ALL", "Tile", "AmbientLight.1"
   * @returns {Array[Document]}
   */
  static async spawnPreset({
    uuid,
    preset,
    name,
    type,
    folder,
    tags,
    random = false,
    x,
    y,
    z,
    coordPicker = false,
    pickerLabel,
    taPreview,
    snapToGrid = true,
    hidden = false,
    layerSwitch = false,
    scaleToGrid = false,
    modifyPrompt = true,
    center = false,
    transform = {},
    previewOnly = false,
    sceneId = canvas.scene.id,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(uuid || preset || name || type || folder || tags))
      throw Error('ID, Name, Folder, Tags, or Preset is needed to spawn it.');
    if (!coordPicker && ((x == null && y != null) || (x != null && y == null)))
      throw Error('Need both X and Y coordinates to spawn a preset.');

    if (preset) await preset.load();
    preset = preset ?? (await PresetAPI.getPreset({ uuid, name, type, folder, tags, random }));
    if (!preset) throw Error(`No preset could be found matching: { uuid: "${uuid}", name: "${name}", type: "${type}"}`);

    let presetData = foundry.utils.deepClone(preset.data);

    // Instead of using the entire data group use only one random one
    if (preset.spawnRandom && presetData.length)
      presetData = [presetData[Math.floor(Math.random() * presetData.length)]];

    // Display prompt to modify data if needed
    if (modifyPrompt && preset.modifyOnSpawn?.length) {
      presetData = await modifySpawnData(presetData, preset.modifyOnSpawn);
      // presetData being returned as null means that the modify field form has been canceled
      // in which case we should cancel spawning as well
      if (presetData == null) return;
    }

    // Populate preset data with default placeable data
    presetData = presetData.map((data) => {
      return mergePresetDataToDefaultDoc(preset, data);
    });
    presetData = presetData.map((d) => foundry.utils.flattenObject(d));
    if (!foundry.utils.isEmpty(preset.randomize)) await applyRandomization(presetData, null, preset.randomize); // Randomize data if needed
    await checkApplySpecialFields(preset.documentName, presetData, presetData); // Apply Special fields (TMFX)
    presetData = presetData.map((d) => foundry.utils.expandObject(d));

    if (preset.preSpawnScript) {
      await executeScript(preset.preSpawnScript, { data: presetData });
    }

    // Lets sort the preset data as well as any attached placeable data into document groups
    // documentName -> data array
    const docToData = new Map();
    docToData.set(preset.documentName, presetData);
    if (preset.attached) {
      for (const attached of preset.attached) {
        if (!docToData.get(attached.documentName)) docToData.set(attached.documentName, []);
        const data = foundry.utils.deepClone(attached.data);
        docToData.get(attached.documentName).push(data);
      }
    }

    // Regenerate links present within preset data. This will ensure uniqueness on the links
    // when placed on a scene
    if (preset.regenerateLinks) {
      const links = new Map();
      docToData.forEach((data) => {
        data.forEach((d) => {
          d.flags?.[MODULE_ID]?.links?.forEach((l) => {
            let id = links.get(l.id);
            if (!id) {
              id = foundry.utils.randomID();
              links.set(l.id, id);
            }
            l.id = id;
          });
        });
      });
    }

    // Scale data relative to grid size
    if (scaleToGrid) {
      const scale = canvas.grid.size / (preset.gridSize || 100);
      docToData.forEach((dataArr, documentName) => {
        dataArr.forEach((data) => DataTransform.apply(documentName, data, { x: 0, y: 0 }, { scale, gridScale: true }));
      });
    }

    // ==================
    // Determine spawn position
    if (coordPicker) {
      const coords = await new Promise(async (resolve) => {
        Picker.activate(resolve, {
          documentName: preset.documentName,
          previewData: docToData,
          snap: snapToGrid,
          label: pickerLabel,
          taPreview: taPreview,
          center,
          previewOnly,
          ...transform,
        });
      });
      if (coords == null) return [];
      x = coords.end.x;
      y = coords.end.y;
      if (coords.end.z != null) z = coords.end.z;
    } else if (x == null || y == null) {
      if (game.Levels3DPreview?._active) {
        const pos3d = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
        x = pos3d.x;
        y = pos3d.y;
        z = pos3d.z;
      } else {
        x = canvas.mousePosition.x;
        y = canvas.mousePosition.y;

        if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
          x -= canvas.dimensions.size / 2;
          y -= canvas.dimensions.size / 2;
        }
      }
    }

    // If not using coorPicker (Picker) we need to handle position snapping here
    if (!coordPicker) {
      if (center) {
        const offset = getPresetDataCenterOffset(docToData);
        x -= offset.x;
        y -= offset.y;
      }

      let pos = { x, y };

      if (snapToGrid && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
        // v12
        if (canvas.grid.getSnappedPoint) {
          pos = canvas.getLayerByEmbeddedName(preset.documentName).getSnappedPoint(pos);
        } else {
          pos = canvas.grid.getSnappedPosition(
            pos.x,
            pos.y,
            canvas.getLayerByEmbeddedName(preset.documentName).gridPrecision
          );
        }
      }
      pos.z = z;

      const posTransform = getTransformToOrigin(docToData);
      posTransform.x += pos.x;
      posTransform.y += pos.y;

      // 3D Support

      if (game.Levels3DPreview?._active) {
        if (pos.z == null) posTransform.z = 0;
        else posTransform.z += pos.z;
      }

      docToData.forEach((dataArr, documentName) => {
        dataArr.forEach((data) => {
          DataTransform.apply(documentName, data, { x: 0, y: 0 }, posTransform);
        });
      });
    }

    // Assign ownership to the user who triggered the spawn
    // And hide if necessary
    docToData.forEach((dataArr, documentName) => {
      dataArr.forEach((data) => {
        // Assign ownership for Drawings and MeasuredTemplates
        if (['Drawing', 'MeasuredTemplate'].includes(documentName)) {
          if (documentName === 'Drawing') data.author = game.user.id;
          else if (documentName === 'MeasuredTemplate') data.user = game.user.id;
        }

        // Hide
        if (hidden || game.keyboard.downKeys.has('AltLeft')) data.hidden = true;
      });
    });

    if (layerSwitch) {
      if (game.user.isGM || ['Token', 'MeasuredTemplate', 'Note'].includes(preset.documentName))
        canvas.getLayerByEmbeddedName(preset.documentName)?.activate();
    }

    // Create Documents
    const allDocuments = [];

    for (const [documentName, dataArr] of docToData.entries()) {
      const documents = await createDocuments(documentName, dataArr, sceneId);
      documents.forEach((d) => allDocuments.push(d));
    }

    // Execute post spawn script/function
    if (preset.postSpawnScript) {
      await executeScript(preset.postSpawnScript, {
        documents: allDocuments,
        objects: allDocuments.map((d) => d.object).filter(Boolean),
      });
    }
    await preset.callPostSpawnHooks({
      documents: allDocuments,
      objects: allDocuments.map((d) => d.object).filter(Boolean),
    });

    return allDocuments;
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
    const sorting = game.settings.get(MODULE_ID, 'presetSortMode') === 'manual' ? 'm' : 'a';
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
          if (!UI_DOCS.includes(preset.documentName)) preset._visible = false;
        } else if (type === 'FAVORITES') {
          if (!preset.isFavorite) preset._visible = false;
        } else if (preset.documentName !== type) preset._visible = false;
      }

      if (type === 'FAVORITES' && preset.folder && preset.isFavorite) {
        for (const [uuid, folder] of this.allFolders) {
          if (folder.id === preset.folder) {
            this._setChildAndParentFoldersVisible(folder);
            break;
          }
        }
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
