/**
 * Manage placeable linking to one another using `links` flag.
 */

import { libWrapper } from '../libs/shim/shim.js';
import { pickerSelectMultiLayerDocuments, updateEmbeddedDocumentsViaGM } from '../utils.js';
import { getDataBounds } from '../presets/utils.js';
import { LINKER_DOC_COLORS, MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { DataTransformer } from '../data/transformer.js';

const PROCESSED_UPDATES = new Map();
export const LINK_TYPES = {
  TWO_WAY: 0,
  RECEIVE: 1,
  SEND: 2,
};

export function registerLinkerHooks() {
  SUPPORTED_PLACEABLES.forEach((name) => {
    Hooks.on(`preUpdate${name}`, preUpdate);
    Hooks.on(`update${name}`, update);
    Hooks.on(`delete${name}`, _delete);
  });

  // UNDO linked document delete operation
  libWrapper.register(
    MODULE_ID,
    'PlaceablesLayer.prototype.undoHistory',
    async function (wrapped, ...args) {
      const type = this.history[this.history.length - 1]?.type;
      const undone = await wrapped(...args);
      if (type === 'delete' && undone?.length) {
        for (const document of undone) {
          const event = LinkerAPI.history.find((h) => h.id === document.id);

          if (event) {
            event.data.forEach((data, documentName) => {
              canvas.scene.createEmbeddedDocuments(documentName, data, { isUndo: true, keepId: true });
            });
            LinkerAPI.history = LinkerAPI.history.filter((h) => h.id !== document.id);
          }
        }
      }
      return undone;
    },
    'WRAPPER'
  );
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

        DataTransformer.apply(documentName, update, origin, transform);
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

function preUpdate(document, change, options, userId) {
  if (game.user.id !== userId || options.ignoreLinks) return true;

  // If the document does not contain links do nothing
  let links = document.flags[MODULE_ID]?.links?.filter((l) => l.type !== LINK_TYPES.RECEIVE);
  if (!links?.length) return true;

  const positionUpdate =
    change.hasOwnProperty('x') ||
    change.hasOwnProperty('y') ||
    change.hasOwnProperty('shapes') ||
    change.hasOwnProperty('c') ||
    change.hasOwnProperty('elevation');
  const rotationUpdate =
    change.hasOwnProperty('rotation') || change.hasOwnProperty('direction') || options.hasOwnProperty('meRotation');
  if (!(positionUpdate || rotationUpdate)) return true;

  // Special handling for walls.
  // We do not want to perform linked placeable translation if only a single wall segment is moved.
  if (change.c) {
    if (
      (change.c[0] === document.c[0] && change.c[1] === document.c[1]) ||
      (change.c[2] === document.c[2] && change.c[3] === document.c[3])
    ) {
      return true;
    }
  }

  // If alt is held during during the update, we want to ignore links
  if (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT)) {
    return true;
  }

  // If an update occurred at the same time (likely same drag, or mass update) we need to check whether
  // this update has unique links which need to be processed
  const puLinks = PROCESSED_UPDATES.get(options.modifiedTime);
  if (puLinks) {
    links = links.filter((l) => !puLinks.some((l2) => l2.id === l.id));
    if (!links.length) return false;
    links.forEach((l) => puLinks.push(l));
  } else {
    PROCESSED_UPDATES.set(options.modifiedTime, [...links]);
    setTimeout(() => PROCESSED_UPDATES.delete(options.modifiedTime), 2000);
  }

  foundry.utils.setProperty(options, `links.${document.id}`, links);
  foundry.utils.setProperty(options, `linkSources.${document.id}`, document.toObject());
  return true;
}

async function update(document, change, options, userId) {
  if (!options.links?.[document.id] || options.ignoreLinks || game.user.id !== userId) return true;

  const positionUpdate =
    change.hasOwnProperty('x') ||
    change.hasOwnProperty('y') ||
    change.hasOwnProperty('shapes') ||
    change.hasOwnProperty('c') ||
    change.hasOwnProperty('elevation');
  const rotationUpdate =
    change.hasOwnProperty('rotation') || change.hasOwnProperty('direction') || options.hasOwnProperty('meRotation');
  if (!(positionUpdate || rotationUpdate)) return true;

  const previousSource = foundry.utils.deepClone(options.linkSources[document.id]);
  foundry.utils.mergeObject(options.linkSources[document.id], change);

  const scene = document.parent;
  const { transform, origin } = calculateTransform(
    document.documentName,
    document.toObject(),
    previousSource,
    change,
    options
  );
  const links = options.links[document.id];

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
  else if (currentSource.hasOwnProperty('direction'))
    dRotation = (currentSource.direction - previousSource.direction) % 360;

  if (dRotation != null) {
    transform.rotation = dRotation;

    const { x1, y1, x2, y2 } = getDataBounds(documentName, currentSource);

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

/**
 * Cascade delete of a placeable to other linked placeables while recording their history
 * for an undo operation
 */
function _delete(document, options, userId) {
  if (game.user.id !== userId || options.linkerDelete) return;

  const linked = LinkerAPI.getHardLinkedDocuments(document);
  if (!linked.size) return;

  // Delete linked
  const toDelete = new Map();
  linked.forEach((d) => {
    if (!toDelete.get(d.documentName)) toDelete.set(d.documentName, [d.toObject()]);
    else toDelete.get(d.documentName).push(d.toObject());
  });

  const scene = document.parent;
  toDelete.forEach((data, documentName) => {
    scene.deleteEmbeddedDocuments(
      documentName,
      data.map((d) => d._id),
      { linkerDelete: true, isUndo: true } // Hack to prevent history tracking
    );
  });

  // Track history
  LinkerAPI.history.push({ id: document.id, data: toDelete });
  if (LinkerAPI.history.length > 10) LinkerAPI.history.shift();
}

export class LinkerAPI {
  /**
   * Open Linker Menu window
   * @returns
   */
  static async openMenu() {
    const module = await import('./menu.js');
    return module.openLinkerMenu();
  }

  static async smartLink({ multiLayer = false } = {}) {
    let selected;
    if (multiLayer) selected = await pickerSelectMultiLayerDocuments();
    else selected = this._getSelected().map((p) => p.document);

    if (!selected.length) return;

    if (!this._smartLink) {
      let link;
      for (const d of selected) {
        link = (this.getLinks(d) ?? []).find((l) => l.type === LINK_TYPES.TWO_WAY);
        if (link) break;
      }
      if (!link) link = { id: foundry.utils.randomID(), type: LINK_TYPES.TWO_WAY, label: 'S_LINK' };
      this._smartLink = link;

      // Open menu window
      const module = await import('./smartMenu.js');
      module.openSmartLinkMenu(selected[0]);
    }

    const { id, type, label } = this._smartLink;
    let numUpdates = 0;
    for (const d of selected) {
      if (await this.addLink(d, id, type, label)) numUpdates++;
    }
    if (numUpdates) {
      ui.notifications.info(`Mass Edit: ${numUpdates} documents have been linked.`);
    }
  }

  /**
   * Links provided documents/placeables using an already existing or otherwise an automatically
   * generated link.
   * @param {*} documents
   * @returns
   */
  static async link(documents) {
    if (!documents?.length || documents.length === 1) return;
    documents = documents.map((d) => d.document ?? d);

    let link;
    for (const d of documents) {
      link = (this.getLinks(d) ?? []).find((l) => l.type === LINK_TYPES.TWO_WAY);
      if (link) break;
    }
    if (!link) link = { id: foundry.utils.randomID(), type: LINK_TYPES.TWO_WAY, label: 'A_LINK' };

    const { id, type, label } = link;
    for (const d of documents) {
      await this.addLink(d, id, type, label);
    }
  }

  static getLinks(document) {
    document = document.document ?? document;
    return document.flags[MODULE_ID]?.links;
  }

  /**
   * Retrieve all linked embedded documents
   * @param {CanvasDocumentMixin|Array<CanvasDocumentMixin>} documents embedded document/s
   * @returns {Set<CanvasDocumentMixin>}
   */
  static getLinkedDocuments(documents, { hardLinked = false } = {}) {
    if (hardLinked) return this.getHardLinkedDocuments(documents);
    if (!Array.isArray(documents)) documents = [documents];
    documents = documents.map((d) => d.document ?? d);

    const allLinked = new Set();
    documents.forEach((document) => this._findLinked(document, allLinked));
    documents.forEach((document) => allLinked.delete(document));

    return allLinked;
  }

  /**
   * Retrieve TWO_WAY and SEND linked embedded documents
   * @param {Array<CanvasDocumentMixin>} documents
   * @returns
   */
  static getHardLinkedDocuments(documents, array = false) {
    if (!Array.isArray(documents)) documents = [documents];

    const allLinked = new Set();
    documents.forEach((document) => this._findHardLinked(document, allLinked));
    documents.forEach((document) => allLinked.delete(document));

    return array ? Array.from(allLinked) : allLinked;
  }

  /**
   * Returns true if the placeable has the provided linkId
   * @param {Placeable} placeable
   * @param {String} linkId
   * @returns
   */
  static hasLink(placeable, linkId) {
    const document = placeable.document ?? placeable;
    return Boolean(document.flags[MODULE_ID]?.links?.find((l) => l.id === linkId));
  }

  /**
   * Returns true if the two placeables share a link
   * @param {*} placeable1
   * @param {*} placeable2
   * @returns
   */
  static areLinked(placeable1, placeable2) {
    const links1 = (placeable1.document ?? placeable1).flags[MODULE_ID]?.links;
    const links2 = (placeable2.document ?? placeable2).flags[MODULE_ID]?.links;

    if (!(links1 && links2)) return false;
    return links1.some((l1) => links2.find((l2) => l1.id === l2.id));
  }

  /**
   * Add a link to the provided placeable
   * @param {Placeable} placeable
   * @param {String} linkId
   * @param {String} type LINK_TYPES
   * @param {String} label hover text displayed within the Linker Menu
   * @returns
   */
  static async addLink(placeable, linkId, type = LINK_TYPES.TWO_WAY, label = null) {
    if (!Object.values(LINK_TYPES).includes(type)) throw Error(`Invalid link type: ${type}`);

    const document = placeable.document ?? placeable;
    const links = document.flags[MODULE_ID]?.links ?? [];

    let link = links.find((l) => l.id === linkId);
    if (!link) {
      link = { id: linkId, type };
      if (label) link.label = label;
      links.push(link);
    } else if (link.type !== type || (label && link.label !== label)) {
      link.type = type;
      if (label) link.label = label;
    } else {
      return false;
    }

    await document.setFlag(MODULE_ID, 'links', links);
    Hooks.call(`${MODULE_ID}.addLink`, document.documentName, document.id, linkId, type, label);

    return true;
  }

  /**
   * Remove link from the provided placeable
   * @param {Placeable} placeable
   * @param {String} linkId
   */
  static async removeLink(placeable, linkId) {
    const document = placeable.document ?? placeable;

    let links = document.flags[MODULE_ID]?.links;
    if (links) {
      links = links.filter((l) => l.id !== linkId);
      if (links.length) await document.setFlag(MODULE_ID, 'links', links);
      else await document.unsetFlag(MODULE_ID, 'links');
      Hooks.call(`${MODULE_ID}.removeLink`, document.id, linkId);
    }
  }

  /**
   * Remove all links from the given placeable/document
   * @param {*} documents
   */
  static async removeLinks(documents) {
    if (!Array.isArray(documents)) documents = [documents];
    documents = documents.map((d) => d.document ?? d);

    let removed = false;
    for (const document of documents) {
      if (document.flags[MODULE_ID]?.links) {
        await document.unsetFlag(MODULE_ID, 'links');
        Hooks.call(`${MODULE_ID}.removeNode`, document.id);
        removed = true;
      }
    }
    return removed;
  }

  /**
   * Remove all links from selected placeables
   */
  static async removeLinksFromSelected({ multiLayer = false, notification = false } = {}) {
    let selected;
    if (multiLayer) selected = await pickerSelectMultiLayerDocuments();
    else selected = LinkerAPI._getSelected();

    let numRemoved = 0;
    for (const s of selected) {
      if (await LinkerAPI.removeLinks(s)) numRemoved++;
    }
    if (notification && numRemoved) ui.notifications.info(`Mass Edit: Links removed from ${numRemoved} documents.`);

    // Inform Smart Link menu of removed links
    Object.values(ui.windows)
      .find((w) => w.unlink)
      ?.unlink(selected);
  }

  static history = [];

  /**
   * Remove all links on the current scene.
   * @returns
   */
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

  /**
   * Update linkId on the current scene with the provided label
   * @param {String} linkId
   * @param {String} label
   * @returns
   */
  static updateLinkLabelOnCurrentScene(linkId, label) {
    if (!linkId) return;

    const scene = canvas.scene;
    if (!scene) return;

    let updated = false;
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const updates = [];
      scene.getEmbeddedCollection(documentName).forEach((d) => {
        const link = d.flags[MODULE_ID]?.links?.find((l) => l.id === linkId);
        if (link && link.label != label) {
          if (!label) delete link.label;
          else link.label = label;

          updates.push({ _id: d.id, [`flags.${MODULE_ID}.links`]: d.flags[MODULE_ID]?.links });
        }
      });
      if (updates.length) {
        scene.updateEmbeddedDocuments(documentName, updates);
        updated = true;
      }
    });

    if (updated) {
      Hooks.call(`${MODULE_ID}.linkLabelChange`, linkId, label);
    }
  }

  /**
   * Remove a link from all placeables on the current scene
   * @param {String} linkId
   * @returns
   */
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

    Hooks.call(`${MODULE_ID}.removeNode`, linkId);
  }

  /**
   * Private Utils
   */

  /**
   * Returns all selected placeables
   * @returns
   */
  static _getSelected() {
    const activeLayer = canvas.activeLayer;
    if (!SUPPORTED_PLACEABLES.includes(activeLayer.options.objectClass.embeddedName)) return [];
    return [...canvas.activeLayer.controlled];
  }

  /**
   * Returns all documents on the current scene matching the provided linkId and type
   * @param {String} linkId
   * @param {LINK_TYPES|null} type
   * @returns
   */
  static _getLinkedDocumentsUsingLink(linkId, type = null) {
    if (type != null && !Object.values(LINK_TYPES).includes(type)) throw Error(`Invalid link type: ${type}`);
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

  /**
   * Utility for LinkerAPI.getLinkedDocuments
   * @param {*} document
   * @param {*} allLinked
   * @param {*} processedLinks
   * @returns
   */
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

  /**
   * Utility for LinkerAPI.getHardLinkedDocuments
   * @param {*} document
   * @param {*} allLinked
   * @param {*} processedLinks
   * @returns
   */
  static _findHardLinked(document, allLinked, processedLinks = new Set()) {
    allLinked.add(document);

    const links = document.flags[MODULE_ID]?.links
      ?.filter((l) => l.type !== LINK_TYPES.RECEIVE && !processedLinks.has(l.id))
      .map((l) => l.id);
    if (!links?.length) return allLinked;

    links.forEach((l) => processedLinks.add(l));

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const linked = document.parent
        .getEmbeddedCollection(documentName)
        .filter((t) =>
          t.flags[MODULE_ID]?.links?.some((l1) => links.find((l2) => l2 === l1.id && l1.type !== LINK_TYPES.SEND))
        );

      for (const d of linked) {
        this._findHardLinked(d, allLinked, processedLinks);
      }
    });

    return allLinked;
  }

  static _highlightDocuments(docs) {
    const dg = canvas.controls.debug;
    dg.clear();

    const width = 8;
    const alpha = 1;
    docs.forEach((d) => {
      let bounds = d.object.bounds;

      dg.lineStyle(width + 2, 0, alpha, 0.5);
      dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);

      dg.lineStyle(width, LINKER_DOC_COLORS[d.documentName], alpha, 0.5);
      dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    });
  }

  static _clearHighlight() {
    canvas.controls.debug.clear();
  }
}
