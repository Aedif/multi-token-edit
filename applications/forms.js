import { Brush } from '../scripts/brush.js';
import { injectFlagTab, injectVisibility } from '../scripts/fieldInjector.js';
import { IS_PRIVATE, showRandomizeDialog } from '../scripts/randomizer/randomizerForm.js';
import {
  applyRandomization,
  selectRandomizerFields,
} from '../scripts/randomizer/randomizerUtils.js';
import { applyDDTint, applyTMFXPreset, getDDTint } from '../scripts/tmfx.js';
import {
  applyAddSubtract,
  flagCompare,
  getCommonData,
  getData,
  getDocumentName,
  hasFlagRemove,
  mergeObjectPreserveDot,
  panToFitPlaceables,
  selectAddSubtractFields,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_HISTORY_DOCS,
  SUPPORTED_PLACEABLES,
  wildcardStringMatch,
} from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
import { GeneralDataAdapter, TokenDataAdapter } from './dataAdapters.js';
import MassEditHistory from './history.js';
import MacroForm from './macro.js';
import { SCENE_DOC_MAPPINGS, showMassActorForm, showMassEdit } from './multiConfig.js';
import MassEditPresets from './presets.js';

// ==================================
// ========= Applications ===========
// ==================================

export const WithMassEditForm = (cls) => {
  class MassEditForm extends cls {
    constructor(doc, docs, options) {
      super(doc, options);
      this.meObjects = docs;
      this.documentName =
        options.documentName ?? doc.document?.documentName ?? doc.documentName ?? 'NONE';
      this.commonData = options.commonData || {};
      this.randomizerEnabled = IS_PRIVATE && options.massEdit;
      this.massFormButtons = [{ title: 'Apply', value: 'permissions', icon: 'far fa-save' }];
    }

    // Add styles and controls to the sheet
    async activateListeners(html) {
      await super.activateListeners(html);
      injectVisibility(this);

      if (
        SUPPORTED_PLACEABLES.includes(this.documentName) ||
        SUPPORTED_COLLECTIONS.includes(this.documentName)
      )
        this._injectGlobalDeleteButton(html);

      this.randomizeFields = {};
      this.addSubtractFields = {};

      // Set style
      const [styleName, css] = getInUseStyle();
      $(html).prepend(`<style>${css}</style>`);

      // On any field being changed we want to automatically select the form-group to be included in the update
      html.on(
        'input',
        'textarea, input[type="text"], input[type="number"]',
        onInputChange.bind(this)
      );
      html.on('change', 'textarea, input, select', onInputChange.bind(this));
      html.on('paste', 'input', onInputChange.bind(this));
      html.on('click', 'button', onInputChange.bind(this));

      const rangeSpanToTextbox = game.settings.get('multi-token-edit', 'rangeToTextbox');

      // Attach classes and controls to all relevant form-groups
      const commonData = flattenObject(this.commonData || {});
      const insertRNGControl = this.randomizerEnabled;
      const processFormGroup = function (formGroup, typeOverride = null) {
        // We only want to attach extra controls if the form-group contains named fields
        if (!$(formGroup).find('[name]').length) return;
        if ($(formGroup).find('[name]:disabled').length) return;

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
      };

      // Add checkboxes to each form-group to control highlighting and which fields are to be saved
      $(html)
        .find('.form-group')
        .each(function (_) {
          processFormGroup(this);
        });
      const context = this;

      // Register randomize listener if enabled
      if (this.randomizerEnabled) {
        $(html).on('contextmenu', '.mass-edit-checkbox', (event) => {
          showRandomizeDialog($(event.target).closest('.form-group'), context);
        });
      }

      // Register numerical input listeners to toggle between subtract, and add modes
      $(html).on(
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
          Brush.refreshFields();
        }
      );

      // Remove all buttons in the footer
      $(html).find('.sheet-footer > button').remove();

      // Special handling for Walls sheet
      $(html).find('button[type="submit"]').remove();

      // Add submit buttons
      let htmlButtons = '';
      for (const button of this.massFormButtons) {
        htmlButtons += `<button type="submit" value="${button.value}"><i class="${button.icon}"></i> ${button.title}</button>`;

        // Auto update control
        if (this.options.massEdit && !this.options.simplified)
          htmlButtons += `<div class="me-mod-update" title="${game.i18n.localize(
            'multi-token-edit.form.immediate-update-title'
          )}"><input type="checkbox" data-submit="${
            button.value
          }"><i class="fas fa-cogs"></i></div>`;
      }
      if (this.options.massSelect && SUPPORTED_PLACEABLES.includes(this.documentName)) {
        htmlButtons += `<div class="me-mod-update" title="${game.i18n.localize(
          'multi-token-edit.form.global-search-title'
        )}"><input type="checkbox" data-submit="world"><i class="far fa-globe"></i></div>`;
      }

      let footer = $(html).find('.sheet-footer');
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

      if (this.options.inputChangeCallback) {
        html.on('change', 'input, select', async (event) => {
          setTimeout(() => this.options.inputChangeCallback(this.getSelectedFields()), 100);
        });
      }

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

      // =====================
      // Module specific logic
      // =====================

      // Monk's Active Tiles
      if (this.documentName === 'Tile' && this._createAction) {
        let chk = $(`
          <div class="form-group">
            <label>Mass Edit: Actions</label>
            <div class="form-fields">
                <input type="hidden" name="flags.monks-active-tiles.actions">
            </div>
          `);
        $(html).find('.matt-tab[data-tab="trigger-actions"]').prepend(chk);
        processFormGroup(chk, 'meInsert');

        chk = $(`
          <div class="form-group">
            <label>Mass Edit: Images</label>
            <div class="form-fields">
                <input type="hidden" name="flags.monks-active-tiles.files">
            </div>
          `);
        chk.insertBefore('.matt-tab[data-tab="trigger-images"] .files-list');
        processFormGroup(chk, 'meInsert');
      }

      // 3D Canvas
      if ((this.documentName === 'Tile' || this.documentName === 'Token') && game.Levels3DPreview) {
        let chk = $(`
          <div class="form-group">
            <label>Mass Edit: Shaders</label>
            <div class="form-fields">
                <input type="hidden" name="flags.levels-3d-preview.shaders">
            </div>
          `);
        $(html).find('#shader-config').after(chk);
        processFormGroup(chk, 'meInsert');
      }
      //

      // =====================
      // = Additional Fields =
      // =====================

      // // Token Magic FX
      if (
        (this.documentName === 'Tile' || this.documentName === 'Token') &&
        !this.options?.simplified &&
        game.modules.get('tokenmagic')?.active &&
        game.settings.get('multi-token-edit', 'tmfxFieldsEnable')
      ) {
        let content = '<datalist id="tmfxPresets"><option value="DELETE ALL">';
        TokenMagic.getPresets().forEach((p) => (content += `<option value="${p.name}">`));
        content += `</datalist><input list="tmfxPresets" name="tokenmagic.preset">`;

        let chk = $(`
          <div class="form-group">
            <label>Preset <span class="units">(TMFX)</span></label>
            <div class="form-fields">
              ${content}
            </div>
          `);
        $(html).find('[name="texture.tint"]').closest('.form-group').after(chk);
        processFormGroup(chk, 'meInsert');

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
        processFormGroup(chk, 'meInsert');
      }

      if (this.documentName === 'Tile') {
        let scaleInput = $(`
        <div class="form-group slim">
          <label>Scale <span class="units">(Ratio)</span></label>
          <div class="form-fields">
            <label>Width | Height</label>
            <input type="number" value="1" step="any" name="massedit.scale" min="0">
          </div>
        </div>`);
        $(html).find('[name="width"]').closest('.form-group').before(scaleInput);
        processFormGroup(scaleInput, 'meInsert');

        if (IS_PRIVATE) {
          scaleInput = $(`
          <div class="form-group slim">
            <label>Tile Scale <span class="units">(Ratio)</span></label>
            <div class="form-fields">
              <label>Horizontal | Vertical</label>
              <input type="number" value="1" step="any" name="massedit.texture.scale" min="0">
            </div>
          </div>`);
          $(html).find('[name="texture.scaleX"]').closest('.form-group').before(scaleInput);
          processFormGroup(scaleInput, 'meInsert');
        }
      }

      // Resizes the window
      this.setPosition();
      this.element[0].style.height = ''; // don't want a statically set height

      // TokenConfig might be changed by some modules after activateListeners is processed
      // Look out for these updates and add checkboxes for any newly added form-groups
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

      if (this.documentName === 'Token') {
        $(html)
          .find('fieldset.detection-mode')
          .each(function (_) {
            $(this).wrap('<div class="form-group"></div>');
          });
      }

      // Inject Flags tab
      injectFlagTab(this);
    }

    getSelectedFields(formData) {
      if (!formData) formData = this._getSubmitData();

      // Some module flags get un-flattened
      // Flatten them again before attempting to find selected
      formData = flattenObject(formData);

      // Modules Specific Logic
      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in formData) {
        formData['flags.levels-3d-preview.shaders'] = this.object.getFlag(
          'levels-3d-preview',
          'shaders'
        );
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
      const form = $(this.form);
      const addSubtractFields = this.addSubtractFields;
      const app = this;

      form.find('.form-group').each(function (_) {
        const me_checkbox = $(this).find('.mass-edit-checkbox > input');
        if (me_checkbox.length && me_checkbox.is(':checked')) {
          $(this)
            .find('[name]')
            .each(function (_) {
              const name = $(this).attr('name');

              // Module specific logic
              if (name === 'flags.limits') {
                const limits = flattenObject(app.object.toObject().flags['limits'] ?? {});
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

              if (getType(selectedFields[name]) === 'string') {
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

      // // Module specific logic
      // if (game.modules.get('barbrawl')?.active) {
      //   for (const [k, v] of Object.entries(selectedFields)) {
      //     if (k.startsWith('flags.barbrawl')) {
      //       let details = form.find(`[name="${k}"]`).closest('.indent-details');
      //       let id = details.attr('id');
      //       if (id) selectedFields[`flags.barbrawl.resourceBars.${id}.id`] = id;
      //     }
      //   }
      // }
      // // End of Module specific logic

      return selectedFields;
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

    _injectGlobalDeleteButton(html) {
      const control = $(
        `<div class="me-global-delete"><a title="${game.i18n.localize(
          'multi-token-edit.form.global-delete-title'
        )}"><i class="far fa-times-octagon fa-2x"></i></a></div>`
      );
      control.click((event) => {
        new Dialog({
          title: 'Confirm',
          content: `
          <h2 style="color: red; text-align: center;">DELETING [${this.meObjects.length}] ${this.documentName}s</h2>
          <p>Do you want to proceed?</p>`,
          buttons: {
            buttonA: {
              label: 'Yes',
              callback: () => {
                this.meObjects.forEach((obj) => {
                  let doc = obj.document ?? obj;
                  if (doc.delete) doc.delete();
                });
                this.close();
              },
            },
            no: {
              label: 'No',
            },
          },
          default: 'buttonA',
        }).render(true);
      });
      html.closest('form').append(control);
    }
  }

  return MassEditForm;
};

export const WithMassConfig = (docName = 'NONE') => {
  let cls;
  const sheets = CONFIG[docName]?.sheetClasses;
  if (!sheets) {
    cls = FormApplication;
  } else if (docName === 'Drawing') {
    if (CONFIG.Drawing.sheetClasses.e) {
      cls = CONFIG.Drawing.sheetClasses.e['core.DrawingConfig'].cls;
    } else {
      cls = CONFIG.Drawing.sheetClasses.base['core.DrawingConfig'].cls;
    }
  } else if (docName === 'Actor') {
    cls = FormApplication;
  } else {
    cls = sheets.base[`core.${docName}Config`].cls;
  }

  const MEF = WithMassEditForm(cls);

  class MassConfig extends MEF {
    constructor(target, docs, options) {
      if (options.massSelect) options.randomizerEnabled = false;
      const docName = options.documentName ?? getDocumentName(target);
      if (!options.commonData) options.commonData = getCommonDocData(docs, docName);

      super(target.document ? target.document : target, docs, options);
      this.docName = docName;

      // Add submit buttons
      let buttons = [];
      if (this.options.massSelect) {
        buttons = [
          { title: 'Search', value: 'search', icon: 'fas fa-search' },
          { title: 'Search and Edit', value: 'searchAndEdit', icon: 'fas fa-search' },
        ];
      } else if (this.documentName === 'Note') {
        // If we're editing notes and there are some on a different scene
        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id === canvas.scene.id).length) {
          buttons.push({
            title: 'Apply on Current Scene',
            value: 'currentScene',
            icon: 'far fa-save',
          });
        }
        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id !== canvas.scene.id).length) {
          buttons.push({
            title: 'Apply on ALL Scenes',
            value: 'allScenes',
            icon: 'fas fa-globe',
          });
        }
      } else {
        buttons = [{ title: 'Apply Changes', value: 'apply', icon: 'far fa-save' }];
        // Extra control for Tokens to update their Actors Token prototype
        if (
          this.documentName === 'Token' &&
          !this.options.simplified &&
          !this.meObjects[0].constructor?.name?.startsWith('PrototypeToken')
        ) {
          buttons.push({
            title: 'Apply and Update Proto',
            value: 'applyToPrototype',
            icon: 'far fa-save',
          });
        }
      }

      this.massFormButtons = buttons;
    }

    async _updateObject(event, formData) {
      await this.massUpdateObject(event, formData);

      // On v11 certain placeable will freeze the canvas layer if parent _updateObject is not called
      if (
        !isNewerVersion('11', game.version) &&
        ['Token', 'AmbientLight'].includes(this.docName) &&
        this.preview?.object
      ) {
        this._resetPreview();
      }
    }

    async massUpdateObject(event, formData) {
      if (!event.submitter?.value) return;

      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields(formData);

      // Detection modes may have been selected out of order
      // Fix that here
      if (this.docName === 'Token') {
        TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
      }

      // Search and Select mode
      if (this.options.massSelect) {
        return performMassSearch(event.submitter.value, this.docName, selectedFields, {
          scope: this.modUpdate ? this.modUpdateType : null,
        });
      } else {
        // Edit mode
        return performMassUpdate.call(
          this,
          selectedFields,
          this.meObjects,
          this.docName,
          event.submitter.value
        );
      }
    }

    _performOnInputChangeUpdate() {
      const selectedFields = this.getSelectedFields();
      performMassUpdate.call(
        this,
        selectedFields,
        this.meObjects,
        this.docName,
        this.modUpdateType
      );
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

      if (isEmpty(selectedFields)) return false;
      if (!isEmpty(this.randomizeFields)) {
        selectedFields['mass-edit-randomize'] = deepClone(this.randomizeFields);
      }
      if (!isEmpty(this.addSubtractFields)) {
        selectedFields['mass-edit-addSubtract'] = deepClone(this.addSubtractFields);
      }

      copyToClipboard(this.documentName, selectedFields, command, this.isPrototype);
      return true;
    }

    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();

      // Macro Generator
      if (
        SUPPORTED_PLACEABLES.includes(this.docName) ||
        SUPPORTED_COLLECTIONS.includes(this.docName)
      ) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-macro',
          icon: 'fas fa-terminal',
          onclick: () => {
            const selectedFields = this.getSelectedFields();
            new MacroForm(
              this.object,
              this.meObjects,
              this.docName,
              selectedFields,
              this.randomizeFields,
              this.addSubtractFields
            ).render(true);
          },
        });
      }

      // Brush Tool
      if (SUPPORTED_PLACEABLES.includes(this.docName)) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-brush',
          icon: 'fas fa-paint-brush',
          onclick: () => {
            Brush.activate({ app: this });
          },
        });
      }

      // Edit Permissions
      if (['Token', 'Note', 'Actor'].includes(this.docName)) {
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

        if (docs.length)
          buttons.unshift({
            label: '',
            class: 'mass-edit-permissions',
            icon: 'fas fa-lock fa-fw',
            onclick: () => {
              let MP = WithMassPermissions();
              new MP(docs[0], docs).render(true);
            },
          });
      }

      // Open Preset form
      buttons.unshift({
        label: '',
        class: 'mass-edit-presets',
        icon: 'fas fa-box',
        onclick: (ev) =>
          new MassEditPresets(
            this,
            async (preset) => this._processPreset(preset),
            this.docName
          ).render(true),
      });

      // Apply JSON data onto the form
      buttons.unshift({
        label: '',
        class: 'mass-edit-apply',
        icon: 'far fa-money-check-edit',
        onclick: (ev) => {
          let selFields = expandObject(this.getSelectedFields());
          if (isEmpty(selFields)) selFields = '';
          else selFields = JSON.stringify(selFields, null, 2);
          let content = `<textarea class="json" style="width:100%; height: 300px;">${selFields}</textarea>`;
          new Dialog({
            title: `Apply JSON Data`,
            content: content,
            buttons: {
              apply: {
                label: 'Apply',
                callback: (html) => {
                  let json = {};
                  try {
                    json = JSON.parse(html.find('.json').val());
                  } catch (e) {}

                  if (!isEmpty(json)) {
                    this._processPreset(flattenObject(json));
                  }
                },
              },
            },
          }).render(true);
        },
      });

      // History
      if (
        game.settings.get('multi-token-edit', 'enableHistory') &&
        SUPPORTED_HISTORY_DOCS.includes(this.docName)
      ) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-history',
          icon: 'fas fa-history',
          onclick: () => {
            new MassEditHistory(this.docName, async (preset) => this._processPreset(preset)).render(
              true
            );
          },
        });
      }

      // Toggle between Token and Actor forms
      if (this.documentName === 'Token' && this.meObjects.filter((t) => t.actor).length) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-actors',
          icon: 'fas fa-user',
          onclick: () => {
            if (
              showMassActorForm(this.meObjects, {
                massEdit: this.options.massEdit,
              })
            ) {
              this.close();
            }
          },
        });
      }

      return buttons;
    }

    async activateListeners(html) {
      await super.activateListeners(html);
      // We want to update fields used by brush control every time a field changes on the form
      html.on('input', 'textarea, input[type="text"], input[type="number"]', () =>
        Brush.refreshFields()
      );
      html.on('change', 'textarea, input, select', () => Brush.refreshFields());
      html.on('paste', 'input', () => Brush.refreshFields());
      html.on('click', 'button', () => Brush.refreshFields());
    }

    async close(options = {}) {
      Brush.deactivate();
      options.force = true;

      if (
        !isNewerVersion('11', game.version) &&
        ['Token', 'AmbientLight'].includes(this.docName) &&
        this.preview?.object
      ) {
        this._resetPreview();
      }
      return super.close(options);
    }

    // Some forms will manipulate themselves via modifying internal objects and re-rendering
    // In such cases we want to preserve the selected fields
    render(force, options = {}) {
      // If it's being re-rendered with an action "update" in means it's ClientDocumentMixin response to _onUpdate
      // We can ignore these
      if (options.action === 'update') return;
      // Form hasn't been rendered yet, aka first render pass, ignore it
      if (!this.form) return super.render(force, options);

      // Fetch the currently selected fields before re-rendering
      const selectedFields = this.getSelectedFields();
      selectedFields['mass-edit-randomize'] = this.randomizeFields;
      selectedFields['mass-edit-addSubtract'] = this.addSubtractFields;

      // Render, the selections will be wiped
      super.render(force, options);

      // Re-select fields, we're reusing preset functions here.
      // Timeout require for this module including others to apply their
      // modifications to the configuration window
      setTimeout(() => {
        if (this.form) {
          this._applyPreset(selectedFields);
        }
      }, 1000);
    }

    async _processPreset(preset) {
      // This will be called when a preset or history item is selected or JSON data is being directly applied
      // The code bellow handles it being applied to the current form

      // =====================
      // Module specific logic
      // =====================
      let timeoutRequired = false;

      // Monk's Active Tiles
      if ('flags.monks-active-tiles.actions' in preset) {
        timeoutRequired = true;
        await this.object.setFlag(
          'monks-active-tiles',
          'actions',
          preset['flags.monks-active-tiles.actions']
        );
      }

      if ('flags.monks-active-tiles.files' in preset) {
        timeoutRequired = true;
        await this.object.setFlag(
          'monks-active-tiles',
          'files',
          preset['flags.monks-active-tiles.files']
        );
      }

      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in preset) {
        timeoutRequired = true;
        await this.object.setFlag(
          'levels-3d-preview',
          'shaders',
          preset['flags.levels-3d-preview.shaders']
        );
      }

      // Limits
      if ('flags.limits.light.enabled' in preset) {
        timeoutRequired = true;
        await this.object.update({ flags: { limits: expandObject(preset).flags.limits } });
      }

      if (this.documentName === 'Token') {
        timeoutRequired = TokenDataAdapter.presetModify(this, preset);
      }

      if (timeoutRequired) {
        setTimeout(() => {
          this._applyPreset(preset);
        }, 250);
        return;
      }

      this._applyPreset(preset);
    }

    _applyPreset(preset) {
      const form = $(this.form);

      const customMerge = (obj1, obj2) => {
        if (!obj2) return obj1;
        for (const [k, v] of Object.entries(obj2)) {
          obj1[k] = v;
        }
        return obj1;
      };

      this.randomizeFields = customMerge(this.randomizeFields, preset['mass-edit-randomize']);
      this.addSubtractFields = customMerge(this.addSubtractFields, preset['mass-edit-addSubtract']);
      selectRandomizerFields(form, this.randomizeFields);
      selectAddSubtractFields(form, this.addSubtractFields);

      for (const key of Object.keys(preset)) {
        const el = form.find(`[name="${key}"]`);
        if (el.is(':checkbox')) {
          el.prop('checked', preset[key]);
        } else {
          el.val(preset[key]);
        }
        el.trigger('change');
      }

      // Make brush aware of randomized field changes
      Brush.refreshFields();
    }

    get title() {
      if (this.options.massSelect) return `Mass-${this.documentName} SEARCH`;
      return `Mass-${this.documentName} EDIT [ ${this.meObjects.length} ]`;
    }
  }

  const constructorName = `Mass${docName}Config`;
  Object.defineProperty(MassConfig.prototype.constructor, 'name', { value: constructorName });
  return MassConfig;
};

