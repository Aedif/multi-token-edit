import { CUSTOM_CONTROLS } from '../../data/custom-controls.js';
import { getCommonData } from '../../scripts/utils.js';
import { WithMassConfig } from '../forms.js';
import { showMassEdit } from '../multiConfig.js';
import { constructNav, isColorField } from './navGenerator.js';

const WMC = WithMassConfig();
export class MassEditGenericForm extends WMC {
  constructor(docs, options = {}) {
    const objects = docs.map((a) => (a.toObject ? a.toObject() : a));
    const allData = {};
    for (let i = objects.length; i >= 0; i--) {
      mergeObject(allData, objects[i]);
    }

    let documentName = options.documentName ?? 'NONE';

    let customControls = mergeObject(
      CUSTOM_CONTROLS[documentName] ?? {},
      game.settings.get('multi-token-edit', 'customControls')[documentName] ?? {}
    );
    customControls = mergeObject(customControls, options.customControls?.[documentName] ?? {});

    const [nav, tabSelectors] = constructNav(allData, documentName, customControls);
    const commonData = getCommonData(objects);

    super(docs[0], docs, {
      tabs: tabSelectors,
      commonData: commonData,
      ...options,
    });

    this.allData = allData;
    this.nav = nav;
    this.editableLabels = {};

    this.pinnedFields = game.settings.get('multi-token-edit', 'pinnedFields')[this.documentName] ?? {};
    this.customControls = customControls;

    if (options.callback) {
      this.callbackOnUpdate = options.callback;
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-generic-form',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/generic/genericForm.html',
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
    const data = super.getData(options);
    // Cache partials
    await getTemplate('modules/multi-token-edit/templates/generic/navHeaderPartial.html');
    await getTemplate('modules/multi-token-edit/templates/generic/form-group.html');

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
    const pinned = game.settings.get('multi-token-edit', 'pinnedFields');
    pinned[this.documentName] = this.pinnedFields;

    for (const name of Object.keys(this.pinnedFields)) {
      this.pinnedFields[name].value = formData[name];
    }

    if (!isEmpty(this.editableLabels)) {
      for (const [name, label] of Object.entries(this.editableLabels)) {
        if (name in this.pinnedFields) {
          this.pinnedFields[name].label = label;
          this.pinnedFields[name].value = formData[name];
        }
      }
      this.editableLabels = {};
    }

    game.settings.set('multi-token-edit', 'pinnedFields', pinned);
  }
}

function defineRangeControl(name, val, customControls, docName, { min = null, max = null, step = null } = {}) {
  let content = `
<div class="form-group slim">
  <label>Range</label>
  <div class="form-fields">
    <label>Min</label>
    <input type="number" value="${min ?? val}" name="min" step="any">
    <label>Max</label>
    <input type="number" value="${max ?? val}" name="max" step="any">
    <label>Step</label>
    <input type="number" value="${step ?? 1}" name="step" step="any">
  </div>
</div>
  `;
  new Dialog({
    title: `Define Range Control`,
    content: content,
    buttons: {
      save: {
        label: 'Save',
        callback: async (html) => {
          const min = html.find('[name="min"]').val() || val;
          const max = html.find('[name="max"]').val() || val;
          const step = html.find('[name="step"]').val() || 1;

          setProperty(customControls, name, { range: true, min, max, step });
          const allControls = game.settings.get('multi-token-edit', 'customControls');
          allControls[docName] = customControls;
          game.settings.set('multi-token-edit', 'customControls', allControls);
        },
      },
    },
  }).render(true);
}

function defineSelectControl(name, val, customControls, docName, { options = null } = {}) {
  let content = `
<div class="form-group slim">
  <label>Options</label>
  <textarea name="options">${options ? options.join('\n') : val}</textarea>
</div>
  `;
  new Dialog({
    title: `Define dropdown control`,
    content: content,
    buttons: {
      save: {
        label: 'Save',
        callback: async (html) => {
          const options = html.find('[name="options"]').val().trim();
          if (options) {
            setProperty(customControls, name, {
              select: true,
              options: options.split('\n').filter((o) => o),
            });
            const allControls = game.settings.get('multi-token-edit', 'customControls');
            allControls[docName] = customControls;
            game.settings.set('multi-token-edit', 'customControls', allControls);
          }
        },
      },
    },
  }).render(true);
}

function unsetCustomControl(name, docName) {
  const allControls = game.settings.get('multi-token-edit', 'customControls');
  let docControls = allControls[docName] || {};
  setProperty(docControls, name, null);
  game.settings.set('multi-token-edit', 'customControls', allControls);
}
