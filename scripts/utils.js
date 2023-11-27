import { GeneralDataAdapter } from '../applications/dataAdapters.js';
import { MassEditPresets } from '../applications/presets.js';
import { applyRandomization } from './randomizer/randomizerUtils.js';

export const SUPPORTED_PLACEABLES = [
  'Token',
  'MeasuredTemplate',
  'Tile',
  'Drawing',
  'Wall',
  'AmbientLight',
  'AmbientSound',
  'Note',
];

// TODO add 'Actor'
export const UI_DOCS = ['ALL', ...SUPPORTED_PLACEABLES];

export const SUPPORT_SHEET_CONFIGS = [...SUPPORTED_PLACEABLES, 'Actor', 'PlaylistSound', 'Scene'];

export const SUPPORTED_HISTORY_DOCS = [...SUPPORTED_PLACEABLES, 'Scene', 'Actor', 'PlaylistSound'];

export const SUPPORTED_COLLECTIONS = [
  'Item',
  'Cards',
  'RollTable',
  'Actor',
  'JournalEntry',
  'Scene',
];

export function interpolateColor(u, c1, c2) {
  return c1.map((a, i) => Math.floor((1 - u) * a + u * c2[i]));
}

/**
 * Returns true of provided path points to an image
 */
export function isImage(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(extension);
}

/**
 * Returns true of provided path points to a video
 */
export function isVideo(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['mp4', 'ogg', 'webm', 'm4v'].includes(extension);
}

export async function recursiveTraverse(path, source, bucket, files = []) {
  const result = await FilePicker.browse(source, path, {
    bucket: bucket,
  });

  if (result) {
    for (const file of result.files) {
      files.push(file);
    }

    for (const dir of result.dirs) {
      await recursiveTraverse(dir, source, bucket, files);
    }
  }

  return files;
}

// To get rid of v10 warnings
export function getData(obj) {
  return obj.document ? obj.document : obj;
}

// Flags are stored inconsistently. Absence of a flag, being set to null, undefined, empty object or empty string
// should all be considered equal
export function flagCompare(data, flag, flagVal) {
  if (data[flag] == flagVal) return true;

  const falseyFlagVal =
    flagVal == null ||
    flagVal === false ||
    flagVal === '' ||
    (getType(flagVal) === 'Object' && isEmpty(flagVal));

  const falseyDataVal =
    data[flag] == null ||
    data[flag] === false ||
    data[flag] === '' ||
    (getType(data[flag]) === 'Object' && isEmpty(data[flag]));

  if (falseyFlagVal && falseyDataVal) return true;

  // Special treatment for Tagger module's tags
  // Instead of directly comparing string we check if it contains the string
  if (flag === 'flags.tagger.tags') {
    const tags = data[flag] || [];
    let compTags = flagVal;
    if (!Array.isArray(compTags)) {
      compTags = flagVal ? flagVal.split(',').map((s) => s.trim()) : [];
    }
    for (const t of compTags) {
      if (!tags.includes(t)) return false;
    }
    return true;
  }

  if (flagVal && typeof flagVal === 'string' && flagVal.includes('*')) {
    return wildcardStringMatch(flagVal, data[flag]);
  }

  return false;
}

export function hasFlagRemove(flag, formData) {
  const comp = flag.split('.');
  for (let i = comp.length - 1; i >= 1; i--) {
    const tempFlag = comp.slice(0, i).join('.') + '.-=' + comp[i];
    if (tempFlag in formData) {
      return tempFlag;
    }
  }
  return null;
}

export function selectAddSubtractFields(form, fields) {
  if (!fields) return;
  for (const key of Object.keys(fields)) {
    form
      .find(`[name="${key}"]`)
      .removeClass('me-add')
      .removeClass('me-subtract')
      .addClass(fields[key].method === 'add' ? 'me-add' : 'me-subtract')
      .attr('title', fields[key].method === 'add' ? '+ Adding' : '- Subtracting');
  }
}