// ====================
// ===== UTILS ========
// ====================

export function pasteDataUpdate(docs, preset, suppressNotif = false) {
  if (!docs || !docs.length) return false;

  let docName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;
  let data = preset ? deepClone(preset) : deepClone(getClipboardData(docName));
  let applyType;

  // Special handling for Tokens/Actors
  if (!preset) {
    if (docName === 'Token') {
      if (!data) {
        data = getClipboardData('TokenProto');
        applyType = 'applyToPrototype';
      }

      if (!data) {
        data = getClipboardData('Actor');
        docName = 'Actor';
        docs = docs.filter((d) => d.actor).map((d) => d.actor);
      }
    }
  }

  if (data) {
    const context = { meObjects: docs };
    if (data['mass-edit-randomize']) {
      context.randomizeFields = data['mass-edit-randomize'];
      delete data['mass-edit-randomize'];
    }
    if (data['mass-edit-addSubtract']) {
      context.addSubtractFields = data['mass-edit-addSubtract'];
      delete data['mass-edit-addSubtract'];
    }
    performMassUpdate.call(context, data, docs, docName, applyType);
    if (!suppressNotif)
      ui.notifications.info(
        game.i18n.format('multi-token-edit.clipboard.paste', {
          documentName: docName,
          number: docs.length,
        })
      );

    return true;
  }
  return false;
}

