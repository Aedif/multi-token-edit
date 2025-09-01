import { MODULE_ID } from '../../../constants.js';
import { PresetContainerV2 } from '../../containerAppV2.js';

// A simple app to display provided presets
export class PresetDialog extends PresetContainerV2 {
  static open({ presets, windowTitle }) {
    new PresetDialog({ presets, windowTitle }).render(true);
  }

  constructor(options = {}) {
    super({}, options);
    this.presets = options.presets;
    this.windowTitle = options.windowTitle ?? 'Preset Dialog';
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['mass-edit-window-fill'],
    form: {
      handler: undefined,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 500,
      height: 500,
    },
    actions: {},
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/dialog.hbs` },
  };

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.windowTitle;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, { presets: this.presets });
  }
}
