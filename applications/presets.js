import { Brush } from '../scripts/brush.js';
import { importPresetFromJSONDialog } from '../scripts/dialogs.js';
import { SUPPORTED_PLACEABLES } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

export class PresetCollection {
  static presets;

  static syncTimer;

  static initialize() {
    if (!this.presets) {
      this.presets = new foundry.utils.Collection(
        game.settings.get('multi-token-edit', 'docPresets').map((p) => [p.id, new Preset(p)])
      );
    }
  }

  static sync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this._saveRefresh(), 3000);
  }

  static _saveRefresh() {
    console.debug('Mass Edit: Saving Presets');
    game.settings.set(
      'multi-token-edit',
      'docPresets',
      this.presets.contents.map((p) => p.toJSON())
    );
  }

  /**
   * @param {Preset|Array[Preset]} preset
   */
  static set(preset) {
    if (preset instanceof Array) presets.forEach((p) => this.presets.set(p.id, p));
    else this.presets.set(preset.id, preset);
    this.sync();
  }

  /**
   * @param {Preset|Array[Preset]} preset
   */
  static delete(preset) {
    if (preset instanceof Array) presets.forEach((p) => this.presets.delete(p.id));
    else this.presets.delete(preset.id);
    this.sync();
  }

  /**
   * @param {String} id
   * @returns  {Preset|null}
   */
  static get(id) {
    return this.presets.get(id);
  }

  /**
   * @returns  {Array[Preset]}
   */
  static getAll(placeablesOnly = false) {
    if (placeablesOnly)
      return this.presets.contents.filter((p) => SUPPORTED_PLACEABLES.includes(p.documentName));
    else return this.presets.contents;
  }

  static getByDoc(documentName) {
    return this.presets.filter((p) => p.documentName === documentName);
  }
}

export class PresetAPI {
  /**
   * Retrieve saved preset
   * @param {object} [options={}]
   * @param {String} [options.id]   Preset ID
   * @param {String} [options.name] Preset name
   * @param {String} [options.type] Preset type ("Token", "Tile", etc)
   * @returns {Preset}
   */
  static getPreset({ id = null, name = null, type = null } = {}) {
    if (id) return PresetCollection.get(id);
    else if (!name) throw Error('ID or Name required to retrieve a Preset.');

    let presets = PresetCollection.getAll();
    if (type) presets = presets.filter((p) => p.documentName === type);

    return presets.find((p) => p.name === name)?.clone();
  }

  /**
   * Create Presets from passed in placeables
   * @param {PlaceableObject|Array[PlaceableObject]} placeables Placeable/s to create the presets from.
   * @param {object} [options={}] Optional Preset information
   * @param {String} [options.name] Preset name
   * @param {String} [options.color] Preset background color (e.g. "#ff0000")
   * @param {String} [options.img] Preset thumbnail image
   * @returns {Preset|Array[Preset]}
   */
  static createPreset(placeables, options = {}) {
    if (!placeables) return;
    if (!(placeables instanceof Array)) placeables = [placeables];

    const presets = [];

    for (const placeable of placeables) {
      let data = placeable.document.toCompendium();
      delete data.x;
      delete data.y;

      // Preset data before merging with user provided
      const defPreset = { name: '', documentName: placeable.document.documentName, data };
      if (defPreset.documentName === 'Wall') delete data.c;

      switch (defPreset.documentName) {
        case 'Token':
          defPreset.name = data.name;
        case 'Tile':
        case 'Note':
          defPreset.img = data.texture.src;
          break;
        case 'AmbientSound':
          defPreset.img = 'icons/svg/sound.svg';
          break;
        case 'AmbientLight':
          defPreset.img = 'icons/svg/light.svg';
          break;
        case 'Drawing':
          defPreset.img = 'icons/svg/acid.svg';
          break;
        case 'MeasuredTemplate':
          defPreset.img = 'icons/svg/circle.svg';
          break;
      }

      mergeObject(defPreset, options, { inplace: true });

      const preset = new Preset(defPreset);

      PresetCollection.set(preset);
      presets.push(preset);
    }
    return presets;
  }

