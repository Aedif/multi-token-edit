import { BrushMenu } from '../brush.js';
import { MODULE_ID } from '../constants.js';
import { localize } from '../utils.js';
import { PresetAPI } from './collection.js';
import { PresetContainerV2 } from './containerAppV2.js';
import { Preset } from './preset.js';

export async function openBag(uuid) {
  let journal = fromUuidSync(uuid);

  // Attempt a fallback to a an ID tag search
  // This is to support the conversion of the old bag system to the new preset based bag system
  // 11/12/24
  if (!journal) {
    journal = await PresetAPI.getPreset({ tags: [`id-${uuid.slugify({ strict: true })}`] });

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

  new BagApplication({ preset, id: 'mass-edit-bag-' + uuid }).render(true);
}

class BagApplication extends PresetContainerV2 {
  constructor(options = {}) {
    super({}, { ...options, forceAllowDelete: true });
    this.preset = options.preset;
    this.presetBag = true;
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['mass-edit-window-fill'],
    form: {
      handler: undefined,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form', 'mass-edit-bag'],
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 360,
      height: 360,
    },
    actions: {
      configureBag: BagApplication._onConfigureBag,
      createMacro: BagApplication._onCreateMacro,
      refreshSearch: BagApplication._onRefreshSearch,
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/bag/bag.hbs` },
  };

  /* -------------------------------------------- */

  // /** @override */
  // _initializeApplicationOptions(options) {
  //   options = super._initializeApplicationOptions(options);
  //   options.uniqueId = 'mass-edit-bag-' + options.preset.uuid;
  //   return options;
  // }

  /** @override */
  get title() {
    return `Bag: ` + this.preset.name;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const bag = this.preset.data[0];

    let uuids = bag.uuids.map((i) => i.uuid);
    const containedPresets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids, full: false }) : null;
    const searchedPresets = bag.completedSearch?.length
      ? await PresetAPI.getPresets({ uuid: bag.completedSearch, full: false })
      : null;

    return Object.assign(context, {
      containedPresets,
      searchedPresets,
      displayLabels: containedPresets && searchedPresets,
      searchBar: bag.searchBar,
    });
  }

  /** @override */
  _attachPartListeners(partId, element, options) {
    super._attachPartListeners(partId, element, options);
    switch (partId) {
      case 'main':
        $(element).find('.header-search input').on('input', this._onSearchInput.bind(this));
        this.setAppearance();
        break;
    }
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

    await this.preset.update({ data: { uuids: bag.uuids } });
    this.render(true);
  }

  /** @override */
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

  static _onConfigureBag() {
    new BagConfig(this.preset, this).render(true);
  }

  /** @override */
  _getHeaderControls() {
    const controls = super._getHeaderControls();

    if (game.user.isGM) {
      if (Preset.isEditable(this.preset.uuid)) {
        controls.unshift({
          label: 'Configure Bag',
          icon: 'fa-solid fa-gear',
          action: 'configureBag',
        });
      }

      controls.unshift({
        label: 'Create Macro',
        icon: 'fas fa-terminal',
        action: 'createMacro',
      });
    }

    if (game.user.isGM && Preset.isEditable(this.preset.uuid)) {
      controls.unshift({
        label: 'Refresh Bag',
        icon: 'fa-solid fa-arrows-rotate',
        action: 'refreshSearch',
      });
    }

    return controls;
  }

  static async _onCreateMacro() {
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

  static async _onRefreshSearch(notify = true) {
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
    await this.render(true);
    this.refreshing = false;
  }

  /** @override */
  async _onSpawnPreset(preset, options) {
    const flags = this.preset.data[0].flags;
    if (flags) {
      preset = preset.clone();

      preset.data.forEach((d) => {
        foundry.utils.mergeObject(d, { flags });
      });
      preset.attached?.forEach((d) => {
        foundry.utils.mergeObject(d.data, { flags });
      });
    }
    return super._onSpawnPreset(preset, options);
  }

  /** @override */
  async _onActivateBrush(item) {
    const flags = this.preset.data[0].flags;
    if (flags) {
      const [selected, _] = await this._getSelectedPresets({
        editableOnly: false,
      });

      selected.forEach((preset) => {
        preset.data.forEach((d) => {
          foundry.utils.mergeObject(d, { flags });
        });
        preset.attached?.forEach((d) => {
          foundry.utils.mergeObject(d.data, { flags });
        });
      });

      BrushMenu.addPresets(selected);
    } else return super._onActivateBrush(item);
  }
}

class BagConfig extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(preset, parentForm) {
    super({ preset });
    this.preset = preset.clone();
    this._originalPreset = preset;
    this.parentForm = parentForm;
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    form: {
      handler: BagConfig._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
      resizable: false,
      minimizable: true,
    },
    window: {
      contentClasses: ['standard-form', 'mass-edit-bag-config'],
    },
    position: {
      width: 370,
      height: 'auto',
    },
    actions: {
      addSearchTerm: BagConfig._onAddSearchTerm,
      removeSearchTerm: BagConfig._onRemoveSearchTerm,
    },
  };

  /** @override */
  static TABS = {
    main: {
      tabs: [
        { id: 'search', icon: 'fa-solid fa-magnifying-glass' },
        { id: 'appearance', icon: 'fa-solid fa-palette' },
        { id: 'misc', icon: 'fas fa-cogs' },
      ],
      initial: 'search',
      labelPrefix: 'MassEdit.presets.bag',
    },
  };

  /** @override */
  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    search: { template: `modules/${MODULE_ID}/templates/preset/bag/config-search.hbs` },
    appearance: { template: `modules/${MODULE_ID}/templates/preset/bag/config-appearance.hbs` },
    misc: { template: `modules/${MODULE_ID}/templates/preset/bag/config-misc.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  _saveState(formData, clearEmptySearch = false) {
    formData = foundry.utils.expandObject(formData.object);

    [('inclusive', 'exclusive')].forEach((type) => {
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

    if (formData.flags) this.preset.data[0].flags = formData.flags;

    this.preset.data[0].virtualDirectory = formData.virtualDirectory;
    this.preset.data[0].appearance = formData.appearance;
    this.preset.data[0].searchBar = formData.searchBar;

    this.parentForm?.setAppearance(formData.appearance);
  }

  static async _onAddSearchTerm(event, target) {
    const type = target.dataset.type;
    this.preset.data[0].searches[type].push({
      terms: '',
      matchAll: true,
    });
    this.render(true);
  }

  static async _onRemoveSearchTerm(event, target) {
    const type = target.dataset.type;
    const index = target.dataset.index;

    this.preset.data[0].searches[type].splice(index, 1);
    this.render(true);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

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

    context.buttons = [{ type: 'submit', icon: 'fas fa-check', label: localize('common.apply') }];

    return Object.assign(context, data);
  }

  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Process form data
   */
  static async _onSubmit(event, form, formData) {
    this._saveState(formData, true);
    this._originalPreset.update({ data: this.preset.data });

    if (event.type === 'submit') {
      if (this.parentForm) {
        BagApplication._onRefreshSearch.call(this.parentForm, false);
        this.parentForm.setAppearance();
      }
      this.close(true);
    }
  }

  /** @override */
  get title() {
    return 'Configure Bag: ' + this.preset.name;
  }

  /** @override */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.uniqueId = 'mass-edit-bag-config-' + options.preset.uuid;
    return options;
  }
}
