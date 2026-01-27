import { Brush } from '../scripts/brush.js';
import {
  MODULE_ID,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_PLACEABLES,
  SUPPORTED_SHEET_CONFIGS,
} from '../scripts/constants.js';
import { injectVisibility } from '../scripts/fieldInjector.js';
import { PresetBrowser } from '../scripts/presets/browser/browserApp.js';
import { Preset } from '../scripts/presets/preset.js';
import { selectRandomizerFields } from '../scripts/randomizer/randomizerUtils.js';
import { getDDTint } from '../scripts/tmfx.js';
import { getDocumentName, hasFlagRemove, localFormat, localize, selectAddSubtractFields } from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
import { GeneralDataAdapter, TokenDataAdapter } from '../scripts/data/adapters.js';
import {
  copyToClipboard,
  deselectTabs,
  getCommonDocData,
  onInputChange,
  performMassSearch,
  performMassUpdate,
  selectTabs,
} from './formUtils.js';
import { WithMassPermissions } from './forms.js';
import MacroForm from './macro.js';
import { showMassActorForm } from './multiConfig.js';

export const WithBaseMassEditForm = (cls) => {
  class BaseMassEditForm extends cls {
    constructor(doc, docs, options) {
      if (options.massSelect) options.randomizerEnabled = false;
      const documentName = options.documentName ?? getDocumentName(doc);
      if (!options.commonData) options.commonData = getCommonDocData(docs, documentName);

      BaseMassEditForm._setMEActions(options);

      options.document = doc;
      super(options);

      this.meObjects = docs;
      this.documentName = documentName;
      this.commonData = foundry.utils.flattenObject(options.commonData || {});
      this.randomizerEnabled = options.massEdit;
      this.randomizeFields = {};
      this.addSubtractFields = {};
      this.meForm = true;
      this.rangeSpanToTextbox = game.settings.get(MODULE_ID, 'rangeToTextbox');
    }

    get baseDocument() {
      throw Error('The getBaseDocument() method must be defined by a subclass.');
    }

    get title() {
      if (this.options.massSelect) return localFormat('form.mass-search-title', { document: this.documentName });
      return localFormat('form.mass-edit-title', { document: this.documentName, count: this.meObjects.length });
    }

    /**
     * Form Submit
     * @param {*} event
     * @param {*} formData
     * @returns
     */
    static async massUpdateObject(event, control) {
      control = $(control);
      if (!control.data('action')) return;

      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields();

      // Detection modes may have been selected out of order
      // Fix that here
      if (this.documentName === 'Token') {
        TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
      }

      // Preset editing
      if (this.options.presetEdit) {
        this.options.callback?.({
          data: selectedFields,
          addSubtract: this.addSubtractFields,
          randomize: this.randomizeFields,
        });
        return;
      }

      // Search and Select mode
      if (this.options.massSelect) {
        return performMassSearch(control.data('action'), this.documentName, selectedFields, {
          scope: this.modUpdate ? this.modUpdateType : null,
        });
      } else {
        // Edit mode
        return performMassUpdate.call(this, selectedFields, this.meObjects, this.documentName, control.data('action'));
      }
    }

    getSelectedFields(formData) {
      if (!formData) formData = this._getSubmitData();

      // Some module flags get un-flattened
      // Flatten them again before attempting to find selected
      formData = foundry.utils.flattenObject(formData);

      // Modules Specific Logic
      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in formData) {
        formData['flags.levels-3d-preview.shaders'] = this.baseDocument.getFlag('levels-3d-preview', 'shaders');
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

      for (const formGroup of this.element.querySelectorAll('.form-group')) {
        const me_checkbox = formGroup.querySelector('.mass-edit-checkbox > input');
        if (!me_checkbox?.checked) continue;

        for (const namedElement of formGroup.querySelectorAll('[name]')) {
          const name = namedElement.getAttribute('name');
          // Module specific logic
          if (name === 'flags.limits') {
            const limits = foundry.utils.flattenObject(this.meObjects[0].toObject().flags['limits'] ?? {});
            for (const [k, v] of Object.entries(limits)) {
              selectedFields['flags.limits.' + k] = v;
            }
          }
          if (name.startsWith('MassEdit.insert')) {
            const realName = name.replace('MassEdit.insert.', '');
            selectedFields[realName] = formData[realName];
            continue;
          }
          // == End of Module specific logic

          // Some modules will process their flags to remove them using -= notation
          // Need to account for this when selecting fields
          if (formData[name] === undefined && name.startsWith('flags.')) {
            const removeFlag = hasFlagRemove(name, formData);
            if (removeFlag) selectedFields[removeFlag] = null;
          } else {
            selectedFields[name] = formData[name];
            if (name in this.addSubtractFields) this.addSubtractFields[name].value = formData[name];
          }

          // Some inputs (generated by ME) require additional processing
          if (foundry.utils.getType(selectedFields[name]) === 'string') {
            if (namedElement.classList.contains('me-array')) {
              if (v.trim()) {
                selectedFields[name] = selectedFields[name]
                  .trim()
                  .split(',')
                  .map((s) => s.trim());
              } else {
                selectedFields[name] = [];
              }
            } else if (namedElement.classList.contains('me-jsonArray')) {
              try {
                selectedFields[name] = JSON.parse(selectedFields[name]);
              } catch (e) {
                selectedFields[name] = [];
              }
            } else if (namedElement.classList.contains('numeric')) {
              try {
                selectedFields[name] = Number(Color.fromString(selectedFields[name]));
              } catch (e) {
                selectedFields[name] = 0;
              }
            }
          }
        }
      }

      return selectedFields;
    }

    /**
     * Copy currently selected field to the clipboard
     */
    performMassCopy({ command = '', selectedFields = null } = {}) {
      if (!selectedFields) {
        selectedFields = this.getSelectedFields();
        if (this.documentName === 'Token') {
          TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
        }
      }

      if (foundry.utils.isEmpty(selectedFields)) return false;

      const preset = new Preset({
        documentName: this.documentName,
        data: selectedFields,
        randomize: this.randomizeFields,
        addSubtract: this.addSubtractFields,
      });
      copyToClipboard(preset, command, this.isPrototype);
      return true;
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
          'form.global-delete-title',
        )}"><i class="far fa-times-octagon fa-2x"></i></a></div>`,
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
      html.on(
        'input',
        'textarea, input[type="text"], input[type="number"], range-picker, color-picker',
        onInputChange.bind(this),
      );
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
                    `<input name="${name}" class="range-value" type="number" step="any" value="${this.defaultValue}" min="${this.min}" max="${this.max}"></input>`,
                  ),
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
        `<div class="mass-edit-checkbox ${fieldType}">${randomControl}<input class="mass-edit-control" type="checkbox" data-dtype="Boolean"}></div>`,
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

    async _processPreset(preset) {
      // This will be called when a preset item is selected or JSON data is being directly applied
      // The code bellow handles it being applied to the current form

      // =====================
      // Module specific logic
      // =====================
      let timeoutRequired = false;

      const data = foundry.utils.flattenObject(preset.data[0]);

      // Monk's Active Tiles
      if ('flags.monks-active-tiles.actions' in data) {
        timeoutRequired = true;
        await this.baseDocument.setFlag('monks-active-tiles', 'actions', data['flags.monks-active-tiles.actions']);
      }

      if ('flags.monks-active-tiles.files' in data) {
        timeoutRequired = true;
        await this.baseDocument.setFlag('monks-active-tiles', 'files', data['flags.monks-active-tiles.files']);
      }

      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in data) {
        timeoutRequired = true;
        await this.baseDocument.setFlag('levels-3d-preview', 'shaders', data['flags.levels-3d-preview.shaders']);
      }

      // Limits
      if ('flags.limits.light.enabled' in data) {
        timeoutRequired = true;
        await this.baseDocument.update({ flags: { limits: foundry.utils.expandObject(data).flags.limits } });
      }

      if (this.documentName === 'Token') {
        timeoutRequired = TokenDataAdapter.modifyPresetData(this, data);
      }

      if (timeoutRequired) {
        setTimeout(() => {
          this._applyPreset(preset);
        }, 250);
        return;
      }

      this._applyPreset(preset);
    }

    /**
     * Apply preset to the form
     * @param {Preset} preset
     */
    _applyPreset(preset) {
      const form = $(this.form ?? this.element);

      const customMerge = (obj1, obj2) => {
        if (!obj2) return obj1;
        for (const [k, v] of Object.entries(obj2)) {
          obj1[k] = v;
        }
        return obj1;
      };

      this.randomizeFields = customMerge(this.randomizeFields, preset.randomize);
      this.addSubtractFields = customMerge(this.addSubtractFields, preset.addSubtract);
      selectRandomizerFields(form, this.randomizeFields);
      selectAddSubtractFields(form, this.addSubtractFields);

      const data = foundry.utils.flattenObject(preset.data[0]);
      GeneralDataAdapter.dataToForm(this.documentName, preset.data[0], data);
      for (const key of Object.keys(data)) {
        const el = form.find(`[name="${key}"]`);
        if (el.is(':checkbox')) {
          el.prop('checked', data[key]);
        } else {
          el.val(data[key]);
          // Elements such as FilePicker contain the name, but the actual input is a child element
          el.find('input').val(data[key]).trigger('change');
        }
        el.trigger('change');
      }

      // Make brush aware of randomized field changes
      Brush.refreshPreset();
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

    // We want to update fields used by brush control every time a field changes on the form
    _registerBrushRefreshListeners(html) {
      html.on('input', 'textarea, input[type="text"], input[type="number"]', () => Brush.refreshPreset());
      html.on('change', 'textarea, input, select', () => Brush.refreshPreset());
      html.on('paste', 'input', () => Brush.refreshPreset());
      html.on('click', 'button', () => Brush.refreshPreset());
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
        },
      );
    }

    _registerInputChangeCallback(html) {
      if (this.options.inputChangeCallback) {
        html.on('change', 'input, select, color-picker', async (event) => {
          setTimeout(() => this.options.inputChangeCallback(this.getSelectedFields()), 100);
        });
      }
    }

    /**
     * Toggle all ME checkboxes on/off when right-clicking tabs
     * @param {*} html
     */
    _registerNavigationTabMassSelect(html, selector = 'nav > .item') {
      // Select/Deselect all Mass Edit checkboxes when right-clicking the navigation tabs
      html.on('contextmenu', selector, (event) => {
        const tab = event.target.dataset?.tab;
        if (tab) {
          const group = $(event.target).closest('nav').attr('data-group');
          let meCheckboxes;
          if (group) {
            meCheckboxes = $(event.target)
              .closest('form')
              .find(
                `.tab[data-tab="${tab}"][data-group="${group}"], .matt-tab[data-tab="${tab}"][data-group="${group}"]`,
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

    _insertModuleSpecificFields(html) {
      // Monk's Active Tiles
      if (this.documentName === 'Tile' && game.modules.get('monks-active-tiles')?.active) {
        let chk = $(`
              <div class="form-group">
                <label>Mass Edit: ${localize(`form.actions`)}</label>
                <div class="form-fields">
                    <input type="hidden" name="MassEdit.insert.flags.monks-active-tiles.actions">
                </div>
              `);
        $(html).find('.matt-tab[data-tab="actions"]').prepend(chk);
        this._processFormGroup(chk, 'meInsert');

        chk = $(`
              <div class="form-group">
                <label>Mass Edit: ${localize(`form.images`)}</label>
                <div class="form-fields">
                    <input type="hidden" name="MassEdit.insert.flags.monks-active-tiles.files">
                </div>
              `);
        chk.insertBefore('.matt-tab[data-tab="images"] .images-group');
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

        const currentDDTint = getDDTint(this.baseDocument.object ?? this.baseDocument);
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

      if (this.documentName === 'AmbientLight') {
        const hiddenInput = $(`
          <div class="form-group">
            <label>Hidden</label>
            <div class="form-fields">
              <input type="checkbox" name="hidden" >
            </div>
          </div>
        `);
        $(html).find('[name="config.shadows"]').closest('.form-group').after(hiddenInput);
        this._processFormGroup(hiddenInput, 'meInsert');
      }
    }

    /**
     * Insert button to toggle auto-update on form changes
     * @param {*} html
     */
    _insertModUpdateCheckboxes(html) {
      if (this.options.massEdit && !this.options.simplified && !this.options.presetEdit) {
        const app = this;
        const preSelectAutoApply = game.settings.get(MODULE_ID, 'preSelectAutoApply');
        html.find('button[type="submit"]').each(function (index) {
          const button = $(this);
          const modButton = $(
            `<div class="me-mod-update" title="${localize(
              `form.immediate-update-title`,
            )}"><input type="checkbox" data-submit="${button.data('action')}"><i class="fas fa-cogs"></i></div>`,
          );
          modButton.on('change', (event) => {
            event.stopPropagation();
            const isChecked = event.target.checked;
            html.find('.me-mod-update > input').not(this).prop('checked', false);
            $(event.target).prop('checked', isChecked);
            app.modUpdate = isChecked;
            app.modUpdateType = $(event.target).data('submit');
          });

          if (index === 0 && preSelectAutoApply) {
            modButton.find('input[type="checkbox"]').prop('checked', true).trigger('change');
          }

          modButton.insertAfter(button);
        });
      }
    }

    _performOnInputChangeUpdate() {
      const selectedFields = this.getSelectedFields();
      performMassUpdate.call(this, selectedFields, this.meObjects, this.documentName, this.modUpdateType);
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

    _onClose(options = {}) {
      options.force = true;
      Brush.deactivate();
      if (this.linkedPresetForm) this.linkedPresetForm.close();
      return super._onClose?.(options);
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
        this.baseDocument,
        this.meObjects,
        this.documentName,
        selectedFields,
        this.randomizeFields,
        this.addSubtractFields,
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
        if (this.documentName === 'Actor' || this.documentName === 'JournalEntry') d = p;
        else if (this.documentName === 'Token' && p.actor) d = p.actor;
        else if (this.documentName === 'Note' && p.entry) d = p.entry;

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
      this.linkedPresetForm = new PresetBrowser(this, null, this.documentName, {
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
              } catch (e) {
                console.log(e);
              }

              if (!foundry.utils.isEmpty(json)) {
                const preset = new Preset({
                  documentName: this.documentName,
                  data: [json],
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
      const actions = options.actions ?? {};
      actions.meMacroGen = this._openMacroForm;
      actions.meBrush = this._activateBrushTool;
      actions.meEditPermissions = this._openEditPermissions;
      actions.mePresetBrowser = this._openPresetBrowser;
      actions.meJSON = this._openViewApplyJSON;
      actions.meTokenActor = this._showMassActorForm;
      [
        'meSearch',
        'meSearchAndEdit',
        'meApplyCurrentScene',
        'meApplyAllScenes',
        'meApply',
        'meApplyToPrototype',
      ].forEach((action) => {
        actions[action] = this.massUpdateObject;
      });
      options.actions = actions;
      foundry.utils.setProperty(options, 'form.handler', () => {});
    }

    _meGetSubmitButtons() {
      // Add submit buttons
      const buttons = [];

      if (this.options.massSelect) {
        buttons.push({
          type: 'submit',
          icon: 'fas fa-search',
          label: localize('FILES.Search', false),
          action: 'meSearch',
        });
        buttons.push({
          type: 'submit',
          icon: 'fas fa-search',
          label: localize('form.search-and-edit'),
          action: 'meSearchAndEdit',
        });
      } else if (this.documentName === 'Note' && !this.options.presetEdit) {
        // If we're editing notes and there are some on a different scene
        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id === canvas.scene.id).length) {
          buttons.push({
            type: 'submit',
            icon: 'far fa-save',
            label: localize('form.apply-on-current-scene'),
            action: 'meApplyCurrentScene',
          });
        }

        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id !== canvas.scene.id).length) {
          buttons.push({
            type: 'submit',
            label: localize('form.apply-on-all-scenes'),
            icon: 'fas fa-globe',
            action: 'meApplyAllScenes',
          });
        }
      } else {
        buttons.push({
          type: 'submit',
          label: localize('common.apply'),
          icon: 'far fa-save',
          action: 'meApply',
        });

        // Extra control for Tokens to update their Actors Token prototype
        if (
          this.documentName === 'Token' &&
          !this.options.simplified &&
          !this.meObjects[0].constructor?.name?.startsWith('PrototypeToken') &&
          !this.options.presetEdit
        ) {
          buttons.push({
            type: 'submit',
            label: localize('form.apply-update-proto'),
            icon: 'far fa-save',
            action: 'meApplyToPrototype',
          });
        }
      }

      return buttons;
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
      return controls;
    }
  }
  return BaseMassEditForm;
};

export const WithMassEditFormApplicationV2 = (cls) => {
  class MassEditForm extends cls {
    _attachFrameListeners() {
      super._attachFrameListeners();
      $(this.element).on('drop', async (event) => {
        const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event.originalEvent);
        if (dragData.type !== 'preset') return;
        this._applyPreset(await MassEdit.getPreset({ uuid: dragData.uuids[0], full: true }));
      });
    }

    _onRender() {
      super._onRender();
      injectVisibility(this);

      const html = $(this.element);
      this._injectGlobalDeleteButton(html);
      this._setStyle(html);
      this._activateAutoSelectListeners(html);
      this._processAllFormGroups(html);
      this._registerRandomizerListeners(html);
      this._registerBrushRefreshListeners(html);
      this._registerNumericalInputListeners(html);
      this._registerInputChangeCallback(html);
      this._registerNavigationTabMassSelect(html, 'nav.tabs > [data-action="tab"]');
      this._insertModUpdateCheckboxes(html);
      this._insertModuleSpecificFields(html);
      this._insertSpecialFields(html);
      this._registerMutateObserver(html);
    }

    get baseDocument() {
      return this.document;
    }

    /** @override */
    _getSubmitData() {
      const form = this.element;
      const formData = new foundry.applications.ux.FormDataExtended(form);
      const submitData = this._prepareSubmitData(null, form, formData);
      return submitData;
    }

    // Same internals as the original function, but with validation set to strict = false, to not throw errors
    /** @override */
    _prepareSubmitData(event, form, formData, updateData) {
      const submitData = this._processFormData(event, form, formData);
      if (updateData) {
        foundry.utils.mergeObject(submitData, updateData, { performDeletions: true });
        foundry.utils.mergeObject(submitData, updateData, { performDeletions: false });
      }

      const meInsertFields = submitData.MassEdit;
      this.document?.validate({ changes: submitData, clean: true, fallback: false, strict: false });
      if (meInsertFields) submitData.MassEdit = meInsertFields;
      return submitData;
    }

    /** @override */
    _getHeaderControls() {
      return [].concat(super._getHeaderControls()).concat(this._getMeControls());
    }

    // Special handling for Regions to prevent insertion of submit buttons
    async _preparePartContext(partId, context) {
      if (partId !== 'footer') return super._preparePartContext(partId, context);
      return context;
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.buttons = (context.buttons ?? []).filter((b) => b.type !== 'submit');
      context.buttons = context.buttons.concat(this._meGetSubmitButtons());
      return context;
    }

    async render(options = {}, _options = {}) {
      // Do not re-render the form if this is due to the document being updated
      // This is to prevent ME checkboxes from being reset.
      if (_options.renderContext?.startsWith('update')) return;
      return super.render(options, _options);
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
        this.preview = this.baseDocument.clone();
      }
      const data = super.getData(options);
      return data;
    }

    get baseDocument() {
      return this.object;
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
      this._registerBrushRefreshListeners(html);
      this._registerNumericalInputListeners(html);
      this._registerInputChangeCallback(html);
      this._registerNavigationTabMassSelect(html);
      this._removeFooterButtons(html);
      this._insertSubmitButtons(html);
      this._insertModUpdateCheckboxes(html);
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

    _insertSubmitButtons(html) {
      const buttons = this._meGetSubmitButtons();

      // Add submit buttons
      let htmlButtons = '';
      if (!this._meSubmitInserted) {
        this._meSubmitInserted = true;
        for (const button of buttons) {
          htmlButtons += `<button class="me-submit" type="submit" data-action="${button.action}"><i class="${button.icon}"></i> ${button.label}</button>`;
        }
        if (this.options.massSelect && SUPPORTED_PLACEABLES.includes(this.documentName)) {
          htmlButtons += `<div class="me-mod-update" title="${localize(
            `form.global-search-title`,
          )}"><input type="checkbox" data-submit="world"><i class="far fa-globe"></i></div>`;
        }

        let footer = $(html).find('.sheet-footer').last();
        if (footer.length) {
          footer.append(htmlButtons);
        } else {
          footer = $(`<footer class="sheet-footer flexrow">${htmlButtons}</footer>`);
          $(html).closest('form').append(footer);
        }
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

    async _updateObject(event, formData) {
      await this.options.actions.meApply.call(this, event, event.submitter);

      // On v11 certain placeable will freeze the canvas layer if parent _updateObject is not called
      if (['Token', 'AmbientLight'].includes(this.documentName) && this.preview?.object) {
        this._resetPreview();
      }
    }

    _getHeaderButtons() {
      let buttons = super._getHeaderButtons().filter((b) => b.class !== 'configure-sheet');

      const controls = foundry.utils.deepClone(this._getMeControls());
      controls.forEach((ctrl) => {
        ctrl.onclick = this.options.actions[ctrl.action].bind(this);
        ctrl.label = '';
      });

      return controls.concat(buttons);
    }

    _removeFooterButtons(html) {
      // Remove all buttons in the footer
      html.find('.sheet-footer > button').remove();

      // Special handling for Walls sheet
      html.find('button[type="submit"]').remove();
    }

    // Some forms will manipulate themselves via modifying internal objects and re-rendering
    // In such cases we want to preserve the selected fields
    render(force, options = {}) {
      // If it's being re-rendered with an action "update" in means it's ClientDocumentMixin response to _onUpdate
      // We can ignore these
      if (options.action === 'update' || options.renderContext?.startsWith('update')) return;
      // Form hasn't been rendered yet, aka first render pass, ignore it
      if (!this.form) return super.render(force, options);

      // Fetch the currently selected fields before re-rendering
      const selectedFields = this.getSelectedFields();
      const randomize = this.randomizeFields;
      const addSubtract = this.addSubtractFields;

      // Render, the selections will be wiped
      super.render(force, options);

      // Re-select fields, we're reusing preset functions here.
      // Timeout require for this module including others to apply their
      // modifications to the configuration window
      setTimeout(() => {
        if (this.form) {
          this._applyPreset(
            new Preset({
              data: selectedFields,
              randomize,
              addSubtract,
            }),
          );
        }
      }, 1000);
    }

    async close(options = {}) {
      super._onClose(options);
      if (['Token', 'AmbientLight'].includes(this.documentName) && this.preview?.object) {
        this._resetPreview();
      }
      return super.close(options);
    }
  }

  return MassEditForm;
};
