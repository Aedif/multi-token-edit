import { MODULE_ID } from '../../scripts/constants.js';
import { getCommonData } from '../../scripts/utils.js';
import { WithMassConfig } from '../forms.js';
import { showMassEdit } from '../multiConfig.js';

const IMAGE_FIELDS = ['img', 'image', 'src', 'texture'];
const COLOR_FIELDS = ['tint'];

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

    const commonData = getCommonData(objects);

    super(docs[0], docs, {
      commonData: commonData,
      ...options,
    });

    this.allData = allData;

    if (options.callback) this.callbackOnUpdate = options.callback;
    if (options.closeCallback) this.closeCallback = options.closeCallback;
  }

  static TABS = {};

  /**
   * Dynamically assemble a tabs configuration
   */
  #configureTabs(data) {
    const topTab = this._genTab(null, '', data);
    if (!topTab.controls.length) {
      topTab.tabs.forEach((t) => {
        t.group = 'sheet';
      });
      topTab.tabs[0].active = true;
      return topTab.tabs;
    } else {
      const main = { id: 'main', label: 'Main', controls: topTab.controls, tabs: [], group: 'sheet', active: true };
      topTab.tabs.forEach((t) => {
        t.group = 'sheet';
      });
      topTab.tabs.active = false;
      return [main, ...topTab.tabs];
    }

    // _onClickTab - can be overriden, maybe should support right-clicking here?
  }

  _genTab(key, parentId, obj) {
    const id = parentId ? `${parentId}.${key}` : key;
    let controls = [];
    const tabs = [];
    const group = parentId;

    for (const [k, v] of Object.entries(obj)) {
      const t = foundry.utils.getType(v);
      if (t !== 'Object') controls.push(this._genControl(k, v, id ? `${id}.${k}` : k));
      else {
        const tab = this._genTab(k, id, v);
        if (tab) tabs.push(tab);
      }
    }

    if (!controls.length && !tabs.length) return null;

    // If the tab has controls and tabs we want to place the controls under a 'Main' tab
    if (tabs.length && controls.length) {
      tabs.unshift({ id: `${id}.main`, label: 'Main', controls, tabs: [], group: id });
      controls = [];
    }

    if (tabs.length) tabs[0].active = true;

    return { id, label: this._genLabel(key), controls, tabs, group };
  }

  _genLabel(key) {
    if (!key) return '';
    return key;
  }

  _genControl(key, value, name) {
    const control = { label: this._genLabel(key), value, name };

    const type = foundry.utils.getType(value);
    const allowedArrayElTypes = ['number', 'string'];

    if (type === 'number') {
      if (COLOR_FIELDS.includes(key) || key.toLowerCase().includes('color')) {
        control.color = true;
        control.numeric = true;

        try {
          control.value = new Color(value).toString();
        } catch (e) {
          control.value = '';
        }
      } else {
        control.number = true;
      }
    } else if (type === 'string') {
      control.text = true;
      if (IMAGE_FIELDS.includes(key) || key.toLowerCase().includes('image') || key.toLowerCase().includes('path'))
        control.filePicker = true;
      else if (COLOR_FIELDS.includes(key) || key.toLowerCase().includes('color')) control.color = true;
    } else if (type === 'boolean') {
      control.boolean = true;
    } else if (type === 'Array' && value.every((el) => allowedArrayElTypes.includes(foundry.utils.getType(el)))) {
      control.value = value.join(', ');
      control.array = true;
    } else if (type === 'Array') {
      control.jsonArray = true;
      control.value = JSON.stringify(value, null, 2);
    } else {
      control.disabled = true;
      control.text = true;
    }

    return control;
  }

  static DEFAULT_OPTIONS = {
    id: 'mass-edit-generic-form',
    tag: 'form',
    form: {
      closeOnSubmit: true,
    },
    window: {
      title: 'Generic',
      contentClasses: ['mass-edit-generic-form', 'standard-form'],
      minimizable: true,
      resizable: true,
    },
    position: {
      width: 500,
      height: 'auto',
    },
    actions: { meSwitchToTokenForm: MassEditGenericForm._onSwitchToTokenForm },
  };

  /** @override */
  static PARTS = {
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    main: { template: `modules/${MODULE_ID}/templates/generic/genericForm.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  _getHeaderControls() {
    const buttons = super._getHeaderControls();
    if (this.options.tokens) {
      buttons.push({
        label: 'Switch',
        class: 'mass-edit-tokens',
        icon: 'fas fa-user-circle',
        action: 'meSwitchToTokenForm',
        visible: true,
      });
    }

    return buttons;
  }

  static _onSwitchToTokenForm() {
    showMassEdit(this.options.tokens, 'Token');
    this.close();
  }

  _processFormData(event, form, formData) {
    return foundry.utils.expandObject(formData.object);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const tabs = this.#configureTabs(this.allData);
    // Cache partials
    await foundry.applications.handlebars.getTemplate(
      `modules/${MODULE_ID}/templates/generic/form-group.hbs`,
      'me-form-group',
    );
    await foundry.applications.handlebars.getTemplate(`modules/${MODULE_ID}/templates/generic/tab.hbs`, 'me-tab');

    return Object.assign(context, {
      tabs: tabs,
      tabNavigationPartial: 'templates/generic/tab-navigation.hbs',
    });
  }

  /** @override */
  async close(options = {}) {
    if (this.callbackOnUpdate) this.callbackOnUpdate(null);
    this.closeCallback?.(null);
    return super.close(options);
  }
}