export function applyAddSubtract(updates, objects, docName, addSubtractFields) {
  // See if any field need to be added or subtracted
  if (!addSubtractFields || isEmpty(addSubtractFields)) return;

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const data = flattenObject(getData(objects[i]).toObject());

    GeneralDataAdapter.dataToForm(docName, objects[i], data);

    for (const field of Object.keys(update)) {
      if (field in addSubtractFields && field in data) {
        const ctrl = addSubtractFields[field];
        let val = data[field];

        // Special processing for Tagger module fields
        if (field === 'flags.tagger.tags') {
          const currentTags = Array.isArray(val)
            ? val
            : (val ?? '').split(',').map((s) => s.trim());
          const modTags = (update[field] ?? '').split(',').map((s) => s.trim());
          for (const tag of modTags) {
            if (ctrl.method === 'add') {
              if (!currentTags.includes(tag)) currentTags.push(tag);
            } else if (ctrl.method === 'subtract') {
              const index = currentTags.indexOf(tag);
              if (index > -1) currentTags.splice(index, 1);
            }
          }
          update[field] = currentTags.filter((t) => t).join(',');
          continue;
        } else if (ctrl.type === 'text') {
          if (ctrl.method === 'add') {
            const toAdd = 'value' in ctrl ? ctrl.value : update[field];
            if (toAdd.startsWith('>>')) {
              val = toAdd.replace('>>', '') + val;
            } else {
              val += toAdd;
            }
          } else {
            val = val.replace('value' in ctrl ? ctrl.value : update[field], '');
          }
          update[field] = val;
          continue;
        }

        if (ctrl.method === 'add') {
          val += 'value' in ctrl ? ctrl.value : update[field];
        } else {
          val -= 'value' in ctrl ? ctrl.value : update[field];
        }
        if ('min' in ctrl && val < ctrl.min) {
          val = ctrl.min;
        } else if ('max' in ctrl && val > ctrl.max) {
          val = ctrl.max;
        }
        update[field] = val;
      }
    }
  }
}

export function getCommonData(objects) {
  if (!objects || !objects.length) return {};
  const commonData = flattenObject(objects[0]);
  for (let i = 1; i < objects.length; i++) {
    const diff = flattenObject(diffObject(commonData, flattenObject(objects[i])));
    for (const k of Object.keys(diff)) {
      // Special handling for empty/undefined data
      if ((diff[k] === '' || diff[k] == null) && (commonData[k] === '' || commonData[k] == null)) {
        // matches, do not remove
      } else {
        delete commonData[k];
      }
    }
  }
  return commonData;
}

/**
 * Merges 'other' into 'original' without expanding and duplicating the 'original' if it contains dot notation using keys
 */
export function mergeObjectPreserveDot(original, other = {}, nestedKey = '') {
  if (!other) return;
  for (const [key, val] of Object.entries(original)) {
    const fullKey = nestedKey ? nestedKey + '.' + key : key;
    const t = getType(val);
    if (t === 'Object') mergeObjectPreserveDot(val, other, fullKey);
    else {
      const prop = getProperty(other, fullKey);
      if (prop !== undefined) {
        original[key] = prop;
      }
    }
  }
}

export function panToFitPlaceables(placeables) {
  placeables = placeables.map((p) => p.object ?? p).filter((p) => p.center);
  if (placeables.length) {
    if (placeables.length === 1) {
      if (placeables[0].center?.x) {
        canvas.animatePan({ x: placeables[0].center.x, y: placeables[0].center.y, duration: 250 });
      }
    } else {
      // Determine top left and bottom right corners to later determine the view's center position and scale
      const topLeft = { x: 999999999, y: 999999999 };
      const bottomRight = { x: -999999999, y: -999999999 };

      for (let p of placeables) {
        let tlc = p;
        if (p instanceof Wall) {
          tlc = { x: p.center.x - p.width / 2, y: p.center.y - p.height / 2 };
        }

        if (tlc.x < topLeft.x) topLeft.x = tlc.x;
        if (tlc.y < topLeft.y) topLeft.y = tlc.y;
        if (tlc.x + p.width > bottomRight.x) bottomRight.x = tlc.x + p.width;
        if (tlc.y + p.height > bottomRight.y) bottomRight.y = tlc.y + p.height;
      }

      // Checking if screen at current scale fits placeables along x and y axis
      let scale = canvas.scene._viewPosition.scale;
      // Adjust the size of the rectangle that placeable occupy in our scale calculations
      // to account for UI elements
      const padding = 100;
      if (bottomRight.x - topLeft.x + padding > canvas.screenDimensions[0] / scale) {
        scale = canvas.screenDimensions[0] / (bottomRight.x - topLeft.x + padding);
      }
      if (bottomRight.y - topLeft.y + padding > canvas.screenDimensions[1] / scale) {
        scale = canvas.screenDimensions[1] / (bottomRight.y - topLeft.y + padding);
      }

      canvas.animatePan({
        duration: 250,
        scale,
        x: (bottomRight.x - topLeft.x) / 2 + topLeft.x,
        y: (bottomRight.y - topLeft.y) / 2 + topLeft.y,
      });
    }
  }
}

