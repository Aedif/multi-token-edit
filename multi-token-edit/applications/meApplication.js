import { Brush } from '../scripts/brush.js';
import { injectVisibility } from '../scripts/fieldInjector.js';
import { MassEditPresets } from '../scripts/presets/forms.js';
import { Preset } from '../scripts/presets/preset.js';
import { getDDTint } from '../scripts/tmfx.js';
import {
  MODULE_ID,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_PLACEABLES,
  hasFlagRemove,
  localFormat,
  localize,
} from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
import { onInputChange } from './formUtils.js';
import { WithMassPermissions } from './forms.js';
import MacroForm from './macro.js';
import { showMassActorForm } from './multiConfig.js';

export const WithBaseMassEditForm = (cls) => {
  class BaseMassEditForm extends cls {
    constructor(doc, docs, options) {
      BaseMassEditForm._setMEActions(options);
      const documentName = options.documentName ?? doc.document?.documentName ?? doc.documentName ?? 'NONE';
      if (documentName === 'AmbientSound' || documentName === 'AmbientLight') {
        options.document = doc;
        super(options);
      } else super(doc, options);
      this.meObjects = docs;
      this.documentName = documentName;
      this.commonData = foundry.utils.flattenObject(options.commonData || {});
      this.randomizerEnabled = options.massEdit;
      this.massFormButtons = [
        {
          title: localize(`common.apply`),
          value: 'permissions',
          icon: 'far fa-save',
        },
      ];

      this.randomizeFields = {};
      this.addSubtractFields = {};
      this.meForm = true;
      this.rangeSpanToTextbox = game.settings.get(MODULE_ID, 'rangeToTextbox');
    }

    getSelectedFields(formData) {
      if (!formData) formData = this._getSubmitData();

      // Some module flags get un-flattened
      // Flatten them again before attempting to find selected
      formData = foundry.utils.flattenObject(formData);

      // Modules Specific Logic
      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in formData) {
        formData['flags.levels-3d-preview.shaders'] = this.meObjects[0].getFlag('levels-3d-preview', 'shaders');
      }
      // == End of Module specific logic

      // Token _getSubmitData() performs conversions related to scale, we need to undo them here
      // so that named fields on the form match up and can be selected
      if (this.documentName === 'Token') {
        if (formData['texture.scaleX']) {
          formData.scale = Math.abs(formData['texture.scaleX']);
          formData.mirrorX = formData['texture.scaleX'] < 0;
          formData.mirrorY = formData['texture.scaleY'] < 0;
        }
      } else if (this.documentName === 'Note') {
        if (formData['texture.src']) {
          formData['icon.selected'] = formData['texture.src'];
          formData['icon.custom'] = formData['texture.src'];
        }
      }

      const selectedFields = {};
      const html = $(this.element);
      const addSubtractFields = this.addSubtractFields;
      const app = this;

      html.find('.form-group').each(function (_) {
        const me_checkbox = $(this).find('.mass-edit-checkbox > input');
        if (me_checkbox.length && me_checkbox.is(':checked')) {
          $(this)
            .find('[name]')
            .each(function (_) {
              const name = $(this).attr('name');
              console.log('name', name);

              // Module specific logic
              if (name === 'flags.limits') {
                const limits = foundry.utils.flattenObject(app.meObjects[0].toObject().flags['limits'] ?? {});
                for (const [k, v] of Object.entries(limits)) {
                  selectedFields['flags.limits.' + k] = v;
                }
              }
              // == End of Module specific logic

              // Some modules will process their flags to remove them using -= notation
              // Need to account for this when selecting fields
              if (formData[name] === undefined && name.startsWith('flags.')) {
                const removeFlag = hasFlagRemove(name, formData);
                if (removeFlag) {
                  selectedFields[removeFlag] = null;
                }
              } else {
                selectedFields[name] = formData[name];
                if (name in addSubtractFields) {
                  addSubtractFields[name].value = formData[name];
                }
              }

              if (foundry.utils.getType(selectedFields[name]) === 'string') {
                const input = $(this);
                if (input.hasClass('tva-array')) {
                  if (v.trim()) {
                    selectedFields[name] = selectedFields[name]
                      .trim()
                      .split(',')
                      .map((s) => s.trim());
                  } else {
                    selectedFields[name] = [];
                  }
                } else if (input.hasClass('tva-jsonArray')) {
                  try {
                    selectedFields[name] = JSON.parse(selectedFields[name]);
                  } catch (e) {
                    selectedFields[name] = [];
                  }
                }
              }
            });
        }
      });

      return selectedFields;
    }

    /**
     * Control button style
     * @param {*} html
     */
    _setStyle(html) {
      const [styleName, css] = getInUseStyle();
      html.prepend(`<style>${css}</style>`);
    }

    _injectGlobalDeleteButton(html) {
      if (!(SUPPORTED_PLACEABLES.includes(this.documentName) || SUPPORTED_COLLECTIONS.includes(this.documentName)))
        return;

      const control = $(
        `<div class="me-global-delete"><a title="${localize(
          'form.global-delete-title'
        )}"><i class="far fa-times-octagon fa-2x"></i></a></div>`
      );
      control.click((event) => {
        new Dialog({
          title: 'Confirm',
          content: `
                <h2 style="color: red; text-align: center;">${localFormat('form.delete-warning', {
                  count: this.meObjects.length,
                  document: this.documentName,
                })}</h2>
                <p>${localize('form.proceed')}</p>`,
          buttons: {
            buttonA: {
              label: localize('Yes', false),
              callback: () => {
                this.meObjects.forEach((obj) => {
                  let doc = obj.document ?? obj;
                  if (doc.delete) doc.delete();
                });
                this.close();
              },
            },
            no: {
              label: localize('No', false),
            },
          },
          default: 'buttonA',
        }).render(true);
      });
      html.closest('form').append(control);
    }

    _activateAutoSelectListeners(html) {
      // On any field being changed we want to automatically select the form-group to be included in the update
      html.on('input', 'textarea, input[type="text"], input[type="number"]', onInputChange.bind(this));
      html.on('change', 'textarea, input, select', onInputChange.bind(this));
      html.on('paste', 'input', onInputChange.bind(this));
      html.on('click', 'button', onInputChange.bind(this));
    }

    /**
     * Add Mass Edit controls to a .form-group
     * @param {*} formGroup
     * @param {*} typeOverride
     * @returns
     */
    _processFormGroup(formGroup, typeOverride = null) {
      // We only want to attach extra controls if the form-group contains named fields
      if (!$(formGroup).find('[name]').length) return;
      // Return if a checkbox is already inserted
      if ($(formGroup).find('.mass-edit-checkbox').length) return;
      // if ($(formGroup).find('[name]:disabled').length) return;

      const commonData = this.commonData;
      const rangeSpanToTextbox = this.rangeSpanToTextbox;
      const insertRNGControl = this.randomizerEnabled;

      // Check if fields within this form-group are part of common data or control a flag
      let fieldType = 'meCommon';
      if (commonData) {
        $(formGroup)
          .find('[name]')
          .each(function () {
            const name = $(this).attr('name');

            if (rangeSpanToTextbox && $(this).attr('type') === 'range') {
              const span = $(formGroup).find('span.range-value');
              if (span.length) {
                span.replaceWith(
                  $(
                    `<input name="${name}" class="range-value" type="number" step="any" value="${this.defaultValue}" min="${this.min}" max="${this.max}"></input>`
                  )
                );
                $(this).removeAttr('name');
              }
            }

            if (name.startsWith('flags.')) {
              fieldType = 'meFlag';
            } else if (!(name in commonData)) {
              // We want to ignore certain fields from commonData checks e.g. light invert-radius

              if (name === 'invert-radius') {
              } else {
                fieldType = 'meDiff';
              }
            }
          });
      }

      // Add randomizer controls
      let randomControl = '';
      if (insertRNGControl) {
        randomControl = '<div class="mass-edit-randomize"></div>';
      }

      fieldType = typeOverride ?? fieldType;

      // Insert the checkbox
      const checkbox = $(
        `<div class="mass-edit-checkbox ${fieldType}">${randomControl}<input class="mass-edit-control" type="checkbox" data-dtype="Boolean"}></div>`
      );
      if ($(formGroup).find('p.hint, p.notes').length) {
        $(formGroup).find('p.hint, p.notes').first().before(checkbox);
      } else {
        $(formGroup).append(checkbox);
      }

      // Assign field type to the form group. Will be used to set appropriate visual look
      $(formGroup).addClass(fieldType);
    }

    /**
     * Add Mass Edit control for all .form-group's within the html
     * @param {*} html
     */
    _processAllFormGroups(html) {
      const processFormGroup = this._processFormGroup.bind(this);
      // Add checkboxes to each form-group to control highlighting and which fields are to be saved
      html.find('.form-group').each(function (_) {
        processFormGroup(this);
      });
    }

    _registerRandomizerListeners(html) {
      const context = this;
      if (this.randomizerEnabled) {
        html.on('contextmenu', '.mass-edit-checkbox', (event) => {
          import('../scripts/randomizer/randomizerForm.js').then((module) => {
            module.showRandomizeDialog($(event.target).closest('.form-group'), context);
          });
        });
      }
    }

    _registerNumericalInputListeners(html) {
      html.on(
        'contextmenu',
        'input[type=range], input[type=number], input[name="flags.tagger.tags"], input[type="text"], input[name="tokenmagic.preset"]',
        (event) => {
          const name = event.target.name;
          if (!name) return;

          const input = $(event.target);
          if (name in this.addSubtractFields) {
            if (this.addSubtractFields[name].method === 'add') {
              this.addSubtractFields[name].method = 'subtract';
              input.removeClass('me-add').addClass('me-subtract');
              input.attr('title', '- Subtracting');
              const ctrl = { method: 'subtract' };
              if (event.target.min) {
                ctrl.min = parseFloat(event.target.min);
              }
              ctrl.type = input.attr('type');
              this.addSubtractFields[name] = ctrl;
            } else {
              delete this.addSubtractFields[name];
              input.removeClass('me-subtract');
              input.attr('title', '');
            }
          } else {
            input.addClass('me-add');
            input.attr('title', '+ Adding');
            const ctrl = { method: 'add' };
            if (event.target.max) {
              ctrl.max = parseFloat(event.target.max);
            }
            ctrl.type = input.attr('type');
            this.addSubtractFields[name] = ctrl;
          }

          // Select nearest mass edit checkbox
          onInputChange(event);

          // Make brush aware of add/subtract changes
          Brush.refreshPreset();
        }
      );
    }

    _registerInputChangeCallback(html) {
      if (this.options.inputChangeCallback) {
        html.on('change', 'input, select', async (event) => {
          setTimeout(() => this.options.inputChangeCallback(this.getSelectedFields()), 100);
        });
      }
    }

    /**
     * Toggle all ME checkboxes on/off when right-clicking tabs
     * @param {*} html
     */
    _registerNavigationTabMassSelect(html) {
      // Select/Deselect all Mass Edit checkboxes when right-clicking the navigation tabs
      html.on('contextmenu', 'nav > .item', (event) => {
        const tab = event.target.dataset?.tab;
        if (tab) {
          const group = $(event.target).closest('nav').attr('data-group');
          let meCheckboxes;
          if (group) {
            meCheckboxes = $(event.target)
              .closest('form')
              .find(
                `.tab[data-tab="${tab}"][data-group="${group}"], .matt-tab[data-tab="${tab}"][data-group="${group}"]`
              )
              .find('.mass-edit-control');
          }
          if (!meCheckboxes || meCheckboxes.length === 0) {
            meCheckboxes = $(event.target)
              .closest('form')
              .find(`.tab[data-tab="${tab}"], .matt-tab[data-tab="${tab}"]`)
              .find('.mass-edit-control');
          }

          let selecting = true;

          if (meCheckboxes.not(':checked').length === 0) {
            selecting = false;
          }
          meCheckboxes.prop('checked', selecting);

          // Select/Deselect tabs
          meCheckboxes.each(function () {
            if (selecting) selectTabs(this);
            else deselectTabs(this);
          });

          // Trigger change on one of the checkboxes to initiate processes that respond to them
          // being toggled
          meCheckboxes.first().trigger('change');
        }
      });
    }

    _removeFooterButtons(html) {
      throw Error('The _removeFooterButtons() method must be defined by a subclass.');
    }

    _insertSubmitButtons(html) {
      // Add submit buttons
      let htmlButtons = '';
      if (!this._meSubmitInserted) {
        this._meSubmitInserted = true;
        for (const button of this.massFormButtons) {
          htmlButtons += `<button class="me-submit" type="submit" value="${button.value}"><i class="${button.icon}"></i> ${button.title}</button>`;
          // Auto update control
          if (this.options.massEdit && !this.options.simplified && !this.options.presetEdit)
            htmlButtons += `<div class="me-mod-update" title="${localize(
              `form.immediate-update-title`
            )}"><input type="checkbox" data-submit="${button.value}"><i class="fas fa-cogs"></i></div>`;
        }
        if (this.options.massSelect && SUPPORTED_PLACEABLES.includes(this.documentName)) {
          htmlButtons += `<div class="me-mod-update" title="${localize(
            `form.global-search-title`
          )}"><input type="checkbox" data-submit="world"><i class="far fa-globe"></i></div>`;
        }

        let footer = $(html).find('.sheet-footer').last();
        if (footer.length) {
          footer.append(htmlButtons);
        } else {
          footer = $(`<footer class="sheet-footer flexrow">${htmlButtons}</footer>`);
          $(html).closest('form').append(footer);
        }

        // Auto update listeners
        footer.find('.me-mod-update > input').on('change', (event) => {
          event.stopPropagation();
          const isChecked = event.target.checked;
          footer.find('.me-mod-update > input').not(this).prop('checked', false);
          $(event.target).prop('checked', isChecked);
          this.modUpdate = isChecked;
          this.modUpdateType = event.target.dataset?.submit;
        });
      }
    }

    _insertModuleSpecificFields(html) {
      // Monk's Active Tiles
      if (this.documentName === 'Tile' && this._createAction) {
        let chk = $(`
              <div class="form-group">
                <label>Mass Edit: ${localize(`form.actions`)}</label>
                <div class="form-fields">
                    <input type="hidden" name="flags.monks-active-tiles.actions">
                </div>
              `);
        $(html).find('.matt-tab[data-tab="trigger-actions"]').prepend(chk);
        this._processFormGroup(chk, 'meInsert');

        chk = $(`
              <div class="form-group">
                <label>Mass Edit: ${localize(`form.images`)}</label>
                <div class="form-fields">
                    <input type="hidden" name="flags.monks-active-tiles.files">
                </div>
              `);
        chk.insertBefore('.matt-tab[data-tab="trigger-images"] .files-list');
        this._processFormGroup(chk, 'meInsert');
      }

      // 3D Canvas
      if ((this.documentName === 'Tile' || this.documentName === 'Token') && game.Levels3DPreview) {
        let chk = $(`
              <div class="form-group">
                <label>Mass Edit: ${localize(`form.shaders`)}</label>
                <div class="form-fields">
                    <input type="hidden" name="flags.levels-3d-preview.shaders">
                </div>
              `);
        $(html).find('#shader-config').after(chk);
        this._processFormGroup(chk, 'meInsert');
      }
    }

    _insertSpecialFields(html) {
      // // Token Magic FX
      if (
        (this.documentName === 'Tile' || this.documentName === 'Token') &&
        !this.options?.simplified &&
        game.modules.get('tokenmagic')?.active &&
        game.settings.get(MODULE_ID, 'tmfxFieldsEnable')
      ) {
        let content = '<datalist id="tmfxPresets"><option value="DELETE ALL">';
        TokenMagic.getPresets().forEach((p) => (content += `<option value="${p.name}">`));
        content += `</datalist><input list="tmfxPresets" name="tokenmagic.preset">`;

        let chk = $(`
              <div class="form-group">
                <label>${localize('common.preset')} <span class="units">(TMFX)</span></label>
                <div class="form-fields">
                  ${content}
                </div>
              `);
        $(html).find('[name="texture.tint"]').closest('.form-group').after(chk);
        this._processFormGroup(chk, 'meInsert');

        const currentDDTint = getDDTint(this.object.object ?? this.object);
        chk = $(`
              <div class="form-group">
                <label>DungeonDraft <span class="units">(TMFX)</span></label>
                <div class="form-fields">
                  <input class="color" type="text" name="tokenmagic.ddTint" value="${currentDDTint}">
                  <input type="color" value="${currentDDTint}" data-edit="tokenmagic.ddTint">
                </div>
              `);
        $(html).find('[name="texture.tint"]').closest('.form-group').after(chk);
        this._processFormGroup(chk, 'meInsert');
      }

      // Tile scale
      if (this.documentName === 'Tile') {
        let scaleInput = $(`
            <div class="form-group slim">
              <label>${localize('Scale', false)} <span class="units">(${localize('common.ratio')})</span></label>
              <div class="form-fields">
                <label>${localize('Width', false)} | ${localize('Height', false)} ${
          game.Levels3DPreview?._active ? '| Depth' : ''
        }</label>
                <input type="number" value="1" step="any" name="massedit.scale" min="0">
              </div>
            </div>`);
        $(html).find('[name="width"]').closest('.form-group').before(scaleInput);
        this._processFormGroup(scaleInput, 'meInsert');

        scaleInput = $(`
              <div class="form-group slim">
                <label>${localize('TILE.Scale', false)} <span class="units">(${localize('common.ratio')})</span></label>
                <div class="form-fields">
                  <label>${localize('TILE.ScaleX', false)} | ${localize('TILE.ScaleY', false)}</label>
                  <input type="number" value="1" step="any" name="massedit.texture.scale" min="0">
                </div>
              </div>`);
        $(html).find('[name="texture.scaleX"]').closest('.form-group').before(scaleInput);
        this._processFormGroup(scaleInput, 'meInsert');
      }
    }

    _registerMutateObserver(html) {
      // TokenConfig might be changed by some modules after activateListeners is processed
      // Look out for these updates and add checkboxes for any newly added form-groups
      const processFormGroup = this._processFormGroup.bind(this);
      const mutate = (mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if ($(node).hasClass('form-group')) {
              processFormGroup(node);
            } else {
              $(node)
                .find('.form-group')
                .each(function () {
                  if (!$(this).find('.mass-edit-checkbox').length) {
                    processFormGroup(this);
                  }
                });
            }
          });
        });
      };

      const observer = new MutationObserver(mutate);
      observer.observe(html[0], {
        characterData: false,
        attributes: false,
        childList: true,
        subtree: true,
      });
    }

    /**
     * ===== ACTIONS ======
     */

    /**
     * Macro Generator
     */
    static _openMacroForm() {
      const selectedFields = this.getSelectedFields();
      new MacroForm(
        this.object,
        this.meObjects,
        this.docName,
        selectedFields,
        this.randomizeFields,
        this.addSubtractFields
      ).render(true);
    }

    /**
     * Brush Tool
     */
    static _activateBrushTool() {
      Brush.activate({ app: this });
    }

    /**
     * Token, Note, and Actor permission editing
     */
    static _openEditPermissions() {
      let docs = [];
      const ids = new Set();
      for (const p of this.meObjects) {
        let d;
        if (this.docName === 'Actor' || this.docName === 'JournalEntry') d = p;
        else if (this.docName === 'Token' && p.actor) d = p.actor;
        else if (this.docName === 'Note' && p.entry) d = p.entry;

        // Only retain unique docs
        if (d && !ids.has(d.id)) {
          docs.push(d);
          ids.add(d.id);
        }
      }

      let MP = WithMassPermissions();
      new MP(docs[0], docs).render(true);
    }

    /**
     * Open Preset browser with a relationship to this app
     */
    static _openPresetBrowser() {
      console.log('PRESET BROWSER');
      this.linkedPresetForm = new MassEditPresets(this, null, this.documentName, {
        left: this.position.left - 370,
        top: this.position.top,
        preventPositionOverride: true,
      });
      this.linkedPresetForm.render(true);
    }

    /**
     * View currently selected fields as JSON and/or apply JSON to the current form
     */
    static _openViewApplyJSON() {
      let selFields = foundry.utils.expandObject(this.getSelectedFields());
      if (foundry.utils.isEmpty(selFields)) selFields = '';
      else selFields = JSON.stringify(selFields, null, 2);
      let content = `<textarea class="json" style="width:100%; height: 300px;">${selFields}</textarea>`;
      new Dialog({
        title: localize('form.apply-json'),
        content: content,
        buttons: {
          apply: {
            label: localize('common.apply'),
            callback: (html) => {
              let json = {};
              try {
                json = JSON.parse(html.find('.json').val());
              } catch (e) {}

              if (!foundry.utils.isEmpty(json)) {
                const preset = new Preset({
                  documentName: this.docName,
                  data: foundry.utils.flattenObject(json),
                });
                this._processPreset(preset);
              }
            },
          },
        },
      }).render(true);
    }

    static _showMassActorForm() {
      if (
        showMassActorForm(this.meObjects, {
          massEdit: this.options.massEdit,
        })
      ) {
        this.close();
      }
    }

    static _setMEActions(options) {
      const actions = options.action ?? {};
      actions.meMacroGen = this._openMacroForm;
      actions.meBrush = this._activateBrushTool;
      actions.meEditPermissions = this._openEditPermissions;
      actions.mePresetBrowser = this._openPresetBrowser;
      actions.meJSON = this._openViewApplyJSON;
      actions.meTokenActor = this._showMassActorForm;
      options.actions = actions;
    }

    _getMeControls() {
      const controls = [
        {
          label: 'Generate Macro',
          class: 'mass-edit-macro',
          icon: 'fas fa-terminal',
          action: 'meMacroGen',
          visible:
            SUPPORTED_PLACEABLES.includes(this.documentName) || SUPPORTED_COLLECTIONS.includes(this.documentName),
        },
        {
          label: 'Brush',
          class: 'mass-edit-brush',
          icon: 'fas fa-paint-brush',
          action: 'meBrush',
          visible: SUPPORTED_PLACEABLES.includes(this.documentName),
        },
        {
          label: 'Permissions',
          class: 'mass-edit-permissions',
          icon: 'fas fa-lock fa-fw',
          action: 'meEditPermissions',
          visible: ['Token', 'Note', 'Actor'].includes(this.documentName),
        },
        {
          label: 'Presets',
          class: 'mass-edit-presets',
          icon: 'fas fa-box',
          action: 'mePresetBrowser',
          visible: !this.options.simplified,
        },
        {
          label: 'JSON',
          class: 'mass-edit-apply',
          icon: 'far fa-money-check-edit',
          action: 'meJSON',
          visible: true,
        },
        {
          label: 'Switch',
          class: 'mass-edit-actors',
          icon: 'fas fa-user',
          action: 'meTokenActor',
          visible: this.documentName === 'Token' && this.meObjects.filter((t) => t.actor).length,
        },
      ];
      console.log(controls);
      return controls;
    }
  }
  return BaseMassEditForm;
};