export function performMassSearch(
  command,
  docName,
  selectedFields,
  { scope = null, selected = null, control = true, pan = true } = {}
) {
  const found = [];

  console.log(selectedFields);

  if (scope === 'selected') {
    performDocSearch(selected, docName, selectedFields, found);
  } else if (SUPPORTED_COLLECTIONS.includes(docName)) {
    performDocSearch(Array.from(game.collections.get(docName)), docName, selectedFields, found);
  } else {
    let scenes = [];
    if (scope === 'world') scenes = Array.from(game.scenes);
    else if (canvas.scene) scenes = [canvas.scene];

    for (const scene of scenes) {
      performMassSearchScene(scene, docName, selectedFields, found);
    }
  }

  // Select found placeables/documents
  if (control) {
    // First release/de-select the currently selected placeable on the current scene
    canvas.activeLayer.controlled.map((c) => c).forEach((c) => c.release());

    setTimeout(() => {
      found.forEach((f) => {
        let obj = f.object ?? f;
        if (obj.control) obj.control({ releaseOthers: false });
      });

      if (pan && found.length && game.settings.get('multi-token-edit', 'panToSearch')) {
        panToFitPlaceables(found);
      }
    }, 100);
  }
  if (command === 'searchAndEdit') {
    setTimeout(() => {
      showMassEdit(found, docName);
    }, 500);
  }
  return found;
}

