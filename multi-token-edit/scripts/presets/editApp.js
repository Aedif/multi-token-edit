import { showMassEdit } from '../../applications/multiConfig.js';
import { MODULE_ID, SUPPORTED_PLACEABLES, SUPPORTED_SHEET_CONFIGS } from '../constants.js';
import { LinkerAPI } from '../linker/linker.js';
import { DragHoverOverlay, localFormat, localize } from '../utils.js';
import { itemSelect } from './containerApp.js';
import { DOC_ICONS, Preset, VirtualFilePreset } from './preset.js';
import { exportPresets, mergePresetDataToDefaultDoc, placeableToData } from './utils.js';

export class PresetConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static name = 'PresetConfig';

  /**
   * @param {Array[Preset]} presets
   */
  constructor(presets, options = {}) {
    super(options);
    this.presets = presets;
    this._data = presets.length === 1 ? foundry.utils.deepClone(this.presets[0].toJSON()) : {};
    this.callback = options.callback;
    this.isCreate = options.isCreate;
    if (options.attached) this._data.attached = options.attached;
  }

  static DEFAULT_OPTIONS = {
    id: 'mass-edit-preset-edit',
    tag: 'form',
    form: {
      handler: PresetConfig._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      controls: [
        {
          icon: 'fas fa-file-export',
          label: 'Export',
          action: 'export',
        },
      ],
    },
    position: {
      width: 410,
      height: 'auto',
    },
    actions: {
      performUpdate: PresetConfig._onPerformUpdate,
      editDocument: PresetConfig._onEditDocument,
      deleteFields: PresetConfig._onDeleteFields,
      assignDocument: PresetConfig._onAssignDocument,
      export: PresetConfig._onExport,
      fieldModify: PresetConfig._onFieldModify,
      attachSelected: PresetConfig._onAttachSelected,
      attachedRemove: PresetConfig._onAttachedRemove,
      copyUuid: { handler: PresetConfig._onCopyUuid, buttons: [0, 2] },
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
    overlay: { template: `modules/${MODULE_ID}/templates/drag-hover-overlay.hbs` },
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
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    switch (partId) {
      case 'overlay':
        DragHoverOverlay.attachListeners(element, {
          condition: () => {
            if (this.presets.length !== 1) return false;
            if (canvas.activeLayer?.preview?.children.some((c) => c._original?.mouseInteractionManager?.isDragging)) {
              PresetConfig.objectHover = true;
              return true;
            } else {
              PresetConfig.objectHover = false;
              return false;
            }
          },
          hoverOutCallback: () => (PresetConfig.objectHover = false),
        });
        break;
    }
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.virtual = this.presets[0] instanceof VirtualFilePreset;
    context.multiEdit = this.presets.length !== 1;
    context.preset = this._data;

    // Hide spawning tab for virtual and non-placeable presets
    if (context.virtual || !SUPPORTED_PLACEABLES.includes(this.presets[0].documentName)) {
      delete context.tabs.spawning;
      options.parts = options.parts.filter((p) => p !== 'spawning');
    }

    // Hide main tab for virtual presets
    if (context.virtual) {
      delete context.tabs.main;
      options.parts = options.parts.filter((p) => p !== 'main');
    }

    context.buttons = [
      { type: 'button', icon: 'fas fa-check', label: localize('common.apply'), action: 'performUpdate' },
    ];

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];

    switch (partId) {
      case 'main':
        context.fieldDeleteEnabled = this.presets.length === 1;
        context.minlength = this.presets.length > 1 ? 0 : 1;

        // Check if all presets are for the same document type and thus can be edited using a Mass Edit form
        const documentName = this.presets[0].documentName;
        if (
          documentName !== 'Actor' &&
          SUPPORTED_SHEET_CONFIGS.includes(documentName) &&
          this.presets.every((p) => p.documentName === documentName)
        ) {
          context.dataEditEnabled = true;
          context.documentName = documentName;
          context.assignEnabled = SUPPORTED_PLACEABLES.includes(documentName);
        }
        break;
      case 'spawning':
        let attached = this._data.attached;
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
      case 'tags':
        if (context.virtual) context.tab.active = true;
        break;
    }

    return context;
  }

  /**
   * Process form data
   */
  static async _onSubmit(event, form, formData) {
    const data = formData.object;

    data.name = data.name?.trim();
    data.img = data.img?.trim() || null;
    data.preSpawnScript = data.preSpawnScript?.trim();
    data.postSpawnScript = data.postSpawnScript?.trim();
    data.tags = data.tags ?? [];
    data.addTags = data.addTags ?? [];
    data.removeTags = data.removeTags ?? [];

    foundry.utils.mergeObject(this._data, data);
  }

  /**
   * Called by main submit button to execute updating of presets, callbacks, and closing of the window.
   */
  static async _onPerformUpdate() {
    await this.submit();
    await this._updatePresets(this._data);
    this.callback?.(this.presets);
    this.close(true);
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

      [
        'data',
        'randomize',
        'addSubtract',
        'gridSize',
        'modifyOnSpawn',
        'preSpawnScript',
        'postSpawnScript',
        'spawnRandom',
        'attached',
        'preserveLinks',
      ].forEach((field) => {
        if (formData[field] != null) update[field] = formData[field];
      });

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

      await preset.update(update, true);
    }

    await Preset.processBatchUpdates();
  }

  static _onExport() {
    let fileName;
    if (this.presets.length === 1) {
      fileName = this.presets[0].name.replace(' ', '_').replace(/\W/g, '');
    }
    exportPresets(this.presets, fileName);
  }

  static async _onEditDocument() {
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
        this._data.addSubtract = {};
        this._data.randomize = {};
        for (const k of Object.keys(obj.data)) {
          if (k in obj.randomize) this._data.randomize[k] = obj.randomize[k];
          if (k in obj.addSubtract) this._data.addSubtract[k] = obj.addSubtract[k];
        }

        this._data.data = obj.data;
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

  static async _onDeleteFields() {
    new PresetFieldDelete(this._data.data, (data) => {
      this._data.data = data;
    }).render(true);
  }

  static async _onAssignDocument() {
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
        this._data.attached = Array.from(linked).map((l) => {
          return { documentName: l.documentName, data: placeableToData(l) };
        });
      }
    }

    const data = controlled.map((p) => placeableToData(p));
    this._data.data = data;
    ui.notifications.info(
      localFormat('presets.assign', {
        count: data.length,
        document: this.presets[0].documentName,
      })
    );
    this._data.gridSize = canvas.grid.size;
    this._data.modifyOnSpawn = [];
    this.render(true);
  }

  /**
   * Handle selection of data fields which are to be prompted for manual modification upon spawning the preset
   */
  static _onFieldModify() {
    new PresetFieldModify(
      this._data.data,
      (modifyOnSpawn) => {
        this._data.modifyOnSpawn = modifyOnSpawn;
      },
      this._data.modifyOnSpawn
    ).render(true);
  }

  /**
   * Handle attachment of a placeable selected on the canvas.
   */
  static _onAttachSelected() {
    const controlled = canvas.activeLayer.controlled;
    if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
      this.dropPlaceable(controlled);
    }
  }

  /**
   * Handle removal of an attached placeable
   * @param {PointerEvent} event  The triggering event.
   * @param {HTMLElement} target  The action target.
   */
  static async _onAttachedRemove(event, target) {
    const index = Number(target.dataset.index);
    this._data.attached.splice(index, 1);
    await this.render(true);
  }

  /** @override */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if (!this.hasFrame) return frame;

    // Insert Copy UUID header button
    const copyLabel = game.i18n.localize('SHEETS.CopyUuid');
    const copyId = `
      <button type="button" class="header-control fa-solid fa-passport icon" data-action="copyUuid"
              data-tooltip="${copyLabel}" aria-label="${copyLabel}"></button>
    `;
    this.window.close.insertAdjacentHTML('beforebegin', copyId);

    return frame;
  }

  static _onCopyUuid(event) {
    event.preventDefault(); // Don't open context menu
    event.stopPropagation(); // Don't trigger other events
    if (event.detail > 1) return; // Ignore repeated clicks

    const ids = this.presets.map((p) => (event.button === 2 ? p.id : p.uuid)).join(', ');
    const type = event.button === 2 ? 'id' : 'uuid';
    const label = localize('common.preset');

    game.clipboard.copyPlainText(ids);
    ui.notifications.info('DOCUMENT.IdCopiedClipboard', { format: { label, type, id: ids } });
  }

  /**
   * Create a preset from placeables dragged and dropped ont he form
   * @param {Array[Placeable]} placeables
   */
  async dropPlaceable(placeables) {
    if (!this._data.attached) this._data.attached = [];

    placeables.forEach((p) =>
      this._data.attached.push({
        documentName: p.document.documentName,
        data: placeableToData(p),
      })
    );

    await this.render(true);
  }
}