export const WithMassEditFormApplicationV2 = (cls) => {
  class MassEditForm extends cls {
    _attachFrameListeners() {
      console.log('IN _attachFrameListeners');
      super._attachFrameListeners();
      injectVisibility(this);

      const html = $(this.element);
      this._injectGlobalDeleteButton(html);
      this._setStyle(html);
      this._activateAutoSelectListeners(html);
      this._processAllFormGroups(html);
      this._registerRandomizerListeners(html);
      this._registerNumericalInputListeners(html);
      this._registerInputChangeCallback(html);
      this._registerNavigationTabMassSelect(html);
      this._removeFooterButtons(html);
      this._insertSubmitButtons(html);
      this._insertModuleSpecificFields(html);
      this._insertSpecialFields(html);
      this._registerMutateObserver(html);
    }

    _getSubmitData() {
      const form = this.element;
      const formData = new FormDataExtended(form);
      const submitData = this._prepareSubmitData(null, form, formData);
      return submitData;
    }

    _getHeaderControls() {
      return [].concat(super._getHeaderControls()).concat(this._getMeControls());
    }

    _removeFooterButtons(html) {
      html.find('footer.form-footer > button').remove();
    }
  }
  return MassEditForm;
};

export const WithMassEditFormApplication = (cls) => {
  class MassEditForm extends cls {
    async getData(options) {
      // During Preset editing we will be editing AmbientLight document directly, which causes the preview to be set to null
      // and Foundry complaining about being unable to read data from it. So we set the preview manually here
      if (this.documentName === 'AmbientLight' && !this.preview) {
        this.preview = this.meObjects[0].clone();
      }
      const data = super.getData(options);
      return data;
    }

    // Add styles and controls to the sheet
    async activateListeners(html) {
      await super.activateListeners(html);
      injectVisibility(this);
      this._injectGlobalDeleteButton(html);
      this._setStyle(html);
      this._activateAutoSelectListeners(html);
      this._processAllFormGroups(html);
      this._registerRandomizerListeners(html);
      this._registerNumericalInputListeners(html);
      this._registerInputChangeCallback(html);
      this._registerNavigationTabMassSelect(html);
      this._removeFooterButtons(html);
      this._insertSubmitButtons(html);
      this._insertModuleSpecificFields(html);
      this._insertSpecialFields(html);
      this._registerMutateObserver(html);

      // Resizes the window
      this.setPosition();
      this.element[0].style.height = ''; // don't want a statically set height

      if (this.documentName === 'Token') {
        $(html)
          .find('fieldset.detection-mode')
          .each(function (_) {
            $(this).wrap('<div class="form-group"></div>');
          });
      }
    }

    // Overriding here to prevent the underlying object from being updated as inputs change on the form
    // Relevant for AmbientLight, Tile, and Token sheets
    async _onChangeInput(event) {
      if (!['AmbientLight', 'Tile', 'Token'].includes(this.documentName)) {
        super._onChangeInput(event);
        return;
      }

      // // Handle form element updates
      const el = event.target;
      if (el.type === 'color' && el.dataset.edit) this._onChangeColorPicker(event);
      else if (el.type === 'range') this._onChangeRange(event);
    }

    _getHeaderButtons() {
      let buttons = super._getHeaderButtons();
      return buttons.filter((b) => b.class !== 'configure-sheet');
    }

    _removeFooterButtons() {
      // Remove all buttons in the footer
      html.find('.sheet-footer > button').remove();

      // Special handling for Walls sheet
      html.find('button[type="submit"]').remove();
    }
  }

  return MassEditForm;
};