function performMassSearchScene(scene, docName, selectedFields, found) {
  const docs = Array.from(scene[SCENE_DOC_MAPPINGS[docName]]);
  performDocSearch(docs, docName, selectedFields, found);
}

function performDocSearch(docs, docName, selectedFields, found) {
  // Next select objects that match the selected fields
  for (const c of docs) {
    let matches = true;
    const data = flattenObject(getData(c).toObject());

    // Special processing for some placeable types
    // Necessary when form data is not directly mappable to placeable
    GeneralDataAdapter.dataToForm(docName, c, data);

    for (const [k, v] of Object.entries(selectedFields)) {
      // Special handling for flags
      if (k.startsWith('flags.')) {
        if (!flagCompare(data, k, v)) {
          matches = false;
          break;
        }
        // Special handling for empty strings and undefined
      } else if ((v === '' || v == null) && (data[k] !== '' || data[k] != null)) {
        // matches
      } else if (typeof v === 'string' && v.includes('*') && wildcardStringMatch(v, data[k])) {
        // Wildcard matched
      } else if (data[k] != v) {
        // Detection mode keys cannot be treated in isolation
        // We skip them here and will check them later
        if (docName === 'Token') {
          if (k.startsWith('detectionModes')) {
            continue;
          }
        }

        matches = false;
        break;
      }
    }
    if (matches) {
      // We skipped detectionMode matching in the previous step and do it now instead
      if (docName === 'Token') {
        const modes = Object.values(
          foundry.utils.expandObject(selectedFields)?.detectionModes || {}
        );

        if (!TokenDataAdapter.detectionModeMatch(modes, c.detectionModes)) {
          continue;
        }
      }

      found.push(c);
    }
  }
}

