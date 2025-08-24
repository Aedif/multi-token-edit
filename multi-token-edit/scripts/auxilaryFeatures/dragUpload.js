import { MODULE_ID } from '../constants.js';
import { PresetContainerV2 } from '../presets/containerAppV2.js';
import { uploadFiles } from './utils.js';

export function registerDragUploadHooks() {
  Hooks.on('dropCanvasData', async (canvas, point, event) => {
    if (
      !game.user.isGM ||
      !event.dataTransfer.files?.length ||
      !foundry.utils.isEmpty(foundry.applications.ux.TextEditor.implementation.getDragEventData(event))
    )
      return;
    const presets = await uploadFiles(event.dataTransfer.files, 'canvas');
    for (const preset of presets) {
      MassEdit.spawnPreset({ preset, x: point.x, y: point.y, pivot: MassEdit.PIVOTS.CENTER, layerSwitch: true });
    }
  });
}

export class DragUploadSettingsApp extends PresetContainerV2 {
  constructor() {
    super();
    this._settings = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'dragUpload'));
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-drag-upload-settings`,
    tag: 'form',
    form: {
      handler: DragUploadSettingsApp._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      title: `Drag Upload Settings`,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      performUpdate: DragUploadSettingsApp._onPerformUpdate,
      browse: DragUploadSettingsApp._onBrowse,
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dragUploadSettings.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.buttons = [
      { type: 'button', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save', action: 'performUpdate' },
    ];

    let uuids = ['Token', 'Tile', 'AmbientSound']
      .map((documentName) => this._settings.presets[documentName])
      .filter(Boolean);

    let presets = await MassEdit.getPresets({ uuid: uuids });
    if (!presets.length) presets = null;

    return Object.assign(context, { ...this._settings, presets });
  }

  /** @override */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    switch (partId) {
      case 'main':
        $(element).on('drop', '.preset-browser', this._onPresetDrop.bind(this));
        break;
    }
  }

  async _onPresetDrop(event) {
    const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
    if (dragData.type !== 'preset') return;

    (await MassEdit.getPresets({ uuid: dragData.uuids }))
      .filter((p) => ['Token', 'Tile', 'AmbientSound'].includes(p.documentName))
      .forEach((p) => {
        this._settings.presets[p.documentName] = p.uuid;
      });

    this.render(true);
  }

  /**
   * Process form data
   */
  static async _onSubmit(event, form, formData) {
    const settings = foundry.utils.expandObject(formData.object);
    foundry.utils.mergeObject(this._settings, settings);
  }

  static async _onPerformUpdate(event) {
    game.settings.set(MODULE_ID, 'dragUpload', this._settings);
    this.close();
  }

  static async _onBrowse(event) {
    const { source, bucket, target } = this._settings;

    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: 'folder',
      allowUpload: true,
      callback: (target, fp) => {
        this._settings.source = fp.activeSource;
        this._settings.target = target;
        this._settings.bucket = fp.source.bucket;
        this.render(true);
      },
    });
    fp.source.target = target;
    fp.source.bucket = bucket;
    fp.activeSource = source;
    fp.browse();
  }

  /** @override */
  async _onDeleteSelectedPresets(item) {
    const { selected } = await this._getSelectedPresets({
      editableOnly: false,
      load: false,
    });
    selected.forEach((p) => (this._settings.presets[p.documentName] = null));
    this.render(true);
  }
}
