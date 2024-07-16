import { LINK_TYPES, LinkerAPI } from './linker.js';
import { MODULE_ID, SUPPORTED_PLACEABLES } from '../utils';
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

const NODE_CONFIG = {
  COLOR: 'white',
  COLOR_SELECTED: '#7FFF00',
  LINK_COLOR: 'yellow',
  LINK_COLOR_SELECTED: '#7FFF00',
  LINK_IMAGE: 'modules/multi-token-edit/images/linker/link-45deg.svg',
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

    // Add nodes and edges
    SUPPORTED_PLACEABLES.forEach((embeddedName) => {
      canvas.scene.getEmbeddedCollection(embeddedName).forEach((d) => {
        if (d.flags[MODULE_ID]?.links?.length) {
          // Placeable node
          const coords = {
            x: d.object.bounds.x,
            y: -d.object.bounds.y,
          };
          graph.addNode(d.id, {
            size: 15,
            label: embeddedName,
            color: NODE_CONFIG.COLOR,
            pictoColor: 'red',
            image: DOC_ICONS[embeddedName],
            type: 'pictogram',
            document: d,
            ...coords,
          });

          // Link nodes and edges
          d.flags[MODULE_ID].links.forEach((link) => {
            if (!graph.hasNode(link.id)) {
              // Link node
              graph.addNode(link.id, {
                size: 15,
                label: 'LINK',
                color: NODE_CONFIG.LINK_COLOR,
                pictoColor: 'red',
                image: NODE_CONFIG.LINK_IMAGE,
                type: 'pictogram',
                isLink: true,
                ...coords,
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
              size: 4,
              color: link.type === LINK_TYPES.TWO_WAY ? 'white' : 'green',
              type: link.type === LINK_TYPES.TWO_WAY ? 'line' : 'arrow',
            });
          });
        }
      });
    });

    //const positions = forceAtlas2(graph, { iterations: 50 });
    //forceAtlas2.assign(graph, 50);

    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const layout = new FA2Layout(graph, {
      settings: sensibleSettings,
    });

    // const layout = new ForceSupervisor(graph);

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
        size: 15,
        label: 'LINK',
        color: NODE_CONFIG.LINK_COLOR,
        pictoColor: 'red',
        image: NODE_CONFIG.LINK_IMAGE,
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
    sigmaInstance.on('rightClickNode', ({ node }) => this.onRightClickNode(node));
  }

  onClickNode(node) {
    const graph = this._graph;
    if (graph.getNodeAttribute(node, 'isLink')) {
      // Link node click handling
      if (this._selectedLinkNode === node) {
        this._selectedLinkNode = null;
        graph.setNodeAttribute(node, 'color', NODE_CONFIG.LINK_COLOR);
      } else {
        if (this._selectedLinkNode) graph.setNodeAttribute(this._selectedLinkNode, 'color', NODE_CONFIG.LINK_COLOR);
        this._selectedLinkNode = node;
        graph.setNodeAttribute(this._selectedLinkNode, 'color', NODE_CONFIG.LINK_COLOR_SELECTED);
      }
    } else {
      // Placeable note click handling
      if (this._selectedNodes.includes(node)) {
        this._selectedNodes = this._selectedNodes.filter((n) => n !== node);
        graph.setNodeAttribute(node, 'color', NODE_CONFIG.COLOR);
      } else {
        this._selectedNodes.push(node);
        graph.setNodeAttribute(node, 'color', NODE_CONFIG.COLOR_SELECTED);
      }
    }
    this._sigmaInstance.refresh();
  }

  onRightClickNode(node) {
    const graph = this._graph;

    if (graph.getNodeAttribute(node, 'isLink')) {
      // Link node click handling

      // If this link was the sole connection to a placeable,
      // remove that placeable from the graph
      graph.forEachNeighbor(node, (n) => {
        if (graph.edges(n).length === 1) graph.dropNode(n);
      });

      graph.dropNode(node);
      LinkerAPI.removeLinkFromScene(node);

      // The link has to have been hovered over. Clear the highlighting
      canvas.controls.debug.clear();
    } else {
      // Placeable note click handling
      const document = graph.getNodeAttribute(node, 'document');
      if (document) LinkerAPI.removeLinks(document);

      this._graph.dropNode(node);
    }
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

    // Display node graph
    this.activateGraph(html);
  }

  async close(options = {}) {
    this._graphLayout?.kill();
    this._sigmaInstance?.kill();
    return super.close(options);
  }
}