export async function performMassUpdate(data, objects, docName, applyType) {
  objects = objects.map((o) => o.document ?? o);
  if (this.options?.simplified) {
    if (this.options.callback) this.options.callback(data);
    return;
  }
  if (isEmpty(data)) {
    if (this.callbackOnUpdate) {
      this.callbackOnUpdate(objects);
    }
    return;
  }

  // Update docs
  const updates = [];
  const context = {};

  const total = objects.length;
  for (let i = 0; i < total; i++) {
    const update = deepClone(data);
    update._id = objects[i].id;

    // push update
    updates.push(update);
  }

  // If history is enabled we'll want to attach additional controls to the updates
  // so that they can be tracked.
  if (game.settings.get('multi-token-edit', 'enableHistory')) {
    context['mass-edit-randomize'] = [deepClone(this.randomizeFields)];
    context['mass-edit-addSubtract'] = [deepClone(this.addSubtractFields)];
  }

  // Applies randomization
  if (this) applyRandomization(updates, objects, this.randomizeFields);
  if (this) applyAddSubtract(updates, objects, docName, this.addSubtractFields);

  // Special processing for some placeable types
  // Necessary when form data is not directly mappable to placeable
  for (let i = 0; i < total; i++) {
    GeneralDataAdapter.formToData(docName, objects[i], updates[i]);
  }

  await checkApplySpecialFields(docName, updates, objects);

  if (docName === 'Actor') {
    // Perform Updates
    // There is a lot of wonkiness related to updating of real/synthetic actors. It's probably best
    // to simply update the Actors directly

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      delete update._id;
      if (this.options?.tokens) this.options.tokens[i].actor.update(update);
      else objects[i].update(update);
    }
  } else if (docName === 'Scene') {
    Scene.updateDocuments(updates, context);
  } else if (docName === 'PlaylistSound') {
    for (let i = 0; i < objects.length; i++) {
      delete updates[i]._id;
      objects[i].update(updates[i], context);
    }
  } else if (docName === 'Note') {
    // Notes can be updated across different scenes
    const splitUpdates = {};
    for (let i = 0; i < updates.length; i++) {
      const scene = objects[i].scene ?? objects[i].parent;
      if (applyType === 'currentScene' && scene.id !== canvas.scene.id) continue;
      if (!(scene.id in splitUpdates)) {
        splitUpdates[scene.id] = { scene: scene, updates: [] };
      }
      splitUpdates[scene.id].updates.push(updates[i]);
    }
    for (const sceneUpdate of Object.values(splitUpdates)) {
      sceneUpdate.scene.updateEmbeddedDocuments(docName, sceneUpdate.updates, context);
    }
  } else if (!this.isPrototype && SUPPORTED_PLACEABLES.includes(docName)) {
    const splitUpdates = {};
    for (let i = 0; i < updates.length; i++) {
      const scene = objects[i].parent;
      if (!splitUpdates[scene.id]) splitUpdates[scene.id] = [];
      splitUpdates[scene.id].push(updates[i]);
    }

    for (const sceneId of Object.keys(splitUpdates)) {
      game.scenes.get(sceneId)?.updateEmbeddedDocuments(docName, splitUpdates[sceneId], context);
    }
  } else if (SUPPORTED_COLLECTIONS.includes(docName)) {
    objects[0].constructor?.updateDocuments(updates, context);
  } else {
    // Note a placeable or otherwise specially handled doc type
    // Simply merge the fields directly into the object
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      delete update._id;
      mergeObjectPreserveDot(objects[i], mergeObject(objects[i], update));
    }
    if (this.callbackOnUpdate) {
      this.callbackOnUpdate(objects);
    }
  }

  // May need to also update Token prototypes
  if ((applyType === 'applyToPrototype' || this.isPrototype) && docName === 'Token') {
    const actorUpdates = {};
    for (let i = 0; i < objects.length; i++) {
      const actor = objects[i].actor;
      if (actor) actorUpdates[actor.id] = { _id: actor.id, prototypeToken: updates[i] };
    }
    if (!isEmpty(actorUpdates)) {
      const updates = [];
      for (const id of Object.keys(actorUpdates)) {
        updates.push(actorUpdates[id]);
      }
      Actor.updateDocuments(updates);
    }
  }
}

