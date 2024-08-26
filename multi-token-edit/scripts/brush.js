import { pasteDataUpdate } from '../applications/formUtils.js';
import { MODULE_ID } from './constants.js';
import { Mouse3D } from './mouse3d.js';
import { Picker } from './picker.js';
import { PresetAPI } from './presets/collection.js';
import { Preset } from './presets/preset.js';
import { applyRandomization } from './randomizer/randomizerUtils.js';
import { TagInput } from './utils.js';

export class Brush {
  static app;
  static deactivateCallback;
  static spawner;
  static eraser;
  static lastSpawnTime;
  // @type {Preset}
  static preset;
  static brushOverlay;
  static updatedPlaceables = new Map();
  static hoveredPlaceables = new Set();
  static spawnPoints = [];
  static hoveredPlaceable;
  static documentName;
  static active = false;
  static hitTest;

  static _checkDensity(pos) {
    const d = canvas.grid.size * this.spawnDensity;
    return this.spawnPoints.every((p) => Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2) >= d);
  }

  static _performBrushDocumentUpdate(placeable) {
    this.preset.callPostSpawnHooks({ objects: [placeable], documents: [placeable.document] });
    if (!this.preset.isEmpty) pasteDataUpdate([placeable], this.preset, true, true, this.transform);
    this.updatedPlaceables.set(placeable.id, placeable);
    BrushMenu.iterate();
  }

  static _performBrushDocumentCreate(pos) {
    const now = new Date().getTime();
    if (!this.lastSpawnTime || now - this.lastSpawnTime > 100) {
      this.lastSpawnTime = now;

      if (!this._checkDensity(pos)) return;
      Picker.resolve(pos);
      this.spawnPoints.push(pos);

      BrushMenu.iterate();
    }
  }

  static _performBrushDocumentDelete(placeable) {
    this.hoveredPlaceable = null;
    if (!placeable._brushDelete) placeable.document?.delete();
    placeable._brushDelete = true;
  }

  static _hitTestWall(point, wall) {
    return wall.line.hitArea.contains(point.x, point.y);
  }

  static _hitTestRegion(point, region) {
    return region.bounds.contains(point.x, point.y);
  }

  static _hitTestControlIcon(point, placeable) {
    return (
      Number.between(
        point.x,
        placeable.x - placeable.controlIcon.width / 2,
        placeable.x + placeable.controlIcon.width / 2
      ) &&
      Number.between(
        point.y,
        placeable.y - placeable.controlIcon.height / 2,
        placeable.y + placeable.controlIcon.height / 2
      )
    );
  }

  static _hitTestTile(point, placeable) {
    const foreground = ui.controls.control.foreground ?? false;
    // V12, to be removed
    if (placeable.document.hasOwnProperty('elevation')) {
      if (placeable.document.elevation && !foreground) return false;
    } else {
      if (placeable.document.overhead !== foreground) return false;
    }
    return placeable.bounds.contains(point.x, point.y);
  }

  static _hoverTestArea(placeable) {
    if (!this.hoveredPlaceable) return false;

    const hBounds = this.hoveredPlaceable.bounds;
    const pBounds = placeable.bounds;
    return hBounds.width * hBounds.height > pBounds.width * pBounds.height;
  }

  static _hitTestArea(point, placeable) {
    return (
      Number.between(point.x, placeable.x, placeable.x + placeable.hitArea.width) &&
      Number.between(point.y, placeable.y, placeable.y + placeable.hitArea.height)
    );
  }

  static _onBrushMove(event) {
    const pos = event.data.getLocalPosition(this.brushOverlay);
    const layer = canvas.getLayerByEmbeddedName(this.documentName);
    this._clearHover(event, pos);

    for (const p of layer.placeables) {
      if (p.visible && this.hitTest(pos, p) && !this.updatedPlaceables.has(p.id) && this.hoveredPlaceable !== p) {
        if (this.hoverTest?.(p)) {
          this.hoveredPlaceable._onHoverOut(event);
          this.hoveredPlaceable = p;
        } else if (!this.hoverTest && this.hoveredPlaceable && this.hoveredPlaceable !== p) {
          this.hoveredPlaceable._onHoverOut(event);
          this.hoveredPlaceable = p;
        } else if (!this.hoveredPlaceable) {
          this.hoveredPlaceable = p;
        }

        this.hoveredPlaceable._onHoverIn(event);
      }
    }
  }

  static _clearHover(event, pos, force = false) {
    if (this.hoveredPlaceable) {
      if (force || !this.hoveredPlaceable.visible || !this.hitTest(pos, this.hoveredPlaceable)) {
        this.hoveredPlaceable._onHoverOut(event);
        this.hoveredPlaceable = null;
      }
    }
  }

  static _onBrushClickMove(event) {
    if (this.spawner) {
      this._performBrushDocumentCreate(event.data.getLocalPosition(this.brushOverlay));
    } else if (
      this.hoveredPlaceable &&
      this.hoveredPlaceable.visible &&
      !this.updatedPlaceables.has(this.hoveredPlaceable.id)
    ) {
      if (this.eraser) this._performBrushDocumentDelete(this.hoveredPlaceable);
      else this._performBrushDocumentUpdate(this.hoveredPlaceable);
    }
  }

  static _on3DBrushClick({ x, y, z, placeable } = {}) {
    if (this.spawner) {
      this._performBrushDocumentCreate({ x, y, z });
    } else {
      if (placeable && placeable.document.documentName === this.documentName) {
        if (this.eraser) this._performBrushDocumentDelete(placeable);
        else this._performBrushDocumentUpdate(placeable);
      }
      this.updatedPlaceables.clear();
    }
  }

  static refreshPreset() {
    if (this.active && this.app) {
      this.preset = new Preset({
        documentName: this.documentName,
        data: this.app.getSelectedFields(),
        randomize: this.app.randomizeFields,
        addSubtract: this.app.addSubtractFields,
      });
    }
  }

  static async genPreview() {
    PresetAPI.spawnPreset({
      preset: this.preset,
      coordPicker: true,
      previewOnly: true,
      center: true,
      taPreview: 'ALL',
      transform: this.transform,
      snapToGrid: this.snap,
      scaleToGrid: this.scaleToGrid,
    });
  }

  /**
   * @param {Object} options
   * @param {MassEditForm} options.app
   * @param {Preset} options.preset
   * @returns
   */
  static activate({
    app = null,
    preset = null,
    deactivateCallback = null,
    spawner = false,
    spawnDensity = 0.01,
    eraser = false,
    refresh = false,
    transform = {},
    snap = true,
    scaleToGrid = true,
  } = {}) {
    this.deactivate(refresh);
    if (!canvas.ready) return false;
    if (!app && !preset) return false;

    if (this.brushOverlay) {
      this.brushOverlay.destroy(true);
    }

    // Setup fields to be used for updates
    this.app = app;
    this.preset = preset;
    this.transform = transform;
    this.deactivateCallback = deactivateCallback;
    this.spawner = spawner;
    this.eraser = eraser;
    this.snap = snap;
    this.spawnDensity = spawnDensity;
    this.scaleToGrid = scaleToGrid;
    if (this.app) {
      this.documentName = this.app.documentName;
    } else {
      this.documentName = this.preset.documentName;
    }
    if (!refresh) {
      this.updatedPlaceables.clear();
      this.spawnPoints = [];
    }

    const interaction = canvas.app.renderer.events;
    if (!interaction.cursorStyles['brush']) {
      interaction.cursorStyles['brush'] = `url('modules/${MODULE_ID}/images/brush_icon.png'), auto`;
      interaction.cursorStyles['brush_spawn'] = `url('modules/${MODULE_ID}/images/brush_icon_spawn.png'), auto`;
      interaction.cursorStyles['eraser'] = `url('modules/${MODULE_ID}/images/brush_icon_eraser.png'), auto`;
    }

    this.active = true;
    this.refreshPreset();

    if (game.Levels3DPreview?._active) {
      if (this.spawner) this.genPreview();
      return this._activate3d();
    }

    // Determine hit test test function to be used for pointer hover detection
    if (this.spawner) {
      this.hitTest = () => false;
      this.genPreview();
    } else {
      switch (this.documentName) {
        case 'Wall':
          this.hitTest = this._hitTestWall;
          break;
        case 'Region':
          this.hitTest = this._hitTestRegion;
          break;
        case 'AmbientLight':
        case 'MeasuredTemplate':
        case 'AmbientSound':
        case 'Note':
          this.hitTest = this._hitTestControlIcon;
          break;
        case 'Tile':
          this.hitTest = this._hitTestTile;
          this.hoverTest = this._hoverTestArea;
          break;
        default:
          this.hitTest = this._hitTestArea;
          this.hoverTest = this._hoverTestArea;
      }
    }

    // Create the brush overlay
    this.brushOverlay = new PIXI.Container();
    this.brushOverlay.hitArea = canvas.dimensions.rect;

    let cursor = 'brush';
    if (spawner) cursor = 'brush_spawn';
    else if (eraser) cursor = 'eraser';
    this.brushOverlay.cursor = cursor;

    this.brushOverlay.interactive = true;
    this.brushOverlay.zIndex = Infinity;

    this.brushOverlay.on('mousemove', (event) => {
      Picker.feedPos(event.data.getLocalPosition(this.brushOverlay));
      this._onBrushMove(event);
      if (!this.mDownWithinCanvas) return; // Fix to prevent mouse interaction within apps
      if (event.buttons === 1) this._onBrushClickMove(event);
    });
    this.brushOverlay.on('mouseup', (event) => {
      this.mDownWithinCanvas = false; // Fix to prevent mouse interaction within apps
      if (event.nativeEvent.which !== 2) {
        this._onBrushClickMove(event);
      }
      this.updatedPlaceables.clear();
      this.spawnPoints = [];
    });

    this.brushOverlay.on('mousedown', (event) => {
      this.mDownWithinCanvas = true; // Fix to prevent mouse interaction within apps
    });

    this.brushOverlay.on('click', (event) => {
      if (event.nativeEvent.which == 2) {
        this.deactivate();
      }
    });

    canvas.stage.addChild(this.brushOverlay);

    // Disable canvas events to prevent selects and object placements on click
    canvas.mouseInteractionManager.permissions.clickLeft = false;
    // canvas.mouseInteractionManager.permissions.longPress = false;

    return true;
  }

  static _activate3d() {
    Mouse3D.activate({
      mouseMoveCallback: Picker.feedPos.bind(Picker),
      mouseClickCallback: this._on3DBrushClick.bind(this),
      mouseWheelClickCallback: this.deactivate.bind(this),
    });
    return true;
  }

  static deactivate(refresh = false) {
    if (this.active) {
      canvas.mouseInteractionManager.permissions.clickLeft = true;
      //canvas.mouseInteractionManager.permissions.longPress = true;
      if (this.brushOverlay) this.brushOverlay.parent?.removeChild(this.brushOverlay);
      this.active = false;

      if (!refresh) {
        this.updatedPlaceables.clear();
        this.spawnPoints = [];
        this._clearHover(null, null, true);
      }
      this.hoverTest = null;
      if (!refresh) this.deactivateCallback?.();
      if (this.spawner) Picker.destroy();
      this.spawner = false;
      this.eraser = false;
      this.deactivateCallback = null;
      this.app = null;
      this.preset = null;
      this.transform = null;
      return true;
    }
    Mouse3D.deactivate();
  }
}

