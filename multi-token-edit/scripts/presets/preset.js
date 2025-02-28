import { MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { is3DModel, isAudio, loadImageVideoDimensions } from '../utils.js';
import { META_INDEX_FIELDS, META_INDEX_ID, PresetTree } from './collection.js';
import { FileIndexer } from './fileIndexer.js';
import { decodeURIComponentSafely, isVideo, placeableToData } from './utils.js';

const DOCUMENT_FIELDS = ['id', 'name', 'sort', 'folder'];

export const PRESET_FIELDS = [
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
  'gridSize',
  'modifyOnSpawn',
  'preSpawnScript',
  'postSpawnScript',
  'spawnRandom',
  'attached',
  'tags',
  'preserveLinks',
];

export const DOC_ICONS = {
  ALL: 'fas fa-globe',
  Bag: 'fa-solid fa-sack',
  Token: 'fas fa-user-circle',
  MeasuredTemplate: 'fas fa-ruler-combined',
  Tile: 'fa-solid fa-cubes',
  Drawing: 'fa-solid fa-pencil-alt',
  Wall: 'fa-solid fa-block-brick',
  AmbientLight: 'fa-regular fa-lightbulb',
  AmbientSound: 'fa-solid fa-music',
  Note: 'fa-solid fa-bookmark',
  Region: 'fa-regular fa-game-board',
  Actor: 'fas fa-user-alt',
  Scene: 'fas fa-map',
  FauxScene: 'fas fa-map',
  DEFAULT: 'fa-solid fa-question',
};

export class Preset {
  static isEditable(uuid) {
    if (uuid.startsWith('virtual@')) return true;
    let { collection } = foundry.utils.parseUuid(uuid);
    if (!collection) return false;
    return !collection.locked;
  }

  constructor(data) {
    this.id = data.id ?? data._id ?? foundry.utils.randomID();
    this.name = data.name ?? 'Mass Edit Preset';
    this.documentName = data.documentName;
    this.sort = data.sort ?? 0;
    this.tags = data.tags ?? [];
    this.addSubtract =
      data.addSubtract instanceof Array
        ? Object.fromEntries(data.addSubtract)
        : foundry.utils.deepClone(data.addSubtract ?? {});
    this.randomize =
      data.randomize instanceof Array
        ? Object.fromEntries(data.randomize)
        : foundry.utils.deepClone(data.randomize ?? {});
    this.data = foundry.utils.deepClone(data.data);
    this.img = data.img;
    this.folder = data.folder;
    this.uuid = data.uuid;
    this.gridSize = data.gridSize;
    this.modifyOnSpawn = data.modifyOnSpawn;
    this.preSpawnScript = data.preSpawnScript;
    this.postSpawnScript = data.postSpawnScript;
    this.attached = data.attached;
    this.spawnRandom = data.spawnRandom;
    this.preserveLinks = data.preserveLinks;
    this._visible = true;
    this._render = true;
  }

  get visible() {
    return this._visible && this._render;
  }

  get icon() {
    return DOC_ICONS[this.documentName] ?? DOC_ICONS.DEFAULT;
  }

  get thumbnail() {
    if (!this.img) return CONST.DEFAULT_TOKEN;
    else if (isAudio(this.img)) return 'icons/svg/sound.svg';
    else if (isVideo(this.img)) return 'icons/svg/video.svg';
    return this.img;
  }

  get pages() {
    if (this.document?.pages.size) return this.document.toJSON().pages;
    else if (this._pages) return this._pages;
    return null;
  }

  set data(data) {
    if (data instanceof Array) this._data = data.length ? data : [{}];
    else if (data == null) this._data = [{}];
    else this._data = [data];
  }

  get data() {
    return this._data;
  }

  get isPlaceable() {
    return SUPPORTED_PLACEABLES.includes(this.documentName);
  }

  get isEmpty() {
    return foundry.utils.isEmpty(this.data[0]);
  }

  addPostSpawnHook(hook) {
    if (!this._postSpawnHooks) this._postSpawnHooks = [];
    this._postSpawnHooks.push(hook);
  }

  async callPostSpawnHooks(options) {
    if (this._postSpawnHooks) {
      for (const hook of this._postSpawnHooks) {
        await hook(options);
      }
    }
  }

  /**
   * Loads underlying JournalEntry document from the compendium
   * @returns this
   */
  async load(force = false, document) {
    if (this.document && !force) return this;
    if (!this.document && this.uuid) {
      this.document = document ?? (await fromUuid(this.uuid));
    }

    if (this.document) {
      const preset = this.document.getFlag(MODULE_ID, 'preset') ?? {};
      this.documentName = preset.documentName;
      this.img = preset.img;
      this.data = preset.data;
      this.randomize =
        foundry.utils.getType(preset.randomize) === 'Object'
          ? preset.randomize
          : Object.fromEntries(preset.randomize ?? []);
      this.addSubtract =
        foundry.utils.getType(preset.addSubtract) === 'Object'
          ? preset.addSubtract
          : Object.fromEntries(preset.addSubtract ?? []);
      this.gridSize = preset.gridSize;
      this.modifyOnSpawn = preset.modifyOnSpawn;
      this.preSpawnScript = preset.preSpawnScript;
      this.postSpawnScript = preset.postSpawnScript;
      this.attached = preset.attached;
      this.spawnRandom = preset.spawnRandom;
      this.preserveLinks = preset.preserveLinks;
      this.tags = preset.tags ?? [];
    }

    return this;
  }

  async openJournal() {
    if (!this.document) await this.load();
    if (this.document) this.document.sheet.render(true);
  }

  /**
   * Looks for a tag in the format of '#ft' and returns the numerical value
   * @returns
   */
  scenescapeSizeOverride() {
    const regex = new RegExp(/(\d+)ft/);
    let size = this.tags.find((t) => t.match(regex))?.match(regex)[1];
    if (!size && this.documentName === 'Token') {
      const actor = game.actors.get(this.data[0].actorId);
      if (actor) return Scenescape._getActorSize(actor, this.data[0]);
      return 6;
    }
    if (size) return Number(size);
    return null;
  }

  /**
   * Attach placeables
   * @param {Placeable|Array[Placeable]} placeables
   * @returns
   */
  async attach(placeables) {
    if (!placeables) return;
    if (!(placeables instanceof Array)) placeables = [placeables];

    if (!this.attached) this.attached = [];
    for (const placeable of placeables) {
      this.attached.push({ documentName: placeable.document.documentName, data: placeableToData(placeable) });
    }

    await this.update({ attached: this.attached });
  }

  static _updateBatch = {};

  /**
   * Collate document updates to be processed at a later time using `processBatchUpdates`
   * @param {Document} document
   * @param {object} update
   */
  static batchUpdate(document, update) {
    this._updateBatch[document.pack] = foundry.utils.mergeObject(this._updateBatch[document.pack] ?? {}, {
      [document.id]: update,
    });
  }

  /**
   * Process updates collated using `batchUpdate`
   */
  static async processBatchUpdates() {
    const batch = this._updateBatch;
    this._updateBatch = {};

    for (const pack of Object.keys(batch)) {
      const updates = [];

      for (const id of Object.keys(batch[pack])) {
        const update = batch[pack][id];
        update._id = id;
        updates.push(update);
      }

      await JournalEntry.updateDocuments(updates, { pack });
    }
  }

  /**
   * Update preset with the provided data
   * @param {Object} update
   */
  async update(update, batch = false) {
    if (this.document) {
      const flagUpdate = {};
      Object.keys(update).forEach((k) => {
        if (k === 'randomize' || k === 'addSubtract') {
          flagUpdate[k] = Object.entries(update[k]);
          this[k] = update[k];
        } else if (k === 'data' && !(update.data instanceof Array)) {
          flagUpdate.data = this.data.map((d) => {
            return foundry.utils.mergeObject(d, update.data);
          });
          this.data = flagUpdate.data;
        } else if (PRESET_FIELDS.includes(k) && update[k] !== this[k]) {
          flagUpdate[k] = update[k];
          this[k] = update[k];
        }
      });

      if (!foundry.utils.isEmpty(flagUpdate)) {
        const docUpdate = { flags: { [MODULE_ID]: { preset: flagUpdate } } };
        DOCUMENT_FIELDS.forEach((field) => {
          if (field in flagUpdate && this.document[field] !== flagUpdate[field]) {
            docUpdate[field] = flagUpdate[field];
          }
        });

        if (batch) Preset.batchUpdate(this.document, docUpdate);
        else await this.document.update(docUpdate);
      }
      await this._updateIndex(flagUpdate, batch);
    } else {
      console.warn('Updating preset without document', this.id, this.uuid, this.name);
    }
  }

  async _updateIndex(data, batch = false) {
    const update = {};

    META_INDEX_FIELDS.forEach((field) => {
      if (field in data) update[field] = data[field];
    });

    if (!foundry.utils.isEmpty(update)) {
      const pack = game.packs.get(this.document.pack);
      const metaDoc = await pack.getDocument(META_INDEX_ID);
      if (metaDoc) {
        if (batch) Preset.batchUpdate(metaDoc, { flags: { [MODULE_ID]: { index: { [this.id]: update } } } });
        else await metaDoc.setFlag(MODULE_ID, 'index', { [this.id]: update });
        delete PresetTree._packTrees[pack.metadata.name];
      } else {
        console.warn(`META INDEX missing in ${this.document.pack}`);
        return;
      }
    }
  }

  toJSON() {
    let json = {};
    PRESET_FIELDS.forEach((field) => {
      json[field] = foundry.utils.deepClone(this[field]);
    });

    json.randomize = Object.entries(json.randomize ?? {});
    json.addSubtract = Object.entries(json.addSubtract ?? {});
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

export class VirtualFilePreset extends Preset {
  constructor(data) {
    if (!data.name) data.name = data.src.split('/').pop();
    data.name = decodeURIComponentSafely(data.name);

    data.uuid = 'virtual@' + data.src;
    data.documentName = isAudio(data.src) ? 'AmbientSound' : 'Tile';

    if (!data.data) {
      if (data.documentName === 'Tile') {
        data.data = [{ texture: { src: data.src, scaleY: 1, scaleX: 1 }, x: 0, y: 0, rotation: 0 }];
      } else {
        data.data = [{ path: data.src, radius: 20, x: 0, y: 0 }];
      }
      data.img = data.thumb ?? data.src;
    }
    data.gridSize = 150;
    super(data);
  }

  get virtual() {
    return true;
  }

  async load(force = false) {
    const p = await FileIndexer.getPreset(this.uuid);
    if (p) this.tags = p.tags;
    this._storedReference = p;

    // Ambient Sound, no further processing required
    if (this.data[0].path) return this;

    // Width already determined, no further processing required
    if (this.data[0].width) return this;

    // Load image/video/3D Model metadata to retrieve dimensions
    const src = this.data[0].texture?.src;

    if (is3DModel(src) || foundry.utils.getProperty(this.data[0], 'flags.levels-3d-preview.model3d')) {
      await this._load3DModel(src, this.data[0]);
    } else {
      let { width, height } = await loadImageVideoDimensions(src);
      this.data[0].width = width ?? 100;
      this.data[0].height = height ?? 100;
    }

    return this;
  }

  async _load3DModel(src, data) {
    src = foundry.utils.getProperty(data, 'flags.levels-3d-preview.model3d') ?? src;
    if (!game.Levels3DPreview) {
      foundry.utils.setProperty(data, 'flags.levels-3d-preview.model3d', src);
      foundry.utils.setProperty(data, 'texture.src', 'modules/levels-3d-preview/assets/blank.webp');
      return;
    }

    data.flags = {
      'levels-3d-preview': {
        model3d: src,
        autoGround: true,
        autoCenter: false,
        cameraCollision: false,
        castShadow: true,
        collision: true,
        color: '#ffffff',
        dynaMesh: 'default',
        sight: true,
      },
    };

    const object3d = await game.Levels3DPreview.helpers.loadModel(src);
    const modelBB = new game.Levels3DPreview.THREE.Box3().setFromObject(object3d.model);
    const depth = (modelBB.max.y - modelBB.min.y) * canvas.grid.size;
    data.flags['levels-3d-preview'].depth = depth ?? 0.05;
    data.width = canvas.grid.size * (modelBB.max.x - modelBB.min.x);
    data.height = canvas.grid.size * (modelBB.max.z - modelBB.min.z);
    data.texture.src = `modules/levels-3d-preview/assets/blank.webp`;
  }

  async update(update) {
    if (!update.hasOwnProperty('tags')) return;

    if (this._storedReference) {
      this._storedReference.tags = update.tags;
      clearTimeout(VirtualFilePreset._updateTimeout);
      VirtualFilePreset._updateTimeout = setTimeout(() => FileIndexer.saveIndexToCache(), 3000);
    }
  }

  clone() {
    const data = this.toJSON();
    data.src = data.img;
    return new VirtualFilePreset(data);
  }
}
