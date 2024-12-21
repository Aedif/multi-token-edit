import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';
import { parseSearchString } from './utils.js';

export async function openCategoryBrowser(menu, id = foundry.utils.randomID()) {
  // // If category browser is already open close it
  const app = Object.values(ui.windows).find((w) => w._browserId === id);
  if (app) {
    app.close(true);
    return;
  }

  new CategoryBrowserApplication(menu, { id }).render(true);
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
  _menus = new Map();
  _categories = new Map();

  _processMenu(submenu, parentCategory = null) {
    const categoryList = new CategoryList(parentCategory);
    this._menus.set(categoryList.id, categoryList);

    submenu.forEach((category) => {
      const { title, fa, img, submenu, query } = category;
      const cat = new Category({ title, fa, img, menu: categoryList, query });
      if (submenu) cat.submenu = this._processMenu(submenu, cat);
      categoryList.categories.push(cat);
      this._categories.set(cat.id, cat);
    });

    return categoryList;
  }

  // Track positions of previously opened bags
  static previousPositions = {};

  constructor(menu, options = {}) {
    const id = options.id ?? foundry.utils.randomID();
    let positionOpts = CategoryBrowserApplication.previousPositions[id] ?? {};
    super({}, { ...options, forceAllowDelete: false, ...positionOpts });
    this._browserId = id;

    this._processMenu(menu)._topMenu = true;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-category-browser'],
      template: `modules/${MODULE_ID}/templates/preset/categoryBrowser.html`,
      width: 360,
      height: 360,
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
    return `Category Browser`;
  }

  async getData(options) {
    await super.getData(options); // TODO: remove once better caching has been implemented in PresetContainer
    return { menus: Array.from(this._menus.values()).filter((menu) => menu.active), presets: this._presetResults };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.category').on('click', this._onClickCategory.bind(this));
  }

  async _onClickCategory(event) {
    const category = this._categories.get($(event.currentTarget).data('id'));

    this._menus.values().forEach((menu) => (menu.active = false));
    if (!category.active) {
      await this._setCategoryActive(category);
      this.render(true);
    }
  }

  async _setCategoryActive(category) {
    category.menu.active = true;
    category.menu.categories.forEach((cat) => (cat.active = false));
    category.active = true;

    if (category.menu.parentCategory) {
      await this._setCategoryActive(category.menu.parentCategory);
    }

    if (category.submenu && !category.submenu.active) {
      category.submenu.active = true;
      await this._checkRunSubmenuQuery(category.submenu);
    } else if (category.query) {
      await this._runQuery(category.query);
    }
  }

  async _checkRunSubmenuQuery(submenu) {
    const activeCategory = submenu.categories.find((category) => category.active);
    if (activeCategory) {
      if (activeCategory.submenu) {
        activeCategory.submenu.active = true;
        return this._checkRunSubmenuQuery(activeCategory.submenu);
      } else if (activeCategory.query) {
        return this._runQuery(activeCategory.query);
      }
    }
  }

  async _runQuery(query, matchAny = false) {
    console.log('processing query', query, matchAny);
    let { terms, tags } = parseSearchString(query);
    if (!terms.length) terms = undefined;
    if (!tags.length) tags = undefined;
    if (terms || tags) {
      if (tags) tags = { tags, matchAny };
      this._presetResults = await PresetAPI.getPresets({ terms, tags, virtualDirectory: true, full: false });
    } else {
      this._presetResults = null;
    }
  }

  /** @override */
  setPosition(...args) {
    super.setPosition(...args);

    const { left, top, width, height } = this.position;
    CategoryBrowserApplication.previousPositions[this._browserId] = { left, top, width, height };
  }
}
