/**
 * Manage placeable linking to one another using `links` flag.
 */

import { DataTransform } from '../picker.js';
import { libWrapper } from '../shim/shim.js';
import { isResponsibleGM, MODULE_ID, SUPPORTED_PLACEABLES, updateEmbeddedDocumentsViaGM } from '../utils.js';
import { getDataBounds } from '../presets/utils.js';

const PROCESSED_UPDATES = new Map();
export const LINK_TYPES = {
  TWO_WAY: 0,
  RECEIVE: 1,
  SEND: 2,
};

export function registerLinkerHooks() {
  SUPPORTED_PLACEABLES.forEach((name) => Hooks.on(`preUpdate${name}`, preUpdate));
  SUPPORTED_PLACEABLES.forEach((name) => Hooks.on(`update${name}`, update));

  if (foundry.utils.isNewerVersion(12, game.version)) {
    libWrapper.register(
      MODULE_ID,
      'Scene.prototype.updateEmbeddedDocuments',
      async function (wrapped, embeddedName, updates = [], context = {}) {
        if (!context.modifiedTime) context.modifiedTime = new Date().getTime();
        return wrapped(embeddedName, updates, context);
      },
      'WRAPPER'
    );
  }
}

function processLinks(transform, origin, links, scene, docUpdates, processedLinks, sourceId) {
  SUPPORTED_PLACEABLES.forEach((documentName) => {
    const linked = scene
      .getEmbeddedCollection(documentName)
      .filter(
        (t) =>
          t.flags[MODULE_ID]?.links?.some((l1) => l1.type < 2 && links.find((l2) => l2.id === l1.id)) &&
          t.id !== sourceId
      );

    if (linked.length) {
      const updates = [];
      for (const d of linked) {
        const data = d._source;
        let update = foundry.utils.deepClone(data);

        DataTransform.apply(documentName, update, origin, transform);
        update = foundry.utils.diffObject(data, update);

        update._id = d.id;
        updates.push(update);

        // Check if the document has unprocessed links and if so chain the update
        const dLinks = d.flags[MODULE_ID].links.filter(
          (l) => !(l.type === LINK_TYPES.RECEIVE || processedLinks.has(l.id))
        );
        if (dLinks.length) {
          dLinks.forEach((l) => processedLinks.add(l.id));
          processLinks(transform, origin, dLinks, scene, docUpdates, processedLinks, d.id);
        }
      }

      docUpdates.set(documentName, (docUpdates.get(documentName) ?? []).concat(updates));
    }
  });
}

class PromiseQueue {
  queue = Promise.resolve();

  add(operation) {
    this.queue = this.queue.then(operation).catch(() => {});
  }
}

const updateQueue = new PromiseQueue();
const doc_sources = {};

function preUpdate(document, change, options, userId) {
  if (game.user.id !== userId || options.ignoreLinks) return true;

  let links = document.flags[MODULE_ID]?.links?.filter((l) => l.type !== LINK_TYPES.RECEIVE);
  if (!links?.length) return true;

  let positionUpdate =
    change.hasOwnProperty('x') ||
    change.hasOwnProperty('y') ||
    change.hasOwnProperty('shapes') ||
    change.hasOwnProperty('c') ||
    change.hasOwnProperty('elevation');
  let rotationUpdate = change.hasOwnProperty('rotation') || options.hasOwnProperty('meRotation');
  if (!(positionUpdate || rotationUpdate)) return true;

  // If control is held during non-rotation update, we want to ignore links
  if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT)) {
    return true;
  }

  // If an update occurred at the same time (likely same drag, or mass update) we need to check whether
  // this update has unique links which need to be processed
  const puLinks = PROCESSED_UPDATES.get(options.modifiedTime);
  if (puLinks) {
    links = links.filter((l) => !puLinks.some((l2) => l2.id === l.id));
    if (!links.length) return true;
    puLinks.push(...links);
  } else {
    PROCESSED_UPDATES.set(options.modifiedTime, links);
    setTimeout(() => PROCESSED_UPDATES.delete(options.modifiedTime), 2000);
  }

  options.meLinks = links;

  /// TODO
  // Need to figure out how to clean this up...
  doc_sources[document.id] = document.toObject();

  return true;
}

