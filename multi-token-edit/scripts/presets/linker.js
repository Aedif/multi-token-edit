/**
 * Manage placeable linking to one another using `links` flag.
 */

import { DataTransform } from '../picker.js';
import { libWrapper } from '../shim/shim.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, updateEmbeddedDocumentsViaGM } from '../utils.js';
import { getDataBounds } from './utils.js';

const PROCESSED_UPDATES = new Map();

export function registerLinkerHooks() {
  SUPPORTED_PLACEABLES.forEach((name) => Hooks.on(`preUpdate${name}`, preUpdate));

  if (foundry.utils.isNewerVersion(12, game.version)) {
    libWrapper.register(
      MODULE_ID,
      'Scene.prototype.updateEmbeddedDocuments',
      function (wrapped, embeddedName, updates = [], context = {}) {
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
      .filter((t) => t.flags[MODULE_ID]?.links?.some((l1) => links.find((l2) => l2.id === l1.id)) && t.id !== sourceId);

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
        const dLinks = d.flags[MODULE_ID].links.filter((l) => !(l.child || processedLinks.has(l.id)));
        if (dLinks.length) {
          dLinks.forEach((l) => processedLinks.add(l.id));
          processLinks(transform, origin, dLinks, scene, docUpdates, processedLinks, d.id);
        }
      }

      docUpdates.set(documentName, (docUpdates.get(documentName) ?? []).concat(updates));
    }
  });
}

function preUpdate(document, change, options, userId) {
  if (game.user.id !== userId || options.ignoreLinks) return;

  let links = document.flags[MODULE_ID]?.links?.filter((l) => !l.child);
  if (!links?.length) return;

  if (
    change.hasOwnProperty('x') ||
    change.hasOwnProperty('y') ||
    change.hasOwnProperty('rotation') ||
    change.hasOwnProperty('shapes') ||
    change.hasOwnProperty('c') ||
    change.hasOwnProperty('elevation')
  ) {
    // If an update occurred at the same time we need to check whether
    // this update has unique links which need to be processed
    const puLinks = PROCESSED_UPDATES.get(options.modifiedTime);
    if (puLinks) {
      links = links.filter((l) => !puLinks.some((l2) => l2.id === l.id));
      if (!links.length) return;
      puLinks.push(...links);
    } else {
      PROCESSED_UPDATES.set(options.modifiedTime, links);
      setTimeout(() => PROCESSED_UPDATES.delete(options.modifiedTime), 2000);
    }

    const scene = document.parent;

    let { transform, origin } = calculateTransform(document, change);

    const docUpdates = new Map();
    processLinks(transform, origin, links, scene, docUpdates, new Set(links.map((l) => l.id)), document.id);
    docUpdates.forEach((updates, documentName) => {
      updateEmbeddedDocumentsViaGM(documentName, updates, { ignoreLinks: true, animate: false }, scene);
    });
    return;
  }
}

function calculateTransform(document, change) {
  let transform;

  // Cannot trust document data as it can be modified by animations
  // to get real coordinates/dimensions we need to use source
  const source = document._source;

  if (change.hasOwnProperty('shapes') || change.hasOwnProperty('c')) {
    const changeBounds = getDataBounds(document.documentName, change);
    const currentBounds = getDataBounds(document.documentName, source);

    transform = {
      x: changeBounds.x1 - currentBounds.x1,
      y: changeBounds.y1 - currentBounds.y1,
    };
  } else {
    transform = {
      x: change.hasOwnProperty('x') ? change.x - source.x : 0,
      y: change.hasOwnProperty('y') ? change.y - source.y : 0,
    };
  }

  const origin = { x: 0, y: 0 };

  if (change.hasOwnProperty('rotation')) {
    const dRotation = change.rotation - source.rotation;

    if (dRotation !== 0) {
      transform.rotation = change.rotation - source.rotation;

      const { x1, y1, x2, y2 } = getDataBounds(document.documentName, source);

      origin.x = x1 + (x2 - x1) / 2;
      origin.y = y1 + (y2 - y1) / 2;
    }
  }

  if (change.hasOwnProperty('elevation')) {
    if (Number.isNumeric(change.elevation)) {
      transform.z = change.elevation - source.elevation;
    } else if (change.elevation.bottom != null) {
      transform.z = change.elevation.bottom - (source.elevation.bottom ?? 0);
    }
  }

  return { transform, origin };
}

// TODO, get chained links
export function getLinkedPlaceables(links, parentId = null) {
  const linked = [];
  SUPPORTED_PLACEABLES.forEach((documentName) => {
    canvas.getLayerByEmbeddedName(documentName).placeables.forEach((p) => {
      if (
        p.document.flags[MODULE_ID]?.links?.find((l1) => links.find((l2) => l1.id === l2.id)) &&
        p.document.id !== parentId
      )
        linked.push(p);
    });
  });
  return linked;
}