/**
 * Returns a hash code from a string
 * @param  {String} str The string to hash.
 * @return {Number}    A 32bit integer
 * @see http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 */
export function hashCode(str) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function escapeRegex(string) {
  return string.replace(/[/\-\\^$+?.()|[\]{}]/g, '\\$&');
}

export function wildcardStringMatch(sw, s2) {
  return new RegExp('^' + escapeRegex(sw).replaceAll('*', '.*') + '$').test(s2);
}

export function wildcardStringReplace(sw, replaceWith, s2) {
  let re = new RegExp(escapeRegex(sw).replaceAll('*', '.*'), 'g');
  return s2.replaceAll(re, replaceWith);
}

export function regexStringReplace(sw, replaceWith, s2) {
  try {
    let re = new RegExp(sw, 'g');
    return s2.replaceAll(re, replaceWith);
  } catch (e) {}
  return s2;
}

export function flattenToDepth(obj, d = 0) {
  if (d === 0) return obj;

  const flat = {};
  for (let [k, v] of Object.entries(obj)) {
    let t = getType(v);
    if (t === 'Object') {
      if (isEmpty(v)) flat[k] = v;
      let inner = flattenToDepth(v, d - 1);
      for (let [ik, iv] of Object.entries(inner)) {
        flat[`${k}.${ik}`] = iv;
      }
    } else flat[k] = v;
  }
  return flat;
}

// TODO
export function activeEffectPresetSelect(aeConfig) {
  const showPresetGeneric = function (docName) {
    new MassEditPresets(
      aeConfig,
      (preset) => {
        if (!isEmpty(preset.randomize)) {
          applyRandomization([preset.data], null, preset.randomize);
        }

        const changes = aeConfig.object.changes ?? [];
        let nChanges = [];

        Object.keys(preset.data).forEach((k) => {
          let value;
          if (getType(preset.data[k]) === 'string') value = preset.data[k];
          else value = JSON.stringify(preset.data[k]);

          nChanges.push({
            key: docName === 'Token' ? 'ATL.' + k : k,
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            priority: 20,
            value,
          });
        });

        for (let i = changes.length - 1; i >= 0; i--) {
          if (!nChanges.find((nc) => nc.key === changes[i].key)) nChanges.unshift(changes[i]);
        }

        aeConfig.object.update({ changes: nChanges });
      },
      docName
    ).render(true);
  };

  const showPresetActiveEffect = function () {
    new MassEditPresets(
      aeConfig,
      (preset) => {
        const changes = aeConfig.object.changes ?? [];
        let nChanges = [];

        preset.data.changes?.forEach((change) => {
          if (change.key) {
            nChanges.push(
              mergeObject({ mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, priority: 20 }, change)
            );
          }
        });

        for (let i = changes.length - 1; i >= 0; i--) {
          if (!nChanges.find((nc) => nc.key === changes[i].key)) nChanges.unshift(changes[i]);
        }

        aeConfig.object.update({ changes: nChanges });
      },
      'ActiveEffect'
    ).render(true);
  };

  new Dialog({
    title: 'Open Presets',
    content: ``,
    buttons: {
      activeEffect: {
        label: 'ActiveEffect',
        callback: () => showPresetActiveEffect(),
      },
      token: {
        label: 'Token',
        callback: () => showPresetGeneric('Token'),
      },
      actor: {
        label: 'Actor',
        callback: () => showPresetGeneric('Actor'),
      },
    },
  }).render(true);
}