  /**
   * Spawn a preset on the scene (id, name or preset itself are required).
   * @param {object} [options={}]
   * @param {Preset} [options.preset]             Preset
   * @param {String} [options.id]                 Preset ID
   * @param {String} [options.name]               Preset name
   * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
   * @param {Number} [options.x]                  Spawn canvas x coordinate (required if spawnOnMouse is false)
   * @param {Number} [options.y]                  Spawn canvas y coordinate (required if spawnOnMouse is false)
   * @param {Boolean} [options.spawnOnMouse]      If 'true' current mouse position will be used as the spawn position
   * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
   * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
   *
   */
  static spawnPreset({
    id = null,
    preset = null,
    name = null,
    type = null,
    x = null,
    y = null,
    spawnOnMouse = true,
    snapToGrid = true,
    hidden = false,
  } = {}) {
    if (!canvas.ready) throw Error("Canvas need to be 'ready' for a preset to be spawned.");
    if (!(id || preset || name)) throw Error('ID, Name, or Preset is needed to spawn it.');
    if (!spawnOnMouse && (x == null || y == null))
      throw Error(
        'X and Y coordinates have to be provided or spawnOnMouse set to true for a preset to be spawned.'
      );

    preset = preset ?? PresetAPI.getPreset({ id, name, type });
    if (!preset)
      throw Error(
        `No preset could be found matching: { id: "${id}", name: "${name}", type: "${type}"}`
      );

    if (spawnOnMouse && x == null) {
      x = canvas.mousePosition.x;
      y = canvas.mousePosition.y;

      if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
        x -= canvas.dimensions.size / 2;
        y -= canvas.dimensions.size / 2;
      }
    }

    let pos = { x, y };

    if (snapToGrid) {
      pos = canvas.grid.getSnappedPosition(
        pos.x,
        pos.y,
        canvas.getLayerByEmbeddedName(preset.documentName).gridPrecision
      );
    }

    const randomizer = preset.randomize;
    if (!isEmpty(randomizer)) {
      applyRandomization([preset.data], null, randomizer);
    }

    let data;

    // Set default values if needed
    switch (preset.documentName) {
      case 'Token':
        data = { name: preset.name };
        break;
      case 'Tile':
        data = { width: canvas.grid.w, height: canvas.grid.h };
        break;
      case 'AmbientSound':
        data = { radius: 20 };
        break;
      case 'Wall':
        data = { c: [pos.x, pos.y, pos.x + canvas.grid.w, pos.y] };
        break;
      case 'Drawing':
        data = { 'shape.width': canvas.grid.w * 2, 'shape.height': canvas.grid.h * 2 };
        break;
      case 'MeasuredTemplate':
        data = { distance: 10 };
        break;
      case 'AmbientLight':
        if (!('config.dim' in preset.data) && !('config.bright' in preset.data)) {
          data = { 'config.dim': 20, 'config.bright': 10 };
          break;
        }
      default:
        data = {};
    }

    mergeObject(data, preset.data);
    mergeObject(data, pos);

    if (hidden || game.keyboard.downKeys.has('AltLeft')) {
      data.hidden = true;
    }

    canvas.scene.createEmbeddedDocuments(preset.documentName, [data]);
  }
}

export class Preset {
  constructor(preset) {
    this.id = preset.id ?? randomID();
    this.name = preset.name ?? 'Mass Edit Preset';
    this.documentName = preset.documentName;
    this.bgColor = preset.color;
    this.order = preset.order ?? -1;
    this.gOrder = preset.gOrder ?? -1;
    this.addSubtract = deepClone(preset.addSubtract ?? {});
    this.randomize = deepClone(preset.randomize ?? {});
    this.data = deepClone(preset.data ?? {});
    this.img = preset.img;
  }

  set color(color) {
    try {
      this.bgColor = new PIXI.Color(color).toHex();
    } catch (e) {
      this.bgColor = null;
    }
  }

  get color() {
    return this.bgColor;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      documentName: this.documentName,
      color: this.color,
      order: this.order,
      gOrder: this.gOrder,
      addSubtract: this.addSubtract,
      randomize: this.randomize,
      img: this.img,
      data: this.data,
    };
  }

  clone() {
    return new Preset(this.toJSON());
  }
}

