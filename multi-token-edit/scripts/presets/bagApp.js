import { MODULE_ID } from '../constants.js';
import { TagInput } from '../utils.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';
import { Preset } from './preset.js';

export async function openBag(uuid) {
  let journal = fromUuidSync(uuid);

  // Attempt a fallback to a an ID tag search
  // This is to support the conversion of the old bag system to the new preset based bag system
  // 11/12/24
  if (!journal) {
    journal = await PresetAPI.getPreset({ tags: [`id-${TagInput.simplifyString(uuid)}`] });

    if (!journal) {
      ui.notifications.warn(`Bag not found: ` + uuid);
      return;
    }
    uuid = journal.uuid;
  }

  // If bag is already open toggle it off
  const app = Object.values(ui.windows).find((w) => w.presetBag && w.preset.uuid === uuid);
  if (app) {
    app.close(true);
    return;
  }

  const preset = await PresetAPI.getPreset({ uuid });

  new BagApplication(preset).render(true);
}

class BagApplication extends PresetContainer {
  // Track positions of previously opened bags
  static previousPositions = {};

  constructor(preset, options = {}) {
    let positionOpts = BagApplication.previousPositions[preset.uuid] ?? {};

    super({}, { ...options, forceAllowDelete: true, ...positionOpts });
    this.preset = preset;
    this.presetBag = true;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-bag'],
      template: `modules/${MODULE_ID}/templates/preset/bag/bag.html`,
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
    return 'mass-edit-bag-' + this.preset.uuid;
  }

  get title() {
    return `Bag: ` + this.preset.name;
  }

  async getData(options) {
    await super.getData(options); // TODO: remove once better caching has been implemented in PresetContainer

    const bag = this.preset.data[0];

    let uuids = bag.uuids.map((i) => i.uuid);
    const containedPresets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids, full: false }) : null;
    const searchedPresets = bag.completedSearch?.length
      ? await PresetAPI.getPresets({ uuid: bag.completedSearch, full: false })
      : null;

    return {
      containedPresets,
      searchedPresets,
      displayLabels: containedPresets && searchedPresets,
      searchBar: bag.searchBar,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.setAppearance();
    html.find('.header-search input').on('input', this._onSearchInput.bind(this));
  }

  _onSearchInput(event) {
    let search = event.target.value.trim().toLowerCase();

    if (search) {
      $(event.target).addClass('active');
      this.element.find('.item').each(function () {
        const item = $(this);
        if (!item.attr('name').toLowerCase().includes(search)) item.hide();
      });
    } else {
      $(event.target).removeClass('active');
      this.element.find('.item').show();
    }
  }

  setAppearance(appearance) {
    appearance = appearance ?? this.preset.data[0].appearance;
    if (!appearance) return;

    const html = $(this.element);

    const hColor = Color.fromString(appearance.header.color);
    html.find('header, .static-label').css('background-color', hColor.toRGBA(appearance.header.alpha));

    const bColor = Color.fromString(appearance.background.color);
    html
      .find('.window-content')
      .attr('style', `background-color: ${bColor.toRGBA(appearance.background.alpha)} !important;`);
  }

  /**
   * Process dropped preset uuids
   * @param {Array[String]} uuids
   * @returns
   */
  async _dropUuids(droppedUuids) {
    if (!droppedUuids?.length || !game.user.isGM) return;

    const bag = this.preset.data[0];

    let sort = bag.uuids.length
      ? Math.max.apply(
          null,
          bag.uuids.map((p) => p.sort)
        )
      : 0;

    const bagUuids = bag.uuids.map((p) => p.uuid);
    for (const uuid of droppedUuids) {
      if (!bagUuids.includes(uuid)) {
        sort++;
        bag.uuids.push({ sort, uuid });
      }
    }

    this.preset.update({ data: { uuids: bag.uuids } });
    this.render(true);
  }

  async _onDeleteSelectedPresets(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
      full: false,
    });

    if (selected.length) {
      const uuids = this.preset.data[0].uuids.filter((i) => !selected.find((s) => s.uuid === i.uuid));
      this.preset.update({ data: { uuids } });

      this.render(true);
    }
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    if (game.user.isGM) {
      if (Preset.isEditable(this.preset.uuid)) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-bag-configure',
          icon: 'fa-solid fa-gear',
          onclick: () => {
            new BagConfig(this.preset, this).render(true);
          },
        });
      }

      buttons.unshift({
        label: '',
        class: 'mass-edit-bag-macro',
        icon: 'fas fa-terminal',
        onclick: this._onCreateMacro.bind(this),
      });
    }

    if (game.user.isGM && Preset.isEditable(this.preset.uuid)) {
      buttons.unshift({
        label: '',
        class: 'mass-edit-bag-refresh',
        icon: 'fa-solid fa-arrows-rotate',
        onclick: this._onRefreshSearch.bind(this),
      });
    }

    return buttons;
  }

  async _onCreateMacro() {
    const response = await new Promise((resolve) => {
      Dialog.confirm({
        title: 'Create Bag Macro',
        content: `<p>Do you wish to create a quick access macro for preset bag: [<b>${this.preset.name}</b>] ?</p>`,
        yes: () => resolve(true),
        no: () => resolve(false),
        defaultYes: false,
      });
    });

    if (!response) return;

    const macro = await Macro.create({
      name: 'Bag: ' + this.preset.name,
      type: 'script',
      scope: 'global',
      command: `// Open Mass Edit preset bag\nMassEdit.openBag('${this.preset.uuid}');`,
      img: this.preset.img,
    });
    macro.sheet.render(true);
  }

  async _onRefreshSearch(notify = true) {
    if (this.refreshing) {
      ui.notification.warn('Refresh is in progress. Please wait.');
      return;
    }

    this.refreshing = true;

    const bag = this.preset.data[0];
    const searches = bag.searches;
    const virtualDirectory = bag.virtualDirectory;

    let uuids = new Set();

    for (const search of searches.inclusive) {
      (
        await PresetAPI.getPresets({
          query: search.terms,
          matchAny: !search.matchAll,
          virtualDirectory,
          full: false,
        })
      ).forEach((p) => uuids.add(p.uuid));
    }

    if (uuids.size) {
      for (const search of searches.exclusive) {
        if (tags) tags = { tags, matchAny: !search.matchAll };
        (
          await PresetAPI.getPresets({
            query: search.terms,
            matchAny: !search.matchAll,
            virtualDirectory,
            full: false,
          })
        ).forEach((p) => uuids.delete(p.uuid));
      }
    }

    await this.preset.update({
      data: {
        completedSearch: uuids.size ? Array.from(uuids) : null,
      },
    });
    if (notify) ui.notifications.info('Bag contents have been refreshed: ' + this.preset.name);
    this.render(true);
    this.refreshing = false;
  }

  /** @override */
  setPosition(...args) {
    super.setPosition(...args);

    const { left, top, width, height } = this.position;
    BagApplication.previousPositions[this.preset.uuid] = { left, top, width, height };
  }
}

