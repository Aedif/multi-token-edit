import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MODEL_EXTENSIONS,
  MODULE_ID,
  SUPPORTED_PLACEABLES,
  VIDEO_EXTENSIONS,
} from './constants.js';
import { Picker } from './picker.js';
import { Preset } from './presets/preset.js';
import { Spawner } from './presets/spawner.js';
import { applyRandomization } from './randomizer/randomizerUtils.js';

export function interpolateColor(u, c1, c2) {
  return c1.map((a, i) => Math.floor((1 - u) * a + u * c2[i]));
}

/**
 * Returns true of provided path points to an image
 */
export function isImage(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return IMAGE_EXTENSIONS.includes(extension);
}

/**
 * Returns true of provided path points to a video
 */
export function isVideo(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return VIDEO_EXTENSIONS.includes(extension);
}

/**
 * Returns true of provided path points to an audio file
 */
export function isAudio(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return AUDIO_EXTENSIONS.includes(extension);
}

export function is3DModel(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return MODEL_EXTENSIONS.includes(extension);
}

export async function recursiveTraverse(path, source, bucket, files = []) {
  const result = await foundry.applications.apps.FilePicker.browse(source, path, {
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
    (foundry.utils.getType(flagVal) === 'Object' && foundry.utils.isEmpty(flagVal));

  const falseyDataVal =
    data[flag] == null ||
    data[flag] === false ||
    data[flag] === '' ||
    (foundry.utils.getType(data[flag]) === 'Object' && foundry.utils.isEmpty(data[flag]));

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
      .attr(
        'title',
        fields[key].method === 'add' ? `+ ${localize('form.adding')}` : `- ${localize('form.subtracting')}`
      );
  }
}

export function getCommonData(objects) {
  if (!objects || !objects.length) return {};
  const commonData = foundry.utils.flattenObject(objects[0]);
  for (let i = 1; i < objects.length; i++) {
    const diff = foundry.utils.flattenObject(
      foundry.utils.diffObject(commonData, foundry.utils.flattenObject(objects[i]))
    );
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
    const t = foundry.utils.getType(val);
    if (t === 'Object') mergeObjectPreserveDot(val, other, fullKey);
    else {
      const prop = foundry.utils.getProperty(other, fullKey);
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
    let t = foundry.utils.getType(v);
    if (t === 'Object') {
      if (foundry.utils.isEmpty(v)) flat[k] = v;
      let inner = flattenToDepth(v, d - 1);
      for (let [ik, iv] of Object.entries(inner)) {
        flat[`${k}.${ik}`] = iv;
      }
    } else flat[k] = v;
  }
  return flat;
}

export function getDocumentName(doc) {
  const documentName = doc.document ? doc.document.documentName : doc.documentName;
  return documentName ?? 'NONE';
}

export const DOCUMENT_CREATE_REQUESTS = {};

/**
 * Creates documents either directly or by delegating the task to a GM
 * @param {String} documentName  document type to be created
 * @param {Array[Object]} data   data defining the documents
 * @param {String} sceneID       scene the documents should be created on
 * @param {object} options       options to be passed to createEmbeddedDocuments
 * @returns placeable documents that have been created
 */
export async function createDocuments(documentName, data, sceneID, options = {}) {
  if (game.user.isGM) {
    return game.scenes.get(sceneID).createEmbeddedDocuments(documentName, data, options);
  }

  const requestID = foundry.utils.randomID();

  const message = {
    handlerName: 'document',
    args: { sceneID, documentName, data, requestID, options },
    type: 'CREATE',
  };
  game.socket.emit(`module.${MODULE_ID}`, message);

  // Self resolve in 4s if no response from a GM is received
  setTimeout(() => {
    DOCUMENT_CREATE_REQUESTS[requestID]?.([]);
  }, 4000);

  return new Promise((resolve) => {
    DOCUMENT_CREATE_REQUESTS[requestID] = resolve;
  });
}

/**
 * Resolves the delegated create documents request
 * @param {object} options
 * @param {String} options.requestID          request to be resolved
 * @param {String} options.sceneID            scene the documents have been created on
 * @param {String} options.documentName       type of document that has been created
 * @param {Array[String]} options.documentIDs array of document ids that have been created
 */
export function resolveCreateDocumentRequest({ requestID, sceneID, documentName, documentIDs } = {}) {
  if (!DOCUMENT_CREATE_REQUESTS.hasOwnProperty(requestID)) return;

  const scene = game.scenes.get(sceneID);
  const documents = [];
  for (const docID of documentIDs) {
    documents.push(scene.getEmbeddedDocument(documentName, docID));
  }

  DOCUMENT_CREATE_REQUESTS[requestID](documents);
  delete DOCUMENT_CREATE_REQUESTS[requestID];
}

export async function updateEmbeddedDocumentsViaGM(documentName, updates, context, scene) {
  if (game.user.isGM) {
    return scene.updateEmbeddedDocuments(documentName, updates, context);
  } else {
    const message = {
      handlerName: 'document',
      args: { sceneID: scene.id, documentName, updates, context },
      type: 'UPDATE',
    };
    game.socket.emit(`module.${MODULE_ID}`, message);
  }
}

export function isResponsibleGM() {
  return game.users.filter((u) => u.active && u.isGM).sort((a, b) => b.role - a.role || a.id.compare(b.id))[0]?.isSelf;
}

export function localize(path, moduleLocalization = true) {
  if (moduleLocalization) return game.i18n.localize(`MassEdit.${path}`);
  return game.i18n.localize(path);
}

export function localFormat(path, insert, moduleLocalization = true) {
  if (moduleLocalization) return game.i18n.format(`MassEdit.${path}`, insert);
  return game.i18n.format(path, insert);
}

export async function applyPresetToScene(preset) {
  if (preset && canvas.scene) {
    await preset.load();
    const data = foundry.utils.flattenObject(preset.data[0]);

    const randomizer = preset.randomize;
    if (!foundry.utils.isEmpty(randomizer)) {
      await applyRandomization([data], null, randomizer);
    }

    await canvas.scene.update(data);

    // Grid doesn't redraw on scene update, do it manually here
    if ('grid.color' in data || 'grid.alpha' in data) {
      canvas.grid.grid.draw({
        color: (data['grid.color'] ?? canvas.scene.grid.color).replace('#', '0x'),
        alpha: Number(data['grid.alpha'] ?? canvas.scene.grid.alpha),
      });
    }
  }
}

export async function executeScript(command, { actor, token, ...scope } = {}) {
  // Add variables to the evaluation scope
  const speaker = ChatMessage.implementation.getSpeaker({ actor, token });
  const character = game.user.character;
  token = token || (canvas.ready ? canvas.tokens.get(speaker.token) : null);
  actor = actor || token?.actor || game.actors.get(speaker.actor);

  // Unpack argument names and values
  const argNames = Object.keys(scope);
  if (argNames.some((k) => Number.isNumeric(k))) {
    throw new Error('Illegal numeric Macro parameter passed to execution scope.');
  }
  const argValues = Object.values(scope);

  // Define an AsyncFunction that wraps the macro content
  const AsyncFunction = async function () {}.constructor;
  // eslint-disable-next-line no-new-func
  const fn = new AsyncFunction('speaker', 'actor', 'token', 'character', 'scope', ...argNames, `{${command}\n}`);

  // Attempt macro execution
  try {
    return await fn.call(this, speaker, actor, token, character, scope, ...argValues);
  } catch (err) {
    ui.notifications.error('MACRO.Error', { localize: true });
  }
}

export class SeededRandom {
  /**
   * Seeded variation of the Foundry's randomID(...) function.
   * Generate a random string ID of a given requested length.
   * @param {String} seed      Seed to be fed into random number generator
   * @param {number} length    The length of the random ID to generate
   * @return {string}          Return a string containing random letters and numbers
   */
  static randomID(seed, length = 16) {
    seed = this.cyrb128(seed);
    const random = this.sfc32(seed[0], seed[1], seed[2], seed[3]);

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const r = Array.from({ length }, () => (random() * chars.length) >> 0);
    return r.map((i) => chars[i]).join('');
  }

  // Courtesy of bryc
  // github.com/bryc
  static cyrb128(str) {
    let h1 = 1779033703,
      h2 = 3144134277,
      h3 = 1013904242,
      h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    (h1 ^= h2 ^ h3 ^ h4), (h2 ^= h1), (h3 ^= h1), (h4 ^= h1);
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  // Courtesy of Chris Doty-Humphrey
  // https://pracrand.sourceforge.net/
  static sfc32(a, b, c, d) {
    return function () {
      a |= 0;
      b |= 0;
      c |= 0;
      d |= 0;
      var t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
}

/**
 * TODO:
 * Is currently used just for the Brush TMFX field. Explore replacing it with foundry's StringTag input
 */
export class TagInput {
  static registerHandlebarsHelper() {
    Handlebars.registerHelper('tagInput', (options) => {
      const name = options.hash.name;
      const label = options.hash.label ?? 'Tags';
      const listId = options.hash.listId;
      const listEntries = options.hash.listEntries;

      let tags = options.hash.tags;
      if (!Handlebars.Utils.isArray(tags)) tags = [];

      // Construct the HTML
      let tagHtml = '';
      tags.forEach((tag) => {
        tagHtml += this._tagField(tag);
      });

      // DataList
      let listAttr = '';
      let dataList = '';
      if (listId && listEntries) {
        listAttr = `list="${listId}"`;

        dataList = `<datalist id="${listId}"><option value="DELETE"><option value="DELETE ALL">`;
        listEntries.forEach((le) => {
          dataList += `<option value="${le}">`;
        });
        dataList += `</datalist>`;
      }

      return new Handlebars.SafeString(`
      ${dataList}
      <fieldset>
        <legend>${label}</legend>
        <div class="form-group me-tags">
            <input type="text" ${listAttr} class="tag-input">  
            <input type="text" class="tag-hidden-input" name="${name}" value="${tags.join(',')}" hidden>
            <button type="button" class="add-tag"><i class="fas fa-save" style="margin: auto;"></i></button>
            <div class="tag-container">${tagHtml}</div>
        </div>
      </fieldset>
    `);
    });
  }

  static _tagField(tag) {
    return `<div class="tag"><span>${tag}</span> <a class="delete-tag"><i class="fa-solid fa-x fa-xs"></i></a></div>`;
  }

  static activateListeners(html, { change, simplifyTags = true } = {}) {
    html.find('.me-tags .add-tag').on('click', (event) => {
      const meTags = $(event.target).closest('.me-tags');
      const input = meTags.find('.tag-input');

      const newTags = input
        .val()
        .split(',')
        .map((t) => {
          t = t.trim();
          if (simplifyTags) t = t.slugify({ strict: true });
          return t;
        })
        .filter(Boolean);

      if (newTags.length) {
        input.val('');
        const hiddenInput = meTags.find('.tag-hidden-input');
        const currentTags = hiddenInput.val().split(',').filter(Boolean);
        for (const tag of newTags) {
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
            meTags.find('.tag-container').append(this._tagField(tag));
          }
        }
        hiddenInput.attr('value', currentTags.join(','));
        change?.(currentTags);
      }
    });

    html.find('.me-tags').on('click', '.delete-tag', (event) => {
      const tag = $(event.target).closest('.tag');

      // Remove tag from hidden input
      const tagValue = tag.find('span').text();
      const hiddenInput = tag.closest('.me-tags').find('.tag-hidden-input');
      const newTags = hiddenInput
        .val()
        .split(',')
        .filter((t) => t !== tagValue);
      hiddenInput.attr('value', newTags.join(','));

      // Remove the tag element itself
      tag.remove();

      change?.(newTags);
    });
  }
}

export class DragHoverOverlay {
  static attachListeners(html, { condition = null, hoverOutCallback = null } = {}) {
    const overlay = $(html);

    overlay
      .closest('.window-content')
      .on('mouseover', () => {
        if (condition?.()) overlay.show();
        else overlay.hide();
      })
      .on('mouseout', () => {
        overlay.hide();
        hoverOutCallback?.();
      });
  }
}

/**
 * Activates Picker allowing drag selection of document across all placeables layers
 * @returns {Array[CanvasDocumentMixin]}
 */
export async function pickerSelectMultiLayerDocuments() {
  // Activate picker to define select box
  const coords = await new Promise(async (resolve) => {
    Picker.activate(resolve);
  });
  if (!coords) return [];

  // Selects placeables within the bounding box
  const selectionRect = new PIXI.Rectangle(coords.x1, coords.y1, coords.x2 - coords.x1, coords.y2 - coords.y1);

  let selected = [];
  SUPPORTED_PLACEABLES.forEach((documentName) => {
    canvas.getLayerByEmbeddedName(documentName).placeables.forEach((p) => {
      const c = p.center;
      if (selectionRect.contains(c.x, c.y)) selected.push(p.document);
    });
  });

  return selected;
}

/**
 * Returns dimensions of the provided image or video path
 * @param {String} src
 * @returns {object} {width, height}
 */
export async function loadImageVideoDimensions(src) {
  let width, height;

  try {
    const baseTexture = (await foundry.canvas.loadTexture(src)).baseTexture;
    width = baseTexture.width;
    height = baseTexture.height;
  } catch (e) {}

  return { width, height };
}

export async function spawnSceneAsPreset(scene) {
  const attached = [];

  SUPPORTED_PLACEABLES.forEach((name) => {
    scene.getEmbeddedCollection(name).forEach((embed) => {
      attached.push({ documentName: name, data: embed.toObject() });
    });
  });

  let presetData;
  if (scene.background.src) {
    let { x, y, width, height } = scene.dimensions.sceneRect;

    const tiles = attached.filter((att) => att.documentName === 'Tile');
    let minSort = tiles.length
      ? Math.min.apply(
          Math,
          tiles.map((t) => t.data.sort ?? 0)
        )
      : 0;
    let minElevation = tiles.length
      ? Math.min.apply(
          Math,
          tiles.map((t) => t.data.elevation ?? 0)
        )
      : 0;

    presetData = {
      documentName: 'Tile',
      data: {
        texture: {
          src: scene.background.src,
        },
        width,
        height,
        x,
        y,
        sort: minSort - 1,
        elevation: minElevation,
      },
    };
  } else {
    presetData = attached.findSplice((att) => att.documentName === 'Token');
    if (!presetData) presetData = attached.findSplice((att) => att.documentName === 'Tile');
    if (!presetData) presetData = attached.shift();
  }

  if (!presetData) {
    ui.notifications.warn('Attempting to spawn an empty scene.');
    return;
  }

  const preset = new Preset({ documentName: presetData.documentName, data: [presetData.data], attached });

  await Spawner.spawnPreset({
    preset,
    preview: true,
    previewRestrictedDocuments: preset.documentName === 'AmbientLight' ? null : ['AmbientLight'],
    pivot: MassEdit.PIVOTS.CENTER,
  });
}
