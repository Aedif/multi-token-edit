import { MODULE_ID, PIVOTS } from '../constants.js';
import { Preset } from '../presets/preset.js';
import { Spawner } from '../presets/spawner.js';
import { ScenescapeControls } from './controls.js';
import { Scenescape } from './scenescape.js';

const TEMPLATES = [
  { height: 3, src: `modules/${MODULE_ID}/images/3ft.webp` },
  { height: 6, src: `modules/${MODULE_ID}/images/6ft.webp` },
  { height: 30, src: `modules/${MODULE_ID}/images/30ft.webp` },
  { height: 100, src: `modules/${MODULE_ID}/images/100ft.webp` },
];

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export default class ScenescapeConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static autoScale = true;

  static close() {
    foundry.applications.instances.get(ScenescapeConfig.DEFAULT_OPTIONS.id)?.close();
  }

  constructor() {
    super({});
    this.scene = canvas.scene;
    this.flags = this.scene.getFlag(MODULE_ID, 'scenescape') ?? {};
    this.dataUpdate = {};
    this._createReferenceMarkers();
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'mass-edit-scenescape',
    window: { resizable: true, minimizable: true, contentClasses: ['standard-form'] },
    tag: 'form',
    form: {
      handler: ScenescapeConfig._onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
    classes: ['mass-edit', 'flexcol'],
    actions: {
      revert: ScenescapeConfig._onRevert,
      marker: ScenescapeConfig._onMarker,
      limit: ScenescapeConfig._onLimit,
    },
    position: {
      width: 420,
      height: 'auto',
      left: 60,
    },
  };

  /** @override */
  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    scale: { template: `modules/${MODULE_ID}/templates/scenescapes/config-scale.hbs` },
    movement: { template: `modules/${MODULE_ID}/templates/scenescapes/config-movement.hbs` },
    misc: { template: `modules/${MODULE_ID}/templates/scenescapes/config-misc.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  static TABS = {
    main: {
      tabs: [
        { id: 'scale', label: 'Scale', icon: 'fa-solid fa-arrow-up-triangle-square' },
        { id: 'movement', label: 'Movement', icon: 'fa-solid fa-shoe-prints' },
        { id: 'misc', label: 'Misc', icon: 'fa-solid fa-gear' },
      ],
      initial: 'scale',
    },
  };

  get title() {
    return 'Scenescape: ' + this.scene.name;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    switch (partId) {
      case 'scale':
        context.markerTemplates = TEMPLATES;
        context.scaleDistance = this.flags.scaleDistance ?? 32;
        break;
      case 'movement':
        context.speed = this.flags.speed ?? 4.3;
        context.speedY = this.flags.speedY ?? 8.6;
        break;
      case 'misc':
        context.pixelPerfect = this.flags.pixelPerfect ?? true;
        context.hideBorder = this.flags.hideBorder ?? false;
        break;
      case 'footer':
        context.buttons = [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'Save' }];
        break;
    }
    return context;
  }

  /** @override */
  _getHeaderControls() {
    const buttons = super._getHeaderControls();

    buttons.push({
      label: 'Revert Scene',
      class: 'mass-edit-scenescape-delete',
      icon: 'fas fa-trash fa-fw',
      action: 'revert',
    });

    return buttons;
  }

  static _onRevert() {
    this.scene.unsetFlag(MODULE_ID, 'scenescape');
    this.close();
    ScenescapeControls._checkActivateControls();
  }

  static async _onMarker(event, element) {
    this._onMinimize();

    const height = Number(element.dataset.height);
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

  static async _onLimit(event, element) {
    const limit = element.dataset.limit;

    switch (limit) {
      case 'y1':
      case 'y2':
        this._onSelectLimit(limit);
        break;
      case 'auto':
        this._onAutoSelectLimits();
        break;
      case 'clear':
        this._onClearLimits();
        break;
    }
  }

  _onSelectLimit(varName) {
    this._onMinimize();
    LineSelector.select(
      (pos) => {
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
      },
      Object.values(this.flags.movementLimits ?? {}),
    );
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

    ui.notifications.info(`Limits set to: {${ys[0]}, ${ys[ys.length - 1]}}`);
  }

  _onClearLimits() {
    delete this.flags.movementLimits;
  }

  async _onLockInScale() {
    const { markers, foregroundElevation } = Scenescape.processReferenceMarkers(this.scene);
    if (markers) {
      const update = { [`flags.${MODULE_ID}.scenescape.markers`]: markers, foregroundElevation };

      // Disable settings which interfere with Scenescapes
      update['grid.type'] = CONST.GRID_TYPES.GRIDLESS;
      update['fog.exploration'] = false;
      update.tokenVision = false;
      update['flags.levels.lightMasking'] = true;
      update['flags.wall-height.advancedVision'] = false;

      await this.scene.update(update);
    } else {
      await this.scene.update({ [`flags.${MODULE_ID}.scenescape.-=markers`]: null });
    }
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
    Array.from(foundry.applications.instances.values())
      .find((w) => w.document?.id === this.scene.id)
      ?.minimize();
  }

  _onMaximize() {
    this.maximize();
    Array.from(foundry.applications.instances.values())
      .find((w) => w.document?.id === this.scene.id)
      ?.maximize();
  }

  static async _onSubmit(event, form, formData) {
    let update = {};

    foundry.utils.mergeObject(this.flags, formData.object);

    ['movementLimits', 'speed', 'speedY', 'scaleDistance', 'pixelPerfect', 'hideBorder'].forEach((varName) => {
      if (foundry.utils.isEmpty(this.flags[varName])) update[`flags.${MODULE_ID}.scenescape.-=${varName}`] = null;
      else update[`flags.${MODULE_ID}.scenescape.${varName}`] = this.flags[varName];
    });

    if (!foundry.utils.isEmpty(this.dataUpdate)) {
      foundry.utils.mergeObject(update, this.dataUpdate);
    }

    if (!foundry.utils.isEmpty(update)) await this.scene.update(update);
    await this._onLockInScale(this.scene);
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
