import { LINK_TYPES, LinkerAPI } from './linker.js';
import { localize, MODULE_ID, pickerSelectMultiLayerDocuments, SUPPORTED_PLACEABLES } from '../utils';
import Graph from 'graphology';
import { Sigma } from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { createNodeImageProgram } from '@sigma/node-image';
import { createNodeCompoundProgram, NodeCircleProgram } from 'sigma/rendering';

export function openLinkerMenu() {
  const menu = Object.values(ui.windows).find((w) => w instanceof LinkerMenu);
  if (menu) menu.close();
  else new LinkerMenu().render(true);
}

const DOC_ICONS = {
  Token: 'modules/multi-token-edit/images/linker/person-fill.svg',
  MeasuredTemplate: 'modules/multi-token-edit/images/linker/rulers.svg',
  Tile: 'modules/multi-token-edit/images/linker/boxes.svg',
  Drawing: 'modules/multi-token-edit/images/linker/pencil-fill.svg',
  Wall: 'modules/multi-token-edit/images/linker/bricks.svg',
  AmbientLight: 'modules/multi-token-edit/images/linker/lightbulb-fill.svg',
  AmbientSound: 'modules/multi-token-edit/images/linker/music-note-beamed.svg',
  Note: 'modules/multi-token-edit/images/linker/bookmark-fill.svg',
  Region: 'modules/multi-token-edit/images/linker/border-outer.svg',
};

const GRAPH_CONFIG = {
  document: {
    color: 'white',
    colorSelected: '#7FFF00',
    pictoColor: 'red',
    size: 15,
  },
  link: {
    color: 'yellow',
    colorSelected: '#7FFF00',
    pictoColor: 'red',
    image: 'modules/multi-token-edit/images/linker/link-45deg.svg',
    size: 15,
  },
  edge: {
    arrow: 'orange',
    line: 'white',
    hover: '#7FFF00',
    size: 4,
  },
};

class LinkerMenu extends FormApplication {
  static registeredHooks = [];

  /**
   * Highlight nodes on placeable control
   * @param {PlaceableObject} placeable
   * @param {Boolean} controlled
   */
  static onControl(placeable, controlled) {
    const document = placeable.document;
    if (this._graph.hasNode(document.id)) {
      this._graph.setNodeAttribute(document.id, 'highlighted', controlled);
    }
  }

  /**
   * Remove nodes on placeable destroy
   * @param {*} document
   */
  static onDelete(document) {
    if (document.parent.id === canvas.scene.id) LinkerMenu.removeNode.call(this, document.id);
  }

  /**
   * Add nodes for created documents
   * @param {*} document
   */
  static onCreate(document) {
    if (document.object) this._processDocument(document);
  }

  static addLink(documentName, documentId, linkId, linkType, linkLabel) {
    const graph = this._graph;

    if (!graph.hasNode(linkId)) this._addLinkNode(linkId, { x: 0.5, y: 0.5 }, linkLabel);

    if (!graph.hasNode(documentId)) {
      const position = { x: graph.getNodeAttribute(linkId, 'x'), y: graph.getNodeAttribute(linkId, 'y') };

      position.x += Math.random() * 0.1 - 0.05;
      position.y += Math.random() * 0.01 - 0.005;

      this._addDocumentNode(documentName, documentId, null, position);
    }

    let edge = graph.edges(documentId).find((edge) => graph.source(edge) === linkId || graph.target(edge) === linkId);

    if (!edge) return this._addEdge(documentId, linkId, linkType);

    // Need to manually change the edge appearance
    if (linkType === LINK_TYPES.TWO_WAY) {
      graph.setEdgeAttribute(edge, 'type', 'line');
      graph.setEdgeAttribute(edge, 'color', GRAPH_CONFIG.edge.line);
    } else {
      graph.dropEdge(edge);
      this._addEdge(documentId, linkId, linkType);
    }
  }

