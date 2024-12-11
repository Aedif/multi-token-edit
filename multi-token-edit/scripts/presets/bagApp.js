import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';
import { parseSearchString } from './utils.js';

export async function openBag(id) {
  const app = Object.values(ui.windows).find((w) => w._bagId === id);
  if (app) {
    app.close(true);
    return;
  }

  const bags = game.settings.get(MODULE_ID, 'bags');
  if (!bags[id]) {
    bags[id] = { presets: [], name: 'New Bag' };
    await game.settings.set(MODULE_ID, 'bags', bags);
  }

  new BagApplication(id).render(true);
}

export async function openBagPreset(preset) {
  const app = Object.values(ui.windows).find((w) => w.preset?.uuid === preset.uuid);
  if (app) {
    app.close(true);
    return;
  }

  new BagApplication(preset).render(true);
}

class BagApplication extends PresetContainer {
  constructor(preset, options = {}) {
    super({}, { ...options, forceAllowDelete: true });
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
    if (bag.completedSearch) {
      uuids = uuids.concat(bag.completedSearch);
    }

    const presets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids }) : [];

    return { presets };
  }

  /**
   * Process dropped preset uuids
   * @param {Array[String]} uuids
   * @returns
   */
  async _dropUuids(droppedUuids) {
    if (!droppedUuids?.length) return;

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
      buttons.unshift({
        label: 'Configure',
        class: 'mass-edit-bag-configure',
        icon: 'fa-solid fa-gear',
        onclick: () => {
          new BagConfig(this.preset, this).render(true);
        },
      });
    }

    buttons.unshift({
      label: 'Refresh',
      class: 'mass-edit-bag-refresh',
      icon: 'fa-solid fa-arrows-rotate',
      onclick: this._onRefreshSearch.bind(this),
    });

    return buttons;
  }

  async _onRefreshSearch() {
    const searches = this.preset.data[0].searches;

    let uuids = new Set();

    for (const search of searches.inclusive) {
      let { terms, tags } = parseSearchString(search.terms);
      if (!terms.length) terms = undefined;
      if (!tags.length) tags = undefined;
      if (terms || tags) {
        if (tags) tags = { tags, matchAny: !search.matchAll };
        (await PresetAPI.getPresets({ terms, tags })).forEach((p) => uuids.add(p.uuid));
      }
    }

    if (uuids.size) {
      for (const search of searches.exclusive) {
        let { terms, tags } = parseSearchString(search.terms);
        if (!terms.length) terms = undefined;
        if (!tags.length) tags = undefined;
        if (terms || tags) {
          if (tags) tags = { tags, matchAny: !search.matchAll };
          (await PresetAPI.getPresets({ terms, tags })).forEach((p) => uuids.delete(p.uuid));
        }
      }
    }

    await this.preset.update({
      data: {
        completedSearch: uuids.size ? Array.from(uuids) : null,
      },
    });
    this.render(true);
  }
}

export function openBagCreateDialog() {
  new BagCreate().render(true);
}

class BagCreate extends FormApplication {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/bagCreate.html`,
      width: 360,
      height: 'auto',
      resizable: false,
      minimizable: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.existingBags').on('change', (event) => {
      html.find('.bag-name').prop('disabled', Boolean(event.target.value));
    });
  }

  async getData(options) {
    const bagOptions = {};
    const bags = game.settings.get(MODULE_ID, 'bags');
    Object.keys(bags).forEach((id) => {
      bagOptions[id] = bags[id].name ?? id;
    });

    return { bagOptions };
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    let command, name;

    if (formData.existingBagId) {
      command = `MassEdit.openBag("${formData.existingBagId}")`;
      name = game.settings.get(MODULE_ID, 'bags')[formData.existingBagId].name ?? formData.existingBagId;
    } else if (formData.bagName) {
      const id = foundry.utils.randomID();
      const bags = game.settings.get(MODULE_ID, 'bags');
      bags[id] = {
        presets: [],
        name: formData.bagName,
      };
      await game.settings.set(MODULE_ID, 'bags', bags);
      command = `MassEdit.openBag("${id}")`;
      name = formData.bagName;
    }

    if (command) {
      const macro = await Macro.create({
        name: 'Bag: ' + name,
        type: 'script',
        scope: 'global',
        command,
        img: `icons/containers/bags/pack-engraved-leather-tan.webp`,
      });
      macro.sheet.render(true);
    }
  }

  get title() {
    return 'Create a Preset Bag Macro';
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
      width: 360,
      height: 'auto',
      resizable: false,
      minimizable: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.addSearchTerm', this._onAddSearchTerm.bind(this));
    html.on('click', '.removeSearchTerm', this._onRemoveSearchTerm.bind(this));
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

  async getData(options) {
    const data = this.preset.data[0];
    return data;
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    console.log(foundry.utils.expandObject(formData));

    formData = foundry.utils.expandObject(formData);

    ['inclusive', 'exclusive'].forEach((type) => {
      if (formData.searches?.[type]) {
        const searches = [];
        let i = 0;
        let search = formData.searches[type][i];
        while (search != undefined) {
          if (search.terms.trim() !== '') searches.push(search);
          search = formData.searches[type][++i];
        }
        this.preset.data[0].searches[type] = searches;
      }
    });

    this._originalPreset.update({ data: this.preset.data });
    this.parentForm?.render(true);
  }

  get title() {
    return 'Configure Bag: ' + this.preset.name;
  }

  get id() {
    return `mass-edit-bag-config-` + this.preset.uuid;
  }
}
