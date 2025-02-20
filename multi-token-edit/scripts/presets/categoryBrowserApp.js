import { MODULE_ID } from '../constants.js';
import { PresetBrowser } from './browser/browserApp.js';
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
  {
    retainState = false,
    name = 'Category Browser',
    alignment = 'left',
    searchBar = false,
    globalSearch = false,
    globalQuery = '',
    editEnabled = false,
    width,
    height,
  } = {}
) {
  // // If category browser is already open close it
  const app = Object.values(ui.windows).find((w) => w._browserId === name);
  if (app) {
    app.close(true);
    return;
  }

  new CategoryBrowserApplication(menu, {
    name,
    retainState,
    alignment,
    searchBar,
    globalSearch,
    globalQuery,
    editEnabled,
    width,
    height,
  }).render(true);
}

/**
 * Representation of a menu button
 */
class Category {
  menu = null; // CategoryList this category is part of
  submenu = null; // CategoryList to be displayed when this category is active

  constructor({ title, fa, img, query, disableQuery, menu }) {
    this.title = title; // Hover text
    this.fa = fa; // Font Awesome icon
    this.img = img; // Image icon
    this.query = query; // Search query to be ran when active
    this.disableQuery = disableQuery; // Prevent query from being run when category is click (children will still inherit this query)
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

    // If the state of the window was set to be retained we retrieve it now
    // and run the necessary queries to get the results
    if (options.retainState && CategoryBrowserApplication.oldMenuStates[this._browserId]) {
      const { menus, categories, lastSearch, globalSearch } = CategoryBrowserApplication.oldMenuStates[this._browserId];
      this._menus = menus;
      this._categories = categories;
      this._lastSearch = lastSearch;
      this.options.globalSearch = globalSearch;
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
      scrollY: ['.item-list', '.category-list'],
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
      alignment: options.alignment,
      searchBar: options.searchBar,
      globalSearch: options.globalSearch,
      lastSearch: this._lastSearch,
      editEnabled: options.editEnabled,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.category').on('click', this._onClickCategory.bind(this));
    if (this.options.editEnabled) {
      html.find('.category').on('contextmenu', this._onRightClickCategory.bind(this));
    }
    html.find('.header-search input').on('input', this._onSearchInput.bind(this));
    html.find('.globalSearchToggle').on('click', this._onGlobalSearchToggle.bind(this));
    this._setHeaderButtonColors();
  }

  async _onSearchInput(event) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this._onSearch(event.target.value), 250);
  }

  async _onSearch(search) {
    this._lastSearch = search.length >= 3 ? search : null;
    if (this._lastSearch || !search) this._runQueryTree();
  }

  _onGlobalSearchToggle(event) {
    this.options.globalSearch = !this.options.globalSearch;

    if (this.options.globalSearch) $(event.currentTarget).addClass('active');
    else $(event.currentTarget).removeClass('active');

    this._runQueryTree();
  }

  /**
   * Hack to set the Preset header button colours
   */
  _setHeaderButtonColors() {
    const windowHeader = this.element.find('.window-header');

    const activeColor = 'darkorange';
    const inactiveColor = 'var(--color-text-light-highlight)';

    windowHeader
      .find('.mass-edit-category-browser-external')
      .css('color', PresetBrowser.CONFIG.externalCompendiums ? activeColor : inactiveColor);

    windowHeader
      .find('.mass-edit-category-browser-virtual')
      .css('color', PresetBrowser.CONFIG.virtualDirectory ? activeColor : inactiveColor);

    windowHeader
      .find('.mass-edit-category-browser-scale')
      .css('color', PresetBrowser.CONFIG.autoScale ? activeColor : inactiveColor);

    windowHeader
      .find('.mass-edit-category-browser-switch')
      .css('color', PresetBrowser.CONFIG.switchLayer ? activeColor : inactiveColor);
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
      const { title, fa, img, submenu, query, disableQuery } = category;
      const cat = new Category({ title, fa, img, menu: categoryList, query, disableQuery });
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

  _onRightClickCategory(event) {
    const category = this._categories.get($(event.currentTarget).data('id'));
    new EditCategory(category, this).render(true);
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
   * @param {String} search
   * @param {Boolean} global
   * @returns
   */
  async _runQueryTree() {
    const runTime = new Date().getTime();
    this._queryRunTime = runTime;
    this._presetResults = null;

    await this._renderContent(true);

    const queries = [];

    if (this._lastSearch && this.options.globalSearch) {
      queries.push(this._lastSearch);
    } else {
      let lastCategory;
      for (const menu of this._menus) {
        if (!menu.active) continue;
        const category = menu.categories.find((category) => category.active);
        if (category?.query?.trim()) {
          queries.push(category.query);
          lastCategory = category;
        }
      }
      if (lastCategory?.disableQuery) queries.pop();

      if (this._lastSearch && queries.length) queries.push(this._lastSearch);
    }

    let results;
    if (queries.length) {
      // Insert a global query that applies to all searches
      if (this.options.globalQuery) {
        queries.unshift(this.options.globalQuery);
      }

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
    return PresetAPI.getPresets({
      query,
      matchAny,
      virtualDirectory: PresetBrowser.CONFIG.virtualDirectory,
      externalCompendiums: PresetBrowser.CONFIG.externalCompendiums,
      full: false,
      presets,
    });
  }

  /** @override */
  setPosition(...args) {
    super.setPosition(...args);

    const { left, top, width, height } = this.position;
    CategoryBrowserApplication.previousPositions[this._browserId] = { left, top, width, height };
  }

  async close(options = {}) {
    if (this.options.retainState) {
      CategoryBrowserApplication.oldMenuStates[this._browserId] = {
        menus: this._menus,
        categories: this._categories,
        lastSearch: this._lastSearch,
        globalSearch: this.options.globalSearch,
      };
    }

    return super.close(options);
  }

  async _toggleSetting(setting, runQueryTree = false) {
    await PresetBrowser.setSetting(setting, !PresetBrowser.CONFIG[setting]);
    this._setHeaderButtonColors();
    if (runQueryTree) return this._runQueryTree();
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    if (game.user.isGM) {
      buttons.unshift({
        label: '',
        class: 'mass-edit-category-browser-virtual',
        icon: 'fas fa-file-search',
        onclick: () => this._toggleSetting('virtualDirectory', true),
      });

      buttons.unshift({
        label: '',
        class: 'mass-edit-category-browser-external',
        icon: 'fa-solid fa-books',
        onclick: () => this._toggleSetting('externalCompendiums', true),
      });

      buttons.unshift({
        label: '',
        class: 'mass-edit-category-browser-scale',
        icon: 'fa-solid fa-arrow-down-big-small',
        onclick: () => this._toggleSetting('autoScale'),
      });

      buttons.unshift({
        label: '',
        class: 'mass-edit-category-browser-switch',
        icon: 'fa-solid fa-arrows-cross',
        onclick: () => this._toggleSetting('switchLayer'),
      });

      if (this.options.editEnabled) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-category-browser-gen-macro',
          icon: 'fa-solid fa-dice-d20',
          onclick: this._generateMacro.bind(this),
        });
      }
    }

    return buttons;
  }

  _generateMacro() {
    const options = this.options;

    let macro = `
const options = {
  name: "${options.name}",
  alignment: "${options.alignment}",
  retainSate: ${options.retainState},
  searchBar: ${options.searchBar},
  globalSearch: ${options.globalSearch},
  globalQuery: ${options.globalQuery},
  editEnabled: ${options.editEnabled},
};

const menu = ${JSON.stringify(this._menuToJson(this._menus[0]), null, 2)};

MassEdit.openCategoryBrowser(menu, options);`;

    new Dialog({
      title: `Open Category Browser Macro`,
      content: `<textarea style="width:100%; height: 300px;">${macro}</textarea>`,
      buttons: {
        close: {
          label: 'Close',
        },
      },
    }).render(true);
  }

  _menuToJson(menu) {
    return menu.categories.map((c) => this._categoryToJson(c));
  }

  _categoryToJson(category) {
    const json = { title: category.title };
    if (category.fa) json.fa = category.fa;
    if (category.img) json.img = category.img;
    if (category.query) json.query = category.query;
    if (category.disableQuery) json.disableQuery = category.disableQuery;
    if (category.submenu) json.submenu = this._menuToJson(category.submenu);
    return json;
  }
}