async function update(document, change, options, userId) {
  if (!options.meLinks || game.user.id !== userId) return true;

  let positionUpdate =
    change.hasOwnProperty('x') ||
    change.hasOwnProperty('y') ||
    change.hasOwnProperty('shapes') ||
    change.hasOwnProperty('c') ||
    change.hasOwnProperty('elevation');
  let rotationUpdate = change.hasOwnProperty('rotation') || options.hasOwnProperty('meRotation');
  if (!(positionUpdate || rotationUpdate)) return true;

  /// TODO
  // Need to figure out how to clean this up...
  const previousSource = foundry.utils.deepClone(doc_sources[document.id]);
  foundry.utils.mergeObject(doc_sources[document.id], change);

  // console.log(
  //   'pre',
  //   previousSource.rotation,
  //   'pos',
  //   document.rotation,
  //   'pos_s',
  //   document._source.rotation,
  //   'time',
  //   options.modifiedTime,
  //   'change',
  //   change
  // );

  const scene = document.parent;
  let { transform, origin } = calculateTransform(
    document.documentName,
    document.toObject(),
    previousSource,
    change,
    options
  );
  let links = options.meLinks;

  updateQueue.add(async () => {
    const docUpdates = new Map();
    processLinks(transform, origin, links, scene, docUpdates, new Set(links.map((l) => l.id)), document.id);

    for (const [documentName, updates] of docUpdates.entries()) {
      const options = { ignoreLinks: true, animate: false };
      if (documentName === 'Token') {
        options.RidingMovement = true; // 'Auto-Rotate' module compatibility
        options.forced = true; // Regions
      }
      //await scene.updateEmbeddedDocuments(documentName, updates, options);
      await updateEmbeddedDocumentsViaGM(documentName, updates, options, scene);
    }
  });
}

function calculateTransform(documentName, currentSource, previousSource, change, options) {
  let transform;

  if (change.hasOwnProperty('shapes') || change.hasOwnProperty('c')) {
    if (options.hasOwnProperty('meRotation')) {
      transform = { x: 0, y: 0 };
    } else {
      const previousBounds = getDataBounds(documentName, previousSource);
      const currentBounds = getDataBounds(documentName, currentSource);

      transform = {
        x: currentBounds.x1 - previousBounds.x1,
        y: currentBounds.y1 - previousBounds.y1,
      };
    }
  } else {
    transform = {
      x: currentSource.x - previousSource.x,
      y: currentSource.y - previousSource.y,
    };
  }

  const origin = { x: 0, y: 0 };

  // Calculate rotation delta
  let dRotation;
  if (options.hasOwnProperty('meRotation')) dRotation = options.meRotation;
  else if (currentSource.hasOwnProperty('rotation'))
    dRotation = (currentSource.rotation - previousSource.rotation) % 360;

  if (dRotation != null) {
    transform.rotation = dRotation;

    const { x1, y1, x2, y2 } = getDataBounds(documentName, previousSource);

    origin.x = x1 + (x2 - x1) / 2;
    origin.y = y1 + (y2 - y1) / 2;
  }

  if (currentSource.hasOwnProperty('elevation')) {
    let dElevation;
    if (Number.isNumeric(currentSource.elevation)) {
      dElevation = currentSource.elevation - previousSource.elevation;
    } else {
      dElevation = (currentSource.elevation.bottom ?? 0) - (previousSource.elevation.bottom ?? 0);
    }
    if (dElevation != 0) transform.z = dElevation;
  }

  return { transform, origin };
}

export class LinkerAPI {
  static async openMenu() {
    const module = await import('./menu.js');
    await module.openLinkerMenu();
  }

  /**
   * Retrieve all linked embedded documents
   * @param {CanvasDocumentMixin|Array<CanvasDocumentMixin>} documents embedded document/s
   * @returns {Set<CanvasDocumentMixin>}
   */
  static getLinkedDocuments(documents) {
    if (!Array.isArray(documents)) documents = [documents];

    const allLinked = new Set();
    documents.forEach((document) => this._findLinked(document, allLinked));
    documents.forEach((document) => allLinked.delete(document));

    return allLinked;
  }

