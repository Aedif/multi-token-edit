import { showMassEdit } from '../../applications/multiConfig';
import { MODULE_ID, SUPPORTED_PLACEABLES, SUPPORTED_SHEET_CONFIGS } from '../constants.js';
import { LinkerAPI } from '../linker/linker.js';
import { localFormat, localize, TagInput } from '../utils';
import { itemSelect } from './containerApp.js';
import { DOC_ICONS, Preset, VirtualFilePreset } from './preset.js';
import { exportPresets, mergePresetDataToDefaultDoc, placeableToData } from './utils.js';

export class PresetConfig extends FormApplication {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/presetEdit.html`,
      width: 360,
      height: 'auto',
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.content', initial: 'main' }],
    });
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

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

    html.find('.edit-document').on('click', this._onEditDocument.bind(this));
    html.find('.assign-document').on('click', this._onAssignDocument.bind(this));
    html.find('.delete-fields').on('click', this._onDeleteFields.bind(this));
    html.find('.spawn-fields').on('click', this._onSpawnFields.bind(this));
    html.find('summary').on('click', () => setTimeout(() => this.setPosition({ height: 'auto' }), 30));
    html.find('.attached').on('click', this.onAttachedRemove.bind(this));
    html.find('.attach-selected').on('click', () => {
      const controlled = canvas.activeLayer.controlled;
      if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
        this.dropPlaceable(controlled);
      }
    });

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

    //Hover
    const hoverOverlay = html.closest('.window-content').find('.drag-drop-overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (this.presets.length !== 1) return;
        if (canvas.activeLayer?.preview?.children.some((c) => c._original?.mouseInteractionManager?.isDragging)) {
          hoverOverlay.show();
          PresetConfig.objectHover = true;
        } else {
          hoverOverlay.hide();
          PresetConfig.objectHover = false;
        }
      })
      .on('mouseout', () => {
        if (this.presets.length !== 1) return;
        hoverOverlay.hide();
        PresetConfig.objectHover = false;
      });

    //Tags
    TagInput.activateListeners(html, {
      change: () => this.setPosition({ height: 'auto' }),
    });
  }

  async render(force = false) {
    if (this.form) this._submitData = this._getSubmitData();
    return await super.render(force);
  }

  /**
   * Create a preset from placeables dragged and dropped ont he form
   * @param {Array[Placeable]} placeables
   * @param {Event} event
   */
  async dropPlaceable(placeables, event) {
    if (!this.attached) this.attached = foundry.utils.deepClone(this.presets[0].attached ?? []);
    placeables.forEach((p) =>
      this.attached.push({
        documentName: p.document.documentName,
        data: placeableToData(p),
      })
    );

    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async onAttachedRemove(event) {
    const index = $(event.target).closest('.attached').data('index');
    this.attached = this.attached || foundry.utils.deepClone(this.presets[0].attached);
    this.attached.splice(index, 1);
    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async _onSpawnFields() {
    new PresetFieldModify(
      this.data ?? this.presets[0].data,
      (modifyOnSpawn) => {
        this.modifyOnSpawn = modifyOnSpawn;
      },
      this.modifyOnSpawn ?? this.presets[0].modifyOnSpawn
    ).render(true);
  }

  async _onDeleteFields() {
    new PresetFieldDelete(this.data ?? this.presets[0].data, (data) => {
      this.data = data;
    }).render(true);
  }

  async _onAssignDocument() {
    const controlled = canvas.getLayerByEmbeddedName(this.presets[0].documentName)?.controlled.map((p) => p.document);
    if (!controlled?.length) return;

    const linked = LinkerAPI.getLinkedDocuments(controlled);
    if (linked.size) {
      const response = await new Promise((resolve) => {
        Dialog.confirm({
          title: 'Override Attached',
          content: `<p>Linked placeables have been detected [<b>${linked.size}</b>].</p><p>Should they be included and override <b>Attached</b>?</p>`,
          yes: () => resolve(true),
          no: () => resolve(false),
          defaultYes: false,
        });
      });
      if (response) {
        this.attached = Array.from(linked).map((l) => {
          return { documentName: l.documentName, data: placeableToData(l) };
        });
      }
    }

    const data = controlled.map((p) => placeableToData(p));
    this.data = data;
    ui.notifications.info(
      localFormat('presets.assign', {
        count: data.length,
        document: this.presets[0].documentName,
      })
    );
    this.gridSize = canvas.grid.size;
    this.modifyOnSpawn = [];
    this.render(true);
  }

  async _onEditDocument() {
    const documents = [];
    const cls = CONFIG[this.presets[0].documentName].documentClass;

    for (const p of this.presets) {
      p.data.forEach((d) => {
        const tempDoc = new cls(mergePresetDataToDefaultDoc(p, d), { parent: canvas.scene });
        documents.push(tempDoc);
      });
    }

    const app = await showMassEdit(documents, null, {
      presetEdit: true,
      callback: (obj) => {
        this.addSubtract = {};
        this.randomize = {};
        for (const k of Object.keys(obj.data)) {
          if (k in obj.randomize) this.randomize[k] = obj.randomize[k];
          if (k in obj.addSubtract) this.addSubtract[k] = obj.addSubtract[k];
        }
        this.data = obj.data;
        this.render(true);
      },
      forceForm: true,
    });

    // For randomize and addSubtract only take into account the first preset
    // and apply them to the form
    const preset = new Preset({
      data: {},
      randomize: this.presets[0].randomize,
      addSubtract: this.presets[0].addSubtract,
    });
    setTimeout(() => {
      app._applyPreset(preset);
    }, 400);
  }

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    this._createDocumentIdLink(html);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create an ID link button in the header which displays the JournalEntry ID and copies it to clipboard
   * @param {jQuery} html
   * @protected
   */
  _createDocumentIdLink(html) {
    const title = html.find('.window-title');
    const label = localize('DOCUMENT.JournalEntry', false);
    const idLink = document.createElement('a');
    idLink.classList.add('document-id-link');
    idLink.setAttribute('alt', 'Copy document id');
    idLink.dataset.tooltip = `${label}: ${this.presets.map((p) => p.id).join(', ')}`;
    idLink.dataset.tooltipDirection = 'UP';
    idLink.innerHTML = '<i class="fa-solid fa-passport"></i>';
    idLink.addEventListener('click', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.id).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'id',
          id: this.presets.map((p) => p.id).join(', '),
        })
      );
    });
    idLink.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.uuid).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'uuid',
          id: this.presets.map((p) => p.uuid).join(', '),
        })
      );
    });
    title.append(idLink);
  }
}

export class PresetConfigV2 extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static name = 'PresetConfig';

  /**
   * @param {Array[Preset]} presets
   */
  constructor(presets, options = {}) {
    super(options);
    this.presets = presets;
    this.callback = options.callback;
    this.isCreate = options.isCreate;
    this.attached = options.attached;

    console.log(this);
  }

  static DEFAULT_OPTIONS = {
    id: 'mass-edit-preset-edit',
    tag: 'form',
    form: {
      handler: PresetConfigV2._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
    },
    position: {
      width: 360,
      height: 'auto',
    },
  };

  /** @override */
  static TABS = {
    main: {
      tabs: [
        { id: 'main', icon: 'fa-regular fa-book-open' },
        { id: 'spawning', icon: 'fa-solid fa-circle-plus' },
        { id: 'tags', icon: 'fa-solid fa-tag' },
      ],
      initial: 'main',
      labelPrefix: 'MassEdit.presets',
    },
  };

  /** @override */
  static PARTS = {
    overlay: { template: `modules/${MODULE_ID}/templates/drag-drop-overlay.hbs` },
    hidden: { template: `modules/${MODULE_ID}/templates/preset/preset-edit/preset-edit-hidden.hbs` },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    main: { template: `modules/${MODULE_ID}/templates/preset/preset-edit/preset-edit-main.hbs` },
    spawning: { template: `modules/${MODULE_ID}/templates/preset/preset-edit/preset-edit-spawning.hbs` },
    tags: { template: `modules/${MODULE_ID}/templates/preset/preset-edit/preset-edit-tags.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  get title() {
    const prefix = this.presets[0] instanceof VirtualFilePreset ? 'File' : 'Preset';
    if (this.presets.length > 1) return `${prefix}s [${this.presets.length}]`;
    else return `${prefix}: ${this.presets[0].name.substring(0, 20)}${this.presets[0].name.length > 20 ? '...' : ''}`;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    const tab = context.tabs[partId];
    if (tab) context.tab = tab;

    return context;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.virtual = this.presets[0] instanceof VirtualFilePreset;
    context.multiEdit = this.presets.length !== 1;

    context.preset = {};
    if (this.presets.length === 1) {
      context.preset = foundry.utils.deepClone(this.presets[0].toJSON());
    }

    // Form data stored if re-render was required
    if (this._submitData) {
      foundry.utils.mergeObject(context.preset, this._submitData);
    }

    if ((this.data && !(this.data instanceof Array)) || (!this.data && this.presets[0].isEmpty)) {
      context.modifyDisabled = true;
    }

    context.buttons = [{ type: 'submit', icon: 'fas fa-check', label: localize('common.apply') }];

    return context;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    switch (partId) {
      case 'main':
        context.displayFieldDelete = this.presets.length === 1;
        context.minlength = this.presets.length > 1 ? 0 : 1;
        context.tva = game.modules.get('token-variants')?.active;

        // Check if all presets are for the same document type and thus can be edited using a Mass Edit form
        const documentName = this.presets[0].documentName;
        if (
          documentName !== 'Actor' &&
          SUPPORTED_SHEET_CONFIGS.includes(documentName) &&
          this.presets.every((p) => p.documentName === documentName)
        ) {
          context.documentEdit = documentName;
          context.isPlaceable = SUPPORTED_PLACEABLES.includes(documentName);
        }
        break;
      case 'spawning':
        let attached = this.attached || context.preset?.attached;
        if (attached) {
          attached = attached.map((at) => {
            let tooltip = at.documentName;
            if (at.documentName === 'Token' && at.data.name) tooltip += ': ' + at.data.name;
            return {
              icon: DOC_ICONS[at.documentName] ?? DOC_ICONS.DEFAULT,
              tooltip,
            };
          });
          context.attached = attached;
        }
        break;
    }
    if (partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  static async _onSubmit(event, form, formData) {
    // Particularly large updates can take a while, prevent the submit button being clicked multiple times
    $(form).find('button[type="submit"]').prop('disabled', true);

    const data = formData.object;

    data.name = data.name?.trim();
    data.img = data.img?.trim() || null;
    data.preSpawnScript = data.preSpawnScript?.trim();
    data.postSpawnScript = data.postSpawnScript?.trim();
    data.tags = data.tags ? data.tags.split(',') : [];
    data.addTags = data.addTags ? data.addTags.split(',') : [];
    data.removeTags = data.removeTags ? data.removeTags.split(',') : [];

    this._submitData = data;
  }

  // TODO
  // Call this when Apply is clicked
  async _onUpdate(data) {
    await this._updatePresets(data);

    if (this.callback) this.callback(this.presets);
    return this.presets;
  }

  async _updatePresets(formData) {
    for (const preset of this.presets) {
      let update;
      if (this.isCreate) {
        update = {
          name: formData.name || preset.name || localize('presets.default-name'),
          img: formData.img ?? preset.img,
        };
      } else {
        update = {
          name: formData.name || preset.name,
          img: formData.img || preset.img,
        };
      }

      if (this.data) update.data = this.data;
      if (this.addSubtract) update.addSubtract = this.addSubtract;
      if (this.randomize) update.randomize = this.randomize;
      if (this.modifyOnSpawn) update.modifyOnSpawn = this.modifyOnSpawn;
      if (this.gridSize || formData.gridSize) update.gridSize = this.gridSize ?? formData.gridSize;
      if (this.attached) update.attached = this.attached;
      if (formData.preSpawnScript != null) update.preSpawnScript = formData.preSpawnScript;
      if (formData.postSpawnScript != null) update.postSpawnScript = formData.postSpawnScript;
      if (formData.spawnRandom != null) update.spawnRandom = formData.spawnRandom;
      if (formData.preserveLinks != null) update.preserveLinks = formData.preserveLinks;

      // If this is a single preset config, we override all tags
      // If not we merge
      if (this.presets.length === 1) {
        update.tags = formData.tags;
      } else if (formData.addTags.length || formData.removeTags.length) {
        let tags = preset.tags ?? [];
        if (formData.addTags.length) tags = Array.from(new Set(tags.concat(formData.addTags)));
        if (formData.removeTags.length) tags = tags.filter((t) => !formData.removeTags.includes(t));
        update.tags = tags;
      }

      // TODO uncomment once ready
      // await preset.update(update, true);
    }

    await Preset.processBatchUpdates();
  }
}

class PresetFieldSelect extends FormApplication {
  static name = 'PresetFieldSelect';

  constructor(data, callback) {
    super();
    this.presetData = data;
    this.isObject = !(data instanceof Array);
    this.callback = callback;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'preset-field-select', 'mass-edit-dark-window', 'mass-edit-window-fill'],
      template: `modules/${MODULE_ID}/templates/preset/presetFieldSelect.html`,
      width: 600,
      resizable: false,
    });
  }

  /* -------------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.item').on('click', this._onFieldClick);
  }

  _onFieldClick(e) {
    itemSelect(e, $(e.target).closest('.preset-field-list'));
  }

  /** @override */
  async getData(options = {}) {
    let data = foundry.utils.flattenObject(this.presetData);

    const singleData = !this.isObject && this.presetData.length === 1;

    let index;
    let fields = [];
    for (const [k, v] of Object.entries(data)) {
      if (!singleData) {
        const i = k.split('.')[0];
        if (!index) {
          fields.push({ header: true, index: 0 });
        } else if (i !== index) {
          fields.push({ header: true, index: i });
        }
        index = i;
      }

      let label = k;
      if (singleData) label = label.substring(label.indexOf('.') + 1);

      let value;
      const t = foundry.utils.getType(v);
      if (t === 'Object' || t === 'Array' || t === 'null') value = JSON.stringify(v);
      else value = v;

      fields.push({ name: k, label, value, selected: false });
    }

    return { fields };
  }
}

