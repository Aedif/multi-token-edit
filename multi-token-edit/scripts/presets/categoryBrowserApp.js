import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';

/**
 * Constructs and opens a menu for browsing through Mass Edit presets
 * @param {object} menu    Application's menu structure
 * @param {object} options
 * @returns
 */
export async function openCategoryBrowser(
  menu,
  { retainState = false, name = 'Category Browser', menuTop = false } = {}
) {
  // // If category browser is already open close it
  const app = Object.values(ui.windows).find((w) => w._browserId === name);
  if (app) {
    app.close(true);
    return;
  }

  new CategoryBrowserApplication(menu, { name, retainState, menuTop }).render(true);
}

/**
 * Representation of a menu button
 */
class Category {
  menu = null; // CategoryList this category is part of
  submenu = null; // CategoryList to be displayed when this category is active

  constructor({ title, fa, img, query, menu }) {
    this.title = title; // Hover text
    this.fa = fa; // Font Awesome icon
    this.img = img; // Image icon
    this.query = query; // Search query to be ran when active
    this.menu = menu; // CategoryList this category is part of
    this.id = foundry.utils.randomID(); // Unique identifier
  }
}

/**
 * Representation of a single menu (column) within the app
 */
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

    // If the state of the window was set to be retained we retrieve it now
    // and run the necessary queries to get the results
    if (this._retainState && CategoryBrowserApplication.oldMenuStates[this._browserId]) {
      const { menus, categories, virtualDirectory } = CategoryBrowserApplication.oldMenuStates[this._browserId];
      this._menus = menus;
      this._categories = categories;
      this.virtualDirectory = virtualDirectory;
      this._runQueryTree();
    } else {
      // Otherwise we process the fed in JSON menu structure
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
    return {
      menus: this._menus.filter((menu) => menu.active),
      presets: this._presetResults,
      top: options.menuTop,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.category').on('click', this._onClickCategory.bind(this));
    this._setVirtualDirectoryColor();
  }

  /**
   * Hack to set the Virtual Directory header button colour
   */
  _setVirtualDirectoryColor() {
    // hack to color the virtual directory header button
    const headerButton = this.element.closest('.window-app').find('.mass-edit-category-browser-virtual');
    if (this.virtualDirectory) headerButton.css('color', 'darkorange');
    else headerButton.css('color', 'var(--color-text-light-highlight)');
  }

  /**
   * Process JSON menu structure into Category and CategoryList instances usable by the application
   * @param {object} submenu                An array of JSON objects representing a `Category`
   * @param {Category|null} parentCategory  A `Category` instance that is the parent of the provided submenu
   * @returns
   */
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

  /**
   * Handle category click event
   * @param {*} event
   */
  async _onClickCategory(event) {
    const category = this._categories.get($(event.currentTarget).data('id'));

    this._menus.forEach((menu) => (menu.active = false));
    if (category.active) this._setCategoryInactive(category);
    else this._setCategoryActive(category);

    this._presetResults = null;
    await this.render(true);
    this._runQueryTree();
  }

  /**
   * Set provided category as active, turning on/off relevant menus and categories
   * @param {Category} category
   */
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

  /**
   * Set provided category as inactive, turning off relevant menus and categories
   * @param {Category} category
   */
  _setCategoryInactive(category) {
    category.active = false;
    category.menu.active = true;

    let parentCategory = category.menu.parentCategory;
    while (parentCategory) {
      parentCategory.menu.active = true;
      parentCategory = parentCategory.menu.parentCategory;
    }
  }

  /**
   * Run queries for active categories and renders the results
   * @returns
   */
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

  /**
   * Render query results
   * @param {Boolean} loading if true a rotating spinner will be rendered instead of query results
   * @returns
   */
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

  /**
   * Run a search query and returns the results
   * @param {String} query                Query to be ran
   * @param {Boolean} matchAny            Should any tag match be returned?
   * @param {Array[Presets]|null} presets If provided search will be carried out on this preset array instead of all presets
   * @returns {Array[Presets]|null}       Query results
   */
  async _runQuery(query, matchAny = false, presets) {
    return PresetAPI.getPresets({ query, matchAny, virtualDirectory: this.virtualDirectory, full: false, presets });
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
