import { showGenericForm } from '../../applications/multiConfig.js';
import { applyRandomization } from '../randomizer/randomizerUtils.js';
import { ColorSlider } from '../randomizer/slider.js';
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

/**
 * Scales placeable data relative to current canvas size and the provided gridSize
 * @param {Object} data         placeable data
 * @param {String} documentName placeable document name
 * @param {Number} gridSize     grid size to scale relative to
 * @returns
 */
export function scaleDataToGrid(data, documentName, gridSize) {
  if (!SUPPORTED_PLACEABLES.includes(documentName)) return;
  if (!gridSize) gridSize = 100;

  const ratio = canvas.grid.size / gridSize;
  for (const d of data) {
    if ('x' in d) d.x *= ratio;
    if ('y' in d) d.y *= ratio;
    switch (documentName) {
      case 'Tile':
        if ('width' in d) d.width *= ratio;
        if ('height' in d) d.height *= ratio;
        break;
      case 'Drawing':
        if (d.shape?.width != null) d.shape.width *= ratio;
        if (d.shape?.height != null) d.shape.height *= ratio;
        break;
      case 'Wall':
        if ('c' in d) {
          for (let i = 0; i < d.c.length; i++) {
            d.c[i] *= ratio;
          }
        }
        break;
    }
  }
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
      data = { name: preset.name };
      break;
    case 'Tile':
      data = { width: canvas.grid.w, height: canvas.grid.h };
      break;
    case 'AmbientSound':
      data = { radius: 20 };
      break;
    case 'Drawing':
      data = {
        shape: {
          width: canvas.grid.w * 2,
          height: canvas.grid.h * 2,
          strokeWidth: 8,
          strokeAlpha: 1.0,
        },
      };
      break;
    case 'MeasuredTemplate':
      data = { distance: 10 };
      break;
    case 'AmbientLight':
      if (presetData.config?.dim == null && presetData.config?.bright == null) {
        data = { config: { dim: 20, bright: 20 } };
        break;
      }
    case 'Scene':
      data = { name: preset.name };
      break;
    default:
      data = {};
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
      colorSlider = new ColorSlider(html, [
        { hex: '#663600', offset: 0 },
        { hex: '#944f00', offset: 100 },
      ]);
      setTimeout(() => dialog.setPosition({ height: 'auto' }), 100);
    },
  });

  dialog.render(true);
}
