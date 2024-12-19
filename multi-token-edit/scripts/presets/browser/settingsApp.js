import { MODULE_ID, UI_DOCS } from '../../constants.js';
import { DOC_ICONS } from '../preset.js';

export default class PresetBrowserSettings extends FormApplication {
  constructor(browser) {
    super({}, {});
    this.browser = browser;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-browser-settings',
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/browserSettings.html`,
      resizable: false,
      minimizable: false,
      title: 'Settings',
      width: 400,
      height: 'auto',
    });
  }

  async getData(options) {
    const data = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'presetBrowser'));

    data.dropdownDocuments = UI_DOCS.map((name) => {
      return { name, active: data.dropdownDocuments.includes(name), icon: DOC_ICONS[name] };
    });

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.document-select').on('click', (event) => {
      $(event.target).closest('.document-select').toggleClass('active');
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const dropdownDocuments = [];
    $(this.form)
      .find('.document-select.active')
      .each(function () {
        dropdownDocuments.push($(this).data('name'));
      });
    formData.dropdownDocuments = dropdownDocuments;

    const settings = foundry.utils.mergeObject(game.settings.get(MODULE_ID, 'presetBrowser'), formData);
    await game.settings.set(MODULE_ID, 'presetBrowser', settings);
    this.browser?.render(true);
  }
}