class BagConfig extends FormApplication {
  constructor(preset, parentForm) {
    super({}, {});
    this.preset = preset.clone();
    this._originalPreset = preset;
    this.parentForm = parentForm;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-bag-config'],
      template: `modules/${MODULE_ID}/templates/preset/bag/config.html`,
      width: 370,
      height: 'auto',
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.content', initial: 'search' }],
      resizable: false,
      minimizable: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.addSearchTerm', this._onAddSearchTerm.bind(this));
    html.on('click', '.removeSearchTerm', this._onRemoveSearchTerm.bind(this));

    //html.on('input', 'color-picker', this._onAppearanceFieldChange.bind(this));
    html.on('change', 'color-picker, [type="range"]', this._onAppearanceFieldChange.bind(this));
    html.on('input', 'input', () => this._saveState());
  }

  _saveState(formData, clearEmptySearch = false) {
    if (!formData) formData = this._getSubmitData();

    formData = foundry.utils.expandObject(formData);

    ['inclusive', 'exclusive'].forEach((type) => {
      if (formData.searches?.[type]) {
        const searches = [];
        let i = 0;
        let search = formData.searches[type][i];
        while (search != undefined) {
          if (!clearEmptySearch || search.terms.trim() !== '') searches.push(search);
          search = formData.searches[type][++i];
        }
        this.preset.data[0].searches[type] = searches;
      }
    });

    this.preset.data[0].virtualDirectory = formData.virtualDirectory;
    this.preset.data[0].appearance = formData.appearance;
    this.preset.data[0].searchBar = formData.searchBar;
  }

  async _onAppearanceFieldChange() {
    const appearance = foundry.utils.expandObject(this._getSubmitData()).appearance;
    this.parentForm?.setAppearance(appearance);
  }

  async _onAddSearchTerm(event) {
    const type = $(event.currentTarget).data('type');

    this.preset.data[0].searches[type].push({
      terms: '',
      matchAll: true,
    });

    this.render(true);
  }

  async _onRemoveSearchTerm(event) {
    const type = $(event.currentTarget).data('type');
    const index = $(event.currentTarget).data('index');

    this.preset.data[0].searches[type].splice(index, 1);
    this.render(true);
  }

  /* override */
  _getFolderContextOptions() {
    return [];
  }

  async getData(options) {
    const data = this.preset.data[0];
    if (!data.appearance) {
      data.appearance = {
        header: {
          color: '#000000',
          alpha: 1.0,
        },
        background: {
          color: '#323232',
          alpha: 0.8,
        },
      };
    }
    return data;
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    this._saveState(formData, true);
    this._originalPreset.update({ data: this.preset.data });
    this.parentForm?._onRefreshSearch(false);
  }

  get title() {
    return 'Configure Bag: ' + this.preset.name;
  }

  get id() {
    return `mass-edit-bag-config-` + this.preset.uuid;
  }
}
