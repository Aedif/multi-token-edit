import { MODULE_ID, PIVOTS } from '../constants.js';
import { PresetStorage } from './collection.js';
import { Preset } from './preset.js';

/**
 * Convert provided placeable into an object usable as Preset data
 * @param {Placeable} placeable
 * @returns
 */
export function placeableToData(placeable) {
  const document = placeable.document ?? placeable;
  const data = document.toObject();

  // Check if `Token Attacher` has attached elements to this token
  if (
    document.documentName === 'Token' &&
    game.modules.get('token-attacher')?.active &&
    tokenAttacher?.generatePrototypeAttached
  ) {
    const attached = data.flags?.['token-attacher']?.attached || {};
    if (!foundry.utils.isEmpty(attached)) {
      const prototypeAttached = tokenAttacher.generatePrototypeAttached(data, attached);
      foundry.utils.setProperty(data, 'flags.token-attacher.attached', null);
      foundry.utils.setProperty(data, 'flags.token-attacher.prototypeAttached', prototypeAttached);
      foundry.utils.setProperty(data, 'flags.token-attacher.grid', {
        size: canvas.grid.size,
        w: canvas.grid.sizeX ?? canvas.grid.w, // v12
        h: canvas.grid.sizeY ?? canvas.grid.h, // v12
      });
    }
  } else if (document.documentName === 'Token') {
    // Scenescape data
    const width = foundry.utils.getProperty(data, `flags.${MODULE_ID}.width`);
    const height = foundry.utils.getProperty(data, `flags.${MODULE_ID}.height`);
    if (width) data.width = width;
    if (height) data.height = height;
  }

  return data;
}

/**
 * Portions of code taken from Tagger (https://github.com/fantasycalendar/FoundryVTT-Tagger)
 * Applies Tagger module's tag rules
 * @param {Array[String]} tags
 * @returns {Array[String]}
 */
export function applyTaggerTagRules(tags) {
  if (game.modules.get('tagger')?.active) {
    const rules = {
      /**
       * Replaces a portion of the tag with a number based on how many objects in this scene has the same numbered tag
       * @private
       */
      '{#}': (tag, regx) => {
        const findTag = new RegExp('^' + tag.replace(regx, '([1-9]+[0-9]*)') + '$');
        const existingDocuments = Tagger.getByTag(findTag);
        if (!existingDocuments.length) return tag.replace(regx, 1);

        const numbers = existingDocuments.map((existingDocument) => {
          return Number(
            Tagger.getTags(existingDocument)
              .find((tag) => {
                return tag.match(findTag);
              })
              .match(findTag)[1],
          );
        });

        const length = Math.max(...numbers) + 1;
        for (let i = 1; i <= length; i++) {
          if (!numbers.includes(i)) {
            return tag.replace(regx, i);
          }
        }
      },

      /**
       *  Replaces the section of the tag with a random ID
       *  @private
       */
      '{id}': (tag, regx, index) => {
        let id = temporaryIds?.[tag]?.[index];
        if (!id) {
          if (!temporaryIds?.[tag]) {
            temporaryIds[tag] = [];
          }
          id = foundry.utils.randomID();
          temporaryIds[tag].push(id);
        }
        return tag.replace(regx, id);
      },
    };

    const tagRules = Object.entries(rules).filter((entry) => {
      entry[0] = new RegExp(`${entry[0]}`, 'g');
      return entry;
    });

    tags = Tagger._validateTags(tags, 'TaggerHandler');

    tags = tags.map((tag, index) => {
      const applicableTagRules = tagRules.filter(([regx]) => {
        return tag.match(regx);
      });
      if (!applicableTagRules.length) return tag;

      applicableTagRules.forEach(([regx, method]) => {
        tag = method(tag, regx, index);
      });

      return tag;
    });
  }
  return tags;
}

/**
 * A Preset may not contain enough information within its data to spawn a placeable. This method populates
 * the data with some defaults so that a minimum viable placeable can be spawned.
 * @param {Preset} preset
 * @param {Object} presetData
 * @returns
 */
