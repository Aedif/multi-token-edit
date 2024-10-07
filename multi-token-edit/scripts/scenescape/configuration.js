import { MODULE_ID, PIVOTS } from '../constants.js';
import { Preset } from '../presets/preset.js';
import { Spawner } from '../presets/spawner.js';
import { SceneScape } from './scenescape.js';

const TEMPLATES = [
  { height: 3, src: `modules/${MODULE_ID}/images/3ft.webp` },
  { height: 6, src: `modules/${MODULE_ID}/images/6ft.webp` },
  { height: 30, src: `modules/${MODULE_ID}/images/30ft.webp` },
  { height: 100, src: `modules/${MODULE_ID}/images/100ft.webp` },
];

export default class ScenescapeConfig extends FormApplication {
  static close() {
    Object.values(ui.windows)
      .find((w) => w instanceof ScenescapeConfig)
      ?.close();
  }

  constructor() {
    super({}, { left: 60 });
    this.scene = canvas.scene;
    this.flags = this.scene.getFlag(MODULE_ID, 'scenescape') ?? {};
    this.dataUpdate = {};
    this._createReferenceMarkers();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-scenescape',
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/scenescape.html`,
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.content', initial: 'scale' }],
      resizable: false,
      minimizable: false,
      width: 300,
      height: 'auto',
    });
  }

  get title() {
    return 'Scenescape: ' + this.scene.name;
  }

  async getData(options) {
    const data = super.getData(options);
    data.markerTemplates = TEMPLATES;
    data.scaleDistance = this.flags.scaleDistance ?? 32;
    data.speed = this.flags.speed ?? 4.3;
    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.marker > img', this._onClickMarker.bind(this));
    html.on('click', '.select-limit-lower', () => this._onSelectLimit('y2'));
    html.on('click', '.select-limit-upper', () => this._onSelectLimit('y1'));
    html.on('click', '.auto-select-limits', this._onAutoSelectLimits.bind(this));
    html.on('click', '.clear-limits', this._onClearLimits.bind(this));
  }

  /**
   * Set movement limits to lowest and highest reference markers
   * @returns
   */
  _onAutoSelectLimits() {
    const ys = this.scene.tiles
      .filter((d) => d.getFlag(MODULE_ID, 'scenescape')?.marker)
      .map((d) => d.y + d.height)
      .sort((y1, y2) => y1 - y2);
    if (!ys.length) return this._onClearLimits();

    foundry.utils.mergeObject(this.flags, {
      movementLimits: {
        y1: ys[0],
        y2: ys[ys.length - 1],
      },
    });
  }

  _onLockInScale() {
    const { markers, foregroundElevation } = SceneScape.processReferenceMarkers(this.scene);
    if (markers) {
      this.scene.update({ [`flags.${MODULE_ID}.scenescape.markers`]: markers, foregroundElevation });
    } else {
      this.scene.update({ [`flags.${MODULE_ID}.scenescape.-=markers`]: null });
    }
  }

  _onSelectLimit(varName) {
    this._onMinimize();
    LineSelector.select((pos) => {
      if (pos) {
        const limits = this.flags.movementLimits ?? {};
        limits[varName] = pos.y;

        if (limits.y1 != null && limits.y2 != null) {
          let y1 = Math.min(limits.y1, limits.y2);
          limits.y2 = Math.max(limits.y1, limits.y2);
          limits.y1 = y1;
        }

        foundry.utils.mergeObject(this.flags, { movementLimits: limits });
      }
      this._onMaximize();
    }, Object.values(this.flags.movementLimits ?? {}));
  }

  _onClearLimits() {
    delete this.flags.movementLimits;
  }

  async _onClickMarker(event) {
    this._onMinimize();

    const height = Number($(event.target).closest('.marker').data('height'));
    const preset = new Preset({
      documentName: 'Tile',
      data: [
        {
          texture: { src: TEMPLATES.find((t) => t.height === height).src },
          width: 100 * (height / 6),
          height: 100 * (height / 6),
          flags: {
            [MODULE_ID]: {
              scenescape: {
                marker: true,
                size: height,
              },
            },
          },
        },
      ],
      tags: [`${height}ft`],
    });

    await Spawner.spawnPreset({
      preset,
      preview: true,
      pivot: PIVOTS.BOTTOM,
      snapToGrid: false,
      scaleToGrid: true,
      layerSwitch: true,
    });
    this._onMaximize();
  }

  _deleteReferenceMarkers() {
    const ids = this.scene.tiles.filter((d) => d.getFlag(MODULE_ID, 'scenescape')?.marker).map((d) => d.id);
    if (ids.length) this.scene.deleteEmbeddedDocuments('Tile', ids);
  }

  _createReferenceMarkers() {
    if (this.scene.tiles.find((d) => d.getFlag(MODULE_ID, 'scenescape')?.marker)) return;

    const markers = this.flags.markers?.filter((m) => !m.virtual);
    if (!markers?.length) return;

    for (const m of markers) {
      const preset = new Preset({
        documentName: 'Tile',
        data: [
          {
            texture: { src: TEMPLATES.find((t) => t.height === m.size).src },
            width: m.height,
            height: m.height,
            elevation: this.scene.foregroundElevation,
            flags: {
              [MODULE_ID]: {
                scenescape: {
                  marker: true,
                  size: m.size,
                },
              },
            },
          },
        ],
        tags: [`${m.size}ft`],
      });
      Spawner.spawnPreset({ preset, x: m.x, y: m.y, preview: false, pivot: PIVOTS.BOTTOM, scaleToGrid: false });
    }
  }

  _onMinimize() {
    this.minimize();
    Object.values(ui.windows)
      .find((w) => w.object.id === this.scene.id)
      ?.minimize();
  }

  _onMaximize() {
    this.maximize();
    Object.values(ui.windows)
      .find((w) => w.object.id === this.scene.id)
      ?.maximize();
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    let update = {};

    foundry.utils.mergeObject(this.flags, formData);

    ['movementLimits', 'speed', 'scaleDistance'].forEach((varName) => {
      if (foundry.utils.isEmpty(this.flags[varName])) update[`flags.${MODULE_ID}.scenescape.-=${varName}`] = null;
      else update[`flags.${MODULE_ID}.scenescape.${varName}`] = this.flags[varName];
    });

    if (!foundry.utils.isEmpty(this.dataUpdate)) {
      foundry.utils.mergeObject(update, this.dataUpdate);
    }

    if (!foundry.utils.isEmpty(update)) await this.scene.update(update);
    this._onLockInScale(this.scene);
  }

  async close(options = {}) {
    this._deleteReferenceMarkers();
    return super.close(options);
  }
}

class LineSelector {
  static select(callback, lines = []) {
    if (this.overlay) return;

    this.callback = callback;
    this.lines = lines;

    let overlay = new PIXI.Container();
    overlay.hitArea = canvas.dimensions.rect;
    overlay.cursor = 'crosshair';
    overlay.interactive = true;
    overlay.zIndex = 5;

    this.graphics = new PIXI.Graphics();
    overlay.addChild(this.graphics);

    overlay.on('mouseup', (event) => {
      if (event.nativeEvent.which == 1) this._save(this.pos);
      this._exit();
    });
    overlay.on('contextmenu', () => {
      this._exit();
    });

    overlay.on('pointermove', (event) => {
      const pos = event.data.getLocalPosition(overlay);
      const dimensions = canvas.dimensions;
      pos.y = Math.clamp(pos.y, 0, dimensions.height);
      this._drawLine(pos);
      this.pos = pos;
    });

    canvas.stage.addChild(overlay);

    this.overlay = overlay;
  }

  static _drawLine(pos) {
    const graphics = this.overlay.children[0];
    graphics.clear();
    graphics.lineStyle(3, 0xff0000, 1.0, 0.5).moveTo(0, pos.y).lineTo(canvas.dimensions.rect.width, pos.y);

    this.lines.forEach((l) => {
      graphics.lineStyle(3, 0x0000ff, 1.0, 0.5).moveTo(0, l).lineTo(canvas.dimensions.rect.width, l);
    });
  }

  static _save(pos) {
    this.callback?.(pos);
    this.callback = null;
  }

  static _exit() {
    const overlay = this.overlay;
    if (overlay) {
      overlay.parent?.removeChild(overlay);
      overlay.destroy(true);
      overlay.children?.forEach((c) => c.destroy(true));
      this.overlay = null;
      this.callback?.(null);
    }
  }
}