const DOC_ICONS = {
  Token: 'fas fa-user-circle',
  MeasuredTemplate: 'fas fa-ruler-combined',
  Tile: 'fa-solid fa-cubes',
  Drawing: 'fa-solid fa-pencil-alt',
  Wall: 'fa-solid fa-block-brick',
  AmbientLight: 'fa-regular fa-lightbulb',
  AmbientSound: 'fa-solid fa-music',
  Note: 'fa-solid fa-bookmark',
  Actor: 'fas fa-user-alt',
  DEFAULT: 'fa-solid fa-question',
};

const SORT_MODES = {
  manual: { tooltip: 'Sort Manually', icon: '<i class="fa-solid fa-arrow-down-short-wide"></i>' },
  alphabetical: {
    tooltip: 'Sort Alphabetically',
    icon: '<i class="fa-solid fa-arrow-down-a-z"></i>',
  },
};

export class MassEditPresets extends FormApplication {
  static objectHover = false;
  static lastSearch;

  constructor(configApp, callback, docName, options = {}) {
    super({}, options);
    this.callback = callback;

    if (!configApp) {
      const docLock = game.settings.get('multi-token-edit', 'presetDocLock');
      this.docName = docLock || docName;
    } else {
      this.configApp = configApp;
      this.docName = docName || this.configApp.documentName;
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet', 'mass-edit-preset-form'],
      template: 'modules/multi-token-edit/templates/presets.html',
      resizable: true,
      minimizable: false,
      title: `Presets`,
      width: 350,
      height: 'auto',
      scrollY: ['ol.item-list'],
    });
  }

  get title() {
    return `${game.i18n.localize('multi-token-edit.common.presets')}`;
  }

  async getData(options) {
    const data = super.getData(options);

    const presetList = await this._reOrderPresets();

    data.presets = [];

    data.createEnabled = Boolean(this.configApp);
    data.isPlaceable = this.docName === 'ALL' || SUPPORTED_PLACEABLES.includes(this.docName);
    data.allowDocumentSwap = data.isPlaceable && !this.configApp;
    data.docLockActive = game.settings.get('multi-token-edit', 'presetDocLock') === this.docName;

    data.sortMode = SORT_MODES[game.settings.get('multi-token-edit', 'presetSortMode')];

    const aeModeString = function (mode) {
      let s = Object.keys(CONST.ACTIVE_EFFECT_MODES).find(
        (k) => CONST.ACTIVE_EFFECT_MODES[k] === mode
      );
      return s ?? mode;
    };

    for (const p of presetList) {
      const fields = p.data;

      let title = '';
      for (const k of Object.keys(fields)) {
        if (k in p.randomize) {
          title += `${k}: {{randomized}}\n`;
        } else if (k in p.addSubtract) {
          const val = 'value' in p.addSubtract[k] ? p.addSubtract[k].value : fields[k];
          title += `${k}: ${p.addSubtract[k].method === 'add' ? '+' : '-'}${val}\n`;
        } else if (k === 'changes' && this.docName === 'ActiveEffect') {
          fields[k].forEach((c) => {
            title += `${c.key} | ${aeModeString(c.mode)} | ${c.value} | ${c.priority}\n`;
          });
        } else {
          title += `${k}: ${fields[k]}\n`;
        }
      }

      // Convert color to CSS rgba with opacity <1
      let color;
      try {
        if (p.color) color = new PIXI.Color(p.color);
      } catch (e) {}
      if (color) {
        color = color.toUint8RgbArray();
        color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3)`;
      }

      data.presets.push({
        id: p.id,
        name: p.name,
        img: p.img || CONST.DEFAULT_TOKEN,
        title: title,
        color: color,
        icon: DOC_ICONS[p.documentName] ?? DOC_ICONS.DEFAULT,
      });
    }

    data.displayDragDropMessage = data.allowDocumentSwap && !Boolean(data.presets.length);

    data.lastSearch = MassEditPresets.lastSearch;

    data.documents = ['ALL', ...SUPPORTED_PLACEABLES];
    data.currentDocument = this.docName;

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    import('../scripts/jquery-ui/jquery-ui.js').then((imp) => {
      import('../scripts/jquery-multisortable/jquery.multisortable.js').then(() => {
        const app = this;
        html.find('.preset-items').multisortable({
          cursor: 'move',
          placeholder: 'ui-state-highlight',
          opacity: '0.8',
          items: '.item',
          scroll: true,
          scrollSpeed: 10,
          scrollSensitivity: 40,
          stop: function (event, ui) {
            app._onPresetOrder(event, ui, this);
          },
        });
      });
    });

    const hoverOverlay = html.closest('.window-content').find('.overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (
          canvas.activeLayer?.preview?.children.some(
            (c) => c._original?.mouseInteractionManager?.isDragging
          )
        ) {
          hoverOverlay.show();
          MassEditPresets.objectHover = true;
        } else {
          hoverOverlay.hide();
          MassEditPresets.objectHover = false;
        }
      })
      .on('mouseout', () => {
        hoverOverlay.hide();
        MassEditPresets.objectHover = false;
      });

    html.find('.toggle-sort').on('click', this._onToggleSort.bind(this));
    html.find('.toggle-doc-lock').on('click', this._onToggleLock.bind(this));
    html.find('.document-select').on('change', this._onDocumentChange.bind(this));
    html
      .find('.item .item-name label, .item .thumbnail')
      .on('click', this._onSelectPreset.bind(this))
      .on('contextmenu', this._onRightClickPreset.bind(this));
    html.on('click', '.preset-create', this._onPresetCreate.bind(this));
    html.on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    html.on('click', '.preset-brush', this._onPresetBrush.bind(this));

    const list = html.find('.item');
    const headerSearch = html.find('.header-search input');
    headerSearch
      .on('input', (event) => {
        MassEditPresets.lastSearch = event.target.value;
        const filter = event.target.value.trim().toLowerCase();
        list.each(function () {
          const item = $(this);
          if (item.attr('name').toLowerCase().includes(filter)) item.show();
          else item.hide();
        });
      })
      .trigger('input');
  }

  async _onToggleSort(event) {
    const currentSort = game.settings.get('multi-token-edit', 'presetSortMode');
    const newSort = currentSort === 'manual' ? 'alphabetical' : 'manual';
    await game.settings.set('multi-token-edit', 'presetSortMode', newSort);

    this.render(true);
  }

  _onToggleLock(event) {
    const lockControl = $(event.target).closest('.toggle-doc-lock');

    let currentLock = game.settings.get('multi-token-edit', 'presetDocLock');
    let newLock = this.docName;

    if (newLock !== currentLock) lockControl.addClass('active');
    else {
      lockControl.removeClass('active');
      newLock = '';
    }

    game.settings.set('multi-token-edit', 'presetDocLock', newLock);
  }

  _onDocumentChange(event) {
    const newDocName = $(event.target).val();
    if (newDocName != this.docName) {
      this.docName = newDocName;
      this.render(true);
    }
  }

  _onRightClickPreset(event) {
    const selected = [];
    $(event.target)
      .closest('.item-list')
      .find('.item.selected')
      .each(function () {
        const id = $(this).data('id');
        const preset = PresetCollection.get(id);
        if (preset) selected.push(preset);
      });
    this._editPresets(selected, {}, event);
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    new PresetConfig(presets, options, {
      left: event.originalEvent.x,
      top: event.originalEvent.y,
    }).render(true);
  }

  _onSelectPreset(event) {
    const id = $(event.target).closest('.item').data('id');

    const preset = PresetCollection.get(id);
    if (preset) {
      this.callback(preset);
    }
  }

  _onPresetOrder(event, ui, sortable) {
    // Check if the preset for a placeable has been dragged out onto the canvas
    if (this.docName === 'ALL' || SUPPORTED_PLACEABLES.includes(this.docName)) {
      const checkMouseInWindow = function (event) {
        let app = $(event.target).closest('.window-app');
        var offset = app.offset();
        let appX = offset.left;
        let appY = offset.top;
        let appW = app.width();
        let appH = app.height();

        var mouseX = event.pageX;
        var mouseY = event.pageY;

        if (mouseX > appX && mouseX < appX + appW && mouseY > appY && mouseY < appY + appH) {
          return true;
        }
        return false;
      };

      if (!checkMouseInWindow(event)) {
        this._onPresetDragOut(event);
        $(sortable).sortable('cancel');
        return false;
      }
    }

    if (game.settings.get('multi-token-edit', 'presetSortMode') === 'manual') {
      const globalSorting = this.docName === 'ALL';
      $(event.target)
        .find('.item')
        .each(function (index) {
          const id = $(this).data('id');
          const preset = PresetCollection.get(id);
          if (preset) {
            if (globalSorting) preset.gOrder = index;
            else preset.order = index;
          }
        });
    }
  }

  async _onPresetDragOut(event) {
    const id = $(event.originalEvent.target).closest('.item').data('id');
    const preset = PresetCollection.get(id);
    if (preset) PresetAPI.spawnPreset({ preset });
  }

  async _onPresetBrush(event) {
    const id = $(event.target).closest('.item').data('id');
    const preset = PresetCollection.get(id);
    if (preset) {
      let activated = Brush.activate({
        preset,
        deactivateCallback: this._onPresetBrushDeactivate.bind(this),
      });

      const brushControl = $(event.target).closest('.preset-brush');
      if (brushControl.hasClass('active')) {
        brushControl.removeClass('active');
      } else {
        $(event.target).closest('form').find('.preset-brush').removeClass('active');
        if (!activated) {
          if (
            Brush.activate({ preset, deactivateCallback: this._onPresetBrushDeactivate.bind(this) })
          ) {
            brushControl.addClass('active');
          }
        } else {
          brushControl.addClass('active');
        }
      }
    }
  }

  _onPresetBrushDeactivate() {
    $(this.form).find('.preset-brush').removeClass('active');
  }

  async close(options = {}) {
    if (!Boolean(this.configApp)) Brush.deactivate();
    MassEditPresets.objectHover = false;
    PresetCollection.sync();
    return super.close(options);
  }

  _onPresetUpdate(event) {
    const id = $(event.target).closest('.item').data('id');
    if (!id) return;

    const preset = PresetCollection.get(id);
    if (!preset) return;

    const selectedFields =
      this.configApp instanceof ActiveEffectConfig
        ? this._getActiveEffectFields()
        : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected, unable to update.');
      return;
    }

    const randomize = deepClone(this.configApp.randomizeFields || {});
    const addSubtract = deepClone(this.configApp.addSubtractFields || {});

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomize);
    }

    preset.data = selectedFields;
    preset.randomize = randomize;
    preset.addSubtract = addSubtract;
    PresetCollection.sync();

    ui.notifications.info(`Preset "${preset.name}" updated`);

    this.render(true);
  }

  _onPresetCreate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig
        ? this._getActiveEffectFields()
        : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected.');
      return;
    }

    const preset = new Preset({
      name: '',
      documentName: this.docName,
      data: selectedFields,
      addSubtract: this.configApp.addSubtractFields,
      randomize: this.configApp.randomizeFields,
    });

    PresetCollection.set(preset);
    this.render(true);

    this._editPresets([preset], { isCreate: true }, event);
  }

  presetFromPlaceable(placeables, event) {
    const presets = PresetAPI.createPreset(placeables);

    // Switch to just created preset's category before rendering if not set to 'ALL'
    const documentName = placeables[0].document.documentName;
    if (this.docName !== 'ALL' && this.docName !== documentName) this.docName = documentName;

    this.render(true);

    this._editPresets(presets, { isCreate: true }, event);
  }

  _getActiveEffectFields() {
    return { changes: deepClone(this.configApp.object.changes ?? []) };
  }

  _getPresetsList() {
    // Order presets
    let presetList;
    if (this.docName === 'ALL') {
      presetList = PresetCollection.getAll(true);
    } else {
      presetList = PresetCollection.getByDoc(this.docName);
    }

    if (game.settings.get('multi-token-edit', 'presetSortMode') === 'manual') {
      const globalSorting = this.docName === 'ALL';
      if (globalSorting) presetList.sort((p1, p2) => p1.gOrder - p2.gOrder);
      else presetList.sort((p1, p2) => p1.order - p2.order);
    } else {
      presetList.sort((p1, p2) => p1.name.localeCompare(p2.name, 'en', { numeric: true }));
    }
    return presetList;
  }

  async _reOrderPresets(save = true) {
    const presetList = this._getPresetsList();

    if (game.settings.get('multi-token-edit', 'presetSortMode') === 'manual') {
      let order = 0;
      const globalSorting = this.docName === 'ALL';
      for (const preset of presetList) {
        if (globalSorting) preset.gOrder = order;
        else preset.order = order;
        order++;
      }
    }

    return presetList;
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: (ev) => this._onExport(ev),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-import',
      icon: 'fas fa-file-import',
      onclick: (ev) => this._onImport(ev),
    });

    return buttons;
  }

  _onExport() {
    exportPresets(PresetCollection.getAll());
  }

  async _onImport() {
    const json = await importPresetFromJSONDialog();
    if (!json) return;

    let importCount = 0;

    if (getType(json) === 'Array') {
      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || isEmpty(p.data)) continue;

        PresetCollection.set(new Preset(p));
        importCount++;
      }
    }

    ui.notifications.info(`Mass Edit: Imported ${importCount} presets.`);

    if (importCount) this.render(true);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const preset = PresetCollection.get(event.submitter.data.id);
    if (preset) this.callback(preset);
  }
}

function exportPresets(presets, fileName) {
  if (!presets.length) return;
  saveDataToFile(
    JSON.stringify(presets, null, 2),
    'text/json',
    (fileName ?? 'mass-edit-presets') + '.json'
  );
}

class PresetConfig extends FormApplication {
  /**
   * @param {Array[Preset]} presets
   */
  constructor(presets, { callback = null, isCreate = false } = {}, opts = {}) {
    if (opts.left !== null) {
      opts.left = opts.left - PresetConfig.defaultOptions.width / 2;
    }
    super({}, opts);
    this.presets = presets;
    this.callback = callback;
    this.isCreate = isCreate;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/presetEdit.html',
      width: 360,
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return 'mass-edit-preset-edit';
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if (this.presets.length > 1) return `Presets [${this.presets.length}]`;
    else return `Preset: ${this.presets[0].name}`;
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: (ev) => this._onExport(ev),
    });
    return buttons;
  }

  _onExport() {
    let fileName;
    if (this.presets.length === 1) {
      fileName = 'mass-edit-preset-' + this.presets[0].name.replace(' ', '_').replace(/\W/g, '');
    }
    exportPresets(this.presets, fileName);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    if (!this.options.submitOnClose) this.options.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options = {}) {
    const data = {};

    data.preset = {};
    if (this.presets.length === 1) data.preset = this.presets[0];

    data.tva = game.modules.get('token-variants')?.active;

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // TVA Support
    const tvaButton = html.find('.token-variants-image-select-button');
    tvaButton.on('click', (event) => {
      game.modules.get('token-variants').api.showArtSelect('Preset', {
        callback: (imgSrc, name) => {
          tvaButton.siblings(`[name="${tvaButton.data('target')}"]`).val(imgSrc);
        },
        searchType: 'Item',
      });
    });
  }

  _removePresets() {
    this.presets.forEach((p) => {
      PresetCollection.delete(p);
    });
    this.presets = null;
  }

  _updatePresets(formData) {
    formData.name = formData.name.trim();
    formData.img = formData.img.trim() || null;
    formData.color = formData.color.trim() || null;

    if (this.isCreate) {
      this.presets.forEach((p) => {
        p.name = formData.name || p.name || 'New Preset';
        if (formData.img) p.img = formData.img;
        p.color = formData.color;
      });
    } else {
      this.presets.forEach((p) => {
        if (formData.name) p.name = formData.name;
        if (formData.img) p.img = formData.img;
        if (formData.color) {
          if (formData.color === '#000000') p.color = null;
          else p.color = formData.color;
        }
      });
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const action = $(event.submitter).data('action');
    if (action === 'remove') this._removePresets();
    else this._updatePresets(formData);

    PresetCollection.sync();

    if (this.callback) this.callback(this.preset);
    return this.presets;
  }
}
