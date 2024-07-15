/**
 * Manage placeable linking to one another using `links` flag.
 */

import { DataTransform } from './picker.js';
import { libWrapper } from './shim/shim.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, updateEmbeddedDocumentsViaGM } from './utils.js';
import { getDataBounds } from './presets/utils.js';

const PROCESSED_UPDATES = new Map();
export const LINK_TYPES = {
  TWO_WAY: 0,
  RECEIVE: 1,
  SEND: 2,
};

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

function preUpdate(document, change, options, userId) {
  if (game.user.id !== userId || options.ignoreLinks) return;

  let links = document.flags[MODULE_ID]?.links?.filter((l) => l.type !== LINK_TYPES.RECEIVE);
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

    let { transform, origin } = calculateTransform(document, change, options);

    // If control is held during non-rotation update, we want to ignore links
    if (
      game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL) &&
      !transform.hasOwnProperty('rotation')
    ) {
      return;
    }

    const docUpdates = new Map();
    processLinks(transform, origin, links, scene, docUpdates, new Set(links.map((l) => l.id)), document.id);
    docUpdates.forEach((updates, documentName) => {
      const options = { ignoreLinks: true, animate: false };
      if (documentName === 'Token') {
        options.RidingMovement = true; // 'Auto-Rotate' module compatibility
      }
      updateEmbeddedDocumentsViaGM(documentName, updates, options, scene);
    });
    return;
  }
}