export async function checkApplySpecialFields(docName, updates, objects) {
  // Token Magic FX specific processing
  if (typeof TokenMagic !== 'undefined' && (docName === 'Token' || docName === 'Tile')) {
    for (let i = 0; i < updates.length; i++) {
      if ('tokenmagic.ddTint' in updates[i]) {
        await applyDDTint(objects[i], updates[i]['tokenmagic.ddTint']);
      }
      if ('tokenmagic.preset' in updates[i]) {
        await applyTMFXPreset(
          objects[i],
          updates[i]['tokenmagic.preset'],
          this?.addSubtractFields?.['tokenmagic.preset']?.method === 'subtract'
        );
      }
    }
  }
}

// Toggle checkbox if input has been detected inside it's form-group
async function onInputChange(event) {
  if (event.target.className === 'mass-edit-control') {
    if (!event.target.checked) {
      // If the checkbox has been unchecked we may need to remove highlighting from tabs
      deselectTabs(event.target);
      return;
    }
  }

  const meChk = $(event.target).closest('.form-group').find('.mass-edit-checkbox input');
  meChk.prop('checked', true);

  // Highlight tabs if they exist
  selectTabs(meChk[0]);

  // Immediately update the placeables
  if (this && this.options.massEdit && this._performOnInputChangeUpdate && this.modUpdate)
    this._performOnInputChangeUpdate();
}