class PresetFieldSelect extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(data, callback) {
    super();
    this.presetData = data;
    this.isObject = !(data instanceof Array);
    this.callback = callback;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['preset-field-select', 'mass-edit-window-fill'],
    tag: 'form',
    actions: {
      fieldSelect: PresetFieldSelect._onFieldSelect,
    },
    position: {
      width: 600,
    },
    window: {
      contentClasses: ['standard-form'],
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/presetFieldSelect.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

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

    context.fields = fields;

    return context;
  }

  static _onFieldSelect(event) {
    itemSelect(event, $(event.target).closest('.preset-field-list'));
  }
}

class PresetFieldModify extends PresetFieldSelect {
  static name = 'PresetFieldModify';

  constructor(data, callback, modifyOnSpawn) {
    super(data, callback);
    this.modifyOnSpawn = modifyOnSpawn ?? [];
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'preset-field-modify',
    form: {
      handler: PresetFieldModify._onSubmit,
      closeOnSubmit: true,
    },
  };

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return localize('presets.select-modify');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.buttons = [
      {
        type: 'submit',
        icon: 'fas fa-check',
        label: 'CONTROLS.CommonSelect',
      },
    ];

    for (const field of context.fields) {
      if (this.modifyOnSpawn.includes(field.name)) field.selected = true;
    }

    return context;
  }

  /* -------------------------------------------- */

  static _onSubmit(event, form, formData) {
    const modifyOnSpawn = [];
    $(form)
      .find('.item.selected')
      .each(function () {
        let name = $(this).attr('name');
        modifyOnSpawn.push(name);
      });

    this.callback(modifyOnSpawn);
  }
}

class PresetFieldDelete extends PresetFieldSelect {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'preset-field-delete',
    form: {
      handler: PresetFieldDelete._onSubmit,
      closeOnSubmit: true,
    },
  };

  /** @override */
  get title() {
    return localize('presets.select-delete');
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.buttons = [
      {
        type: 'submit',
        icon: 'fas fa-trash',
        label: localize('common.delete'),
      },
    ];

    return context;
  }

  /* -------------------------------------------- */

  static _onSubmit(event, form, formData) {
    let data = foundry.utils.flattenObject(this.presetData);

    $(form)
      .find('.item.selected')
      .each(function () {
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
