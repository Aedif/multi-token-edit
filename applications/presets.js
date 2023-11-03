import { Brush } from '../scripts/brush.js';
import { importPresetFromJSONDialog } from '../scripts/dialogs.js';
import { SUPPORTED_PLACEABLES, spawnPlaceable } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

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
}

const DOC_ICONS = {
  Token: 'fas fa-user-alt',
  MeasuredTemplate: 'fas fa-ruler-combined',
  Tile: 'fa-solid fa-cubes',
  Drawing: 'fa-solid fa-pencil-alt',
  Wall: 'fa-solid fa-block-brick',
  AmbientLight: 'fa-regular fa-lightbulb',
  AmbientSound: 'fa-solid fa-music',
  Note: 'fa-solid fa-bookmark',
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

    this.presets = new foundry.utils.Collection(
      game.settings.get('multi-token-edit', 'docPresets').map((p) => [p.id, new Preset(p)])
    );

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
          canvas.activeLayer?.preview?.children[0]?._original?.mouseInteractionManager?.isDragging
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
    html.on('click', '.item-name label', this._onSelectPreset.bind(this));
    html.on('contextmenu', '.item-name label', this._onRightClickPreset.bind(this));
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
    const presets = this.presets;
    $(event.target)
      .closest('.item-list')
      .find('.item.selected')
      .each(function () {
        const id = $(this).data('id');
        const preset = presets.get(id);
        if (preset) selected.push(preset);
      });
    this._editPresets(selected, {}, event);
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    new PresetConfig(presets, this.presets, options, {
      left: event.originalEvent.x,
      top: event.originalEvent.y,
    }).render(true);
  }

  _onSelectPreset(event) {
    const id = $(event.target).closest('.item').data('id');
    const preset = this.presets.get(id);
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
        console.log(event, ui);
        // sortable.sortable('cancel');
        $(sortable).sortable('cancel');
        return false;
      }
    }

    if (game.settings.get('multi-token-edit', 'presetSortMode') === 'manual') {
      const presets = this.presets;
      const globalSorting = this.docName === 'ALL';
      $(event.target)
        .find('.item')
        .each(function (index) {
          const id = $(this).data('id');
          const preset = presets.get(id);
          if (preset) {
            if (globalSorting) preset.gOrder = index;
            else preset.order = index;
          }
        });
    }
  }

  async _onPresetDragOut(event) {
    const id = $(event.originalEvent.target).closest('.item').data('id');
    const preset = this.presets.get(id);
    if (preset) spawnPlaceable(preset);
  }

  async _onPresetBrush(event) {
    const id = $(event.target).closest('.item').data('id');
    const preset = this.presets.get(id);
    if (preset) {
      let activated = Brush.activate({ preset });

      const brushControl = $(event.target).closest('.preset-brush');
      if (brushControl.hasClass('active')) {
        brushControl.removeClass('active');
      } else {
        $(event.target).closest('form').find('.preset-brush').removeClass('active');
        if (!activated) {
          if (Brush.activate({ preset })) {
            brushControl.addClass('active');
          }
        } else {
          brushControl.addClass('active');
        }
      }
    }
  }

  async close(options = {}) {
    if (!Boolean(this.configApp)) Brush.deactivate();
    MassEditPresets.objectHover = false;
    this._savePresets();
    return super.close(options);
  }

  _onPresetUpdate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig
        ? this._getActiveEffectFields()
        : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected, unable to update.');
      return;
    }

    const id = $(event.target).closest('.item').data('id');
    if (!id) return;

    this._createUpdatePreset(id, null, selectedFields);
    ui.notifications.info(`Preset {${name}} updated`);
  }

  async _createUpdatePreset(id, name, selectedFields) {
    const randomize = deepClone(this.configApp.randomizeFields || {});
    const addSubtract = deepClone(this.configApp.addSubtractFields || {});

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomize);
    }

    if (id) {
      const preset = this.presets.get(id);
      preset.data = selectedFields;
      preset.randomize = randomize;
      preset.addSubtract = addSubtract;
    } else {
      const preset = new Preset({
        name,
        documentName: this.docName,
        data: selectedFields,
        randomize: this.configApp.randomizeFields,
        addSubtract: this.configApp.addSubtractFields,
      });
      this.presets.set(preset.id, preset);
    }

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

    new Dialog({
      title: `Choose a name`,
      content: `<table style="width:100%"><tr><td style="width:50%"><input type="text" name="input" value=""/></td></tr></table>`,
      buttons: {
        Ok: {
          label: `Save`,
          callback: (html) => {
            const name = html.find('input').val();
            if (name) {
              this._createUpdatePreset(null, name, selectedFields);
            }
          },
        },
      },
      render: (html) => {
        html.find('input').focus();
      },
    }).render(true);
  }

  presetFromPlaceable(placeable, event) {
    let data = placeable.document.toCompendium();
    delete data.x;
    delete data.y;

    const documentName = placeable.document.documentName;
    if (documentName === 'Wall') delete data.c;

    const preset = new Preset({
      name: '',
      documentName,
      data,
    });

    if (['Token', 'Tile', 'Note'].includes(documentName)) {
      preset.img = data.texture.src;
    }

    this.presets.set(preset.id, preset);
    this.render(true);

    this._editPresets([preset], { isCreate: true }, event);
  }

  _getActiveEffectFields() {
    return { changes: deepClone(this.configApp.object.changes ?? []) };
  }

  _getPresetsList() {
    // Order presets
    let presetList;
    if (this.docName === 'ALL') {
      presetList = this.presets.contents;
    } else {
      presetList = this.presets.filter((p) => p.documentName === this.docName);
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

  async _savePresets() {
    await game.settings.set(
      'multi-token-edit',
      'docPresets',
      this.presets.contents.map((p) => p.toJSON())
    );
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
    exportPresets(this.presets.contents);
  }

  async _onImport() {
    const json = await importPresetFromJSONDialog();
    if (!json) return;

    console.log(json);

    let importCount = 0;

    if (getType(json) === 'Array') {
      for (const p of json) {
        if (!('documentName' in p)) continue;
        if (!('data' in p) || isEmpty(p.data)) continue;

        const preset = new Preset(p);
        this.presets.set(preset.id, preset);
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
    const preset = this.presets.get(event.submitter.data.id);
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
  constructor(presets, presetCollection, { callback = null, isCreate = false } = {}, opts = {}) {
    if (opts.left !== null) {
      opts.left = opts.left - PresetConfig.defaultOptions.width / 2;
    }
    super({}, opts);
    this.presets = presets;
    this.presetCollection = presetCollection;
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
    let preset = {};
    if (this.presets.length === 1) preset = this.presets[0];
    return { preset };
  }

  _removePresets() {
    this.presets.forEach((p) => {
      this.presetCollection.delete(p.id);
    });
    this.presets = null;
  }

  _updatePresets(formData) {
    formData.name = formData.name.trim();
    formData.img = formData.img.trim() || null;
    formData.color = formData.color.trim() || null;

    if (this.isCreate) {
      this.presets.forEach((p) => {
        p.name = formData.name || 'New Preset';
        p.img = formData.img;
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

    if (this.callback) this.callback(this.preset);
    return this.presets;
  }
}