// =================================================

export class BrushMenu extends FormApplication {
  static addPresets(presets = []) {
    if (!this._instance) return this.render(presets);
    else this._instance.addPresets(presets);
  }

  static isActive() {
    return Boolean(this._instance);
  }

  static removePreset(id) {
    if (!this._instance) return;
    this._instance.removePreset(id);
  }

  static iterate(forward = true, force = false) {
    if (!this._instance) return;
    this._instance.iterate(forward, force);
  }

  static render(presets, settings = {}) {
    if (this._instance) this.addPresets(presets);
    else {
      this._instance = new BrushMenu(presets, settings);
      this._instance.render(true);
    }
  }

  static async close() {
    return this._instance?.close(true);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-brush-menu',
      template: `modules/${MODULE_ID}/templates/preset/brush/menu.html`,
      classes: ['mass-edit-dark-window', 'mass-edit-window-fill'],
      resizable: false,
      minimizable: false,
      width: 200,
      height: 'auto',
      scrollY: ['.presets'],
    });
  }

  constructor(presets, settings = {}) {
    super({}, { left: 10, top: window.innerHeight / 2 });
    this.presets = presets ?? [];
    this.preset = this.presets[0].clone();
    this.preset.data = this.preset.data[0];
    this._settings = foundry.utils.mergeObject(game.settings.get(MODULE_ID, 'brush'), settings);
    this._it = -1;
    this._createIndex();
    this.iterate();
  }

  _createIndex() {
    const index = [];

    if (this._settings.group) {
      for (let pI = 0; pI < this.presets.length; pI++) {
        index.push({ pI });
      }
    } else {
      for (let pI = 0; pI < this.presets.length; pI++) {
        const preset = this.presets[pI];
        for (let dI = 0; dI < preset.data.length; dI++) {
          index.push({ pI, dI });
        }
      }
    }
    this._index = index;
    if (this._it >= this._index.length) this._it = this._index.length - 1;
  }

  async _activateBrush(refresh = true) {
    const index = this._index[this._it];
    const p = this.presets[index.pI];
    this.preset = p.clone();
    if (index.hasOwnProperty('dI')) this.preset.data = [this.preset.data[index.dI]];

    // Apply Color
    await this._applyColor();

    // Apply TMFX Filters
    this._applyTmfxPresets(this.preset, this._settings.tmfxPreset);

    // Apply Tagger tags
    this._applyTaggerTags(this.preset, this._settings.tagger);

    Brush.activate({
      preset: this.preset,
      deactivateCallback: this._deactivateCallback.bind(this),
      spawner: this._settings.spawner,
      eraser: this._settings.eraser,
      transform: this._getTransform(),
      refresh,
      snap: this._settings.snap,
      scaleToGrid: this._settings.scaleToGrid,
      spawnDensity: this._settings.density,
    });
  }

  async _applyColor() {
    if (this._settings.randomColor || this._settings.color) {
      let pPath;
      const documentName = this.preset.documentName;
      if (documentName === 'Token' || documentName === 'Tile') pPath = 'texture.tint';
      else if (documentName === 'AmbientLight') pPath = 'config.color';

      if (game.Levels3DPreview?._active) {
        if (documentName === 'Token' || documentName === 'Tile') pPath = 'flags.levels-3d-preview.color';
      }

      if (pPath) {
        if (this._settings.randomColor) {
          const updates = this.preset.data.map(() => {
            return { color: '' };
          });
          await applyRandomization(updates, null, { color: { type: 'color', ...this._settings.randomColor } });

          this.preset.data.forEach((d, i) => {
            if (this._settings.ddTint) this._applyDDTint(d, updates[i].color);
            else foundry.utils.setProperty(d, pPath, updates[i].color);
          });
        } else {
          this.preset.data.forEach((d) => {
            if (this._settings.ddTint) this._applyDDTint(d, this._settings.color);
            else foundry.utils.setProperty(d, pPath, this._settings.color);
          });
        }
      }
    }
  }

  _applyDDTint(data, color) {
    let filters = foundry.utils.getProperty(data, 'flags.tokenmagic.filters');

    if (!color) {
      if (filters) {
        foundry.utils.setProperty(
          data,
          'flags.tokenmagic.filters',
          filters.filter((f) => f.tmFilters.filterId !== 'DDTint')
        );
      }
    } else {
      filters = (filters ?? []).filter((f) => f.tmFilters.filterId !== 'DDTint');
      filters.push({
        tmFilters: {
          tmFilterId: 'DDTint',
          tmFilterInternalId: randomID(),
          tmFilterType: 'ddTint',
          filterOwner: game.data.userId,
          tmParams: {
            tmFilterType: 'ddTint',
            filterId: 'DDTint',
            tint: PIXI.utils.hex2rgb(color),
            updateId: randomID(),
            rank: 10000,
            enabled: true,
            filterOwner: game.data.userId,
          },
        },
      });
      foundry.utils.setProperty(data, 'flags.tokenmagic.filters', filters);
    }
  }

  _applyTaggerTags(preset, tags) {
    if (!tags || !tags.length) return;
    if (!game.modules.get('tagger')?.active) return;

    preset.addPostSpawnHook(({ objects } = {}) => {
      Tagger.addTags(objects, tags);
    });
  }

  _applyTmfxPresets(preset, tmfxPreset) {
    if (!tmfxPreset) return;
    if (!game.modules.get('tokenmagic')?.active) return;
    if (!['Token', 'Tile', 'Drawing', 'MeasuredTemplate'].includes(preset.documentName)) return;

    if (!Array.isArray(tmfxPreset)) tmfxPreset = [tmfxPreset];

    if (tmfxPreset.includes('DELETE ALL')) {
      this.preset.addPostSpawnHook(({ objects } = {}) => objects.forEach((o) => TokenMagic.deleteFilters(o)));
      return;
    } else if (tmfxPreset.includes('DELETE')) {
      this.preset.addPostSpawnHook(({ objects } = {}) =>
        objects.forEach(async (o) => {
          for (const p of tmfxPreset) await TokenMagic.deleteFilters(o, p);
        })
      );
      return;
    }

    const filters = [];
    tmfxPreset.forEach((presetName) => TokenMagic.getPreset(presetName)?.forEach((filter) => filters.push(filter)));

    if (filters.length)
      this.preset.addPostSpawnHook(({ objects } = {}) =>
        objects.forEach((o) => TokenMagic.addUpdateFilters(o, filters))
      );
  }

  get title() {
    return 'Brush';
  }

  async getData(options = {}) {
    return {
      presets: this.presets,
      activePreset: this.preset,
      ...this._settings,
      tmfxActive: game.modules.get('tokenmagic')?.active,
      taggerActive: game.modules.get('tagger')?.active,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const settings = this._settings;
    const app = this;

    import('./jquery-ui/jquery-ui.js').then((module) => {
      const rotationRangeLabel = html.find('.rotation-range-label');
      html.find('.rotation-slider').slider({
        range: true,
        min: -180,
        max: 180,
        values: settings.rotation,
        slide: function (event, ui) {
          rotationRangeLabel.text(`${ui.values[0]}° - ${ui.values[1]}°`);
        },
        change: function (event, ui) {
          app._updateBrushSettings({ rotation: ui.values });
        },
      });

      const scaleRangeLabel = html.find('.scale-range-label');
      html.find('.scale-slider').slider({
        range: true,
        min: 0.1,
        max: 4,
        step: 0.01,
        values: settings.scale,
        slide: function (event, ui) {
          scaleRangeLabel.text(`${ui.values[0]} - ${ui.values[1]}`);
        },
        change: function (event, ui) {
          app._updateBrushSettings({ scale: ui.values });
        },
      });

      const densityRangeLabel = html.find('.density-range-label');
      html.find('.density-slider').slider({
        range: false,
        min: 0.01,
        max: 4,
        step: 0.01,
        value: settings.density ?? 0.01,
        slide: function (event, ui) {
          densityRangeLabel.text(`${ui.value}`);
        },
        change: function (event, ui) {
          app._updateBrushSettings({ density: ui.value });
        },
      });

      this.setPosition({ height: 'auto' });
    });

    html.on('click', '.toggle-button', this._toggleSetting.bind(this));
    html.find('.reset').on('click', this._resetToDefaults.bind(this));
    html.on('click', '.preset', this._onClickPreset.bind(this));
    html.on('contextmenu', '.preset', this._onRightClickPreset.bind(this));

    // Colorize
    html.on('click', '.randomize-color', this._onRandomizeColor.bind(this));
    html.on('change', 'color-picker', this._onColorChange.bind(this));
    html.on('input paste', 'color-picker input[type="text"]', this._onColorChange.bind(this));
    html.find('.colorizeControl').on('click', this._onColorMenu.bind(this));

    html.find('.tmfxPresetControl').on('click', () => {
      this._onEditTaglikeField({
        label: 'TMFX',
        name: 'tmfxPreset',
        tags: this._settings.tmfxPreset,
        simplifyTags: false,
        listId: 'tmfxPresets',
        listEntries: TokenMagic.getPresets().map((p) => p.name),
      });
    });
    html.find('.taggerControl').on('click', () => {
      this._onEditTaglikeField({
        label: 'Tagger',
        name: 'tagger',
        tags: this._settings.tagger,
        simplifyTags: false,
      });
    });
  }

  async _onEditTaglikeField({ label, name, tags, simplifyTags = true, listId, listEntries } = {}) {
    const subMenu = this._toggleSubMenu(name);
    if (!subMenu) return;

    if (tags && !Array.isArray(tags)) tags = [tags];
    const template = Handlebars.compile(
      `{{tagInput name=name label=label tags=tags listId=listId listEntries=listEntries}}`
    );
    let content = template(
      { name, label, tags, listId, listEntries },
      {
        allowProtoMethodsByDefault: true,
        allowProtoPropertiesByDefault: true,
      }
    );

    subMenu.html(content);
    this.setPosition({ height: 'auto' });

    TagInput.activateListeners(subMenu, {
      change: (tags) => {
        this.setPosition({ height: 'auto' });
        this._updateBrushSettings({ [name]: tags.length ? tags : null });
      },
      simplifyTags,
    });
  }

  /**
   * Controls toggling of the sub-menu div container. The div is shared between many different controls, and behaviour
   * depends on whether the same or different controls are being toggled
   * @param {String} name a name of the control issuing a toggle
   * @returns {Boolean} sub-menu element if sub-menu is to be rendered, null if sub-menu was emptied
   */
  _toggleSubMenu(name) {
    const subMenu = this.element.find('.sub-menu');
    if (subMenu.attr('data-control') === name) {
      subMenu.html('').attr('data-control', null);
      this.setPosition({ height: 'auto' });
      return null;
    } else subMenu.attr('data-control', name);
    return subMenu;
  }

  async _onColorMenu(event) {
    const subMenu = this._toggleSubMenu('colorize');
    if (!subMenu) return;

    const template = await getTemplate(`modules/${MODULE_ID}/templates/preset/brush/colorize.html`);
    let content = template(await this.getData({}), {
      allowProtoMethodsByDefault: true,
      allowProtoPropertiesByDefault: true,
    });

    subMenu.html(content);
    this.setPosition({ height: 'auto' });
  }

  async _onColorChange(event) {
    let cString = $(event.currentTarget).val();
    if (!cString) this._updateBrushSettings({ color: '' });
    else {
      let color = Color.fromString(cString);
      if (!Number.isNaN(color.valueOf())) this._updateBrushSettings({ color: cString });
    }
  }

  async _onClickPreset(event) {
    const presetIndex = $(event.currentTarget).data('index');
    if (presetIndex != null) {
      this._it = this._index.findIndex((i) => i.pI === presetIndex);
      await this._activateBrush();
      this.render(true);
    }
  }

  async _onRandomizeColor() {
    const randomColor = this._settings.randomColor ?? {};
    const colorTemp = await renderTemplate(`modules/${MODULE_ID}/templates/randomizer/color.html`, {
      method: 'random',
      lockMethod: true,
      space: randomColor.space,
      hue: randomColor.hue,
    });

    let colorSlider;
    let dialog = new Dialog({
      title: `Pick Range`,
      content: `<form>${colorTemp}</form>`,
      buttons: {
        save: {
          label: 'Apply',
          callback: async (html) => {
            await this._updateBrushSettings({
              randomColor: {
                method: 'random',
                space: html.find('[name="space"]').val(),
                hue: html.find('[name="hue"]').val(),
                colors: colorSlider.getColors(),
              },
            });
            this.render(true);
          },
        },
        remove: {
          label: 'Remove',
          callback: async (html) => {
            await this._updateBrushSettings({
              randomColor: null,
            });
            this.render(true);
          },
        },
      },
      render: (html) => {
        import('./randomizer/slider.js').then((module) => {
          colorSlider = new module.ColorSlider(
            html,
            randomColor.colors ?? [
              { hex: '#ff0000', offset: 0 },
              { hex: '#ff0000', offset: 100 },
            ]
          );
          setTimeout(() => dialog.setPosition({ height: 'auto' }), 100);
        });
      },
    });

    dialog.render(true);
  }

  async _onRightClickPreset(event) {
    const presetIndex = $(event.currentTarget).data('index');
    const preset = this.presets[presetIndex];
    if (preset) this.removePreset(preset.id);
  }

  async _resetToDefaults() {
    await this._updateBrushSettings({
      scale: [1, 1],
      rotation: [0, 0],
      density: 1,
      color: null,
      randomColor: null,
      tmfxPreset: null,
      tagger: null,
    });
    this.render(true);
  }

  async _toggleSetting(event) {
    const control = $(event.target).closest('.toggle-button');
    const update = { [control.data('name')]: !control.hasClass('active') };

    if (update.spawner) update.eraser = false;
    if (update.eraser) update.spawner = false;

    await this._updateBrushSettings(update);

    if (update.random) await this.iterate();
    else this.render(true);
  }

  async _updateBrushSettings(update) {
    foundry.utils.mergeObject(this._settings, update);
    await game.settings.set(MODULE_ID, 'brush', this._settings);

    if (update.hasOwnProperty('group')) this._createIndex();
    await this._activateBrush();
  }

  addPresets(presets = []) {
    for (const preset of presets) {
      if (!this.presets.find((p) => p.uuid === preset.uuid)) this.presets.push(preset);
    }
    this._createIndex();
    this.render(true);
  }

  removePreset(id) {
    const presetIndex = this.presets.findIndex((p) => p.id === id);
    if (presetIndex === -1) return;

    const wasActivePreset = this._index[this._it]?.pI === presetIndex;

    this.presets = this.presets.filter((p) => p.id !== id);
    if (this.presets.length === 0) return this.close(true);

    this._createIndex();

    if (wasActivePreset) this.iterate();
    else this.render(true);
  }

  async iterate(forward = true, force = false) {
    if (force || !this._settings.lock) {
      if (this._settings.random) this._it = Math.floor(Math.random() * this._index.length);
      else {
        this._it += forward ? 1 : -1;
        if (this._it < 0) this._it = this._index.length - 1;
        else this._it %= this._index.length;
      }
    } else {
      if (this._it === -1) this._it = 0;
    }

    await this._activateBrush();
    this.render(true);
  }

  /**
   * Get transform to be immediately applied to the preset preview
   * @returns {Object} e.g. { rotation: 45, scale: 0.8 }
   */
  _getTransform() {
    const settings = this._settings;
    const transform = {};

    // Scale and Rotation transformation are accumulated on the picker
    // We want to preserve these when rendering a new preview
    const accumulatedTransform = Picker.getTransformAccumulator();

    if (settings.scale[0] === settings.scale[1]) {
      transform.scale = settings.scale[0];
      transform.scale *= accumulatedTransform.scale;
    } else {
      const stepsInRange = (settings.scale[1] - settings.scale[0]) / 0.01;
      transform.scale = Math.floor(Math.random() * stepsInRange) * 0.01 + settings.scale[0];
      transform.scale *= accumulatedTransform.scale;
    }

    if (settings.rotation[0] === settings.rotation[1]) {
      transform.rotation = settings.rotation[0];
      transform.rotation += accumulatedTransform.rotation;
    } else {
      const stepsInRange = (settings.rotation[1] - settings.rotation[0] + 1) / 1;
      transform.rotation = Math.floor(Math.random() * stepsInRange) * 1 + settings.rotation[0];
    }

    return transform;
  }

  _deactivateCallback() {
    this.close(true);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-brush-macro',
      icon: 'fa-solid fa-code',
      onclick: this._generateBrushMacro.bind(this),
    });

    return buttons;
  }

  async _generateBrushMacro() {
    const genMacro = async function (command) {
      const macro = await Macro.create({
        name: 'Brush Macro',
        type: 'script',
        scope: 'global',
        command,
        img: `modules/${MODULE_ID}/images/brush_icon.png`,
      });
      macro.sheet.render(true);
    };

    const genUUIDS = function () {
      const uuids = this.presets.map((p) => p.uuid).filter(Boolean);
      if (!uuids.length) return;

      const command = `MassEdit.openBrushMenu({ 
    uuid: ${JSON.stringify(uuids, null, 4)}
  },
  ${JSON.stringify(this._settings, null, 2)}
  );`;
      genMacro(command);
    };

    const genNames = function () {
      const opts = this.presets.map((p) => {
        return { name: p.name, type: p.documentName };
      });

      const command = `MassEdit.openBrushMenu(
    ${JSON.stringify(opts, null, 4)}
  ,
  ${JSON.stringify(this._settings, null, 2)}
  );`;
      genMacro(command);
    };

    let dialog = new Dialog({
      title: `Generate Macro`,
      content: ``,
      buttons: {
        uuids: {
          label: 'UUIDs',
          callback: genUUIDS.bind(this),
        },
        name: {
          label: 'Names',
          callback: genNames.bind(this),
        },
      },
    });

    dialog.render(true);
  }

  async close(options = {}) {
    Brush.deactivate();
    BrushMenu._instance = null;
    Picker.destroy();
    Picker.resetTransformAccumulator();
    return super.close(options);
  }
}

/**
 * API method to activate the brush.
 * @param {Object} options See MassEdit.getPreset(...)
 * @param {String} mode update|spawn
 */
export async function activateBrush(options, mode = 'spawner') {
  const preset = await PresetAPI.getPreset(options);
  if (preset) {
    Brush.activate({ preset, spawner: mode === 'spawner' });
  }
}

/**
 * API method to de-activate the brush.
 */
export function deactivateBush() {
  Brush.deactivate();
}

/**
 * Open Brush Menu using the provided presets
 * @param {Object} options See MassEdit.getPresets(...)
 * @param {Object} settings Brush Menu control settings
 */
export async function openBrushMenu(options, settings = {}) {
  if (BrushMenu.isActive()) return BrushMenu.close();

  let presets = [];

  if (Array.isArray(options)) {
    for (const opts of options) {
      let preset = await PresetAPI.getPreset(opts);
      if (preset) presets.push(preset);
    }
  } else {
    presets = await PresetAPI.getPresets(options);
  }

  if (!presets?.length) return;
  for (const preset of presets) await preset.load();
  BrushMenu.render(presets, settings);
}
