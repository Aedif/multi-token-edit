import { MODULE_ID } from '../constants.js';
import { MassEditPresets } from './forms.js';

export class TagSelector extends FormApplication {
  constructor(presetsApp) {
    const defaultOptions = TagSelector.defaultOptions;
    super({}, { left: presetsApp.position.left - defaultOptions.width - 5, top: presetsApp.position.top });
    this.presetsApp = presetsApp;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tag-selector',
      classes: ['mass-edit-dark-window', 'mass-edit-window-fill'],
      template: `modules/${MODULE_ID}/templates/preset/tagSelector.html`,
      resizable: true,
      minimizable: true,
      width: 200,
      height: 500,
    });
  }

  get title() {
    return 'Tag Selector';
  }

  async close(options = {}) {
    this.presetsApp._tagSelector = null;
    return super.close(options);
  }

  async getData(options = {}) {
    const tagMap = this.getTagsOfRendered();
    const searchedTagsArr = this.getSearchedTags();

    let tags = [];
    let activeTags = [];
    tagMap.forEach((count, tag) => {
      const t = { name: tag, count };
      if (searchedTagsArr.includes(tag)) activeTags.push(t);
      else tags.push(t);
    });

    tags = tags.sort((t1, t2) => t2.count - t1.count);
    activeTags = activeTags.sort((t1, t2) => t2.count - t1.count);

    return { tags, activeTags };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on('click', '.tag', this._onClickTag.bind(this));
  }

  /**
   * Collate all tags of render-able presets
   */
  getTagsOfRendered() {
    const tags = new Map();

    this.presetsApp.tree.folders.forEach((f) => this._getFolderTags(f, tags));
    this.presetsApp.tree.extFolders.forEach((f) => this._getFolderTags(f, tags));
    this.presetsApp.tree.presets.forEach((p) => this._getPresetTags(p, tags));

    return tags;
  }

  getSearchedTags() {
    const search = MassEditPresets.lastSearch ?? '';
    const tags = search
      .split(' ')
      .filter((k) => k.startsWith('#'))
      .map((k) => k.substring(1));
    return tags;
  }

  _getFolderTags(folder, tags) {
    if (!folder.render) return;

    for (const f of folder.children) {
      this._getFolderTags(f, tags);
    }

    for (const p of folder.presets) {
      this._getPresetTags(p, tags);
    }
  }

  _getPresetTags(preset, tags) {
    if (preset.visible) {
      for (const tag of preset.tags) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
  }

  _onClickTag(event) {
    const tag = '#' + $(event.currentTarget).find('span').first().text();

    const searchInput = this.presetsApp.element.find('.header-search input');
    let search = searchInput.val();

    if ($(event.currentTarget).hasClass('active')) {
      search = search
        .split(' ')
        .filter((k) => k !== tag)
        .filter(Boolean)
        .join(' ');
    } else {
      if (!search.endsWith(' ') && search.length) search += ' ';
      search += tag;
    }

    searchInput.val(search).trigger('input');
  }
}