export function mergePresetDataToDefaultDoc(preset, presetData) {
  let data;

  // Set default values if needed
  switch (preset.documentName) {
    case 'Token':
      data = { name: preset.name, elevation: 0, x: 0, y: 0, rotation: 0, width: 1, height: 1 };
      break;
    case 'Tile':
      data = {
        texture: {
          scaleX: 1,
          scaleY: 1,
        },
        width: canvas.grid.sizeX ?? canvas.grid.w, // v12
        height: canvas.grid.sizeY ?? canvas.grid.h, // v12
        x: 0,
        y: 0,
        rotation: 0,
        elevation: 0,
      };
      break;
    case 'AmbientSound':
      data = { radius: 20, x: 0, y: 0 };
      break;
    case 'Drawing':
      data = {
        shape: {
          width: (canvas.grid.sizeX ?? canvas.grid.w) * 2, // v12
          height: (canvas.grid.sizeY ?? canvas.grid.h) * 2, // v12
          strokeWidth: 8,
          strokeAlpha: 1.0,
        },
        x: 0,
        y: 0,
        rotation: 0,
      };
      break;
    case 'MeasuredTemplate':
      data = { distance: 10, x: 0, y: 0 };
      break;
    case 'AmbientLight':
      data = { config: { dim: 20, bright: 20 }, x: 0, y: 0 };
      break;
    case 'Scene':
      data = { name: preset.name };
      break;
    case 'Wall':
      data = { c: [0, 0, canvas.grid.size, 0] };
      break;
    case 'Region':
      data = {
        name: preset.name,
        shapes: [
          {
            type: 'rectangle',
            hole: false,
            x: 0,
            y: 0,
            width: (canvas.grid.sizeX ?? canvas.grid.w) * 2,
            height: (canvas.grid.sizeX ?? canvas.grid.w) * 2,
            rotation: 0,
          },
        ],
      };
      break;
    default:
      data = { x: 0, y: 0 };
  }

  return foundry.utils.mergeObject(data, presetData);
}

/**
 * Returns a transform that return first element to x:0, y:0 (z: 0)
 * @param {Map<String, Array[Object]>} docToData
 * @returns
 */
export function getTransformToOrigin(docToData) {
  const [name, data] = docToData.entries().next().value;
  const transform = {};
  if (name === 'Wall') {
    const c = data[0].c;
    transform.x = -c[0];
    transform.y = -c[1];
    transform.z = 0;
  } else if (name === 'Region') {
    const b = getDataBounds(name, data[0]);
    transform.x = -b.x1;
    transform.y = -b.y1;
    transform.z = -b.z1;
  } else {
    transform.x = -data[0].x;
    transform.y = -data[0].y;
    transform.z = -(data[0].elevation ?? 0);
  }
  return transform;
}

/**
 * Calculates and returns the overall bounds of the preset data
 * @param {Map<String, Array[Object]>} docToData
 * @returns
 */
export function getPresetDataBounds(docToData) {
  let x1 = Number.MAX_SAFE_INTEGER;
  let y1 = Number.MAX_SAFE_INTEGER;
  let x2 = Number.MIN_SAFE_INTEGER;
  let y2 = Number.MIN_SAFE_INTEGER;
  let z1 = Number.MAX_SAFE_INTEGER;
  let z2 = Number.MIN_SAFE_INTEGER;
  docToData.forEach((dataArr, documentName) => {
    for (const data of dataArr) {
      const b = getDataBounds(documentName, data);
      if (b.x1 < x1) x1 = b.x1;
      if (b.y1 < y1) y1 = b.y1;
      if (b.x2 > x2) x2 = b.x2;
      if (b.y2 > y2) y2 = b.y2;
      if (b.z1 < z1) z1 = b.z1;
      if (b.z2 > z2) z2 = b.z2;
    }
  });
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1, elevation: { bottom: z1, top: z2 } };
}

/**
 * Calculates and returns bounds of placeable's data
 * @param {String} documentName
 * @param {Object} data
 * @returns
 */