  /**
   * Update graph state in response to link being removed from a document
   * @param {String} documentId
   * @param {String} linkId
   * @returns
   */
  static removeLink(documentId, linkId) {
    const graph = this._graph;
    if (!(graph.hasNode(documentId) || graph.hasNode(linkId))) return;

    // Find edge connecting doc and link nodes
    const edge = graph.edges(documentId).find((edge) => graph.source(edge) === linkId || graph.target(edge) === linkId);
    if (!edge) return;

    const docNeighbors = graph.neighbors(documentId);
    // const linkNeighbors = graph.neighbors(linkId);

    if (docNeighbors.length < 2) LinkerMenu.removeNode.call(this, documentId);
    else {
      graph.dropEdge(edge);
      canvas.controls.debug.clear();
      this._refreshControlState();
    }
  }

  /**
   * Update graph state in response all document links being removed, or a link being removed from the whole scene
   * @param {String} node document/link id
   * @returns
   */
  static removeNode(node) {
    const graph = this._graph;
    if (!graph.hasNode(node)) return;

    if (graph.getNodeAttribute(node, 'isLink')) {
      // Link node handling

      // If this link was the sole connection to a document,
      // remove that document from the graph
      graph.forEachNeighbor(node, (n) => {
        if (graph.edges(n).length === 1) {
          graph.dropNode(n);
        }
      });

      graph.dropNode(node);

      // If this node was selected, reset the selection
      if (node === this._selectedLinkNode) this._selectedLinkNode = null;
    } else {
      // Document node handling

      // If this was the only document with an edge to a link, remove the link node
      graph.neighbors(node).forEach((node) => {
        if (graph.edges(node).length === 1) {
          graph.dropNode(node);
          // If this node was selected, reset the selection
          if (node === this._selectedLinkNode) this._selectedLinkNode = null;
        }
      });

      graph.dropNode(node);

      // If this node was selected, remove it from selections
      this._selectedNodes = this._selectedNodes.filter((n) => n !== node);
    }

    // Refresh highlights and controls
    canvas.controls.debug.clear();
    this._refreshControlState();
  }

  static onCanvasReady() {
    this.close(true);
  }

  static linkLabelChange(linkId, label) {
    if (this._graph.hasNode(linkId)) this._graph.setNodeAttribute(linkId, 'label', label ?? 'LINK');
  }

  /**
   * Register hooks to provide Canvas to LinkerMenu interactivity.
   * At the moment this is just for placeable control
   * @param {LinkerMenu} app
   */
  static registerHooks(app) {
    LinkerMenu.unregisterHooks();

    // Control hooks
    SUPPORTED_PLACEABLES.forEach((embeddedName) => {
      LinkerMenu.registeredHooks.push({
        hook: `control${embeddedName}`,
        id: Hooks.on(`control${embeddedName}`, LinkerMenu.onControl.bind(app)),
      });
      LinkerMenu.registeredHooks.push({
        hook: `delete${embeddedName}`,
        id: Hooks.on(`delete${embeddedName}`, LinkerMenu.onDelete.bind(app)),
      });
      LinkerMenu.registeredHooks.push({
        hook: `create${embeddedName}`,
        id: Hooks.on(`create${embeddedName}`, LinkerMenu.onCreate.bind(app)),
      });
    });

    // API hooks
    LinkerMenu.registeredHooks.push({
      hook: `${MODULE_ID}.removeLink`,
      id: Hooks.on(`${MODULE_ID}.removeLink`, LinkerMenu.removeLink.bind(app)),
    });
    LinkerMenu.registeredHooks.push({
      hook: `${MODULE_ID}.removeNode`,
      id: Hooks.on(`${MODULE_ID}.removeNode`, LinkerMenu.removeNode.bind(app)),
    });
    LinkerMenu.registeredHooks.push({
      hook: `${MODULE_ID}.addLink`,
      id: Hooks.on(`${MODULE_ID}.addLink`, LinkerMenu.addLink.bind(app)),
    });
    LinkerMenu.registeredHooks.push({
      hook: `${MODULE_ID}.linkLabelChange`,
      id: Hooks.on(`${MODULE_ID}.linkLabelChange`, LinkerMenu.linkLabelChange.bind(app)),
    });

    // Close window on canvasReady (scene change)
    LinkerMenu.registeredHooks.push({
      hook: `canvasReady`,
      id: Hooks.on(`canvasReady`, LinkerMenu.onCanvasReady.bind(app)),
    });
  }

