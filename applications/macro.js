import { generateMacro } from '../scripts/private.js';

export default class MacroForm extends FormApplication {
  constructor(object, placeables, fields) {
    super({}, {});
    this.mainObject = object;
    this.placeables = placeables;
    this.docName = this.placeables[0].document
      ? this.placeables[0].document.documentName
      : this.placeables[0].documentName;
    this.fields = fields;
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

    data.macroName = this.docName + ' Update Macro';
    data.singleGeneric = this.docName === 'Token';
    data.fields = JSON.stringify(this.fields, null, 2);

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

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
    if (formData.method === 'toggle') formData.toggleFields = JSON.parse(formData.toggleFields);

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
