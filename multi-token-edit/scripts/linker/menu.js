import { LINK_TYPES, LinkerAPI } from './linker.js';
import { MODULE_ID, SUPPORTED_PLACEABLES } from '../utils';
import Graph from 'graphology';
import { Sigma } from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { createNodeImageProgram } from '@sigma/node-image';
import { createNodeCompoundProgram, NodeCircleProgram } from 'sigma/rendering';
import ForceSupervisor from 'graphology-layout-force/worker';

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

  async activateGraph(html) {
    const graph = new Graph();
    this._graph = graph;

    const processDocument = function (d) {
      if (d.flags[MODULE_ID]?.links?.length) {
        // Placeable node
        const coords = {
          x: d.object.bounds.x,
          y: -d.object.bounds.y,
        };
        graph.addNode(d.id, {
          size: GRAPH_CONFIG.document.size,
          label: d.documentName,
          color: GRAPH_CONFIG.document.color,
          pictoColor: GRAPH_CONFIG.document.pictoColor,
          image: DOC_ICONS[d.documentName],
          type: 'pictogram',
          document: d,
          ...coords,
        });

        // Link nodes and edges
        d.flags[MODULE_ID].links.forEach((link) => {
          if (!graph.hasNode(link.id)) {
            // Link node
            graph.addNode(link.id, {
              size: GRAPH_CONFIG.link.size,
              label: 'LINK',
              color: GRAPH_CONFIG.link.color,
              pictoColor: GRAPH_CONFIG.link.pictoColor,
              image: GRAPH_CONFIG.link.image,
              type: 'pictogram',
              isLink: true,
              x: coords.x + 40,
              y: coords.y,
            });
          }

          // Edge
          let source, target;
          if (link.type === LINK_TYPES.RECEIVE) {
            source = link.id;
            target = d.id;
          } else {
            source = d.id;
            target = link.id;
          }
          graph.addEdge(source, target, {
            size: GRAPH_CONFIG.edge.size,
            color: link.type === LINK_TYPES.TWO_WAY ? GRAPH_CONFIG.edge.line : GRAPH_CONFIG.edge.arrow,
            type: link.type === LINK_TYPES.TWO_WAY ? 'line' : 'arrow',
          });
        });
      }
    };

    // Add nodes and edges
    const selected = LinkerAPI._getSelected().map((p) => p.document);
    if (selected.length) {
      selected.forEach((d) => processDocument(d));
      LinkerAPI.getLinkedDocuments(selected).forEach((d) => processDocument(d));
    } else {
      // Retrieve links from the whole scene
      SUPPORTED_PLACEABLES.forEach((embeddedName) => {
        canvas.scene.getEmbeddedCollection(embeddedName).forEach((d) => {
          processDocument(d);
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

    // TODO
    // on enter edge highlight document
    sigmaInstance.on('enterEdge', ({ edge }) => {
      graph.setEdgeAttribute(edge, 'color', GRAPH_CONFIG.edge.hover);
      const document =
        graph.getNodeAttribute(graph.source(edge), 'document') ??
        graph.getNodeAttribute(graph.target(edge), 'document');
      highlightDocs([document]);
    });
    sigmaInstance.on('leaveEdge', ({ edge }) => {
      graph.setEdgeAttribute(
        edge,
        'color',
        graph.getEdgeAttribute(edge, 'type') === 'line' ? GRAPH_CONFIG.edge.line : GRAPH_CONFIG.edge.arrow
      );
      canvas.controls.debug.clear();
    });
    sigmaInstance.on('clickEdge', ({ edge }) => this.cycleEdgeType(edge));
    sigmaInstance.on('rightClickEdge', ({ edge }) => this.removeEdge(edge));

    //this.enableNodeDrag();
  }

  enableNodeDrag() {
    // State for drag'n'drop
    let draggedNode = null;
    let isDragging = false;

    // On mouse down on a node
    //  - we enable the drag mode
    //  - save in the dragged node in the state
    //  - highlight the node
    //  - disable the camera so its state is not updated
    this._sigmaInstance.on('downNode', (e) => {
      isDragging = true;
      draggedNode = e.node;
      this._graph.setNodeAttribute(draggedNode, 'highlighted', true);
    });

    // On mouse move, if the drag mode is enabled, we change the position of the draggedNode
    this._sigmaInstance.getMouseCaptor().on('mousemovebody', (event) => {
      if (!isDragging || !draggedNode) return;

      // Get new position of node
      const pos = this._sigmaInstance.viewportToGraph({ x: event.x, y: event.y });

      this._graph.setNodeAttribute(draggedNode, 'x', pos.x);
      this._graph.setNodeAttribute(draggedNode, 'y', pos.y);

      // Prevent sigma to move camera:
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });

    // On mouse up, we reset the autoscale and the dragging mode
    this._sigmaInstance.getMouseCaptor().on('mouseup', () => {
      if (draggedNode) {
        this._graph.removeNodeAttribute(draggedNode, 'highlighted');
      }
      isDragging = false;
      draggedNode = null;
    });
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

    if (graph.neighbors(documentNode).length === 1) {
      this.removeNode(documentNode);
    } else {
      graph.dropEdge(edge);
      const document = graph.getNodeAttribute(documentNode, 'document');
      LinkerAPI.removeLink(document, linkNode);
    }
  }

  /**
   * Cycle edge through link types defined in `LINK_TYPES`. Changing its appearance and
   * updating the link of the document it connects to.
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

    // Change edge appearance
    if (linkType === LINK_TYPES.TWO_WAY) {
      graph.setEdgeAttribute(edge, 'type', 'line');
      graph.setEdgeAttribute(edge, 'color', GRAPH_CONFIG.edge.line);
    } else {
      graph.dropEdge(edge);

      if (linkType === LINK_TYPES.RECEIVE) {
        if (!graph.getNodeAttribute(source, 'isLink')) {
          let tmp = source;
          source = target;
          target = tmp;
        }
      } else {
        if (graph.getNodeAttribute(source, 'isLink')) {
          let tmp = source;
          source = target;
          target = tmp;
        }
      }

      graph.addEdge(source, target, {
        size: GRAPH_CONFIG.edge.size,
        color: GRAPH_CONFIG.edge.arrow,
        type: 'arrow',
      });
    }
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
      // Link node click handling

      // If this link was the sole connection to a placeable,
      // remove that placeable from the graph
      graph.forEachNeighbor(node, (n) => {
        if (graph.edges(n).length === 1) graph.dropNode(n);
      });

      if (node === this._selectedLinkNode) this._selectedLinkNode = null;
      graph.dropNode(node);
      LinkerAPI.removeLinkFromScene(node);
    } else {
      // Placeable note click handling
      const document = graph.getNodeAttribute(node, 'document');
      if (document) LinkerAPI.removeLinks(document);

      this._selectedNodes = this._selectedNodes.filter((n) => n !== node);

      this._graph.dropNode(node);
    }

    // The link/placeable has to have been hovered over. Clear the highlighting
    canvas.controls.debug.clear();

    this._refreshControlState();
  }

  async getData(options = {}) {
    return {};
  }

  get title() {
    return 'Links';
  }

  async close(options = {}) {
    canvas.controls?.debug?.clear();
    return super.close(options);
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

    this._selectedToLinkControl = html
      .find('.selectedToLink')
      .on('click', this._onSelectedToLinkControlClick.bind(this));
    this._nodeToLinkControl = html.find('.nodeToLink').on('click', this._onNodeToLinkControlClick.bind(this));

    // Display node graph
    this.activateGraph(html);
  }

  _onSelectedToLinkControlClick() {
    if (!this._selectedLinkNode) return;

    const graph = this._graph;

    const attributes = graph.getNodeAttributes(this._selectedLinkNode);
    const neighbors = this._graph.neighbors(this._selectedLinkNode);

    LinkerAPI._getSelected()
      .map((p) => p.document)
      .filter((d) => !neighbors.includes(d.id))
      .forEach((d) => {
        // TODO add graph updating to the API itself
        LinkerAPI.addLink(d, this._selectedLinkNode, LINK_TYPES.TWO_WAY);
        if (!graph.hasNode(d.id)) {
          graph.addNode(d.id, {
            size: GRAPH_CONFIG.document.size,
            label: d.documentName,
            color: GRAPH_CONFIG.document.color,
            pictoColor: GRAPH_CONFIG.document.pictoColor,
            image: DOC_ICONS[d.documentName],
            type: 'pictogram',
            document: d,
            x: attributes.x + Math.random() * 0.1 - 0.05,
            y: attributes.y + Math.random() * 0.1 - 0.05,
          });
        }
        graph.addEdge(d.id, this._selectedLinkNode, {
          size: GRAPH_CONFIG.edge.size,
          color: GRAPH_CONFIG.edge.line,
          type: 'line',
        });
      });
  }

  _onNodeToLinkControlClick() {
    if (!this._selectedLinkNode || !this._selectedNodes.length) return;

    const graph = this._graph;

    const nodes = this._selectedNodes.filter((node) => !graph.neighbors(node).includes(this._selectedLinkNode));

    nodes.forEach((node) => {
      LinkerAPI.addLink(graph.getNodeAttribute(node, 'document'), this._selectedLinkNode, LINK_TYPES.TWO_WAY);

      graph.addEdge(node, this._selectedLinkNode, {
        size: GRAPH_CONFIG.edge.size,
        color: GRAPH_CONFIG.edge.line,
        type: 'line',
      });
    });
  }

  _refreshControlState() {
    if (this._selectedLinkNode) this._selectedToLinkControl.removeAttr('disabled');
    else this._selectedToLinkControl.attr('disabled', 'disabled');

    if (this._selectedLinkNode && this._selectedNodes.length) this._nodeToLinkControl.removeAttr('disabled');
    else this._nodeToLinkControl.attr('disabled', 'disabled');
  }

  async close(options = {}) {
    this._graphLayout?.kill();
    this._sigmaInstance?.kill();
    return super.close(options);
  }
}
