import { showGenericForm } from '../../applications/multiConfig.js';
import { applyRandomization } from '../randomizer/randomizerUtils.js';
import { MODULE_ID, SUPPORTED_PLACEABLES } from '../utils.js';
import { Preset } from './preset.js';

/**
 * Tracking of folder open/close state
 */
export class FolderState {
  static expanded(uuid) {
    return game.folders._expanded[uuid];
  }

  static setExpanded(uuid, state) {
    game.folders._expanded[uuid] = state;
  }
}

/**
 * Convert provided placeable into an object usable as Preset data
 * @param {Placeable} placeable
 * @returns
 */
export function placeableToData(placeable) {
  const data = placeable.document.toCompendium();

  // Check if `Token Attacher` has attached elements to this token
  if (
    placeable.document.documentName === 'Token' &&
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
  }

  return data;
}

/**
 * Opens a GenericMassEdit form to modify specific fields within the provided data
 * @param {Object} data            data to be modified
 * @param {Array[String]} toModify fields within data to be modified
 * @returns modified data or null if form was canceled
 */
export async function modifySpawnData(data, toModify) {
  const fields = {};
  const flatData = foundry.utils.flattenObject(data);
  for (const field of toModify) {
    if (field in flatData) {
      if (flatData[field] == null) fields[field] = '';
      else fields[field] = flatData[field];
    }
  }

  if (!foundry.utils.isEmpty(fields)) {
    await new Promise((resolve) => {
      showGenericForm(fields, 'PresetFieldModify', {
        callback: (modified) => {
          if (foundry.utils.isEmpty(modified)) {
            if (modified == null) data = null;
            resolve();
            return;
          }

          for (const [k, v] of Object.entries(modified)) {
            flatData[k] = v;
          }

          const tmpData = foundry.utils.expandObject(flatData);

          const reorganizedData = [];
          for (let i = 0; i < data.length; i++) {
            reorganizedData.push(tmpData[i]);
          }
          data = reorganizedData;
          resolve();
        },
        simplified: true,
        noTabs: true,
      });
    });
  }

  return data;
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
    default:
      data = { x: 0, y: 0 };
  }

  return foundry.utils.mergeObject(data, presetData);
}

export async function randomizeChildrenFolderColors(uuid, tree, callback) {
  const folder = tree.allFolders.get(uuid);

  const children = folder.children;
  if (!children.length) return;

  const colorTemp = await renderTemplate(`modules/${MODULE_ID}/templates/randomizer/color.html`, {
    method: 'interpolateReverse',
    space: 'srgb',
    hue: 'longer',
  });

  let colorSlider;

  const applyColors = async function (method, space, hue) {
    const updates = children.map((c) => {
      return {
        color: '#000000',
      };
    });
    const randObj = { color: { type: 'color', method, space, hue, colors: colorSlider.getColors() } };

    await applyRandomization(updates, children, randObj);

    for (let i = 0; i < children.length; i++) {
      await children[i].update(updates[i]);
    }

    callback?.();
  };

  let dialog = new Dialog({
    title: `Pick Range`,
    content: `<form>${colorTemp}</form>`,
    buttons: {
      save: {
        label: 'Apply',
        callback: async (html) => {
          applyColors(
            html.find('[name="method"]').val(),
            html.find('[name="space"]').val(),
            html.find('[name="hue"]').val()
          );
        },
      },
    },
    render: (html) => {
      import('../randomizer/slider.js').then((module) => {
        colorSlider = new module.ColorSlider(html, [
          { hex: '#663600', offset: 0 },
          { hex: '#944f00', offset: 100 },
        ]);
        setTimeout(() => dialog.setPosition({ height: 'auto' }), 100);
      });
    },
  });

  dialog.render(true);
}

/**
 * Calculates the necessary x and y offsets to place the mouse within the center of the preset data
 * assuming the mouse is on the top-left corner of the first element
 * @param {Map<String, Array[Object]>} docToData
 * @returns
 */
export function getPresetDataCenterOffset(docToData) {
  const b = getPresetDataBounds(docToData);
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const transform = getTransformToOrigin(docToData);
  return { x: center.x + transform.x, y: center.y + transform.y };
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
  } else {
    transform.x = -data[0].x;
    transform.y = -data[0].y;
    if (game.Levels3DPreview?._active) {
      const height = data[0].elevation ?? data[0].flags?.levels?.rangeBottom ?? 0;
      transform.z = -height;
    }
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
  docToData.forEach((dataArr, documentName) => {
    for (const data of dataArr) {
      const b = getDataBounds(documentName, data);
      if (b.x1 < x1) x1 = b.x1;
      if (b.y1 < y1) y1 = b.y1;
      if (b.x2 > x2) x2 = b.x2;
      if (b.y2 > y2) y2 = b.y2;
    }
  });
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Calculates and returns bounds of placeable's data
 * @param {String} documentName
 * @param {Object} data
 * @returns
 */
function getDataBounds(documentName, data) {
  let x1, y1, x2, y2;

  if (documentName === 'Wall') {
    x1 = Math.min(data.c[0], data.c[2]);
    y1 = Math.min(data.c[1], data.c[3]);
    x2 = Math.max(data.c[0], data.c[2]);
    y2 = Math.max(data.c[1], data.c[3]);
  } else {
    x1 = data.x || 0;
    y1 = data.y || 0;

    let width, height;
    if (documentName === 'Tile') {
      width = data.width;
      height = data.height;
    } else if (documentName === 'Drawing') {
      width = data.shape.width;
      height = data.shape.height;
    } else if (documentName === 'Token') {
      width = data.width * canvas.dimensions.size;
      height = data.height * canvas.dimensions.size;
    } else {
      width = 0;
      height = 0;
    }

    x2 = x1 + (width || 0);
    y2 = y1 + (height || 0);
  }
  return { x1, y1, x2, y2 };
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
