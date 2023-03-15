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
export function emptyObject(obj) {
  if (isNewerVersion('10', game.version)) {
    return foundry.utils.isObjectEmpty(obj);
  } else {
    return foundry.utils.isEmpty(obj);
  }
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
    flagVal == null || flagVal === false || flagVal === '' || (getType(flagVal) === 'Object' && emptyObject(flagVal));

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
          const currentTags = Array.isArray(val) ? val : (val ?? '').split(',').map((s) => s.trim());
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

export function regexStringReplace(sw, replaceWith, s2) {
  try {
    let re = new RegExp(sw, 'g');
    return s2.replaceAll(re, replaceWith);
  } catch (e) {}
  return s2;
}
