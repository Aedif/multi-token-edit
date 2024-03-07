import { Brush } from '../brush.js';
import { Picker } from '../picker.js';
import { applyRandomization } from '../randomizer/randomizerUtils.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, UI_DOCS, createDocuments, executeScript, localize } from '../utils.js';
import { Preset } from './preset.js';
import {
  FolderState,
  mergePresetDataToDefaultDoc,
  modifySpawnData,
  placeableToData,
  scaleDataToGrid,
} from './utils.js';

export const DEFAULT_PACK = 'world.mass-edit-presets-main';
export const META_INDEX_ID = 'MassEditMetaData';
export const META_INDEX_FIELDS = ['id', 'img', 'documentName'];

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
            expanded: FolderState.expanded(p.collection),
            folder: null,
            visible: true,
            render: true,
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
        expanded: FolderState.expanded(f.uuid),
        folder: f.folder?.uuid,
        visible: type ? (f.flags[MODULE_ID]?.types || ['ALL']).includes(type) : true,
        render: true,
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
        await preset.load();
        if (!preset.documentName) continue;
        if (!pack.locked) preset._updateIndex(preset); // Insert missing preset into metadata index
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

      if (type) {
        if (type === 'ALL') {
          if (!UI_DOCS.includes(preset.documentName)) preset._visible = false;
        } else if (preset.documentName !== type) preset._visible = false;
      }

      allPresets.push(preset);
      hasVisible |= preset._visible;
    }

    // Sort folders
    const sorting = game.settings.get(MODULE_ID, 'presetSortMode') === 'manual' ? 'm' : 'a';
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

  // Fixing meta index by removing loose indexes
  // 06/03/2024
  static async _cleanIndex(pack, metaDoc, metaIndex) {
    if (pack.locked || !metaDoc || foundry.utils.isEmpty(metaIndex)) return;
    const index = pack.index;

    const update = {};
    for (const idx of Object.keys(metaIndex)) {
      if (!index.has(idx)) update['-=' + idx] = null;
    }

    if (!foundry.utils.isEmpty(update)) metaDoc.setFlag(MODULE_ID, 'index', update);
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
    update[preset.id] = {
      id: preset.id,
      img: preset.img,
      documentName: preset.documentName,
    };

    await metaDoc.setFlag(MODULE_ID, 'index', update);
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
    update[preset.id] = {
      id: preset.id,
      img: preset.img,
      documentName: preset.documentName,
    };

    await metaDoc.setFlag(MODULE_ID, 'index', update);
  }

  static async get(uuid, { full = true } = {}) {
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

      const deleteIds = [];
      for (const preset of sorted[pack]) {
        deleteIds.push(preset.id);
        metaUpdate['-=' + preset.id] = null;
      }

      await JournalEntry.deleteDocuments(deleteIds, { pack });
      metaDoc.setFlag(MODULE_ID, 'index', metaUpdate);
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

  /**
   * Build preset index for 'Spotlight Omnisearch' module
   * @param {Array[CONFIG.SpotlightOmniseach.SearchTerm]} soIndex
   */
  static async buildSpotlightOmnisearchIndex(soIndex) {
    const tree = await PresetCollection.getTree();

    const SearchTerm = CONFIG.SpotlightOmniseach.SearchTerm;

    const onClick = async function () {
      ui.spotlightOmnisearch?.setDraggingState(true);
      await PresetAPI.spawnPreset({
        preset: this.data,
        coordPicker: true,
        taPreview: 'ALL',
        scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
      });
      ui.spotlightOmnisearch?.setDraggingState(false);
    };

    const onDragEnd = function (event) {
      const { x, y } = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      PresetAPI.spawnPreset({ preset: this.data, x, y, scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling') });
    };

    const deactivateCallback = function () {
      ui.spotlightOmnisearch?.setDraggingState(false);
    };

    const buildTerm = function (preset) {
      const isPlaceable = SUPPORTED_PLACEABLES.includes(preset.documentName);

      const term = new SearchTerm({
        name: preset.name,
        type: isPlaceable ? preset.documentName : 'preset',
        img: preset.img,
        icon: ['fa-solid fa-books', preset.icon],
        onClick,
        onDragEnd,
        data: preset,
        description: 'Mass Edit: Preset',
      });

      const actions = [
        {
          name: 'MassEdit.presets.open-journal',
          icon: '<i class="fas fa-book-open fa-fw"></i>',
          preset,
          callback: function () {
            this.preset.openJournal();
          },
        },
      ];
      if (isPlaceable) {
        actions.push({
          name: `MassEdit.presets.controls.activate-brush`,
          icon: '<i class="fas fa-paint-brush"></i>',
          preset,
          callback: async function () {
            if (SUPPORTED_PLACEABLES.includes(this.preset.documentName)) {
              canvas.getLayerByEmbeddedName(preset.documentName)?.activate();
            }
            if (Brush.activate({ preset: await this.preset.load(), deactivateCallback })) {
              ui.spotlightOmnisearch.setDraggingState(true);
            }
          },
        });
      }

      term.actions = actions;
      soIndex.push(term);
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
        name: localize('presets.default-name'),
        documentName: docName,
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
   * @param {Preset} [options.preset]             Preset
   * @param {String} [options.uuid]               Preset UUID
   * @param {String} [options.name]               Preset name
   * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
   * @param {Number} [options.x]                  Spawn canvas x coordinate (mouse position used if x or y are null)
   * @param {Number} [options.y]                  Spawn canvas y coordinate (mouse position used if x or y are null)
   * @param {Number} [options.z]                  Spawn canvas z coordinate (3D Canvas)
   * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
   * @param {Boolean} [options.layerSwitch]       If 'true' the layer of the spawned preset will be activated.
   * @param {Boolean} [options.scaleToGrid]       If 'true' Tiles, Drawings, and Walls will be scaled relative to grid size.
   * @param {Boolean} [options.modifyPrompt]      If 'true' a field modification prompt will be shown if configured via `Preset Edit > Modify` form
   * @param {Boolean} [options.coordPicker]       If 'true' a crosshair and preview will be enabled allowing spawn position to be picked
   * @param {String} [options.pickerLabel]          Label displayed above crosshair when `coordPicker` is enabled
   * @param {String} [options.taPreview]            Designates the preview placeable when spawning a `Token Attacher` prefab.
   *                                                Accepted values are "ALL" (for all elements) and document name optionally followed by an index number
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
    z,
    coordPicker = false,
    pickerLabel,
    taPreview,
    snapToGrid = true,
    hidden = false,
    layerSwitch = false,
    scaleToGrid = false,
    modifyPrompt = true,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(uuid || preset || name || type || folder)) throw Error('ID, Name, Folder, or Preset is needed to spawn it.');
    if (!coordPicker && ((x == null && y != null) || (x != null && y == null)))
      throw Error('Need both X and Y coordinates to spawn a preset.');

    if (preset) await preset.load();
    preset = preset ?? (await PresetAPI.getPreset({ uuid, name, type, folder }));
    if (!preset) throw Error(`No preset could be found matching: { uuid: "${uuid}", name: "${name}", type: "${type}"}`);

    let presetData = deepClone(preset.data);

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

    // Randomize data if needed
    const randomizer = preset.randomize;
    if (!foundry.utils.isEmpty(randomizer)) {
      // Flat data required for randomizer
      presetData = presetData.map((d) => foundry.utils.flattenObject(d));
      await applyRandomization(presetData, null, randomizer);
      presetData = presetData.map((d) => foundry.utils.expandObject(d));
    }

    // Scale dimensions relative to grid size
    if (scaleToGrid) {
      scaleDataToGrid(presetData, preset.documentName, preset.gridSize);
    }

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
        const data = deepClone(attached.data);
        if (scaleToGrid) scaleDataToGrid([data], attached.documentName, preset.gridSize);
        docToData.get(attached.documentName).push(data);
      }
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
        });
      });
      if (coords == null) return [];
      x = coords.end.x;
      y = coords.end.y;
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

    let pos = { x, y };

    if (snapToGrid && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
      pos = canvas.grid.getSnappedPosition(
        pos.x,
        pos.y,
        canvas.getLayerByEmbeddedName(preset.documentName).gridPrecision
      );
    }
    // ==================

    // ==================
    // Set positions taking into account relative distances between each object
    let diffX, diffY, diffZ;
    docToData.forEach((dataArr, documentName) => {
      for (const data of dataArr) {
        // We need to establish the first found coordinate as the reference point
        if (diffX == null || diffY == null) {
          if (documentName === 'Wall') {
            if (data.c) {
              diffX = pos.x - data.c[0];
              diffY = pos.y - data.c[1];
            }
          } else {
            if (data.x != null && data.y != null) {
              diffX = pos.x - data.x;
              diffY = pos.y - data.y;
            }
          }

          // 3D Canvas
          if (z != null) {
            const property = documentName === 'Token' ? 'elevation' : 'flags.levels.rangeBottom';
            if (getProperty(data, property) != null) {
              diffZ = z - getProperty(data, property);
            }
          }
        }

        // Assign relative position
        if (documentName === 'Wall') {
          if (!data.c || diffX == null) data.c = [pos.x, pos.y, pos.x + canvas.grid.w * 2, pos.y];
          else {
            data.c[0] += diffX;
            data.c[1] += diffY;
            data.c[2] += diffX;
            data.c[3] += diffY;
          }
        } else {
          data.x = data.x == null || diffX == null ? pos.x : data.x + diffX;
          data.y = data.y == null || diffY == null ? pos.y : data.y + diffY;
        }

        // 3D Canvas
        if (z != null) {
          delete data.z;
          let elevation;

          const property = documentName === 'Token' ? 'elevation' : 'flags.levels.rangeBottom';

          if (diffZ !== null && getProperty(data, property) != null) elevation = getProperty(data, property) + diffZ;
          else elevation = z;

          setProperty(data, property, elevation);

          if (documentName !== 'Token') {
            setProperty(data, 'flags.levels.rangeTop', elevation);
          }
        }

        // Assign ownership for Drawings and MeasuredTemplates
        if (['Drawing', 'MeasuredTemplate'].includes(documentName)) {
          if (documentName === 'Drawing') data.author = game.user.id;
          else if (documentName === 'MeasuredTemplate') data.user = game.user.id;
        }

        // Hide
        if (hidden || game.keyboard.downKeys.has('AltLeft')) data.hidden = true;
      }
    });

    // ==================

    if (layerSwitch) {
      if (game.user.isGM || ['Token', 'MeasuredTemplate', 'Note'].includes(preset.documentName))
        canvas.getLayerByEmbeddedName(preset.documentName)?.activate();
    }

    // Create Documents
    const allDocuments = [];

    for (const [documentName, dataArr] of docToData.entries()) {
      const documents = await createDocuments(documentName, dataArr, canvas.scene.id);
      documents.forEach((d) => allDocuments.push(d));
    }

    // Execute post spawn scripts
    if (preset.postSpawnScript) {
      await executeScript(preset.postSpawnScript, {
        documents: allDocuments,
        objects: documents.map((d) => d.object).filter(Boolean),
      });
    }

    return allDocuments;
  }
}