export class LinkerAPI {
  /**
   * Get all documents linked to the placeable/document including the placeable/document itself
   * @param {PlaceableObject|CanvasDocumentMixin} placeable or placeable document
   * @param {Object} meta internal tracking data used by the function
   * @returns
   */
  static getLinkedDocuments(placeable, { processedLinks = new Set(), allLinked = new Set() } = {}) {
    const document = placeable.document ?? placeable;
    allLinked.add(document);

    const links = document.flags[MODULE_ID].links.filter((l) => !processedLinks.has(l.id)).map((l) => l.id);
    if (!links.length) return allLinked;

    processedLinks.add(...links);

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const linked = canvas.scene
        .getEmbeddedCollection(documentName)
        .filter((t) => t.flags[MODULE_ID]?.links?.some((l1) => links.find((l2) => l2 === l1.id)));

      for (const d of linked) {
        this.getLinkedDocuments(d, { processedLinks, allLinked });
      }
    });

    return allLinked;
  }

  static addLinkToSelected(linkId, child = false) {
    this._getSelected().forEach((p) => this.addLink(p, linkId, child));
  }

  static hasLink(placeable, linkId) {
    const document = placeable.document ?? placeable;
    return Boolean(document.flags[MODULE_ID]?.links?.find((l) => l.id === linkId));
  }

  static addLink(placeable, linkId, child = false) {
    const document = placeable.document ?? placeable;
    const links = document.flags[MODULE_ID]?.links ?? [];

    let link = links.find((l) => l.id === linkId);
    if (!link) {
      link = { id: linkId };
      links.push(link);
    }
    if (child) link.child = true;
    else delete link.child;

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

  static _getSelected() {
    let selected = [];
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      selected = selected.concat(canvas.getLayerByEmbeddedName(documentName).controlled);
    });
    return selected;
  }
}

export class LinkerMenu extends FormApplication {
  constructor() {
    const pos = canvas.clientCoordinatesFromCanvas(canvas.mousePosition);
    super({}, { left: Math.max(pos.x - 350, 0), top: pos.y });

    // const pos = ui.controls.element.find('[data-control="me-presets"]').position();
    // super({}, { left: pos.left + 50, top: pos.top });

    const links = [];
    LinkerAPI._getSelected().forEach((p) => {
      p.document.flags[MODULE_ID]?.links?.forEach((l1) => {
        if (!links.find((l2) => l1.id === l2.id)) links.push(foundry.utils.deepClone(l1));
      });
    });
    this.links = links;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-linker-menu',
      template: `modules/${MODULE_ID}/templates/linker.html`,
      classes: ['mass-edit-dark-window', 'mass-edit-window-fill'],
      resizable: false,
      minimizable: false,
      width: 300,
      height: 'auto',
      scrollY: ['.links'],
    });
  }

  async getData(options = {}) {
    return { links: this.links };
  }

  get title() {
    return 'Links';
  }

  _addLink() {
    this.links.push({ id: foundry.utils.randomID() });
    this.render(true);
  }

  _removeAllLinks() {
    LinkerAPI.removeAllLinksFromSelected();
    ui.notifications.info('LINKS REMOVED');
  }

  _applyLink(event) {
    const link = $(event.currentTarget).closest('.link');
    const child = link.find('.toggle-child').hasClass('active');
    const id = link.find('.linkId').text();

    LinkerAPI.addLinkToSelected(id, child);
    ui.notifications.info('LINK APPLIED');
  }

  _removeLink(event) {
    const link = $(event.currentTarget).closest('.link');
    const id = link.find('.linkId').text();

    LinkerAPI.removeLinkFromSelected(id);
    ui.notifications.info('LINK REMOVED');
  }

  _toggleChild(event) {
    const child = $(event.currentTarget);
    child.toggleClass('active');
    this.links[Number(child.closest('.link').data('index'))].child = child.hasClass('active');

    if (child.hasClass('active')) {
      child.html('<i class="fa-duotone fa-arrow-up-arrow-down fa-rotate-90"></i>');
    } else {
      child.html('<i class="fa-solid fa-arrow-up-arrow-down fa-rotate-90"></i>');
    }
  }

  _linkIdChange(event) {
    const id = $(event.currentTarget);
    this.links[Number(id.closest('.link').data('index'))].id = id.text();
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.unshift({
      label: '',
      class: 'mass-edit-add-link',
      icon: 'fa-solid fa-link',
      onclick: () => this._addLink(),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-delete-link',
      icon: 'fas fa-trash',
      onclick: () => this._removeAllLinks(),
    });
    return buttons;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

    html.on('click', '.apply-link', this._applyLink.bind(this));
    html.on('click', '.remove-link', this._removeLink.bind(this));
    html.on('click', '.toggle-child', this._toggleChild.bind(this));
    html.find('.linkId').on('input', this._linkIdChange.bind(this));
  }
}