export function getDocumentName(doc) {
  const docName = doc.document ? doc.document.documentName : doc.documentName;
  return docName ?? 'NONE';
}

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class Picker {
  static pickerOverlay;
  static boundStart;
  static boundEnd;
  static callback;

  /**
   * Activates the picker overlay.
   * @param {Function} callback callback function with coordinates returned as starting and ending bounds of a rectangles
   *                            { start: {x1, y1}, end: {x2, y2} }
   * @param {Object}  preview
   * @param {String}  preview.documentName (optional) preview placeables document name
   * @param {Object}  preview.data           (req) preview placeables data
   * @param {String}  preview.taPreview      (optional) Designates the preview placeable when spawning a `Token Attacher` prefab.
   *                                         e.g. "Tile", "Tile.1", "MeasuredTemplate.3"
   * @param {Boolean} preview.snap         (optional) if true returned coordinates will be snapped to grid
   * @param {String}  preview.label        (optional) preview placeables document name
   */
  static async activate(callback, preview) {
    if (this.pickerOverlay) {
      canvas.stage.removeChild(this.pickerOverlay);
      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.callback?.(null);
    }

    const pickerOverlay = new PIXI.Container();
    this.callback = callback;

    if (preview) {
      let label;
      if (preview.label) {
        label = new PreciseText(preview.label, { ...CONFIG.canvasTextStyle, _fontSize: 24 });
        label.anchor.set(0.5, 1);
        pickerOverlay.addChild(label);
      }

      let diffX = 0;
      let diffY = 0;
      let documentName = preview.documentName;
      let data = preview.data;
      let gridPrecision;
      let previewObject;

      if (preview.documentName) {
        gridPrecision = canvas.getLayerByEmbeddedName(documentName).gridPrecision;

        if (preview.taPreview && tokenAttacher) {
          const attached = getProperty(preview.data, 'flags.token-attacher.prototypeAttached');
          const pos = getProperty(preview.data, 'flags.token-attacher.pos');
          const grid = getProperty(preview.data, 'flags.token-attacher.grid');
          if (attached && pos && grid) {
            const [name, index] = preview.taPreview.split('.');
            const designatedPreviewData = attached[name]?.[index ?? 0];
            if (name !== 'Wall' && designatedPreviewData) {
              documentName = name;
              data = designatedPreviewData;
              diffX = data.x - pos.xy.x;
              diffY = data.y - pos.xy.y;

              if (canvas.grid.size !== grid.size) {
                const ratio = canvas.grid.size / grid.size;
                diffX *= ratio;
                diffY *= ratio;
                if (documentName === 'Tile' || documentName === 'Drawing') {
                  data.width *= ratio;
                  data.height *= ratio;
                }
              }
            }
          }
        }

        const layer = canvas.getLayerByEmbeddedName(documentName);
        pickerOverlay.layer = layer;
        previewObject = await this._createPreview.call(layer, data);
      }

      const setPositions = function (pos) {
        if (!pos) return;
        if (preview.snap && gridPrecision)
          pos = canvas.grid.getSnappedPosition(pos.x, pos.y, gridPrecision);

        if (previewObject) {
          if (documentName === 'Wall') {
            previewObject.document.c = [pos.x, pos.y, pos.x + canvas.grid.w, pos.y];
          } else {
            previewObject.document.x = pos.x + diffX;
            previewObject.document.y = pos.y + diffY;
          }
          previewObject.document.alpha = 0.4;
          previewObject.renderFlags.set({ refresh: true });
        }

        if (label) {
          label.x = pos.x;
          label.y = pos.y - 38;
        }
      };

      pickerOverlay.on('pointermove', (event) => {
        setPositions(event.data.getLocalPosition(pickerOverlay));
      });
      setPositions(canvas.mousePosition);
    }

    pickerOverlay.hitArea = canvas.dimensions.rect;
    pickerOverlay.cursor = 'crosshair';
    pickerOverlay.interactive = true;
    pickerOverlay.zIndex = Infinity;
    pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
    pickerOverlay.on('mousedown', (event) => {
      Picker.boundStart = event.data.getLocalPosition(pickerOverlay);
    });
    pickerOverlay.on(
      'mouseup',
      (event) => (Picker.boundEnd = event.data.getLocalPosition(pickerOverlay))
    );
    pickerOverlay.on('click', (event) => {
      this.callback?.({ start: this.boundStart, end: this.boundEnd });
      pickerOverlay.parent.removeChild(pickerOverlay);
      if (pickerOverlay.layer) pickerOverlay.layer.clearPreviewContainer();
    });

    this.pickerOverlay = pickerOverlay;

    canvas.stage.addChild(this.pickerOverlay);
  }

  // Modified Foundry _createPreview
  // Does not throw warning if user lacks document create permissions
  static async _createPreview(createData) {
    const documentName = this.constructor.documentName;
    const cls = getDocumentClass(documentName);
    const document = new cls(createData, { parent: canvas.scene });

    const object = new CONFIG[documentName].objectClass(document);
    this.preview.addChild(object);
    await object.draw();
    this.activate();

    return object;
  }
}