  static _getLinkedDocumentsUsingLink(linkId, type) {
    const allLinked = new Set();
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      canvas.scene.getEmbeddedCollection(documentName).forEach((d) => {
        if (d.flags[MODULE_ID]?.links?.some((l) => l.id === linkId && (type == null || l.type === type))) {
          allLinked.add(d);
        }
      });
    });
    return allLinked;
  }

  static _findLinked(document, allLinked, processedLinks = new Set()) {
    allLinked.add(document);

    const links = document.flags[MODULE_ID]?.links?.filter((l) => !processedLinks.has(l.id)).map((l) => l.id);
    if (!links?.length) return allLinked;

    links.forEach((l) => processedLinks.add(l));

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const linked = canvas.scene
        .getEmbeddedCollection(documentName)
        .filter((t) => t.flags[MODULE_ID]?.links?.some((l1) => links.find((l2) => l2 === l1.id)));

      for (const d of linked) {
        this._findLinked(d, allLinked, processedLinks);
      }
    });

    return allLinked;
  }

  static addLinkToSelected(linkId, type = LINK_TYPES.TWO_WAY) {
    this._getSelected().forEach((p) => this.addLink(p, linkId, type));
  }

  static hasLink(placeable, linkId) {
    const document = placeable.document ?? placeable;
    return Boolean(document.flags[MODULE_ID]?.links?.find((l) => l.id === linkId));
  }

  static addLink(placeable, linkId, type = LINK_TYPES.TWO_WAY) {
    const document = placeable.document ?? placeable;
    const links = document.flags[MODULE_ID]?.links ?? [];

    let link = links.find((l) => l.id === linkId);
    if (!link) {
      link = { id: linkId };
      links.push(link);
    }
    link.type = type;

    document.setFlag(MODULE_ID, 'links', links);
  }

  static removeLinkFromSelected(linkId) {
    this._getSelected().forEach((p) => this.removeLink(p, linkId));
  }

  static removeLink(placeable, linkId) {
    const document = placeable.document ?? placeable;
    let links = document.flags[MODULE_ID]?.links;
    if (links) {
      links = links.filter((l) => l.id !== linkId);
      if (links.length) document.setFlag(MODULE_ID, 'links', links);
      else document.unsetFlag(MODULE_ID, 'links');
    }
  }

  static removeLinks(placeable) {
    const document = placeable.document ?? placeable;
    if (document.flags[MODULE_ID]?.links) document.unsetFlag(MODULE_ID, 'links');
  }

  static removeAllLinksFromSelected() {
    this._getSelected().forEach((p) => {
      let links = p.document.flags[MODULE_ID]?.links;
      if (links) p.document.unsetFlag(MODULE_ID, 'links');
    });
  }

  static removeAllLinksOnCurrentScene() {
    const scene = canvas.scene;
    if (!scene) return;

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const updates = [];
      scene.getEmbeddedCollection(documentName).forEach((d) => {
        if (d.flags[MODULE_ID]?.links) {
          updates.push({ _id: d.id, [`flags.${MODULE_ID}.-=links`]: null });
        }
      });
      if (updates.length) scene.updateEmbeddedDocuments(documentName, updates);
    });
  }

  static removeLinkFromScene(linkId) {
    const scene = canvas.scene;
    if (!scene || !linkId) return;

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const updates = [];
      scene.getEmbeddedCollection(documentName).forEach((d) => {
        let links = d.flags[MODULE_ID]?.links;
        if (links) {
          let fLinks = links.filter((l) => l.id !== linkId);
          if (fLinks.length !== links.length) {
            updates.push({ _id: d.id, [`flags.${MODULE_ID}.links`]: fLinks });
          }
        }
      });
      if (updates.length) scene.updateEmbeddedDocuments(documentName, updates);
    });
  }

  static deleteLinkedPlaceables(link, scene = canvas.scene) {
    if (!scene || !link || !link.id || !link.hasOwnProperty('type')) return;

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const ids = [];
      scene.getEmbeddedCollection(documentName).forEach((d) => {
        if (d.flags[MODULE_ID]?.links?.some((l) => l.id === link.id && l.type === link.type)) {
          ids.push(d.id);
        }
      });
      if (ids.length) scene.deleteEmbeddedDocuments(documentName, ids);
    });
  }

  static _getSelected() {
    let selected = [];
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      selected = selected.concat(canvas.getLayerByEmbeddedName(documentName).controlled);
    });
    return selected;
  }
}
