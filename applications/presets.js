export default class MassEditPresets extends FormApplication {
  constructor(configApp, callback) {
    super({}, {});
    this.configApp = configApp;
    this.callback = callback;

    this.docName = this.configApp.object.documentName;
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
      width: 250,
      height: 'auto',
      scrollY: ['ol.item-list'],
    });
  }

  async getData(options) {
    const data = super.getData(options);
    const presets = (game.settings.get('multi-token-edit', 'presets') || {})[this.docName] || {};
    data.presets = Object.keys(presets);
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
    if (!selectedFields || isObjectEmpty(selectedFields)) {
      ui.notifications.warn('No fields selected.');
      return;
    }
    if (this.configApp.randomizeFields && !isObjectEmpty(this.configApp.randomizeFields)) {
      selectedFields['mass-edit-randomize'] = this.configApp.randomizeFields;
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
          <li class="item flexrow">
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

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const presetName = event.submitter.name;
    const presets = game.settings.get('multi-token-edit', 'presets') || {};
    const docPresets = presets[this.docName];
    if (docPresets[presetName]) {
      this.callback(docPresets[presetName]);
    }
  }
}
