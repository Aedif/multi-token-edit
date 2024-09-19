import { LINKER_DOC_ICONS, MODULE_ID } from '../constants.js';
import { LinkerAPI } from './linker.js';

export function openSmartLinkMenu(placeable) {
  new SmartMenu(placeable).render(true);
}

class SmartMenu extends FormApplication {
  constructor(placeable) {
    const pos = ui.controls.element.find('[data-control="me-presets"]').position();
    super({}, { left: pos.left + 50, top: pos.top });

    this.placeable = placeable;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-smart-linker-menu',
      template: `modules/${MODULE_ID}/templates/smartLinker.html`,
      classes: ['mass-edit-linker', 'smart-linker-menu', 'mass-edit-dark-window', 'mass-edit-window-fill'],
      resizable: false,
      minimizable: false,
      width: 200,
      height: 190,
    });
  }

  async getData(options = {}) {
    const data = {};

    const doc = this.placeable.document ?? this.placeable;

    if (doc.documentName === 'Token' || doc.documentName === 'Tile') {
      data.img = doc.texture.src;
    } else {
      data.img = LINKER_DOC_ICONS[doc.documentName];
    }

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.selectedToLink').on('click', () => LinkerAPI.smartLink({ multi: false }));
    html.find('.pickerSelectToLink').on('click', () => LinkerAPI.smartLink({ multi: true }));
  }

  get title() {
    return 'Smart Link';
  }

  async close(options = {}) {
    LinkerAPI._smartLink = null;
    return super.close(options);
  }
}