function selectTabs(target) {
  const tab = $(target).parent().closest('div.tab, div.matt-tab');
  if (tab.length) {
    tab
      .siblings('nav.tabs')
      .find(`[data-tab="${tab.attr('data-tab')}"]`)
      .addClass('mass-edit-tab-selected');
    selectTabs(tab[0]);
  }
}

function deselectTabs(target) {
  const tab = $(target).parent().closest('div.tab, div.matt-tab');
  if (tab.length && tab.find('.mass-edit-checkbox input:checked').length === 0) {
    tab
      .siblings('nav.tabs')
      .find(`[data-tab="${tab.attr('data-tab')}"]`)
      .removeClass('mass-edit-tab-selected');
    deselectTabs(tab[0]);
  }
}

export function getObjFormData(obj, docName) {
  const data = flattenObject(getData(obj).toObject());

  // Special processing for some placeable types
  // Necessary when form data is not directly mappable to placeable
  GeneralDataAdapter.dataToForm(docName, obj, data);

  return data;
}

// Merge all data and determine what is common between the docs
function getCommonDocData(docs, docName) {
  if (!docName) getDocumentName(docs[0]);
  const objects = docs.map((d) => getObjFormData(d, docName));
  return getCommonData(objects);
}

export const WithMassPermissions = () => {
  let MEF = WithMassEditForm(DocumentOwnershipConfig);

  class MassPermissions extends MEF {
    constructor(target, docs, options = {}) {
      // Generate common permissions
      const data = getData(docs[0]);
      const commonData = flattenObject(data.ownership);

      const metaLevels = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

      // Permissions are only present if they differ from default, for simplicity simple add them before comparing
      const addMissingPerms = function (perms) {
        game.users.forEach((u) => {
          if (!(u.id in perms)) perms[u.id] = metaLevels.DEFAULT;
        });

        if (!('default' in perms)) perms.default = metaLevels.DEFAULT;
      };
      addMissingPerms(commonData);

      for (let i = 1; i < docs.length; i++) {
        const data = getData(docs[i]);
        const flatData = flattenObject(data.ownership);
        addMissingPerms(flatData);
        const diff = flattenObject(diffObject(commonData, flatData));
        for (const k of Object.keys(diff)) {
          delete commonData[k];
        }
      }

      options.commonData = commonData;
      options.massPermissions = true;

      super(target, docs, options);
    }

    async _updateObject(event, formData) {
      const selectedFields = this.getSelectedFields(formData);

      const metaLevels = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

      if (isEmpty(selectedFields)) return;

      const ids = new Set();
      const updates = [];
      for (const d of this.meObjects) {
        if (!ids.has(d.id)) {
          const data = getData(d);
          const ownership = foundry.utils.deepClone(data.ownership);

          for (let [user, level] of Object.entries(selectedFields)) {
            if (level === metaLevels.DEFAULT) delete ownership[user];
            else ownership[user] = level;
          }

          ids.add(d.id);
          updates.push({ _id: d.id, ownership: ownership });
        }
      }

      this.meObjects[0].constructor.updateDocuments(updates, {
        diff: false,
        recursive: false,
        noHook: true,
      });
    }

    get title() {
      return `Mass-${this.documentName} PERMISSIONS EDIT [ ${this.meObjects.length} ]`;
    }
  }

  return MassPermissions;
};

// ==================================
// ========== CLIPBOARD =============
// ==================================

const CLIPBOARD = {};

export function copyToClipboard(docName, data, command, isPrototype) {
  CLIPBOARD[docName] = data;

  // Special handling for Actors/Tokens
  if (docName === 'Token' && isPrototype) {
    CLIPBOARD['TokenProto'] = data;
  } else if (docName === 'Token') {
    if (command === 'copyProto') {
      delete CLIPBOARD['Token'];
      CLIPBOARD['TokenProto'] = data;
    }
  }

  // Also copy the fields to the game clipboard as plain text
  game.clipboard.copyPlainText(JSON.stringify(deepClone(data), null, 2));

  ui.notifications.info(
    game.i18n.format('multi-token-edit.clipboard.copy', {
      documentName: docName,
    })
  );
}

export function deleteFromClipboard(docName) {
  delete CLIPBOARD[docName];
  if (docName === 'Token') delete CLIPBOARD['TokenProto'];
}

export function getClipboardData(docName) {
  return CLIPBOARD[docName];
}
