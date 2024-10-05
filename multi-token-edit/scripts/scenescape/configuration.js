import { MODULE_ID, PIVOTS } from '../constants.js';
import { Preset } from '../presets/preset.js';
import { Spawner } from '../presets/spawner.js';
import { SceneScape, ScenescapeScaler } from './scenescape.js';

const TEMPLATES = [
  { height: 3, src: `modules/${MODULE_ID}/images/3ft.webp` },
  { height: 6, src: `modules/${MODULE_ID}/images/6ft.webp` },
  { height: 30, src: `modules/${MODULE_ID}/images/30ft.webp` },
  { height: 100, src: `modules/${MODULE_ID}/images/100ft.webp` },
];

export default class ScenescapeConfig extends FormApplication {
  constructor() {
    super({}, {});
    this.scene = canvas.scene;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-scenescape',
      classes: ['mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/scenescape.html`,
      resizable: true,
      minimizable: false,
      title: 'Scenescape',
      width: 300,
      height: 700,
    });
  }

  async getData(options) {
    const data = super.getData(options);
    data.markerTemplates = TEMPLATES;
    data.distanceRatio = 400; // TODO
    data.speed = 1;
    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.marker > img', this._onClickMarker.bind(this));
    html.on('click', '.lockInScale', () => ScenescapeScaler.lockScale());
    html.on('click', '.select-limit-lower', () => this._onSelectLimit('y2'));
    html.on('click', '.select-limit-upper', () => this._onSelectLimit('y1'));
  }

  _onSelectLimit(varName) {
    this._onMinimize();
    LineSelector.select((pos) => {
      if (pos) {
        const limits = SceneScape.movementLimits ?? {};
        limits[varName] = pos.y;

        if (limits.y1 != null && limits.y2 != null) {
          let y1 = Math.min(limits.y1, limits.y2);
          limits.y2 = Math.max(limits.y1, limits.y2);
          limits.y1 = y1;
        }

        this.scene.update({ [`flags.${MODULE_ID}.scenescape.movementLimits`]: limits });
      }
      this._onMaximize();
    }, Object.values(SceneScape.movementLimits ?? {}));
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

    await Spawner.spawnPreset({ preset, preview: true, pivot: PIVOTS.BOTTOM, snapToGrid: false, scaleToGrid: true });
    this._onMaximize();
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
  async _updateObject(event, formData) {}
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
