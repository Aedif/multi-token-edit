import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';
import { parseSearchString } from './utils.js';

export async function openCategoryBrowser(menu, { retainState = false, name = 'Category Browser' } = {}) {
  // // If category browser is already open close it
  const app = Object.values(ui.windows).find((w) => w._browserId === name);
  if (app) {
    app.close(true);
    return;
  }

  new CategoryBrowserApplication(menu, { name, retainState }).render(true);
}

class Category {
  menu = null; // CategoryList this category is part of
  submenu = null; // CategoryList that belongs to this category

  constructor({ title, fa, img, query, menu }) {
    this.title = title;
    this.fa = fa;
    this.img = img;
    this.query = query;
    this.menu = menu;
    this.id = foundry.utils.randomID();
  }
}

class CategoryList {
  parentCategory = null; // Category
  categories = [];

  constructor(parentCategory) {
    this.parentCategory = parentCategory;
    this.id = foundry.utils.randomID();
    this.active = false;
  }

  set active(val) {
    this._active = val;
  }

  get active() {
    return this._active || this._topMenu;
  }
}

class CategoryBrowserApplication extends PresetContainer {
  static oldMenuStates = {};

  _menus = [];
  _categories = new Map();

  // Track positions of previously opened apps
  static previousPositions = {};

  constructor(menu, options = {}) {
    const id = options.name ?? foundry.utils.randomID();
    let positionOpts = CategoryBrowserApplication.previousPositions[id] ?? {};
    super({}, { ...options, disableDelete: true, ...positionOpts });
    this._browserId = id;
    this._retainState = options.retainState;
    this.virtualDirectory = Boolean(options.virtualDirectory);

    if (this._retainState && CategoryBrowserApplication.oldMenuStates[this._browserId]) {
      const { menus, categories, virtualDirectory } = CategoryBrowserApplication.oldMenuStates[this._browserId];
      this._menus = menus;
      this._categories = categories;
      this.virtualDirectory = virtualDirectory;
      this._runQueryTree();
    } else {
      this._processMenu(menu)._topMenu = true;
    }
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-category-browser'],
      template: `modules/${MODULE_ID}/templates/preset/categoryBrowser.html`,
      width: 450,
      height: 450,
      resizable: true,
      minimizable: true,
      scrollY: ['.item-list'],
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return 'mass-edit-category-browser-' + this._browserId;
  }

  get title() {
    return this.options.name ?? 'Category Browser';
  }

  async getData(options) {
    await super.getData(options); // TODO: remove once better caching has been implemented in PresetContainer
    return { menus: this._menus.filter((menu) => menu.active), presets: this._presetResults };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.category').on('click', this._onClickCategory.bind(this));
    this._setVirtualDirectoryColor();
  }

  _setVirtualDirectoryColor() {
    // hack to color the virtual directory header button
    const headerButton = this.element.closest('.window-app').find('.mass-edit-category-browser-virtual');
    if (this.virtualDirectory) headerButton.css('color', 'darkorange');
    else headerButton.css('color', 'var(--color-text-light-highlight)');
  }

  _processMenu(submenu, parentCategory = null) {
    const categoryList = new CategoryList(parentCategory);
    this._menus.push(categoryList);

    submenu.forEach((category) => {
      const { title, fa, img, submenu, query } = category;
      const cat = new Category({ title, fa, img, menu: categoryList, query });
      if (submenu?.length) cat.submenu = this._processMenu(submenu, cat);
      categoryList.categories.push(cat);
      this._categories.set(cat.id, cat);
    });

    return categoryList;
  }

  async _onClickCategory(event) {
    const category = this._categories.get($(event.currentTarget).data('id'));

    this._menus.forEach((menu) => (menu.active = false));
    if (category.active) this._setCategoryInactive(category);
    else this._setCategoryActive(category);

    this._presetResults = null;
    await this.render(true);
    this._runQueryTree();
  }

  _setCategoryActive(category) {
    category.menu.active = true;
    category.menu.categories.forEach((cat) => (cat.active = false));
    category.active = true;

    let parentCategory = category.menu.parentCategory;
    while (parentCategory) {
      parentCategory.menu.active = true;
      parentCategory = parentCategory.menu.parentCategory;
    }

    let submenu = category.submenu;
    while (submenu) {
      submenu.active = true;
      submenu = submenu.categories.find((category) => category.active)?.submenu;
    }
  }

  _setCategoryInactive(category) {
    category.active = false;
    category.menu.active = true;

    let parentCategory = category.menu.parentCategory;
    while (parentCategory) {
      parentCategory.menu.active = true;
      parentCategory = parentCategory.menu.parentCategory;
    }
  }

  async _runQueryTree() {
    const runTime = new Date().getTime();
    this._queryRunTime = runTime;
    this._presetResults = null;

    await this._renderContent(true);

    const queries = [];
    for (const menu of this._menus) {
      if (!menu.active) continue;
      const category = menu.categories.find((category) => category.active);
      if (category?.query?.trim()) queries.push(category.query);
    }

    let results;
    if (queries.length) {
      for (const query of queries) {
        if (this._queryRunTime !== runTime) return;
        results = await this._runQuery(query, false, results);
      }
    }

    if (this._queryRunTime !== runTime) return;
    this._presetResults = results;

    return this._renderContent();
  }

  async _renderContent(loading = false) {
    if (loading) {
      this.element.find('.item-list').html(
        `<div style="width: 100%; height: 100%; text-align: center; font-size: xxx-large;">
            <i class="fa-duotone fa-solid fa-spinner fa-spin-pulse" style="position: relative; top: 30%;"></i>
           </div>`
      );
    } else {
      return super._renderContent({ presets: this._presetResults });
    }
  }

  async _runQuery(query, matchAny = false, presets) {
    let { terms, tags } = parseSearchString(query);
    if (!terms.length) terms = undefined;
    if (!tags.length) tags = undefined;
    if (terms || tags) {
      if (tags) tags = { tags, matchAny };
      return PresetAPI.getPresets({ terms, tags, virtualDirectory: this.virtualDirectory, full: false, presets });
    } else {
      return null;
    }
  }

  /** @override */
  setPosition(...args) {
    super.setPosition(...args);

    const { left, top, width, height } = this.position;
    CategoryBrowserApplication.previousPositions[this._browserId] = { left, top, width, height };
  }

  async close(options = {}) {
    if (this._retainState) {
      CategoryBrowserApplication.oldMenuStates[this._browserId] = {
        menus: this._menus,
        categories: this._categories,
        virtualDirectory: this.virtualDirectory,
      };
    }

    return super.close(options);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-category-browser-virtual',
      icon: 'fas fa-file-search',
      onclick: async () => {
        this.virtualDirectory = !this.virtualDirectory;
        this._setVirtualDirectoryColor();
        this._runQueryTree();
      },
    });

    return buttons;
  }
}
