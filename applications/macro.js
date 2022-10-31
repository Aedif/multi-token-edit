import { generateMacro } from '../scripts/macroGenerator.js';
import { emptyObject } from '../scripts/utils.js';
import { GeneralDataAdapter } from './dataAdapters.js';

export default class MacroForm extends FormApplication {
  constructor(object, placeables, fields, randomizeFields, addSubtractFields) {
    super({}, {});
    this.mainObject = object;
    this.placeables = placeables;
    this.docName = this.placeables[0].document
      ? this.placeables[0].document.documentName
      : this.placeables[0].documentName;
    this.fields = fields;
    this.randomizeFields = randomizeFields;
    this.addSubtractFields = addSubtractFields;

    if (
      (randomizeFields && !emptyObject(randomizeFields)) ||
      (addSubtractFields && !emptyObject(addSubtractFields))
    ) {
      // keep selected fields in form format
    } else {
      GeneralDataAdapter.formToData(this.docName, this.mainObject, this.fields);
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-macro',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/macro.html',
      resizable: false,
      minimizable: false,
      title: `Generate Macro`,
      width: 400,
      height: 'auto',
    });
  }

  async getData(options) {
    const data = super.getData(options);

    data.docName = this.docName;
    data.singleGeneric = this.docName === 'Token';
    data.fields = JSON.stringify(this.fields, null, 2);
    data.taggerActive = game.modules.get('tagger')?.active;

    if (this.addSubtractFields && !emptyObject(this.addSubtractFields)) {
      data.hasAddSubtract = true;
      data.addSubtract = JSON.stringify(this.addSubtractFields);
    }

    if (this.randomizeFields && !emptyObject(this.randomizeFields)) {
      data.hasRandom = true;
      data.random = JSON.stringify(this.randomizeFields);
    }

    data.hasMEControls = data.hasAddSubtract || data.hasRandom;

    // Visibility Toggle
    data.hiddenControl = [
      'Token',
      'Tile',
      'Drawing',
      'AmbientLight',
      'AmbientSound',
      'MeasuredTemplate',
    ].includes(this.docName);

    return data;
  }

  _onShowReturnJson(control, name) {
    const store = control.siblings(`[name="${name}"]`);
    const data = JSON.parse(store.val());

    let content = `<textarea name="json" style="width:100%; height: 300px;">${JSON.stringify(
      data,
      null,
      2
    )}</textarea>`;
    new Dialog({
      title: `JSON`,
      content: content,
      buttons: {
        Ok: {
          label: `Save`,
          callback: (html) => {
            try {
              const val = JSON.parse(html.find('[name="json"]').val() || '{}');
              if (emptyObject(val)) {
                control.hide();
                store.prop('disabled', true);
                this.setPosition({ height: 'auto' });
              } else {
                store.val(JSON.stringify(val));
              }
            } catch (e) {
              ui.notifications.warn('Invalid data. Failed to save.');
            }
          },
        },
      },
    }).render(true);
  }

  _onRemoveJson(control, name) {
    const store = control.siblings(`[name="${name}"]`);
    control.hide();
    store.prop('disabled', true);
    this.setPosition({ height: 'auto' });
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    ['random', 'addSubtract', 'toggleRandom', 'toggleAddSubtract'].forEach((name) => {
      html.find(`.${name}`).click((event) => {
        this._onShowReturnJson($(event.target).parent(), name);
      });
      html.find(`.${name}`).contextmenu((event) => {
        this._onRemoveJson($(event.target).parent(), name);
      });
    });

    html.find('.toggleVisibility').click((event) => {
      const fields = html.find('[name="fields"]');
      const toggleFields = html.find('[name="toggleFields"]');

      let update,
        update2 = {};

      try {
        update = JSON.parse(fields.val());
        update.hidden = !update.hidden;
        fields.val(JSON.stringify(update, null, 2));

        update2 = JSON.parse(toggleFields.val());
        update2.hidden = !update.hidden;
        toggleFields.val(JSON.stringify(update2, null, 2));
      } catch (e) {}
    });

    html.find('[name="target"]').change((event) => {
      if (event.target.value === 'tagger') {
        html.find('.taggerControl').show();
        html.find('[name="tags"').attr('required', true);
        this.setPosition({ height: 'auto' });
      } else {
        html.find('.taggerControl').hide();
        html.find('[name="tags"').attr('required', false);
        this.setPosition({ height: 'auto' });
      }
    });

    html.find('[name="method"]').change((event) => {
      if (event.target.value === 'toggle') {
        let data = (
          this.docName === 'Actor' ? getTokenData(this.mainObject) : getData(this.mainObject)
        ).toObject();
        data = flattenObject(data);

        const toggleFields = {};
        Object.keys(this.fields).forEach((k) => (toggleFields[k] = data[k]));
        html.find('[name="toggleFields"]').val(JSON.stringify(toggleFields, null, 2));
        html.find('.toggleControl').show();
        this.setPosition({ height: 'auto' });
      } else {
        html.find('.toggleControl').hide();
        this.setPosition({ height: 'auto' });
      }
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    formData.fields = JSON.parse(formData.fields);
    if (formData.method === 'toggle') {
      formData.toggleFields = JSON.parse(formData.toggleFields);
    } else {
      ['toggleFields', 'toggleRandom', 'toggleAddSubtract'].forEach((k) => delete formData[k]);
    }

    if (formData.target !== 'tagger') {
      delete formData.tags;
    }

    ['random', 'addSubtract', 'toggleRandom', 'toggleAddSubtract'].forEach((name) => {
      if (formData[name]) {
        formData[name] = JSON.parse(formData[name]);
        for (const k of Object.keys(formData[name])) {
          if (!(k in formData.fields)) {
            delete formData[name][k];
          }
          if (emptyObject(formData[name])) {
            delete formData[name];
          }
        }
      }
    });

    generateMacro(this.docName, this.placeables, formData);
  }
}

function getTokenData(actor) {
  return isNewerVersion('10', game.version) ? getData(actor).token : actor.prototypeToken;
}

function getData(obj) {
  if (isNewerVersion('10', game.version)) {
    return obj.data;
  } else {
    return obj.document ? obj.document : obj;
  }
}