export function getDataBounds(documentName, data) {
  let x1, y1, x2, y2, z1, z2;

  if (documentName === 'Wall') {
    x1 = Math.min(data.c[0], data.c[2]);
    y1 = Math.min(data.c[1], data.c[3]);
    x2 = Math.max(data.c[0], data.c[2]);
    y2 = Math.max(data.c[1], data.c[3]);
    z1 = 0;
    z2 = 0;
  } else if (documentName === 'Region') {
    x2 = -Infinity;
    y2 = -Infinity;
    x1 = Infinity;
    y1 = Infinity;
    z1 = data.elevation?.bottom ?? 0;
    z2 = data.elevation?.top ?? 0;
    data.shapes?.forEach((shape) => {
      if (shape.points) {
        for (let i = 0; i < shape.points.length; i += 2) {
          let x = shape.points[i];
          let y = shape.points[i + 1];
          x1 = Math.min(x1, x);
          y1 = Math.min(y1, y);
          x2 = Math.max(x2, x);
          y2 = Math.max(y2, y);
        }
      } else {
        x1 = Math.min(x1, shape.x);
        y1 = Math.min(y1, shape.y);
        x2 = Math.max(x2, shape.x + (shape.radiusX ?? shape.width));
        y2 = Math.max(y2, shape.y + (shape.radiusY ?? shape.height));
      }
    });
  } else {
    x1 = data.x || 0;
    y1 = data.y || 0;
    z1 = data.elevation ?? 0;

    let width, height;
    if (documentName === 'Tile') {
      width = data.width;
      height = data.height;
    } else if (documentName === 'Drawing') {
      width = data.shape.width;
      height = data.shape.height;
    } else if (documentName === 'Token') {
      if (data.flags?.[MODULE_ID]?.width != null) {
        width = data.flags[MODULE_ID].width;
      } else {
        width = data.width;
      }

      if (data.flags?.[MODULE_ID]?.height != null) {
        height = data.flags[MODULE_ID].height;
      } else {
        height = data.height;
      }

      width *= canvas.dimensions.size;
      height *= canvas.dimensions.size;
    } else {
      width = 0;
      height = 0;
    }

    x2 = x1 + (width || 0);
    y2 = y1 + (height || 0);
    z2 = z1;
  }
  return { x1, y1, x2, y2, z1, z2, x: x1, y: y1, width: x2 - x1, height: y2 - y1, elevation: { bottom: z1, top: z2 } };
}

export function isImage(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(extension);
}

export function isVideo(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['mp4', 'ogg', 'webm', 'm4v'].includes(extension);
}

export function decodeURIComponentSafely(uri) {
  try {
    return decodeURIComponent(uri);
  } catch (e) {
    console.warn('URI Component not decodable: ' + uri);
    return uri;
  }
}

export function encodeURIComponentSafely(uri) {
  try {
    return encodeURIComponent(uri);
  } catch (e) {
    console.warn('URI Component not encodable: ' + uri);
    return uri;
  }
}

export async function readJSONFile(url) {
  try {
    return await jQuery.getJSON(url);
  } catch (e) {}
  return null;
}

/**
 * Handle dropping of AmbientSound presets onto the sidebar playlists
 */
export function registerSideBarPresetDropListener() {
  // TODO v13
  return;

  Hooks.on('renderSidebar', (sidebar, html) => {
    if (!game.user.isGM) return;
    html.on('drop', async (event) => {
      const playlistId = $(event.target).closest('.directory-item.playlist').data('document-id');
      if (!playlistId) return;
      const playlist = game.playlists.get(playlistId);
      if (!playlist) return;

      let data = event.originalEvent.dataTransfer.getData('text/plain');
      if (!data) return;
      data = JSON.parse(data);

      let presets = (await PresetStorage.retrieve({ uuid: data.uuids })).filter(
        (p) => p.documentName === 'AmbientSound',
      );

      await PresetStorage.batchLoad(presets);

      const updates = [];

      presets.forEach((p) => {
        p.data.forEach((d) => {
          if (d.path) {
            updates.push({
              name: p.name,
              path: d.path,
              channel: 'music',
              repeat: false,
              fade: null,
              description: 'Mass Edit Preset',
              volume: 0.52,
              playing: false,
              pausedTime: null,
              flags: {},
            });
          }
        });
      });

      PlaylistSound.create(updates, { parent: playlist });
    });
  });
}

export function getPivotOffset(pivot, docToData, bounds) {
  const { width, height } = bounds ?? getPresetDataBounds(docToData);
  switch (pivot) {
    case PIVOTS.TOP_LEFT:
      return { x: 0, y: 0 };
    case PIVOTS.TOP:
      return { x: width / 2, y: 0 };
    case PIVOTS.TOP_RIGHT:
      return { x: width, y: 0 };
    case PIVOTS.LEFT:
      return { x: 0, y: height / 2 };
    case PIVOTS.CENTER:
      return { x: width / 2, y: height / 2 };
    case PIVOTS.RIGHT:
      return { x: height, y: height / 2 };
    case PIVOTS.BOTTOM_LEFT:
      return { x: 0, y: height };
    case PIVOTS.BOTTOM:
      return { x: width / 2, y: height };
    case PIVOTS.BOTTOM_RIGHT:
      return { x: width, y: height };
  }

  return { x: 0, y: 0 };
}

/**
 * Get pivot coordinate for the given bounds/doc-to-data map
 * @param {PIVOT} pivot
 * @param {Map<string, Array[object]>} docToData
 * @param {object} bounds
 * @returns
 */
