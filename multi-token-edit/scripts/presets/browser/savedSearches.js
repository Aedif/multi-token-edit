import { MODULE_ID } from '../../constants.js';
import { PresetBrowser } from './browserApp.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Form to prompt the user for index merge behavior.
 */
export default class SavedSearches extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(browserApp) {
    const parentPosition = browserApp.position;
    super({
      position: {
        left: parentPosition.left + parentPosition.width + 5,
        top: parentPosition.top,
      },
    });
    this._browserApp = browserApp;
    this._saveSettings = {
      label: '',
      color: '',
    };
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'mass-edit-presets-saved-searches',
    tag: 'form',
    form: {
      handler: SavedSearches._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      title: 'Saved Searches',
      resizable: true,
      icon: 'fa-solid fa-bookmark',
    },
    position: {
      width: 325,
      height: 500,
    },
    actions: {
      save: SavedSearches._onSaveSearch,
      toggle: SavedSearches._onToggleSearch,
      remove: SavedSearches._onRemove,
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/saved-searches.hbs` },
  };

  /**
   * Called by preset browser in response to search input change
   * @param {string} query
   */
  updateQuery(query) {
    this.element.querySelector('.search').value = query;
  }

  /** @override */
  async _prepareContext(options) {
    const searches = foundry.utils.deepClone(PresetBrowser.CONFIG.savedSearches).map((search) => {
      return {
        ...search,
        textColor: this._getContrastColor(search.color),
      };
    });

    return { searches, search: { ...this._saveSettings, query: this._browserApp.lastSearch } };
  }

  _getContrastColor(bgColor) {
    if (!bgColor?.trim()) return 'white';

    const srgb = Color.fromString(bgColor).linear.rgb; // Linear RGB
    const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]; // Relative luminance
    return L > 0.179 ? 'black' : 'white'; // WCAG-recommended threshold
  }

  static async _onSaveSearch(event) {
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    const search = formData.object;

    ['color', 'label', 'query'].forEach((field) => (search[field] = search[field].trim()));
    if (!search.query) {
      ui.notifications.warn('Search field cannot be empty.');
      return;
    }

    if (!search.label) search.label = search.query;
    if (!search.color) search.color = '#000000';

    const savedSearches = PresetBrowser.CONFIG.savedSearches;

    if (savedSearches.find((s) => s.label === search.label)) {
      ui.notifications.warn('Search with this label/query already exists.');
      return;
    }

    // Copy other browser settings relevant to the search
    ['switchLayer', 'autoScale', 'externalCompendiums', 'virtualDirectory'].forEach((setting) => {
      search[setting] = PresetBrowser.CONFIG[setting];
    });
    search.documentName = this._browserApp.documentName;

    savedSearches.push(search);
    await PresetBrowser.setSetting('savedSearches', savedSearches);

    this._saveSettings = search;
    this.render(true);
  }

  static _onToggleSearch(event, element) {
    const search = PresetBrowser.CONFIG.savedSearches[Number(element.closest('.search').dataset.index)];
    this._browserApp.loadSavedSearch(search);
  }

  static async _onRemove(event, element) {
    const index = Number(element.closest('.search').dataset.index);
    const savedSearches = PresetBrowser.CONFIG.savedSearches;
    savedSearches.splice(index, 1);
    await PresetBrowser.setSetting('savedSearches', savedSearches);
    this.render(true);
  }

  /** @override */
  static _onSubmit(event, form, formData) {
    this._saveSettings = formData.object;
  }

  /** @override */
  _attachFrameListeners() {
    super._attachFrameListeners();
    const html = $(this.element);
    html.on('dragstart', '.search', (event) => {
      event.originalEvent.dataTransfer.clearData();
      event.originalEvent.dataTransfer.setData('text/plain', `${event.currentTarget.closest('.search').dataset.index}`);
    });
    html.on('drop', '.search', (event) => {
      const fromIndex = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
      if (!Number.isInteger(fromIndex)) return;
      this._onSort(fromIndex, Number(event.currentTarget.closest('.search').dataset.index));
    });
  }

  async _onSort(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const savedSearches = PresetBrowser.CONFIG.savedSearches;
    savedSearches.splice(toIndex, 0, savedSearches[fromIndex]);
    savedSearches.splice(fromIndex + (toIndex < fromIndex ? 1 : 0), 1);
    await PresetBrowser.setSetting('savedSearches', savedSearches);
    this.render(true);
  }

  async close(options = {}) {
    this._browserApp._savedSearches = null;
    return super.close(options);
  }
}
