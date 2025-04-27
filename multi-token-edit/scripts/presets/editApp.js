import { MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { localize } from '../utils';
import { placeableToData } from './utils.js';

export class PresetConfig extends FormApplication {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/presetEdit.html`,
      width: 360,
      height: 'auto',
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.content', initial: 'main' }],
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    if (!this.options.submitOnClose) this.options.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-select so that the pre-defined names can be conveniently erased
    html.find('[name="name"]').select();

    html.find('.spawn-fields').on('click', this._onSpawnFields.bind(this));
    html.find('.attached').on('click', this.onAttachedRemove.bind(this));
    html.find('.attach-selected').on('click', () => {
      const controlled = canvas.activeLayer.controlled;
      if (controlled.length && SUPPORTED_PLACEABLES.includes(controlled[0].document.documentName)) {
        this.dropPlaceable(controlled);
      }
    });

    //Hover
    const hoverOverlay = html.closest('.window-content').find('.drag-drop-overlay');
    html
      .closest('.window-content')
      .on('mouseover', (event) => {
        if (this.presets.length !== 1) return;
        if (canvas.activeLayer?.preview?.children.some((c) => c._original?.mouseInteractionManager?.isDragging)) {
          hoverOverlay.show();
          PresetConfig.objectHover = true;
        } else {
          hoverOverlay.hide();
          PresetConfig.objectHover = false;
        }
      })
      .on('mouseout', () => {
        if (this.presets.length !== 1) return;
        hoverOverlay.hide();
        PresetConfig.objectHover = false;
      });
  }

  /**
   * Create a preset from placeables dragged and dropped ont he form
   * @param {Array[Placeable]} placeables
   * @param {Event} event
   */
  async dropPlaceable(placeables) {
    if (!this.attached) this.attached = foundry.utils.deepClone(this.presets[0].attached ?? []);
    placeables.forEach((p) =>
      this.attached.push({
        documentName: p.document.documentName,
        data: placeableToData(p),
      })
    );

    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async onAttachedRemove(event) {
    const index = $(event.target).closest('.attached').data('index');
    this.attached = this.attached || foundry.utils.deepClone(this.presets[0].attached);
    this.attached.splice(index, 1);
    await this.render(true);
    setTimeout(() => this.setPosition({ height: 'auto' }), 30);
  }

  async _onSpawnFields() {
    new PresetFieldModify(
      this.data ?? this.presets[0].data,
      (modifyOnSpawn) => {
        this.modifyOnSpawn = modifyOnSpawn;
      },
      this.modifyOnSpawn ?? this.presets[0].modifyOnSpawn
    ).render(true);
  }

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    this._createDocumentIdLink(html);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create an ID link button in the header which displays the JournalEntry ID and copies it to clipboard
   * @param {jQuery} html
   * @protected
   */
  _createDocumentIdLink(html) {
    const title = html.find('.window-title');
    const label = localize('DOCUMENT.JournalEntry', false);
    const idLink = document.createElement('a');
    idLink.classList.add('document-id-link');
    idLink.setAttribute('alt', 'Copy document id');
    idLink.dataset.tooltip = `${label}: ${this.presets.map((p) => p.id).join(', ')}`;
    idLink.dataset.tooltipDirection = 'UP';
    idLink.innerHTML = '<i class="fa-solid fa-passport"></i>';
    idLink.addEventListener('click', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.id).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'id',
          id: this.presets.map((p) => p.id).join(', '),
        })
      );
    });
    idLink.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.presets.map((p) => p.uuid).join(', '));
      ui.notifications.info(
        game.i18n.format('DOCUMENT.IdCopiedClipboard', {
          label,
          type: 'uuid',
          id: this.presets.map((p) => p.uuid).join(', '),
        })
      );
    });
    title.append(idLink);
  }
}
