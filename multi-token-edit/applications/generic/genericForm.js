import { CUSTOM_CONTROLS } from '../../data/custom-controls.js';
import { MODULE_ID, getCommonData, localize } from '../../scripts/utils.js';
import { WithMassConfig } from '../forms.js';
import { showMassEdit } from '../multiConfig.js';
import { constructNav, isColorField } from './navGenerator.js';

const WMC = WithMassConfig();
export class MassEditGenericForm extends WMC {
  constructor(docs, options = {}) {
    const objects = docs.map((a) => (a.toObject ? a.toObject() : a));
    let allData = {};
    for (let i = objects.length; i >= 0; i--) {
      foundry.utils.mergeObject(allData, objects[i]);
    }

    if (options.noTabs) {
      allData = foundry.utils.flattenObject(allData);
    }

    let documentName = options.documentName ?? 'NONE';

    let customControls = foundry.utils.mergeObject(
      CUSTOM_CONTROLS[documentName] ?? {},
      game.settings.get(MODULE_ID, 'customControls')[documentName] ?? {}
    );
    customControls = foundry.utils.mergeObject(customControls, options.customControls?.[documentName] ?? {});

    const [nav, tabSelectors] = constructNav(allData, documentName, customControls, !options.noTabs);
    const commonData = getCommonData(objects);

    super(docs[0], docs, {
      tabs: tabSelectors,
      commonData: commonData,
      ...options,
    });

    this.allData = allData;
    this.nav = nav;
    this.editableLabels = {};

    this.pinnedFields = game.settings.get(MODULE_ID, 'pinnedFields')[this.documentName] ?? {};
    this.customControls = customControls;

    if (options.callback) {
      this.callbackOnUpdate = options.callback;
    }
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-generic-form',
      classes: ['sheet'],
      template: `modules/${MODULE_ID}/templates/generic/genericForm.html`,
      resizable: true,
      minimizable: false,
      title: `Generic`,
      width: 500,
      height: 'auto',
    });
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (this.options.tokens) {
      buttons.unshift({
        label: '',
        class: 'mass-edit-tokens',
        icon: 'fas fa-user-circle',
        onclick: () => {
          showMassEdit(this.options.tokens, 'Token');
          this.close();
        },
      });
    }
    return buttons;
  }

  async getData(options) {
    const data = await super.getData(options);
    // Cache partials
    await getTemplate(`modules/${MODULE_ID}/templates/generic/navHeaderPartial.html`, 'me-navHeaderPartial');
    await getTemplate(`modules/${MODULE_ID}/templates/generic/form-group.html`, 'me-form-group');

    data.nav = this.nav;

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('.me-pinned').click((event) => {
      const star = $(event.target).parent();
      const control = star.closest('.form-group').find('[name]');
      const name = control.attr('name');
      if (star.hasClass('active')) {
        star.removeClass('active');
        delete this.pinnedFields[name];
      } else {
        star.addClass('active');
        this.pinnedFields[name] = { label: name };
      }
    });

    html.find('.me-editable-label').on('input', (event) => {
      const name = $(event.target).closest('.form-group').find('[name]').attr('name');
      this.editableLabels[name] = event.target.value;
    });

    html.find('.color-number').on('change', (event) => {
      if (event.target.dataset?.editNumber) {
        let col = 0;
        try {
          col = Number(Color.fromString(event.target.value));
        } catch (e) {}

        $(event.target).siblings(`[name="${event.target.dataset.editNumber}"]`).val(col).trigger('input');
      }
    });

    html.find('.me-editable-label, label').on('contextmenu', (event) => {
      const formGroup = $(event.target).closest('.form-group');
      if (!formGroup.length) return;
      const input = formGroup.find('[name]');
      const name = input.attr('name');
      if (name) {
        if (isColorField(name)) return;

        const type = input.attr('type');
        if (type === 'range') {
          unsetCustomControl(name, this.documentName);
          return;
        } else if (type === 'number') {
          defineRangeControl(name, input.val(), this.customControls, this.documentName);
        } else if (type === 'text') {
          defineSelectControl(name, input.val(), this.customControls, this.documentName);
        }
      }
    });

    if (this.options.inputChangeCallback) {
      html.on('change', 'input, select', async (event) => {
        setTimeout(() => this.options.inputChangeCallback(this.getSelectedFields()), 100);
      });
    }
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    super._updateObject(event, formData);

    // Save pinned field values and labels
    const pinned = game.settings.get(MODULE_ID, 'pinnedFields');
    pinned[this.documentName] = this.pinnedFields;

    for (const name of Object.keys(this.pinnedFields)) {
      this.pinnedFields[name].value = formData[name];
    }

    if (!foundry.utils.isEmpty(this.editableLabels)) {
      for (const [name, label] of Object.entries(this.editableLabels)) {
        if (name in this.pinnedFields) {
          this.pinnedFields[name].label = label;
          this.pinnedFields[name].value = formData[name];
        }
      }
      this.editableLabels = {};
    }

    game.settings.set(MODULE_ID, 'pinnedFields', pinned);
  }

  async close(options = {}) {
    if (this.callbackOnUpdate) this.callbackOnUpdate(null);
    return super.close(options);
  }
}

function defineRangeControl(name, val, customControls, documentName, { min = null, max = null, step = null } = {}) {
  let content = `
<div class="form-group slim">
  <label>Range</label>
  <div class="form-fields">
    <label>${localize('Minimum', false)}</label>
    <input type="number" value="${min ?? val}" name="min" step="any">
    <label>${localize('Maximum', false)}</label>
    <input type="number" value="${max ?? val}" name="max" step="any">
    <label>${localize('generic-form.step-size')}</label>
    <input type="number" value="${step ?? 1}" name="step" step="any">
  </div>
</div>
  `;
  new Dialog({
    title: localize('generic-form.define-range'),
    content: content,
    buttons: {
      save: {
        label: localize('Save', false),
        callback: async (html) => {
          const min = html.find('[name="min"]').val() || val;
          const max = html.find('[name="max"]').val() || val;
          const step = html.find('[name="step"]').val() || 1;

          setProperty(customControls, name, { range: true, min, max, step });
          const allControls = game.settings.get(MODULE_ID, 'customControls');
          allControls[documentName] = customControls;
          game.settings.set(MODULE_ID, 'customControls', allControls);
        },
      },
    },
  }).render(true);
}

function defineSelectControl(name, val, customControls, documentName, { options = null } = {}) {
  let content = `
<div class="form-group slim">
  <label>${localize('common.options')}</label>
  <textarea name="options">${options ? options.join('\n') : val}</textarea>
</div>
  `;
  new Dialog({
    title: localize('generic-form.define-dropdown'),
    content: content,
    buttons: {
      save: {
        label: localize('Save', false),
        callback: async (html) => {
          const options = html.find('[name="options"]').val().trim();
          if (options) {
            setProperty(customControls, name, {
              select: true,
              options: options.split('\n').filter((o) => o),
            });
            const allControls = game.settings.get(MODULE_ID, 'customControls');
            allControls[documentName] = customControls;
            game.settings.set(MODULE_ID, 'customControls', allControls);
          }
        },
      },
    },
  }).render(true);
}

function unsetCustomControl(name, documentName) {
  const allControls = game.settings.get(MODULE_ID, 'customControls');
  let docControls = allControls[documentName] || {};
  setProperty(docControls, name, null);
  game.settings.set(MODULE_ID, 'customControls', allControls);
}