class PresetFieldModify extends PresetFieldSelect {
  static name = 'PresetFieldModify';

  constructor(data, callback, modifyOnSpawn) {
    super(data, callback);
    this.modifyOnSpawn = modifyOnSpawn ?? [];
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return localize('presets.select-modify');
  }

  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    data.button = {
      icon: '<i class="fas fa-check"></i>',
      text: localize('CONTROLS.CommonSelect', false),
    };
    for (const field of data.fields) {
      if (this.modifyOnSpawn.includes(field.name)) field.selected = true;
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const form = $(event.target).closest('form');
    const modifyOnSpawn = [];
    form.find('.item.selected').each(function () {
      let name = $(this).attr('name');
      modifyOnSpawn.push(name);
    });

    this.callback(modifyOnSpawn);
  }
}

class PresetFieldDelete extends PresetFieldSelect {
  static name = 'PresetFieldDelete';

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return localize('presets.select-delete');
  }

  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    data.button = {
      icon: '<i class="fas fa-trash"></i>',
      text: localize('common.delete'),
    };
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let data = foundry.utils.flattenObject(this.presetData);

    const form = $(event.target).closest('form');
    form.find('.item.selected').each(function () {
      const name = $(this).attr('name');
      delete data[name];
    });
    data = foundry.utils.expandObject(data);

    if (!this.isObject) {
      let reorganizedData = [];
      for (let i = 0; i < this.presetData.length; i++) {
        if (!data[i]) continue;
        reorganizedData.push(data[i]);
      }
      data = reorganizedData;
    }

    this.callback(data);
  }
}