export function getPivotPoint(pivot, docToData, bounds) {
  bounds = bounds ?? getPresetDataBounds(docToData);
  const offset = getPivotOffset(pivot, docToData, bounds);
  return { x: bounds.x + offset.x, y: bounds.y + offset.y };
}

/**
 * Get pivot coordinate for the given placeable data
 * @param {string} documentName
 * @param {object} data
 * @param {PIVOTS} pivot
 * @returns
 */
export function getDataPivotPoint(documentName, data, pivot) {
  const bounds = getDataBounds(documentName, data);
  const offset = getPivotOffset(pivot, null, bounds);
  return { x: bounds.x1 + offset.x, y: bounds.y1 + offset.y };
}

export async function exportPresets(presets, { fileName, json = false, load = true } = {}) {
  if (!presets.length) return;

  if (load) await PresetStorage.batchLoad(presets);

  presets = presets.map((p) => {
    return p.toJSON();
  });

  if (json) return presets;

  foundry.utils.saveDataToFile(
    JSON.stringify(presets, null, 2),
    'text/json',
    (fileName ?? 'mass-edit-presets') + '.json',
  );
}

export async function importSceneCompendium(scenePack, presetPack) {
  const compendium = game.packs.get(scenePack) ?? game.packs.getName(scenePack);
  if (!compendium) throw Error('Invalid scene pack: ' + pack);
  if (compendium.documentName !== 'Scene') throw Error('Pack provided is not a Scene compendium: ' + pack);

  const presets = [];

  // const index = workingPackTree.metaDoc?.flags[MODULE_ID].index;
  const packIndex = (game.packs.get(presetPack) ?? game.packs.getName(presetPack))?.index;
  if (!packIndex) throw Error('Invalid preset pack: ' + presetPack);

  let alreadyImportedCount = 0;
  let nameUpdatedCount = 0;

  for (const i of compendium.index) {
    const jIndex = packIndex.get(i._id);

    if (!jIndex) {
      const preset = new Preset({
        documentName: 'FauxScene',
        id: i._id,
        name: i.name,
        img: i.thumb,
        data: [
          {
            uuid: i.uuid,
          },
        ],
      });
      presets.push(preset);
    } else if (jIndex.name !== i.name) {
      const preset = await PresetStorage.retrieveSingle({ uuid: jIndex.uuid, load: true });
      if (preset) {
        console.log(preset.name, ' -> ', i.name);
        preset.update({ name: i.name }, true);
        nameUpdatedCount++;
      }
    } else {
      alreadyImportedCount++;
    }
  }

  await PresetStorage.createDocuments(presets, presetPack);

  ui.notifications.info(`Imported scenes: ${presets.length}/${alreadyImportedCount + presets.length}`);
  if (nameUpdatedCount) {
    await Preset.processBatchUpdates();
    ui.notifications.info(`Updated FauxScene names: ${nameUpdatedCount}`);
  }
}

export async function sceneNotFoundError(preset) {
  let dialog = null;

  for (const message of MassEdit.registers._sceneNotFoundMessages) {
    if (!(message.query && message.content)) continue;
    let p = await PresetStorage.retrieve({ presets: [preset], query: message.query });
    if (p.length) {
      dialog = true;

      const content = message.content.replace('{{name}}', preset.name);

      foundry.applications.api.DialogV2.prompt({
        window: { title: message.title }, // FIXME: double localization
        position: { width: 480 },
        content,
      });
      break;
    }
  }

  if (!dialog) ui.notifications.warn('Unable to load scene: ' + preset.name);
}

/**
 * Modified Foundry's Hooks.call(...) function to support calling and awaiting of asynchronous hooks
 * @param {string} hook
 * @param  {...any} args
 * @returns
 */
export async function callAsyncHook(hook, ...args) {
  if (CONFIG.debug.hooks) {
    console.log(`DEBUG | Calling async ${hook} hook with args:`);
    console.log(args);
  }

  if (!(hook in Hooks.events)) return true;

  for (const entry of Array.from(Hooks.events[hook])) {
    const { hook, id, fn, once } = entry;
    if (once) Hooks.off(hook, id);
    try {
      const result = await entry.fn(...args);
      if (result === false) return false;
    } catch (err) {
      const msg = `Error thrown in hooked function '${fn?.name}' for hook '${hook}'`;
      console.warn(`${CONST.vtt} | ${msg}`);
      if (hook !== 'error') Hooks.onError('Hooks.callAsyncHook', err, { msg, hook, fn, log: 'error' });
    }
  }

  return true;
}
