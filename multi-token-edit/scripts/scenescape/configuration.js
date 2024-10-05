import { MODULE_ID, PIVOTS } from '../constants.js';
import { Preset } from '../presets/preset.js';
import { Spawner } from '../presets/spawner.js';
import { ScenescapeScaler } from './scenescape.js';

const TEMPLATES = [
  { height: 3, src: `modules/${MODULE_ID}/images/3ft.webp` },
  { height: 6, src: `modules/${MODULE_ID}/images/6ft.webp` },
  { height: 30, src: `modules/${MODULE_ID}/images/30ft.webp` },
  { height: 100, src: `modules/${MODULE_ID}/images/100ft.webp` },
];

export default class ScenescapeConfig extends FormApplication {
  constructor() {
    super({}, {});
    this.sceneId = canvas.scene.id;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-scenescape',
      classes: ['mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/scenescape.html`,
      resizable: true,
      minimizable: false,
      title: 'Scenescape',
      width: 490,
      height: 730,
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
      .find((w) => w.object.id === this.sceneId)
      ?.minimize();
  }

  _onMaximize() {
    this.maximize();
    Object.values(ui.windows)
      .find((w) => w.object.id === this.sceneId)
      ?.maximize();
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {}
}
