import { emptyObject, getCommonData } from '../scripts/utils.js';
import { WithMassConfig } from './forms.js';
import { showMassConfig } from './multiConfig.js';

const WMC = WithMassConfig();
export class MassEditGenericForm extends WMC {
  constructor(docs, options = {}) {
    const objects = docs.map((a) => (a.toObject ? a.toObject() : a));
    const allData = {};
    for (let i = objects.length; i >= 0; i--) {
      mergeObject(allData, objects[i]);
    }
    const [nav, tabSelectors] = _constructNav(
      allData,
      options.documentName ?? 'NONE',
      options.customControls
    );
    const commonData = getCommonData(objects);

    super(docs[0], docs, {
      tabs: tabSelectors,
      commonData: commonData,
      ...options,
    });

    this.allData = allData;
    this.nav = nav;
    this.editableLabels = {};

    this.pinnedFields =
      game.settings.get('multi-token-edit', 'pinnedFields')[this.documentName] ?? {};
    this.customControls = mergeObject(
      game.settings.get('multi-token-edit', 'customControls')[this.documentName] ?? {},
      options.customControls?.[this.documentName] ?? {}
    );

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
          showMassConfig(this.options.tokens, 'Token');
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

  _getSubmitData() {
    const formData = super._getSubmitData();
    const form = $(this.form);
    for (const [k, v] of Object.entries(formData)) {
      if (getType(v) === 'string') {
        const input = form.find(`[name="${k}"]`);
        if (input.hasClass('array')) {
          if (v.trim()) {
            formData[k] = v
              .trim()
              .split(',')
              .map((s) => s.trim());
          } else {
            formData[k] = [];
          }
        } else if (input.hasClass('jsonArray')) {
          try {
            formData[k] = JSON.parse(formData[k]);
          } catch (e) {
            formData[k] === [];
          }
        }
      }
    }
    return formData;
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

        $(event.target)
          .siblings(`[name="${event.target.dataset.editNumber}"]`)
          .val(col)
          .trigger('input');
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

    html.find('.jsonArray').dblclick((event) => {
      let content = `<textarea style="width:100%; height: 100%;">${event.target.value}</textarea>`;
      new Dialog(
        {
          title: `Edit`,
          content: content,
          buttons: {},
          render: (html) => {
            html.find('textarea').on('input', (ev) => {
              $(event.target).val(ev.target.value).trigger('input');
            });
            html.closest('section').find('.dialog-buttons').remove();
          },
        },
        { resizable: true, height: 300 }
      ).render(true);
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

    if (!emptyObject(this.editableLabels)) {
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

function _constructNav(allData, documentName, customControls) {
  const nav = {
    dataGroup: 'main',
    items: [],
    tabs: [],
  };
  const tabSelectors = [
    { navSelector: '.tabs[data-group="main"]', contentSelector: 'form', initial: 'me-pinned' },
  ];

  // Limit the form to just the keys marked as editable
  let editableKeys;
  // if (documentName === 'Actor') {
  //   editableKeys = ['name', 'img', 'system', 'data', 'folder', 'flags'];
  // }

  let object = {};
  if (!editableKeys) object = allData;
  else {
    for (const k of editableKeys) {
      if (k in allData) {
        object[k] = allData[k];
      }
    }
  }

  const pinned = game.settings.get('multi-token-edit', 'pinnedFields')[documentName] || {};
  customControls = mergeObject(
    game.settings.get('multi-token-edit', 'customControls')[documentName] || {},
    customControls?.[documentName] || {}
  );

  _constructControls(nav, object, tabSelectors, '', pinned, customControls);

  const pinned_groups = [];
  const flatObject = flattenObject(object);
  for (const [k, v] of Object.entries(pinned)) {
    const value = k in flatObject ? flatObject[k] : v.value;

    let control = genControl(getType(value), v.label, value, k, {}, true, customControls);
    control.pinned = true;
    pinned_groups.push(control);
  }
  if (pinned_groups.length) {
    // No tabs constructed means this is not a nested object, however since we have pinned fields
    // we need to separate main object fields from the pinned ones
    if (!nav.items.length) {
      nav.items.push({ dataTab: 'main-me-main', label: 'Main' });
      nav.tabs.push({ dataTab: 'main-me-main', groups: nav.groups });
      delete nav.groups;
    }

    nav.items.unshift({
      dataTab: 'me-pinned',
      dataTab: 'me-pinned',
      label: game.i18n.localize('multi-token-edit.common.pinned'),
    });
    nav.tabs.unshift({ dataTab: 'me-pinned', groups: pinned_groups });
  }

  return [nav, tabSelectors];
}

const IMAGE_FIELDS = ['img', 'image', 'src', 'texture'];
const COLOR_FIELDS = ['tint'];

function isColorField(name) {
  name = name.split('.').pop();
  return COLOR_FIELDS.includes(name) || name.toLowerCase().includes('color');
}

function genControl(type, label, value, name, pinned, editableLabel = false, customControls = {}) {
  const allowedArrayElTypes = ['number', 'string'];

  let control = { label: label, value, name, editableLabel };
  // if (name === 'animated.intensity.animType') {
  //   console.log(name, customControls, customControls[name]);
  // }
  if (getProperty(customControls, name)) {
    control = mergeObject(control, getProperty(customControls, name));
  } else if (type === 'number') {
    control.number = true;
    const varName = name.split('.').pop();
    if (isColorField(varName)) {
      control.colorPickerNumber = true;
      try {
        control.colorValue = new Color(value).toString();
      } catch (e) {}
    }
  } else if (type === 'string') {
    control.text = true;
    const varName = name.split('.').pop();
    if (IMAGE_FIELDS.includes(varName) || varName.toLowerCase().includes('image'))
      control.filePicker = true;
    else if (isColorField(varName)) control.colorPicker = true;
  } else if (type === 'boolean') {
    control.boolean = true;
  } else if (type === 'Array' && value.every((el) => allowedArrayElTypes.includes(getType(el)))) {
    control.value = value.join(', ');
    control.array = true;
  } else if (type === 'Array') {
    control.jsonArray = true;
    control.value = JSON.stringify(value, null, 2);
  } else {
    control.disabled = true;
    control.text = true;
    control.editableLabel = false;
  }
  if (control && name in pinned) {
    control.pinned = true;
    control.disabled = true;
    control.name = null;
  }
  return control;
}

function _constructControls(nav, data, tabSelectors, name, pinned, customControls) {
  const groups = [];
  let containsNav = false;
  for (const [k, v] of Object.entries(data)) {
    const name2 = name ? name + '.' + k : k;
    if (v !== null) {
      let t = getType(v);
      let control;
      if (t === 'Object') {
        if (!emptyObject(v)) {
          nav.items.push({ dataTab: name2, label: _genLabel(k) });
          const newNav = { dataGroup: name2, items: [], tabs: [] };
          nav.tabs.push({ dataTab: name2, nav: newNav });
          tabSelectors.push({
            navSelector: `.tabs[data-group="${name2}"]`,
            contentSelector: `.tab[data-tab="${name2}"]`,
            initial: k + '-me-main',
          });
          _constructControls(newNav, v, tabSelectors, name2, pinned, customControls);
          containsNav = true;
        }
      } else {
        control = genControl(t, _genLabel(k), v, name2, pinned, false, customControls);
      }
      if (control) {
        groups.push(control);
      }
    }
  }

  if (groups.length) {
    if (containsNav) {
      nav.items.unshift({
        dataTab: nav.dataGroup + '-me-main',
        label: 'Main',
      });
      nav.tabs.unshift({
        dataTab: nav.dataGroup + '-me-main',
        groups,
      });
    } else {
      nav.groups = groups;
    }
  }
}

function _genLabel(key) {
  if (key.length <= 3) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function defineRangeControl(
  name,
  val,
  customControls,
  docName,
  { min = null, max = null, step = null } = {}
) {
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
