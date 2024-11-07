import { MODULE_ID, SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES } from '../scripts/constants.js';
import { generateMacro, hasSpecialField } from '../scripts/macro/generator.js';
import { localFormat, localize } from '../scripts/utils.js';
import { GeneralDataAdapter } from '../scripts/data/adapters.js';

export default class MacroForm extends FormApplication {
  constructor(object, placeables, documentName, fields, randomizeFields, addSubtractFields) {
    super({}, {});
    this.mainObject = object;
    this.placeables = placeables;
    this.documentName = documentName;
    this.fields = fields;
    this.randomizeFields = randomizeFields;
    this.addSubtractFields = addSubtractFields;

    if (
      (randomizeFields && !foundry.utils.isEmpty(randomizeFields)) ||
      (addSubtractFields && !foundry.utils.isEmpty(addSubtractFields))
    ) {
      // keep selected fields in form format
    } else {
      GeneralDataAdapter.formToData(this.documentName, this.mainObject, this.fields);
    }
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'mass-edit-macro',
      classes: ['sheet'],
      template: `modules/${MODULE_ID}/templates/macro.html`,
      resizable: true,
      minimizable: false,
      title: `Generate Macro`,
      width: 400,
      height: 'auto',
    });
  }

  async getData(options) {
    const data = super.getData(options);

    data.documentName = this.documentName;
    data.fields = JSON.stringify(this.fields, null, 2);
    data.selectable = SUPPORTED_PLACEABLES.includes(this.documentName);
    data.selectScopeEnabled =
      data.selectable ||
      (SUPPORTED_COLLECTIONS.includes(this.documentName) && game.modules.get('multiple-document-selection')?.active);

    // Define targeting options based on the document being updated
    const targetingOptions = [
      {
        value: 'all',
        title: localFormat('macro.target-all-title', { document: this.documentName }),
        label: localize('common.all'),
      },
      {
        value: 'search',
        title: localFormat('macro.target-search-title', { document: this.documentName }),
        label: localize('FILES.Search', false),
      },
    ];

    if (data.selectScopeEnabled) {
      targetingOptions.push({
        value: 'ids',
        title: localize('macro.target-ids-title'),
        label: localize('macro.target-ids'),
      });
    }

    if (this.documentName === 'Scene') {
      targetingOptions.push({
        value: 'currentScene',
        title: localize('macro.target-current-scene-title'),
        label: 'Current Scene',
      });
    }

    if (SUPPORTED_PLACEABLES.includes(this.documentName) && game.modules.get('tagger')?.active) {
      targetingOptions.push({
        value: 'tagger',
        title: localize('macro.target-tagger-title'),
        label: 'Tagger',
      });
    }
    data.targetingOptions = targetingOptions;

    if (this.addSubtractFields && !foundry.utils.isEmpty(this.addSubtractFields)) {
      data.hasAddSubtract = true;
      data.addSubtract = JSON.stringify(this.addSubtractFields);
    }

    if (this.randomizeFields && !foundry.utils.isEmpty(this.randomizeFields)) {
      data.hasRandom = true;
      data.randomize = JSON.stringify(this.randomizeFields);
    }

    data.hasMEControls = data.hasAddSubtract || data.hasRandom || hasSpecialField(this.fields);

    // Visibility Toggle
    data.hiddenControl = ['Token', 'Tile', 'Drawing', 'AmbientLight', 'AmbientSound', 'MeasuredTemplate'].includes(
      this.documentName
    );

    // Macros
    data.macros = game.collections.get('Macro').map((m) => m.name);

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
          label: localize('Save', false),
          callback: (html) => {
            try {
              const val = JSON.parse(html.find('[name="json"]').val() || '{}');
              if (foundry.utils.isEmpty(val)) {
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

    ['randomize', 'addSubtract', 'toggle.randomize', 'toggle.addSubtract'].forEach((name) => {
      const className = name.replace('.', '');
      html.find(`.${className}`).click((event) => {
        this._onShowReturnJson($(event.target).parent(), name);
      });
      html.find(`.${className}`).contextmenu((event) => {
        this._onRemoveJson($(event.target).parent(), name);
      });
    });

    html.find('.toggleVisibility').click((event) => {
      const fields = html.find('[name="fields"]');
      const toggleFields = html.find('[name="toggle.fields"]');

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

    html.find('[name="target.method"]').change((event) => {
      // Hide/show tagger controls
      if (event.target.value === 'tagger') {
        html.find('.taggerControl').show();
        html.find('[name="tags"').attr('required', true);
      } else {
        html.find('.taggerControl').hide();
        html.find('[name="tags"').attr('required', false);
      }

      // Hide/show scope
      if (event.target.value === 'ids' || event.target.value === 'currentScene')
        html.find('[name="target.scope"]').closest('.form-group').hide();
      else html.find('[name="target.scope"]').closest('.form-group').show();

      if (event.target.value === 'search') html.find('[name="target.fields"]').closest('div').show();
      else html.find('[name="target.fields"]').closest('div').hide();

      this.setPosition({ height: 'auto' });
    });

    html.find('[name="method"]').on('change', (event) => {
      if (event.target.value === 'toggle') {
        let data = foundry.utils.flattenObject(getData(this.mainObject).toObject());

        const toggleFields = {};
        Object.keys(this.fields).forEach((k) => (toggleFields[k] = data[k]));
        html.find('[name="toggle.fields"]').val(JSON.stringify(toggleFields, null, 2));
        html.find('.toggleControl').show();
        this.setPosition({ height: 'auto' });
      } else {
        html.find('.toggleControl').hide();
        this.setPosition({ height: 'auto' });
      }

      if (event.target.value === 'massEdit' || event.target.value === 'delete') {
        html.find('.fields').hide();
        this.setPosition({ height: 'auto' });
      } else {
        html.find('.fields').show();
        this.setPosition({ height: 'auto' });
      }
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    formData = expandObject(formData);

    // Cleanup form data so that the macro generator only receives necessary information
    formData.fields = JSON.parse(formData.fields);
    if (formData.method !== 'toggle') delete formData.toggle;
    else formData.toggle.fields = JSON.parse(formData.toggle.fields);

    if (!formData.macro.name) delete formData.macro;
    if (formData.toggle?.macro && !formData.toggle.macro.name) delete formData.toggle.macro;

    if (formData.target.method !== 'tagger') delete formData.target.tagger;
    if (formData.target.method !== 'search') delete formData.target.fields;
    else formData.target.fields = JSON.parse(formData.target.fields);

    if (formData.randomize) formData.randomize = JSON.parse(formData.randomize);
    if (formData.toggle?.randomize) formData.toggle.randomize = JSON.parse(formData.toggle.randomize);
    if (formData.addSubtract) formData.addSubtract = JSON.parse(formData.addSubtract);
    if (formData.toggle?.addSubtract) formData.toggle.addSubtract = JSON.parse(formData.toggle.addSubtract);

    generateMacro(this.documentName, this.placeables, formData);
  }
}

function getData(obj) {
  return obj.document ? obj.document : obj;
}
