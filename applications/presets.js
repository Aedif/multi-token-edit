import { exportPresets, importPresets } from '../scripts/private.js';
import { emptyObject } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

export default class MassEditPresets extends FormApplication {
  constructor(configApp, callback, docName) {
    super({}, {});
    this.configApp = configApp;
    this.callback = callback;

    if (docName) {
      this.docName = docName;
    } else {
      this.configApp = configApp;
      this.docName = this.configApp.object.documentName;
    }
    if (this.docName === 'Actor') this.docName = 'Token';
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/presets.html',
      resizable: true,
      minimizable: false,
      title: 'Select or Create presets',
      width: 270,
      height: 'auto',
      scrollY: ['ol.item-list'],
    });
  }

  async getData(options) {
    const data = super.getData(options);
    const presets = (game.settings.get('multi-token-edit', 'presets') || {})[this.docName] || {};

    data.presets = [];
    data.createEnabled = Boolean(this.configApp);

    for (const [name, fields] of Object.entries(presets)) {
      const randomizer = fields['mass-edit-randomize'] || {};
      const addSubtract = fields['mass-edit-addSubtract'] || {};

      let title = '';
      for (const k of Object.keys(fields)) {
        if (k === 'mass-edit-randomize') continue;
        if (k === 'mass-edit-addSubtract') continue;
        if (k in randomizer) {
          title += `${k}: {{randomized}}\n`;
        } else if (k in addSubtract) {
          title += `${k}: ${addSubtract[k].method === 'add' ? '+' : '-'}${fields[k]}\n`;
        } else {
          title += `${k}: ${fields[k]}\n`;
        }
      }

      data.presets.push({ name: name, title: title });
    }
    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    $(html).on('click', '.preset-create', this._onPresetCreate.bind(this));
    $(html).on('click', '.preset-delete', this._onPresetDelete.bind(this));
  }

  _onPresetCreate(event) {
    const selectedFields = this.configApp.getSelectedFields();
    if (!selectedFields || emptyObject(selectedFields)) {
      ui.notifications.warn('No fields selected.');
      return;
    }

    const randomizeFields = deepClone(this.configApp.randomizeFields);
    const addSubtractFields = deepClone(this.configApp.addSubtractFields);

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomizeFields);
    } else if (this.docName === 'Actor') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomizeFields);
    }

    if (!emptyObject(randomizeFields)) {
      selectedFields['mass-edit-randomize'] = randomizeFields;
    }
    if (!emptyObject(addSubtractFields)) {
      selectedFields['mass-edit-addSubtract'] = addSubtractFields;
    }

    const createPreset = (name) => {
      const presets = game.settings.get('multi-token-edit', 'presets');
      let docPresets = presets[this.docName];
      if (!docPresets) {
        docPresets = {};
      }
      if (!(name in docPresets)) {
        docPresets[name] = selectedFields;
        presets[this.docName] = docPresets;
        game.settings.set('multi-token-edit', 'presets', presets);

        $(event.target).closest('form').find('.item-list').append(`
          <li class="item flexrow" name="${name}">
            <div class="item-name flexrow">
                <button name="${name}">${name}</button>
            </div>
            <div class="item-controls flexrow">
                <a class="item-control preset-delete" title="Delete Action"><i class="fas fa-trash"></i></a>
            </div>
          </li>`);
        this.setPosition();
      }
    };

    new Dialog({
      title: `Choose a name`,
      content: `<table style="width:100%"><tr><td style="width:50%"><input type="text" name="input" value=""/></td></tr></table>`,
      buttons: {
        Ok: {
          label: `Save`,
          callback: (html) => {
            const name = html.find('input').val();
            if (name) {
              createPreset(name);
            }
          },
        },
      },
      render: (html) => {
        html.find('input').focus();
      },
    }).render(true);
  }

  _onPresetDelete(event) {
    const item = $(event.target).closest('.item');

    const presets = game.settings.get('multi-token-edit', 'presets');
    let docPresets = presets[this.docName];
    if (!docPresets) docPresets = {};
    delete docPresets[item.attr('name')];
    presets[this.docName] = docPresets;

    game.settings.set('multi-token-edit', 'presets', presets);
    item.remove();
    this.setPosition();
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    buttons.unshift({
      label: '',
      class: 'mass-edit-export',
      icon: 'fas fa-file-export',
      onclick: (ev) => this._onExport(ev),
    });
    buttons.unshift({
      label: '',
      class: 'mass-edit-import',
      icon: 'fas fa-file-import',
      onclick: (ev) => this._onImport(ev),
    });
    return buttons;
  }

  _onImport() {
    importPresets.call(this);
  }
  _onExport() {
    exportPresets(this.docName);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const presetName = event.submitter.name;
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    if (docPresets[presetName]) {
      this.callback(deepClone(docPresets[presetName]));
    }
  }
}
