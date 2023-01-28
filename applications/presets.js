import { Brush } from '../scripts/brush.js';
import { emptyObject } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

export default class MassEditPresets extends FormApplication {
  constructor(configApp, callback, docName) {
    super({}, {});
    this.callback = callback;

    if (!configApp) {
      this.docName = docName;
    } else {
      this.configApp = configApp;
      this.docName = this.configApp.documentName;
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-presets',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/presets.html',
      resizable: true,
      minimizable: false,
      title: `Presets`,
      width: 270,
      height: 'auto',
      scrollY: ['ol.item-list'],
    });
  }

  get title() {
    return `[${this.docName}] ${game.i18n.localize('multi-token-edit.common.presets')}`;
  }

  async getData(options) {
    const data = super.getData(options);

    const presetList = await this._reOrderPresets();

    data.presets = [];

    data.createEnabled = Boolean(this.configApp);
    data.v10 = !isNewerVersion('10', game.version);

    for (const p of presetList) {
      const fields = p.fields;

      const randomizer = fields['mass-edit-randomize'] || {};
      const addSubtract = fields['mass-edit-addSubtract'] || {};

      let title = '';
      for (const k of Object.keys(fields)) {
        if (
          [
            'mass-edit-randomize',
            'mass-edit-addSubtract',
            'mass-edit-preset-order',
            'mass-edit-keybind',
          ].includes(k)
        )
          continue;
        if (k in randomizer) {
          title += `${k}: {{randomized}}\n`;
        } else if (k in addSubtract) {
          const val = 'value' in addSubtract[k] ? addSubtract[k].value : fields[k];
          title += `${k}: ${addSubtract[k].method === 'add' ? '+' : '-'}${val}\n`;
        } else {
          title += `${k}: ${fields[k]}\n`;
        }
      }

      data.presets.push({
        name: p.name,
        title: title,
        hasKeybind: fields['mass-edit-keybind'],
      });
    }

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    $(html).on('click', '.preset-create', this._onPresetCreate.bind(this));
    $(html).on('click', '.preset-delete a', this._onPresetDelete.bind(this));
    $(html).on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    $(html).on('click', '.preset-sort-up', this._onPresetOrderUp.bind(this));
    $(html).on('click', '.preset-sort-down', this._onPresetOrderDown.bind(this));
    $(html).on('click', '.preset-keybind', this._onPresetKeybind.bind(this));
    $(html).on('click', '.preset-brush', this._onPresetBrush.bind(this));
  }

  async _onPresetBrush(event) {
    const presetName = $(event.target).closest('li').find('.item-name button').attr('name');
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    const preset = docPresets[presetName];
    if (preset) {
      let activated = Brush.activate({ fields: preset, documentName: this.docName });

      const brushControl = $(event.target).closest('.preset-brush');
      if (brushControl.hasClass('active')) {
        brushControl.removeClass('active');
      } else {
        $(event.target).closest('form').find('.preset-brush').removeClass('active');
        if (!activated) {
          if (Brush.activate({ fields: preset, documentName: this.docName })) {
            brushControl.addClass('active');
          }
        } else {
          brushControl.addClass('active');
        }
      }
    }
  }

  async close(options = {}) {
    if (!Boolean(this.configApp)) Brush.deactivate();
    return super.close(options);
  }

  async _onPresetKeybind(event) {
    const presetName = $(event.target).closest('li').find('.item-name button').attr('name');

    const control = $(event.target).closest('.preset-keybind');

    const presets = game.settings.get('multi-token-edit', 'presets');

    let docPresets = presets[this.docName];
    if (!docPresets) {
      control.removeClass('active');
    } else {
      const preset = docPresets[presetName];
      if (preset['mass-edit-keybind']) {
        delete preset['mass-edit-keybind'];
        control.removeClass('active');
      } else {
        preset['mass-edit-keybind'] = true;
        control.addClass('active');
      }
    }

    await game.settings.set('multi-token-edit', 'presets', presets);
  }

  _onPresetUpdate(event) {
    const selectedFields = this.configApp.getSelectedFields();
    if (!selectedFields || emptyObject(selectedFields)) {
      ui.notifications.warn('No fields selected, unable to update.');
      return;
    }

    const name = $(event.target).closest('li').find('.item-name button').attr('name');
    this._createUpdatePreset(name, selectedFields);
    ui.notifications.info(`Preset {${name}} updated`);
  }

  async _onPresetOrderUp(event) {
    const presetName = $(event.target).closest('li').find('.item-name button').attr('name');

    const [allPresets, presetList] = this._getPresetsList();

    const found = presetList.findIndex((p) => p.name === presetName);

    if (found <= 0) return;

    let temp = presetList[found].fields['mass-edit-preset-order'];
    presetList[found].fields['mass-edit-preset-order'] =
      presetList[found - 1].fields['mass-edit-preset-order'];
    presetList[found - 1].fields['mass-edit-preset-order'] = temp;

    await game.settings.set('multi-token-edit', 'presets', allPresets);
    this.render(true);
  }

  async _onPresetOrderDown(event) {
    const presetName = $(event.target).closest('li').find('.item-name button').attr('name');

    const [allPresets, presetList] = this._getPresetsList();

    const found = presetList.findIndex((p) => p.name === presetName);

    if (found < 0 || found === presetList.length - 1) return;

    let temp = presetList[found].fields['mass-edit-preset-order'];
    presetList[found].fields['mass-edit-preset-order'] =
      presetList[found + 1].fields['mass-edit-preset-order'];
    presetList[found + 1].fields['mass-edit-preset-order'] = temp;

    await game.settings.set('multi-token-edit', 'presets', allPresets);
    this.render(true);
  }

  async _createUpdatePreset(name, selectedFields) {
    const randomizeFields = deepClone(this.configApp.randomizeFields);
    const addSubtractFields = deepClone(this.configApp.addSubtractFields);

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomizeFields);
    }

    if (!emptyObject(randomizeFields)) {
      selectedFields['mass-edit-randomize'] = randomizeFields;
    }
    if (!emptyObject(addSubtractFields)) {
      selectedFields['mass-edit-addSubtract'] = addSubtractFields;
    }

    const presets = game.settings.get('multi-token-edit', 'presets');
    let docPresets = presets[this.docName];
    if (!docPresets) {
      docPresets = {};
    }

    if (!(name in docPresets))
      selectedFields['mass-edit-preset-order'] = Object.keys(docPresets).length;
    else {
      selectedFields['mass-edit-preset-order'] = docPresets[name]['mass-edit-preset-order'];
      selectedFields['mass-edit-keybind'] = docPresets[name]['mass-edit-keybind'];
    }

    docPresets[name] = selectedFields;
    presets[this.docName] = docPresets;
    await game.settings.set('multi-token-edit', 'presets', presets);

    this.render(true);
  }

  _onPresetCreate(event) {
    const selectedFields = this.configApp.getSelectedFields();
    if (!selectedFields || emptyObject(selectedFields)) {
      ui.notifications.warn('No fields selected.');
      return;
    }

    new Dialog({
      title: `Choose a name`,
      content: `<table style="width:100%"><tr><td style="width:50%"><input type="text" name="input" value=""/></td></tr></table>`,
      buttons: {
        Ok: {
          label: `Save`,
          callback: (html) => {
            const name = html.find('input').val();
            if (name) {
              this._createUpdatePreset(name, selectedFields);
            }
          },
        },
      },
      render: (html) => {
        html.find('input').focus();
      },
    }).render(true);
  }

  _getPresetsList() {
    const allPresets = game.settings.get('multi-token-edit', 'presets') || {};
    const presets = allPresets[this.docName] || {};

    // Order presets, fixing ordering if needed
    const presetList = [];
    for (const [name, fields] of Object.entries(presets)) {
      if (!'mass-edit-preset-order' in fields) {
        fields['mass-edit-preset-order'] = 99999999;
      }
      presetList.push({ name, fields });
    }
    presetList.sort(
      (p1, p2) => p1.fields['mass-edit-preset-order'] - p2.fields['mass-edit-preset-order']
    );

    return [allPresets, presetList];
  }

  async _reOrderPresets(save = true) {
    const [allPresets, presetList] = this._getPresetsList();

    let order = 0;
    for (const preset of presetList) {
      preset.fields['mass-edit-preset-order'] = order;
      order++;
    }
    if (save) await game.settings.set('multi-token-edit', 'presets', allPresets); // Save ordering

    return presetList;
  }

  async _onPresetDelete(event) {
    const item = $(event.target).closest('.item');

    const presets = game.settings.get('multi-token-edit', 'presets');
    let docPresets = presets[this.docName];
    if (!docPresets) docPresets = {};
    delete docPresets[item.attr('name')];
    presets[this.docName] = docPresets;

    await game.settings.set('multi-token-edit', 'presets', presets);
    await this._reOrderPresets();
    this.render(true);
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    if (this.configApp) {
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
    }
    return buttons;
  }

  _onImport() {
    this.importPresets();
  }
  _onExport() {
    exportPresets(this.docName);
  }

  async importPresets() {
    let json = await this._importFromJSONDialog();
    json = JSON.parse(json);
    if (!json || emptyObject(json)) return;

    const presets = game.settings.get('multi-token-edit', 'presets') || {};

    for (const dType of Object.keys(json)) {
      for (const preset of Object.keys(json[dType])) {
        presets[dType][preset] = json[dType][preset];
      }
    }

    await game.settings.set('multi-token-edit', 'presets', presets);
    this.render();
  }

  async _importFromJSONDialog() {
    const content = await renderTemplate('templates/apps/import-data.html', {
      entity: 'multi-token-edit',
      name: 'presets',
    });
    let dialog = new Promise((resolve, reject) => {
      new Dialog(
        {
          title: 'Import Presets',
          content: content,
          buttons: {
            import: {
              icon: '<i class="fas fa-file-import"></i>',
              label: 'Import',
              callback: (html) => {
                const form = html.find('form')[0];
                if (!form.data.files.length)
                  return ui.notifications?.error('You did not upload a data file!');
                readTextFromFile(form.data.files[0]).then((json) => {
                  resolve(json);
                });
              },
            },
            no: {
              icon: '<i class="fas fa-times"></i>',
              label: 'Cancel',
              callback: (html) => resolve(false),
            },
          },
          default: 'import',
        },
        {
          width: 400,
        }
      ).render(true);
    });
    return await dialog;
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const presetName = event.submitter.name;
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    const preset = docPresets[presetName];
    if (preset) {
      const cPreset = deepClone(preset);
      delete cPreset['mass-edit-preset-order'];
      this.callback(cPreset);
    }
  }
}

