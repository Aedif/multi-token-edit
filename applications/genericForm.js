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
    const [nav, tabSelectors] = _constructNav(allData, options.documentName ?? 'NONE');
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
        if (form.find(`[name="${k}"]`).hasClass('array')) {
          if (v.trim()) {
            formData[k] = v
              .trim()
              .split(',')
              .map((s) => s.trim());
          } else {
            formData[k] = [];
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

    if (this.options.inputChangeCallback) {
      html.find('input').on('change', (event) => {
        this.options.inputChangeCallback(this.getSelectedFields());
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

function _constructNav(allData, documentName) {
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

  _constructControls(nav, object, tabSelectors, '', pinned);

  const pinned_groups = [];
  const flatObject = flattenObject(object);
  for (const [k, v] of Object.entries(pinned)) {
    const value = k in flatObject ? flatObject[k] : v.value;

    let control = genControl(getType(value), v.label, value, k, {}, true);
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

function genControl(type, label, value, name, pinned, editableLabel = false) {
  const allowedArrayElTypes = ['number', 'string'];
  let control = { label: label, value, name, editableLabel };
  if (type === 'number') {
    control.number = true;
    const varName = name.split('.').pop();
    if (COLOR_FIELDS.includes(varName) || varName.toLowerCase().includes('color')) {
      control.colorPickerNumber = true;
      try {
        control.colorValue = new Color(value).toString();
      } catch (e) {}
    }
  } else if (type === 'string') {
    control.text = true;
    const varName = name.split('.').pop();
    if (IMAGE_FIELDS.includes(varName)) control.filePicker = true;
    else if (COLOR_FIELDS.includes(varName) || varName.toLowerCase().includes('color'))
      control.colorPicker = true;
  } else if (type === 'boolean') {
    control.boolean = true;
  } else if (type === 'Array' && value.every((el) => allowedArrayElTypes.includes(getType(el)))) {
    control.value = value.join(', ');
    control.array = true;
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

function _constructControls(nav, data, tabSelectors, name, pinned) {
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
          _constructControls(newNav, v, tabSelectors, name2, pinned);
          containsNav = true;
        }
      } else {
        control = genControl(t, _genLabel(k), v, name2, pinned, false);
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
