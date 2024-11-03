import { MODULE_ID } from '../constants.js';
import { PresetAPI } from './collection.js';

export async function openPocket(id) {
  const app = Object.values(ui.windows).find((w) => w._pocketId === id);
  if (app) {
    app.close(true);
    return;
  }

  new PocketApplication(id).render(true);
}

class PocketApplication extends FormApplication {
  constructor(id, options = {}) {
    super({}, options);
    this._pocketId = id;
    this.presetPocket = true;
  }

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/pocket.html`,
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
    return 'mass-edit-pocket-' + this._pocketId;
  }

  get title() {
    return `Pocket: ` + this._pocketId;
  }

  async getData(options) {
    // Cache partials
    await getTemplate(`modules/${MODULE_ID}/templates/preset/preset.html`, 'me-preset');
    await getTemplate(`modules/${MODULE_ID}/templates/preset/presetsContent.html`, 'me-presets-content');

    const pocket = game.settings.get(MODULE_ID, 'pockets')?.[this._pocketId] ?? {};
    const uuids = pocket.uuids ?? [];
    const presets = uuids.length ? await PresetAPI.getPresets({ uuid: uuids }) : null;

    return { presets };
  }

  async _dropUuids(uuids) {
    if (!uuids?.length) return;

    console.log('dropUuids', uuids);

    const pocket = game.settings.get(MODULE_ID, 'pockets')?.[this._pocketId] ?? {};
    const pUuids = pocket.uuids ?? [];

    for (const uuid of uuids) {
      if (!pUuids.includes(uuid)) pUuids.push(uuid);
    }

    pocket.uuids = pUuids;
    await game.settings.set(MODULE_ID, 'pockets', { [this._pocketId]: pocket });
    this.render(true);
  }

  activateListeners(html) {
    super.activateListeners(html);
  }
}
