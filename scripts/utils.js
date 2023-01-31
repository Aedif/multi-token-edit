import { GeneralDataAdapter } from '../applications/dataAdapters.js';

export const SUPPORTED_PLACEABLES = [
  'Token',
  'Tile',
  'Drawing',
  'Wall',
  'AmbientLight',
  'AmbientSound',
  'MeasuredTemplate',
  'Note',
];

export const SUPPORT_SHEET_CONFIGS = [...SUPPORTED_PLACEABLES, 'Actor', 'PlaylistSound', 'Scene'];

export const SUPPORTED_HISTORY_DOCS = [...SUPPORTED_PLACEABLES, 'Scene', 'Actor', 'PlaylistSound'];

export const SUPPORTED_COLLECTIONS = ['Item', 'Cards', 'RollTable', 'Actor', 'JournalEntry'];

export function hexToRgb(hex) {
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });

  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

export function rgbToHex(rgb) {
  return '#' + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
}

export function interpolateColor(u, c1, c2) {
  return c1.map((a, i) => Math.floor((1 - u) * a + u * c2[i]));
}

function _randomInRange(num1, num2) {
  const h = Math.max(num1, num2);
  const l = Math.min(num1, num2);

  return Math.floor(Math.random() * (h - l) + 1) + l;
}

export function randomizeColor(c1, c2) {
  return [_randomInRange(c1[0], c2[0]), _randomInRange(c1[1], c2[1]), _randomInRange(c1[2], c2[2])];
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

export function shuffleArray(array) {
  var i = array.length,
    j = 0,
    temp;

  while (i--) {
    j = Math.floor(Math.random() * (i + 1));

    // swap randomly chosen element with current element
    temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
}

export function nearestStep(num, step) {
  if (num % step <= step / 2) {
    return num - (num % step);
  }
  return num - (num % step) + step;
}

function _canFit(freeRec, rec) {
  return rec.width <= freeRec.width && rec.height <= freeRec.height;
}

function _fullyContains(freeRec, rec) {
  return (
    freeRec.x <= rec.x &&
    freeRec.x + freeRec.width >= rec.x + rec.width &&
    freeRec.y <= rec.y &&
    freeRec.y + freeRec.height >= rec.y + rec.height
  );
}

function _intersectRec(rec1, rec2) {
  if (rec1.x < rec2.x + rec2.width && rec2.x < rec1.x + rec1.width && rec1.y < rec2.y + rec2.height)
    return rec2.y < rec1.y + rec1.height;
  else return false;
}

export function randomPlace(placeable, ctrl) {
  const width = nearestStep(placeable.w ?? placeable.width, ctrl.stepX);
  const height = nearestStep(placeable.h ?? placeable.height, ctrl.stepY);

  const rec = { x: 0, y: 0, width: width, height: height };
  const freeRectangles = ctrl.freeRectangles;

  // get all free rectangles that can contain rec
  let fittingRecs = Object.keys(freeRectangles).filter((id) => _canFit(freeRectangles[id], rec));

  // if there are no fitting places left, then place it randomly anywhere within the bounding box

  if (fittingRecs.length) {
    // Pick a random free rectangle and choose a random location within so that it fits rec
    const i = fittingRecs[Math.floor(Math.random() * fittingRecs.length)];
    rec.x = randomNum(
      freeRectangles[i].x,
      Math.max(freeRectangles[i].x + freeRectangles[i].width - rec.width, 0),
      ctrl.stepX
    );
    rec.y = randomNum(
      freeRectangles[i].y,
      Math.max(freeRectangles[i].y + freeRectangles[i].height - rec.height, 0),
      ctrl.stepY
    );
  } else {
    // if there are no fitting places left, then place it randomly anywhere within the bounding box
    rec.x = randomNum(
      ctrl.boundingBox.x,
      Math.max(ctrl.boundingBox.x + ctrl.boundingBox.width - rec.width, ctrl.boundingBox.x),
      ctrl.stepX
    );
    rec.y = randomNum(
      ctrl.boundingBox.y,
      Math.max(ctrl.boundingBox.y + ctrl.boundingBox.height - rec.height, ctrl.boundingBox.y),
      ctrl.stepY
    );
  }

  // Find all free rectangles that this spot overlaps
  let overlaps = Object.keys(freeRectangles).filter((id) => _intersectRec(freeRectangles[id], rec));

  for (const id of overlaps) {
    const overlap = freeRectangles[id];
    // remove original rectangle
    delete freeRectangles[id];

    // left split
    if (overlap.x < rec.x) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: overlap.y,
          width: rec.x - overlap.x,
          height: overlap.height,
        },
        ctrl
      );
    }

    // right split
    if (overlap.x + overlap.width > rec.x + rec.width) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: rec.x + rec.width,
          y: overlap.y,
          width: overlap.x + overlap.width - (rec.x + rec.width),
          height: overlap.height,
        },
        ctrl
      );
    }

    // top split
    if (overlap.y < rec.y) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: overlap.y,
          width: overlap.width,
          height: rec.y - overlap.y,
        },
        ctrl
      );
    }

    // bottom split
    if (overlap.y + overlap.height > rec.y + rec.height) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: rec.y + rec.height,
          width: overlap.width,
          height: overlap.y + overlap.height - (rec.y + rec.height),
        },
        ctrl
      );
    }
  }

  return [rec.x, rec.y];
}