function calculateTransform(document, change, options) {
  let transform;

  // Cannot trust document data as it can be modified by animations
  // to get real coordinates/dimensions we need to use source
  const source = document._source;

  if (change.hasOwnProperty('shapes') || change.hasOwnProperty('c')) {
    if (options.hasOwnProperty('meRotation')) {
      transform = { x: 0, y: 0 };
    } else {
      const changeBounds = getDataBounds(document.documentName, change);
      const currentBounds = getDataBounds(document.documentName, source);

      transform = {
        x: changeBounds.x1 - currentBounds.x1,
        y: changeBounds.y1 - currentBounds.y1,
      };
    }
  } else {
    transform = {
      x: change.hasOwnProperty('x') ? change.x - source.x : 0,
      y: change.hasOwnProperty('y') ? change.y - source.y : 0,
    };
  }

  const origin = { x: 0, y: 0 };

  if (change.hasOwnProperty('rotation') || options.hasOwnProperty('meRotation')) {
    const dRotation = options.hasOwnProperty('meRotation') ? options.meRotation : change.rotation - source.rotation;
    if (dRotation !== 0) {
      transform.rotation = dRotation;

      const { x1, y1, x2, y2 } = getDataBounds(document.documentName, source);

      origin.x = x1 + (x2 - x1) / 2;
      origin.y = y1 + (y2 - y1) / 2;
      //console.log({ c: change.rotation, s: source.rotation, t: transform.rotation });
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

export class LinkerAPI {
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

  static _getLinkedDocumentsUsingLink(link) {
    const allLinked = new Set();
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      canvas.scene.getEmbeddedCollection(documentName).forEach((d) => {
        if (d.flags[MODULE_ID]?.links?.some((l) => l.id === link.id && l.type === link.type)) {
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

  static removeLinkFromScene(link) {
    const scene = canvas.scene;
    if (!scene || !link || !link.id) return;

    SUPPORTED_PLACEABLES.forEach((documentName) => {
      const updates = [];
      scene.getEmbeddedCollection(documentName).forEach((d) => {
        let links = d.flags[MODULE_ID]?.links;
        if (links) {
          let fLinks = links.filter((l) => l.id !== link.id);
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

export class LinkerMenu extends FormApplication {
  constructor() {
    const pos = canvas.clientCoordinatesFromCanvas(canvas.mousePosition);
    super({}, { left: Math.max(pos.x - 350, 0), top: pos.y });

    // const pos = ui.controls.element.find('[data-control="me-presets"]').position();
    // super({}, { left: pos.left + 50, top: pos.top });

    const links = [];
    SUPPORTED_PLACEABLES.forEach((embeddedName) => {
      canvas.scene.getEmbeddedCollection(embeddedName).forEach((d) => {
        d.flags[MODULE_ID]?.links?.forEach((l1) => {
          if (!links.find((l2) => l1.id === l2.id && l1.type === l2.type)) links.push(foundry.utils.deepClone(l1));
        });
      });
    });
    links.sort((l1, l2) => l1.id.localeCompare(l2.id));

    this.links = links;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-linker-menu',
      template: `modules/${MODULE_ID}/templates/linker.html`,
      classes: ['mass-edit-dark-window', 'mass-edit-window-fill', 'me-allow-overflow'],
      resizable: false,
      minimizable: false,
      width: 300,
      height: 'auto',
      scrollY: ['.links'],
    });
  }

  async getData(options = {}) {
    return {
      links: foundry.utils.deepClone(this.links).map((l) => {
        l.icon = this._getTypeIcon(l.type);
        return l;
      }),
    };
  }

  get title() {
    return 'Links';
  }

  _getTypeIcon(type) {
    if (type === LINK_TYPES.RECEIVE) {
      return '<i class="fa-duotone fa-arrow-right-arrow-left" title="Receive"></i>';
    } else if (type === LINK_TYPES.SEND) {
      return '<i class="fa-duotone fa-arrow-right-arrow-left fa-rotate-180" title="Send"></i>';
    } else {
      return '<i class="fa-solid fa-arrow-right-arrow-left" title="Receive & Send"></i>';
    }
  }

  _addLink() {
    const link = { id: foundry.utils.randomID(), type: LINK_TYPES.TWO_WAY };
    this.links.push(link);
    LinkerAPI.addLinkToSelected(link.id, link.type);
    this.render(true);
  }

  _removeAllLinks() {
    LinkerAPI.removeAllLinksFromSelected();
    ui.notifications.info('LINKS REMOVED');
  }

  _applyLink(event) {
    if (canvas.activeLayer.controlled?.length) {
      const link = this.links[Number($(event.currentTarget).closest('.link').data('index'))];
      LinkerAPI.addLinkToSelected(link.id, link.type);
      ui.notifications.info('LINK APPLIED');
    }
  }

  _removeLink(event) {
    if (canvas.activeLayer.controlled?.length) {
      const link = this.links[Number($(event.currentTarget).closest('.link').data('index'))];
      LinkerAPI.removeLinkFromSelected(link.id);
      ui.notifications.info('LINK REMOVED');
    }
  }

  _hoverInLink(event) {
    const dg = canvas.controls.debug;
    const link = this.links[Number($(event.currentTarget).closest('.link').data('index'))];
    if (!link) return dg.clear();

    const linked = LinkerAPI._getLinkedDocumentsUsingLink(link);
    if (!linked) return dg.clear();

    const width = 8;
    const alpha = 1;
    linked.forEach((d) => {
      let bounds = d.object.bounds;

      dg.lineStyle(width + 2, 0, alpha, 0.5);
      dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);

      dg.lineStyle(width, 0x00ff00, alpha, 0.5);
      dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    });
  }

  _hoverOutLink(event) {
    canvas.controls.debug.clear();
  }

  async close(options = {}) {
    canvas.controls?.debug?.clear();
    return super.close(options);
  }

  _toggleType(event) {
    const typeControl = $(event.currentTarget);

    const link = this.links[Number(typeControl.closest('.link').data('index'))];
    link.type = (link.type + 1) % Object.keys(LINK_TYPES).length;

    typeControl.html(this._getTypeIcon(link.type));
  }

  _linkIdChange(event) {
    const id = $(event.currentTarget);
    this.links[Number(id.closest('.link').data('index'))].id = id.text();
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.unshift({
      label: '',
      class: 'mass-edit-delete-link',
      icon: 'fa-solid fa-link-slash',
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
    html.on('click', '.toggle-type', this._toggleType.bind(this));
    html.find('.add-link').on('click', this._addLink.bind(this));
    html
      .find('.links .link')
      .on('mouseover', this._hoverInLink.bind(this))
      .on('mouseout', this._hoverOutLink.bind(this));
    html.find('.linkId').on('input', this._linkIdChange.bind(this));

    // Setup context menus for links
    this._contextMenu(html.find('.links'));
    html.closest('.window-content').addClass('me-allow-overflow'); // Allow context menu overflow

    // Since Foundry doesn't allow to specify hover over text for header buttons, lets add it here
    html.closest('.window-app').find('header .mass-edit-delete-link').attr('title', 'Remove All Links from Selected');
  }

  _contextMenu(html) {
    ContextMenu.create(
      this,
      html,
      '.links .link',
      [
        {
          name: 'Remove Link from Scene',
          icon: '<i class="fa-solid fa-link-slash"></i>',
          callback: (linkElement) => {
            const link = this.links[Number(linkElement.closest('.link').data('index'))];
            if (link) LinkerAPI.removeLinkFromScene(link);
          },
        },
        {
          name: 'Delete Linked Placeables',
          icon: '<i class="fas fa-trash"></i>',
          callback: (linkElement) => {
            const link = this.links[Number(linkElement.closest('.link').data('index'))];
            if (link) LinkerAPI.deleteLinkedPlaceables(link);
          },
        },
      ],
      {
        hookName: 'MassEditLinkContext',
      }
    );
  }
}
