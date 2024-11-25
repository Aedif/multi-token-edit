import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';
import { PresetContainer } from './containerApp.js';

export async function openBag(id) {
  const app = Object.values(ui.windows).find((w) => w._bagId === id);
  if (app) {
    app.close(true);
    return;
  }

  new BagApplication(id).render(true);
}

class BagApplication extends PresetContainer {
  constructor(id, options = {}) {
    super({}, options);
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
    return `Bag: ` + this._bagId;
  }

  async getData(options) {
    await super.getData(options); // TODO: remove once better caching has been implemented in PresetContainer

    const bag = game.settings.get(MODULE_ID, 'bags')?.[this._bagId] ?? {};

    const uuids = bag.presets?.sort((p1, p2) => p1.sort - p2.sort).map((p) => p.uuid) ?? [];
    const presets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids }) : null;

    return { presets };
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
}
