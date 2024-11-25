import { MODULE_ID } from '../constants.js';
import { TagInput } from '../utils.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';

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

class BagApplication extends PresetContainer {
  constructor(id, options = {}) {
    super({}, { ...options, forceAllowDelete: true });
    this._bagId = id;
    this.presetBag = true;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window', 'mass-edit-bag'],
      template: `modules/${MODULE_ID}/templates/preset/bag.html`,
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
    return 'mass-edit-bag-' + this._bagId;
  }

  get title() {
    return `Bag: ` + game.settings.get(MODULE_ID, 'bags')?.[this._bagId].name;
  }

  async getData(options) {
    await super.getData(options); // TODO: remove once better caching has been implemented in PresetContainer

    const bag = game.settings.get(MODULE_ID, 'bags')[this._bagId];

    const uuids = bag.presets?.sort((p1, p2) => p1.sort - p2.sort).map((p) => p.uuid) ?? [];
    let presets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids }) : [];

    if (bag.tags?.length) {
      let taggedPresets = await PresetAPI.getPresets({ tags: bag.tags });
      if (taggedPresets.length) presets = presets.concat(taggedPresets);
    }

    const data = { presets };
    if (bag.tags?.length) {
      data.tags = bag.tags;
    }

    return data;
  }

  /**
   * Process dropped preset uuids
   * @param {Array[String]} uuids
   * @returns
   */
  async _dropUuids(uuids) {
    if (!uuids?.length) return;

    const bags = game.settings.get(MODULE_ID, 'bags');
    const bag = bags?.[this._bagId] ?? {};

    if (!bag.presets) bag.presets = [];

    let sort = bag.presets.length
      ? Math.max.apply(
          null,
          bag.presets.map((p) => p.sort)
        )
      : 0;

    const pUuids = bag.presets.map((p) => p.uuid);
    for (const uuid of uuids) {
      if (!pUuids.includes(uuid)) {
        sort++;
        bag.presets.push({ sort, uuid });
      }
    }

    bags[this._bagId] = bag;
    await game.settings.set(MODULE_ID, 'bags', bags);
    this.render(true);
  }

  async _onDeleteSelectedPresets(item) {
    const [selected, items] = await this._getSelectedPresets({
      editableOnly: false,
      full: false,
    });

    if (selected.length) {
      const bags = game.settings.get(MODULE_ID, 'bags');
      const bag = bags?.[this._bagId];
      if (!bag) return;

      bag.presets = bag.presets.filter((p) => !selected.find((s) => s.uuid === p.uuid));
      await game.settings.set(MODULE_ID, 'bags', bags);
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
          new BagConfig(this._bagId, this).render(true);
        },
      });
    }

    return buttons;
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
  constructor(bagId, parentForm) {
    super({}, {});
    this.bagId = bagId;
    this.parentForm = parentForm;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/bagConfig.html`,
      width: 360,
      height: 'auto',
      resizable: false,
      minimizable: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    //Tags
    TagInput.activateListeners(html, {
      change: () => this.setPosition({ height: 'auto' }),
    });
  }

  async getData(options) {
    const data = game.settings.get(MODULE_ID, 'bags')[this.bagId];
    return data;
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const bags = game.settings.get(MODULE_ID, 'bags');

    if (event.submitter?.value === 'delete') {
      delete bags[this.bagId];
      game.settings.set(MODULE_ID, 'bags', bags);
      this.parentForm?.close(true);
      return;
    }

    const bag = bags[this.bagId];
    if (formData.bagName) bag.name = formData.bagName;
    bag.tags = formData.tags ? formData.tags.split(',') : [];

    await game.settings.set(MODULE_ID, 'bags', bags);
    this.parentForm?.render(true);
  }

  get title() {
    return 'Configure Bag: ' + game.settings.get(MODULE_ID, 'bags')[this.bagId].name ?? this.bagId;
  }

  get id() {
    return `mass-edit-bag-config-` + this.bagId;
  }
}