function _addAndMergeFreeRectangle(freeRectangles, rec, ctrl) {
  const keys = Object.keys(freeRectangles);
  for (const key of keys) {
    if (_fullyContains(freeRectangles[key], rec)) {
      return;
    }
  }
  ctrl.freeId++;
  freeRectangles[ctrl.freeId] = rec;
}

export function randomNum(min, max, step) {
  if (step === 'any') step = 1; // default to integer 1 just to avoid very large decimals
  else step = Number(step);
  const stepsInRange = (max - min) / step;
  return Math.floor(Math.random() * (stepsInRange + (Number.isInteger(step) ? 1 : 0))) * step + min;
}

// To get rid of v10 warnings
export function emptyObject(obj) {
  if (isNewerVersion('10', game.version)) {
    return foundry.utils.isObjectEmpty(obj);
  } else {
    return foundry.utils.isEmpty(obj);
  }
}

// To get rid of v10 warnings
export function getData(obj) {
  if (isNewerVersion('10', game.version)) {
    return obj.data;
  } else {
    return obj.document ? obj.document : obj;
  }
}

// Flags are stored inconsistently. Absence of a flag, being set to null, undefined, empty object or empty string
// should all be considered equal
export function flagCompare(data, flag, flagVal) {
  if (data[flag] == flagVal) return true;

  const falseyFlagVal =
    flagVal == null ||
    flagVal === false ||
    flagVal === '' ||
    (getType(flagVal) === 'Object' && emptyObject(flagVal));

  const falseyDataVal =
    data[flag] == null ||
    data[flag] === false ||
    data[flag] === '' ||
    (getType(data[flag]) === 'Object' && emptyObject(data[flag]));

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
  if (!addSubtractFields || emptyObject(addSubtractFields)) return;

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
  if (placeables && placeables.length) {
    if (placeables.length === 1) {
      if (placeables[0].center?.x) {
        canvas.animatePan({ x: placeables[0].center.x, y: placeables[0].center.y, duration: 250 });
      }
    } else {
      // Determine top left and bottom right corners to later determine the view's center position and scale
      const topLeft = { x: 999999999, y: 999999999 };
      const bottomRight = { x: -999999999, y: -999999999 };

      for (const p of placeables) {
        if (p.x < topLeft.x) topLeft.x = p.x;
        if (p.y < topLeft.y) topLeft.y = p.y;
        if (p.x + p.width > bottomRight.x) bottomRight.x = p.x + p.width;
        if (p.y + p.height > bottomRight.y) bottomRight.y = p.y + p.height;
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