function exportPresets(docType) {
  const presets = (game.settings.get('multi-token-edit', 'presets') || {})[docType];
  if (!presets || emptyObject(presets)) return;

  let content = '<form><h2>Select Presets to export:</h2>';
  for (const key of Object.keys(presets)) {
    content += `
    <div class="form-group">
      <label>${key}</label>
      <div class="form-fields">
          <input type="checkbox" name="${key}" data-dtype="Boolean">
      </div>
    </div>
    `;
  }
  content += `</form><div class="form-group"><button type="button" class="select-all">Select all</div>`;

  class WithHeader extends Dialog {
    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      buttons.unshift({
        label: 'Export ALL',
        class: 'mass-edit-presets-export-all',
        icon: 'fas fa-globe',
        onclick: (ev) => {
          saveDataToFile(
            JSON.stringify(game.settings.get('multi-token-edit', 'presets') || {}, null, 2),
            'text/json',
            'mass-edit-presets-ALL.json'
          );
        },
      });
      return buttons;
    }
  }

  new WithHeader({
    title: `Export`,
    content: content,
    buttons: {
      Ok: {
        label: `Export`,
        callback: (html) => {
          const exportData = {};
          html.find('input[type="checkbox"]').each(function () {
            if (this.checked && presets[this.name]) {
              exportData[this.name] = presets[this.name];
            }
          });
          if (!emptyObject(exportData)) {
            const data = {};
            data[docType] = exportData;
            const filename = `mass-edit-presets-${docType}.json`;
            saveDataToFile(JSON.stringify(data, null, 2), 'text/json', filename);
          }
        },
      },
    },
    render: (html) => {
      html.find('.select-all').click(() => {
        html.find('input[type="checkbox"]').prop('checked', true);
      });
    },
  }).render(true);
}