class EditCategory extends FormApplication {
  constructor(category, browser) {
    super({}, {});
    this.category = category;
    this.browser = browser;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/categoryEdit.html`,
      width: 450,
      height: 'auto',
      resizable: false,
    });
  }

  get title() {
    return 'Edit Category';
  }

  async getData(options) {
    return { category: this.category };
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.moveUp', () => {
      const menu = this.category.menu;
      const index = menu.categories.indexOf(this.category);
      if (index > 0) {
        menu.categories.splice(index, 1);
        menu.categories.splice(index - 1, 0, this.category);
        this.browser.render(true);
      }
    });
    html.on('click', '.moveDown', () => {
      const menu = this.category.menu;
      const index = menu.categories.indexOf(this.category);
      if (index < menu.categories.length - 1) {
        menu.categories.splice(index, 1);
        menu.categories.splice(index + 1, 0, this.category);
        this.browser.render(true);
      }
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const action = event.submitter.value;

    formData.fa = formData.fa.replace('<i class="', '').replace('"></i>', '');

    if (action === 'save') {
      for (const [key, value] of Object.entries(formData)) {
        this.category[key] = value;
      }
      this.browser.render(true);
    } else if (action === 'saveNew') {
      const category = new Category({ menu: this.category.menu });
      for (const [key, value] of Object.entries(formData)) {
        category[key] = value;
      }

      category.menu.categories.push(category);
      this.browser._categories.set(category.id, category);
      this.browser.render(true);
    } else if (action === 'delete') {
      this._deleteCategory(this.category, this.browser);
      if (this.browser._menus.length === 0) this.browser.close(true);
      else this.browser.render(true);
    } else if (action === 'addSumbenu') {
      const categoryList = new CategoryList(this.category);
      this.browser._menus.push(categoryList);

      const cat = new Category({
        title: 'New Category',
        fa: 'fa-solid fa-circle-question',
        img: '',
        menu: categoryList,
        query: '',
      });
      categoryList.categories.push(cat);
      this.browser._categories.set(cat.id, cat);

      this.category.submenu = categoryList;

      this.browser.render(true);
    } else if (action === 'deleteSubmenu') {
      this.category.submenu.categories.forEach((c) => {
        this._deleteCategory(c, this.browser);
      });
      this.browser.render(true);
    }
  }

  _deleteCategory(category, browser) {
    category.menu.categories = category.menu.categories.filter((c) => c.id !== category.id);
    browser._categories.delete(category.id);

    if (this.category.menu.categories.length === 0) {
      browser._menus = browser._menus.filter((m) => m.id !== category.menu.id);
      category.menu.parentCategory.menu = null;
    }

    category.submenu?.categories.forEach((c) => {
      this._deleteCategory(c, browser);
    });
  }
}
