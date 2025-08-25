import { MODULE_ID } from '../constants.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { is3DModel, isAudio, loadImageVideoDimensions } from '../utils.js';
import { FileIndexer } from './fileIndexer.js';
import { decodeURIComponentSafely, isVideo, placeableToData } from './utils.js';

export const DOCUMENT_FIELDS = ['id', 'name', 'sort', 'folder'];

export const PRESET_FIELDS = [
  'id',
  'name',
  'data',
  'sort',
  'folder',
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
  ALL: '<i class="fas fa-globe"></i>',
  Bag: '<i class="fa-solid fa-sack"></i>',
  Token: '<i class="fas fa-user-circle"></i>',
  MeasuredTemplate: '<i class="fas fa-ruler-combined"></i>',
  Tile: '<i class="fa-solid fa-cubes"></i>',
  Drawing: '<i class="fa-solid fa-pencil-alt"></i>',
  Wall: '<i class="fa-solid fa-block-brick"></i>',
  AmbientLight: '<i class="fa-regular fa-lightbulb"></i>',
  AmbientSound: '<i class="fa-solid fa-music"></i>',
  Note: '<i class="fa-solid fa-bookmark"></i>',
  Region: '<i class="fa-regular fa-game-board"></i>',
  Actor: '<i class="fas fa-user-alt"></i>',
  Scene: '<i class="fas fa-map"></i>',
  FauxScene: '<i class="fas fa-map"></i>',
  DEFAULT: '<i class="fa-solid fa-question"></i>',
};

export class Preset {
  // Tag to HTML string mappings used to render icons on Presets
  static _tagIcons = {};

  static registerTagIcons(tagToIcon) {
    Object.assign(Preset._tagIcons, tagToIcon);
  }

  static isEditable(uuid) {
    if (!uuid) return false;
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
  }

  get icons() {
    const icons = [DOC_ICONS[this.documentName] ?? DOC_ICONS.DEFAULT];
    this.tags.forEach((t) => {
      if (Preset._tagIcons[t]) icons.push(Preset._tagIcons[t]);
    });

    return icons;
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

  /**
   * Delete the preset along with the underlying document
   * @returns
   */
  async delete() {
    if (this.document) return this.document.delete();
    return (await fromUuid(this.uuid))?.delete();
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
        if (batch) Preset.batchUpdate(this.document, docUpdate);
        else await this.document.update(docUpdate);
      }
    } else {
      console.warn('FAILED UPDATE: Updating preset without document', this.id, this.uuid, this.name);
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
    clone._postSpawnHooks = this._postSpawnHooks;
    return clone;
  }
}

export class VirtualFilePreset extends Preset {
  /**
   * Constructs a VirtualFilePreset using the provided src/path of some media file
   * @param {string} src path to file
   * @param {string} forceType force preset into a specific document type (for now only forced to Token)
   * @returns
   */
  static fromSrc(src, forceType) {
    const documentName = forceType ?? (isAudio(src) ? 'AmbientSound' : 'Tile');

    let data;

    if (documentName === 'Tile' || documentName === 'Token')
      data = [{ texture: { src, scaleY: 1, scaleX: 1 }, x: 0, y: 0, rotation: 0 }];
    else data = [{ path: src, radius: 20, x: 0, y: 0 }];

    return new VirtualFilePreset({
      name: decodeURIComponentSafely(src.split('/').pop()),
      uuid: 'virtual@' + src,
      documentName,
      data,
      gridSize: 150,
      img: src,
    });
  }

  get virtual() {
    return true;
  }

  async load(force = false) {
    if (this._loaded) return;
    this._loaded = true;

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

    this.tags = update.tags;

    clearTimeout(VirtualFilePreset._updateTimeout);
    VirtualFilePreset._updateTimeout = setTimeout(() => FileIndexer.saveIndexToCache({ processAutoSave: true }), 3000);
  }

  clone() {
    const data = this.toJSON();
    const clone = new VirtualFilePreset(data);
    clone._loaded = this._loaded;
    clone._thumb = this._thumb;
    clone._postSpawnHooks = this._postSpawnHooks;
    return clone;
  }
}