  /**
   * Removed hooks registered via LinkerMenu.registerHooks
   */
  static unregisterHooks() {
    LinkerMenu.registeredHooks.forEach((h) => Hooks.off(h.hook, h.id));
    LinkerMenu.registeredHooks = [];
  }

  constructor() {
    // const pos = canvas.clientCoordinatesFromCanvas(canvas.mousePosition);
    // super({}, { left: Math.max(pos.x - 350, 0), top: pos.y });

    const pos = ui.controls.element.find('[data-control="me-presets"]').position();
    super({}, { left: pos.left + 50, top: pos.top });

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
    this._selectedNodes = [];

    // Register control hooks for highlighting of currently controlled placeables
    LinkerMenu.registerHooks(this);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-linker-menu',
      template: `modules/${MODULE_ID}/templates/linker.html`,
      classes: ['mass-edit-dark-window', 'mass-edit-window-fill', 'me-allow-overflow'],
      resizable: true,
      minimizable: false,
      width: 500,
      height: 600,
      scrollY: ['.links'],
    });
  }

  _addDocumentNode(documentName, documentId, doc = null, position = null) {
    const document = doc ?? canvas.scene.getEmbeddedDocument(documentName, documentId);
    if (!document) return;

    const coords = position ?? {
      x: document.object.bounds.x,
      y: -document.object.bounds.y,
    };

    this._graph.addNode(documentId, {
      size: GRAPH_CONFIG.document.size,
      label: documentName,
      color: GRAPH_CONFIG.document.color,
      pictoColor: GRAPH_CONFIG.document.pictoColor,
      image: DOC_ICONS[documentName],
      type: 'pictogram',
      document,
      ...coords,
    });

    return coords;
  }

  _addLinkNode(linkId, coords, label = null) {
    this._graph.addNode(linkId, {
      size: GRAPH_CONFIG.link.size,
      label: label ?? 'LINK',
      color: GRAPH_CONFIG.link.color,
      pictoColor: GRAPH_CONFIG.link.pictoColor,
      image: GRAPH_CONFIG.link.image,
      type: 'pictogram',
      isLink: true,
      ...coords,
    });
  }

  _addEdge(documentId, linkId, linkType) {
    let source, target;
    if (linkType === LINK_TYPES.RECEIVE) {
      source = linkId;
      target = documentId;
    } else {
      source = documentId;
      target = linkId;
    }
    return this._graph.addEdge(source, target, {
      size: GRAPH_CONFIG.edge.size,
      color: linkType === LINK_TYPES.TWO_WAY ? GRAPH_CONFIG.edge.line : GRAPH_CONFIG.edge.arrow,
      type: linkType === LINK_TYPES.TWO_WAY ? 'line' : 'arrow',
    });
  }

  _processDocument(d) {
    if (d.flags[MODULE_ID]?.links?.length) {
      const coords = this._addDocumentNode(d.documentName, d.id, d);

      // Link nodes and edges
      d.flags[MODULE_ID].links.forEach((link) => {
        if (!this._graph.hasNode(link.id)) {
          this._addLinkNode(link.id, { x: coords.x + 40, y: coords.y + 40 }, link.label);
        }
        this._addEdge(d.id, link.id, link.type);
      });
    }
  }

  async activateGraph(html) {
    const graph = new Graph();
    this._graph = graph;

    // Add nodes and edges
    const selected = LinkerAPI._getSelected().map((p) => p.document);
    if (selected.length) {
      selected.forEach((d) => this._processDocument(d));
      LinkerAPI.getLinkedDocuments(selected).forEach((d) => this._processDocument(d));
    } else {
      // Retrieve links from the whole scene
      SUPPORTED_PLACEABLES.forEach((embeddedName) => {
        canvas.scene.getEmbeddedCollection(embeddedName).forEach((d) => {
          this._processDocument(d);
        });
      });
    }

    //const positions = forceAtlas2(graph, { iterations: 50 });
    //forceAtlas2.assign(graph, 50);

    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const layout = new FA2Layout(graph, {
      settings: sensibleSettings,
    });

    // const layout = new ForceSupervisor(graph, { isNodeFixed: (_, attr) => attr.highlighted });

    this._graphLayout = layout;
    layout.start();

    // Program for rendering circle nodes with pictographs
    const NodePictogramCustomProgram = createNodeImageProgram({
      padding: 0.15,
      size: { mode: 'force', value: 256 },
      drawingMode: 'color',
      colorAttribute: 'pictoColor',
    });
    const NodeProgram = createNodeCompoundProgram([NodeCircleProgram, NodePictogramCustomProgram]);

    const sigmaInstance = new Sigma(graph, html.find('.graph')[0], {
      defaultNodeType: 'pictogram',
      enableEdgeEvents: true,
      nodeProgramClasses: {
        pictogram: NodeProgram,
      },
    });
    this._sigmaInstance = sigmaInstance;

    const highlightDocs = function (docs) {
      const dg = canvas.controls.debug;
      dg.clear();

      const width = 8;
      const alpha = 1;
      docs.forEach((d) => {
        let bounds = d.object.bounds;

        dg.lineStyle(width + 2, 0, alpha, 0.5);
        dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);

        dg.lineStyle(width, 0x00ff00, alpha, 0.5);
        dg.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
      });
    };

    sigmaInstance.on('doubleClickStage', ({ event }) => {
      const id = foundry.utils.randomID();

      const coord = sigmaInstance.viewportToGraph({ x: event.x, y: event.y });

      graph.addNode(id, {
        size: GRAPH_CONFIG.link.size,
        label: 'LINK',
        color: GRAPH_CONFIG.link.color,
        pictoColor: GRAPH_CONFIG.link.pictoColor,
        image: GRAPH_CONFIG.link.image,
        type: 'pictogram',
        isLink: true,
        x: coord.x,
        y: coord.y,
      });
      // Prevent sigma from zooming in the camera:
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
      this.onClickNode(id);
    });

    sigmaInstance.on('enterNode', ({ node }) => {
      const document = graph.getNodeAttribute(node, 'document');
      if (document) highlightDocs([document]);
      else highlightDocs(LinkerAPI._getLinkedDocumentsUsingLink(node));
    });

    sigmaInstance.on('leaveNode', () => {
      canvas.controls.debug.clear();
    });

    sigmaInstance.on('clickNode', ({ node }) => this.onClickNode(node));
    sigmaInstance.on('rightClickNode', ({ node }) => this.removeNode(node));
    sigmaInstance.on('doubleClickNode', ({ event, node }) => {
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();

      this.editLinkLabel(node);
    });

    sigmaInstance.on('enterEdge', ({ edge }) => {
      graph.setEdgeAttribute(edge, 'color', GRAPH_CONFIG.edge.hover);
    });
    sigmaInstance.on('leaveEdge', ({ edge }) => {
      graph.setEdgeAttribute(
        edge,
        'color',
        graph.getEdgeAttribute(edge, 'type') === 'line' ? GRAPH_CONFIG.edge.line : GRAPH_CONFIG.edge.arrow
      );
    });
    sigmaInstance.on('clickEdge', ({ edge }) => this.cycleEdgeType(edge));
    sigmaInstance.on('rightClickEdge', ({ edge }) => this.removeEdge(edge));
  }

  /**
   * Show a dialog to edit link node label
   * @param {String} node
   * @returns
   */
  editLinkLabel(node) {
    const graph = this._graph;
    if (!graph.getNodeAttribute(node, 'isLink')) return;

    const currentLabel = graph.getNodeAttribute(node, 'label');
    new Dialog({
      title: `Edit: Link Label`,
      content: `<input class="label" type="text" value="${currentLabel}"></input>`,
      buttons: {
        save: {
          label: localize('Save', false),
          callback: (html) => {
            if (!graph.hasNode(node)) return;

            const updatedLabel = html.find('.label').val();
            if (updatedLabel && updatedLabel != currentLabel) {
              LinkerAPI.updateLinkLabelOnCurrentScene(node, updatedLabel);
            }
          },
        },
      },
    }).render(true);
  }

  /**
   * Remove edge from graph and link from the document the edge connects to.
   * @param {String} edge
   */
  removeEdge(edge) {
    const graph = this._graph;
    let source = graph.source(edge);
    let target = graph.target(edge);

    let linkNode;
    let documentNode;
    if (graph.getNodeAttribute(source, 'isLink')) {
      linkNode = source;
      documentNode = target;
    } else {
      linkNode = target;
      documentNode = source;
    }

    LinkerAPI.removeLink(graph.getNodeAttribute(documentNode, 'document'), linkNode);
  }

  /**
   * Cycle edge through link types defined in `LINK_TYPES`.
   * @param {String} edge
   */
  cycleEdgeType(edge) {
    const graph = this._graph;

    let source = graph.source(edge);
    let target = graph.target(edge);

    let linkType;
    if (graph.getEdgeAttribute(edge, 'type') === 'line') {
      linkType = LINK_TYPES.TWO_WAY;
    } else if (graph.getNodeAttribute(target, 'isLink')) {
      linkType = LINK_TYPES.SEND;
    } else {
      linkType = LINK_TYPES.RECEIVE;
    }

    // Cycle link type
    linkType = (linkType + 1) % Object.keys(LINK_TYPES).length;

    // Update document with new link type
    LinkerAPI.addLink(
      graph.getNodeAttribute(source, 'document') ?? graph.getNodeAttribute(target, 'document'),
      graph.getNodeAttribute(source, 'isLink') ? source : target,
      linkType
    );
  }

  onClickNode(node) {
    const graph = this._graph;
    if (graph.getNodeAttribute(node, 'isLink')) {
      // Link node click handling
      if (this._selectedLinkNode === node) {
        this._selectedLinkNode = null;
        graph.setNodeAttribute(node, 'color', GRAPH_CONFIG.link.color);
      } else {
        if (this._selectedLinkNode) graph.setNodeAttribute(this._selectedLinkNode, 'color', GRAPH_CONFIG.link.color);
        this._selectedLinkNode = node;
        graph.setNodeAttribute(this._selectedLinkNode, 'color', GRAPH_CONFIG.link.colorSelected);
      }
    } else {
      // Placeable note click handling
      if (this._selectedNodes.includes(node)) {
        this._selectedNodes = this._selectedNodes.filter((n) => n !== node);
        graph.setNodeAttribute(node, 'color', GRAPH_CONFIG.document.color);
      } else {
        this._selectedNodes.push(node);
        graph.setNodeAttribute(node, 'color', GRAPH_CONFIG.document.colorSelected);
      }
    }
    this._sigmaInstance.refresh();
    this._refreshControlState();
  }

  removeNode(node) {
    const graph = this._graph;

    if (graph.getNodeAttribute(node, 'isLink')) {
      LinkerAPI.removeLinkFromScene(node);
    } else {
      // Placeable note click handling
      const document = graph.getNodeAttribute(node, 'document');
      if (document) LinkerAPI.removeLinks(document);
    }
  }

  async getData(options = {}) {
    return {};
  }

  get title() {
    return 'Mass Edit: Linker';
  }

  activateListeners(html) {
    super.activateListeners(html);

    this._conditionalControls = [
      {
        element: html.find('.selectedToLink').on('click', this._onSelectedToLinkControlClick.bind(this)),
        condition: () => this._selectedLinkNode,
      },
      {
        element: html.find('.pickerSelectToLink').on('click', this._onPickerSelectToLink.bind(this)),
        condition: () => this._selectedLinkNode && !game.Levels3DPreview?._active,
      },
      {
        element: html.find('.nodeToLink').on('click', this._onNodeToLinkControlClick.bind(this)),
        condition: () => this._selectedLinkNode && this._selectedNodes.length,
      },
      {
        element: html.find('.cycleLinkType').on('click', this._onCycleLinkType.bind(this)),
        condition: () => this._selectedLinkNode,
      },
    ];

    html.find('.removeLinksSelected').on('click', LinkerAPI.removeAllLinksFromSelected);
    html.find('.removeSelectedAndLinked').on('click', LinkerAPI.deleteSelectedLinkedPlaceables);

    // Display node graph
    this.activateGraph(html);
  }

  _onCycleLinkType() {
    if (!this._selectedLinkNode) return;

    const graph = this._graph;

    const edges = graph.edges(this._selectedLinkNode);
    if (!edges.length) return;

    // Use the first found edge to determine the type to be used for cycling
    const edge = edges[0];
    const target = graph.target(edge);

    let linkType;
    if (graph.getEdgeAttribute(edge, 'type') === 'line') {
      linkType = LINK_TYPES.TWO_WAY;
    } else if (graph.getNodeAttribute(target, 'isLink')) {
      linkType = LINK_TYPES.SEND;
    } else {
      linkType = LINK_TYPES.RECEIVE;
    }

    // Cycle link type
    linkType = (linkType + 1) % Object.keys(LINK_TYPES).length;

    // Update all neighbors
    graph.neighbors(this._selectedLinkNode).forEach((node) => {
      const document = graph.getNodeAttribute(node, 'document');
      if (document) LinkerAPI.addLink(document, this._selectedLinkNode, linkType);
    });
  }

  async _onPickerSelectToLink() {
    if (!this._selectedLinkNode) return;

    const neighbors = this._graph.neighbors(this._selectedLinkNode);
    const selected = await pickerSelectMultiLayerDocuments();
    selected
      .filter((d) => !neighbors.includes(d.id))
      .forEach((d) => LinkerAPI.addLink(d, this._selectedLinkNode, LINK_TYPES.TWO_WAY));
  }

  _onSelectedToLinkControlClick() {
    if (!this._selectedLinkNode) return;

    const neighbors = this._graph.neighbors(this._selectedLinkNode);
    LinkerAPI._getSelected()
      .map((p) => p.document)
      .filter((d) => !neighbors.includes(d.id))
      .forEach((d) => LinkerAPI.addLink(d, this._selectedLinkNode, LINK_TYPES.TWO_WAY));
  }

  _onNodeToLinkControlClick() {
    if (!this._selectedLinkNode || !this._selectedNodes.length) return;

    const graph = this._graph;
    const nodes = this._selectedNodes.filter((node) => !graph.neighbors(node).includes(this._selectedLinkNode));
    nodes.forEach((node) => {
      LinkerAPI.addLink(graph.getNodeAttribute(node, 'document'), this._selectedLinkNode, LINK_TYPES.TWO_WAY);
    });
  }

  _refreshControlState() {
    this._conditionalControls.forEach((control) => {
      if (control.condition()) control.element.removeAttr('disabled');
      else control.element.attr('disabled', 'disabled');
    });
  }

  async close(options = {}) {
    this._graphLayout?.kill();
    this._sigmaInstance?.kill();
    canvas.controls?.debug?.clear();
    LinkerMenu.unregisterHooks();

    return super.close(options);
  }
}
