import { LINKER_DOC_ICONS, MODULE_ID } from '../constants.js';
import { LinkerAPI } from './linker.js';

export function openSmartLinkMenu(placeable) {
  new SmartMenu(placeable).render(true);
}

class SmartMenu extends FormApplication {
  constructor(placeable) {
    const pos = $(ui.controls.element).find('[data-control="me-presets"]').position();
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

    html.find('.selectedToLink').on('click', () => LinkerAPI.smartLink({ multiLayer: false }));
    html.find('.pickerSelectToLink').on('click', () => LinkerAPI.smartLink({ multiLayer: true }));
    html
      .find('.image img')
      .on('mouseenter', () => {
        LinkerAPI._highlightDocuments(LinkerAPI.getLinkedDocuments(this.placeable).add(this.placeable));
      })
      .on('mouseleave', LinkerAPI._clearHighlight);
  }

  unlink(placeables) {
    if (placeables.find((p) => p.id === this.placeable.id)) this.close(true);
  }

  get title() {
    return 'Smart Link';
  }

  async close(options = {}) {
    LinkerAPI._smartLink = null;
    LinkerAPI._clearHighlight();
    return super.close(options);
  }
}
