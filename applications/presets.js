import { Brush } from '../scripts/brush.js';
import { importPresetFromJSONDialog } from '../scripts/dialogs.js';
import { IS_PRIVATE } from '../scripts/randomizer/randomizerForm.js';
import { SUPPORTED_PLACEABLES, spawnPlaceable } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';

export default class MassEditPresets extends FormApplication {
  constructor(configApp, callback, docName) {
    super({}, {});
    this.callback = callback;

    if (!configApp) {
      this.docName = docName;
    } else {
      this.configApp = configApp;
      this.docName = docName || this.configApp.documentName;
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
      width: 300,
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
    data.isPlaceable = SUPPORTED_PLACEABLES.includes(this.docName);

    const aeModeString = function (mode) {
      let s = Object.keys(CONST.ACTIVE_EFFECT_MODES).find((k) => CONST.ACTIVE_EFFECT_MODES[k] === mode);
      return s ?? mode;
    };

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
            'mass-edit-preset-color',
            'mass-edit-keybind',
          ].includes(k)
        )
          continue;
        if (k in randomizer) {
          title += `${k}: {{randomized}}\n`;
        } else if (k in addSubtract) {
          const val = 'value' in addSubtract[k] ? addSubtract[k].value : fields[k];
          title += `${k}: ${addSubtract[k].method === 'add' ? '+' : '-'}${val}\n`;
        } else if (k === 'changes' && this.docName === 'ActiveEffect') {
          fields[k].forEach((c) => {
            title += `${c.key} | ${aeModeString(c.mode)} | ${c.value} | ${c.priority}\n`;
          });
        } else {
          title += `${k}: ${fields[k]}\n`;
        }
      }

      data.presets.push({
        name: p.name,
        title: title,
        hasKeybind: fields['mass-edit-keybind'],
        color: Color.fromString(fields['mass-edit-preset-color'] || '#ffffff').toRGBA(0.4),
      });
    }

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    import('../scripts/jquery-ui/jquery-ui.js').then((imp) => {
      const app = this;
      html.find('.preset-items').sortable({
        cursor: 'move',
        placeholder: 'ui-state-highlight',
        opacity: '0.8',
        items: '.item',
        stop: function (event, ui) {
          app._onPresetOrder(event, ui, this);
        },
      });
    });

    html.on('click', '.item-name label', this._onSelectPreset.bind(this));
    html.on('contextmenu', '.item-name label', this._onColorPick.bind(this));
    $(html).on('click', '.preset-create', this._onPresetCreate.bind(this));
    $(html).on('click', '.preset-delete a', this._onPresetDelete.bind(this));
    $(html).on('click', '.preset-update a', this._onPresetUpdate.bind(this));
    $(html).on('click', '.preset-keybind', this._onPresetKeybind.bind(this));
    $(html).on('click', '.preset-brush', this._onPresetBrush.bind(this));
  }

  _onColorPick(event) {
    const presetName = $(event.target).attr('name');
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    const preset = docPresets[presetName];

    let pColor = preset['mass-edit-preset-color'] ?? '';

    new Dialog({
      title: presetName,
      content: `
        <label style="margin-right:60px;">Background</label>
        <input style="width:20%;" class="color" type="text" name="bgColor" value="${pColor}">
        <input style="width:38%;" type="color" value="${pColor ?? '#ffffff'}">`,
      buttons: {
        buttonA: {
          label: 'Save',
          callback: (html) => {
            let pColor = html.find('[name="bgColor"]').val();
            if (pColor) preset['mass-edit-preset-color'] = pColor;
            else delete preset['mass-edit-preset-color'];
            game.settings.set('multi-token-edit', 'presets', presets);

            $(event.target)
              .closest('.item-name')
              .css('background-color', Color.fromString(pColor || '#ffffff').toRGBA(0.4));
          },
        },
      },
      render: (html) => {
        html.find('input[type="color"]').on('change', (event) => html.find('.color').val(event.target.value));
      },
    }).render(true);
    new Dialog();
  }

  _onSelectPreset(event) {
    const presetName = $(event.target).attr('name');
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    const preset = docPresets[presetName];
    if (preset) {
      const cPreset = deepClone(preset);
      delete cPreset['mass-edit-preset-order'];
      delete cPreset['mass-edit-preset-color'];
      this.callback(cPreset);
    }
  }

  async _onPresetOrder(event, ui, sortable) {
    if (IS_PRIVATE && SUPPORTED_PLACEABLES.includes(this.docName)) {
      // Check if the preset has been dragged out onto the canvas
      const checkMouseInWindow = function (event) {
        let app = $(event.target).closest('.window-app');
        var offset = app.offset();
        let appX = offset.left;
        let appY = offset.top;
        let appW = app.width();
        let appH = app.height();

        var mouseX = event.pageX;
        var mouseY = event.pageY;

        if (mouseX > appX && mouseX < appX + appW && mouseY > appY && mouseY < appY + appH) {
          return true;
        }
        return false;
      };

      if (!checkMouseInWindow(event)) {
        this._onPresetDragOut(event);
        $(sortable).sortable('cancel');
        return false;
      }
    }

    const allPresets = game.settings.get('multi-token-edit', 'presets') || {};
    const presets = allPresets[this.docName] || {};

    $(event.target)
      .find('.item')
      .each(function (index) {
        const name = $(this).attr('name');
        if (name in presets) {
          presets[name]['mass-edit-preset-order'] = index;
        }
      });

    await game.settings.set('multi-token-edit', 'presets', allPresets);
  }

  async _onPresetDragOut(event) {
    const presetName = $(event.originalEvent.target).closest('li').find('.item-name label').attr('name');
    const preset = deepClone(game.settings.get('multi-token-edit', 'presets')?.[this.docName]?.[presetName]);

    delete preset['mass-edit-preset-order'];
    delete preset['mass-edit-addSubtract'];

    spawnPlaceable(this.docName, preset, { tokenName: presetName });
  }

  async _onPresetBrush(event) {
    const presetName = $(event.target).closest('li').find('.item-name label').attr('name');
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
    const presetName = $(event.target).closest('li').find('.item-name label').attr('name');

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
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected, unable to update.');
      return;
    }

    const name = $(event.target).closest('li').find('.item-name label').attr('name');
    this._createUpdatePreset(name, selectedFields);
    ui.notifications.info(`Preset {${name}} updated`);
  }

  async _createUpdatePreset(name, selectedFields) {
    const randomizeFields = deepClone(this.configApp.randomizeFields || {});
    const addSubtractFields = deepClone(this.configApp.addSubtractFields || {});

    // Detection modes may have been selected out of order
    // Fix that here
    if (this.docName === 'Token') {
      TokenDataAdapter.correctDetectionModeOrder(selectedFields, randomizeFields);
    }

    if (!isEmpty(randomizeFields)) {
      selectedFields['mass-edit-randomize'] = randomizeFields;
    }
    if (!isEmpty(addSubtractFields)) {
      selectedFields['mass-edit-addSubtract'] = addSubtractFields;
    }

    const presets = game.settings.get('multi-token-edit', 'presets');
    let docPresets = presets[this.docName];
    if (!docPresets) {
      docPresets = {};
    }

    if (!(name in docPresets)) selectedFields['mass-edit-preset-order'] = Object.keys(docPresets).length;
    else {
      selectedFields['mass-edit-preset-order'] = docPresets[name]['mass-edit-preset-order'];
      selectedFields['mass-edit-keybind'] = docPresets[name]['mass-edit-keybind'];
      selectedFields['mass-edit-preset-color'] = docPresets[name]['mass-edit-preset-color'];
    }

    docPresets[name] = selectedFields;
    presets[this.docName] = docPresets;
    await game.settings.set('multi-token-edit', 'presets', presets);

    this.render(true);
  }

  _onPresetCreate(event) {
    const selectedFields =
      this.configApp instanceof ActiveEffectConfig ? this._getActiveEffectFields() : this.configApp.getSelectedFields();
    if (!selectedFields || isEmpty(selectedFields)) {
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

  _getActiveEffectFields() {
    return { changes: deepClone(this.configApp.object.changes ?? []) };
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
    presetList.sort((p1, p2) => p1.fields['mass-edit-preset-order'] - p2.fields['mass-edit-preset-order']);

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
    let json = await importPresetFromJSONDialog(this.docName);
    if (!json) return;

    const presets = game.settings.get('multi-token-edit', 'presets') || {};

    for (const dType of Object.keys(json)) {
      for (const preset of Object.keys(json[dType])) {
        presets[dType][preset] = json[dType][preset];
      }
    }

    await game.settings.set('multi-token-edit', 'presets', presets);
    this.render();
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
  if (!presets || isEmpty(presets)) return;

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
          if (!isEmpty(exportData)) {
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
