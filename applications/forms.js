import { Brush } from '../scripts/brush.js';
import { injectVisibility } from '../scripts/fieldInjector.js';
import {
  IS_PRIVATE,
  applyRandomization,
  showRandomizeDialog,
  selectRandomizerFields,
} from '../scripts/private.js';
import { applyDDTint, applyTMFXPreset, getDDTint } from '../scripts/tmfx.js';
import {
  applyAddSubtract,
  emptyObject,
  flagCompare,
  getCommonData,
  getData,
  hasFlagRemove,
  mergeObjectPreserveDot,
  panToFitPlaceables,
  selectAddSubtractFields,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_HISTORY_DOCS,
  SUPPORTED_PLACEABLES,
  SUPPORT_SHEET_CONFIGS,
} from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
import { GeneralDataAdapter, TokenDataAdapter } from './dataAdapters.js';
import MassEditHistory from './history.js';
import MacroForm from './macro.js';
import { getLayerMappings, showMassActorForm, showMassConfig } from './multiConfig.js';
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
      this.randomizerEnabled = IS_PRIVATE && (options.massCopy || options.massEdit);
      this.massFormButtons = [{ title: 'Apply', value: 'permissions', icon: 'far fa-save' }];
    }

    // Add styles and controls to the sheet
    async activateListeners(html) {
      await super.activateListeners(html);
      injectVisibility(this);

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
      const processFormGroup = function (formGroup) {
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
        if (this.options.massEdit)
          htmlButtons += `<div class="me-update-on-input" title="${game.i18n.localize(
            'multi-token-edit.form.immediate-update-title'
          )}"><input type="checkbox" data-submit="${
            button.value
          }"><i class="fas fa-cogs"></i></div>`;
      }

      const footer = $(html).find('.sheet-footer');
      if (footer.length) {
        footer.append(htmlButtons);
      } else {
        $(html).closest('form').append(htmlButtons);
      }

      // Auto update listeners
      footer.find('.me-update-on-input > input').on('change', (event) => {
        event.stopPropagation();
        const isChecked = event.target.checked;
        footer.find('.me-update-on-input > input').not(this).prop('checked', false);
        $(event.target).prop('checked', isChecked);
        this.updateObjectsOnInput = isChecked;
        this.updateObjectOnInputType = event.target.dataset?.submit;
      });

      if (this.options.inputChangeCallback) {
        html.on('change', 'input, select', async (event) => {
          setTimeout(() => this.options.inputChangeCallback(this.getSelectedFields()), 100);
        });
      }

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
        processFormGroup(chk);

        chk = $(`
          <div class="form-group">
            <label>Mass Edit: Images</label>
            <div class="form-fields">
                <input type="hidden" name="flags.monks-active-tiles.files">
            </div>
          `);
        chk.insertBefore('.matt-tab[data-tab="trigger-images"] .files-list');
        processFormGroup(chk);
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
        processFormGroup(chk);
      }
      //

      // // Token Magic FX
      if (
        (this.documentName === 'Tile' || this.documentName === 'Token') &&
        game.modules.get('tokenmagic')?.active &&
        !isNewerVersion('10', game.version) &&
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
        processFormGroup(chk);

        const currentDDTint = getDDTint(this.object.object);
        chk = $(`
          <div class="form-group">
            <label>DungeonDraft Tint <span class="units">(TMFX)</span></label>
            <div class="form-fields">
              <input class="color" type="text" name="tokenmagic.ddTint" value="${currentDDTint}">
              <input type="color" value="${currentDDTint}" data-edit="tokenmagic.ddTint">
            </div>
          `);
        $(html).find('[name="texture.tint"]').closest('.form-group').after(chk);
        processFormGroup(chk);
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

      // Token _getSubmitData() performs conversions related to scale, we need to undo them here
      // so that named fields on the form match up and can be selected
      if (this.documentName === 'Token' && !isNewerVersion('10', game.version)) {
        if (formData['texture.scaleX']) {
          formData.scale = Math.abs(formData['texture.scaleX']);
          formData.mirrorX = formData['texture.scaleX'] < 0;
          formData.mirrorY = formData['texture.scaleY'] < 0;
        }
      } else if (this.documentName === 'Note' && !isNewerVersion('10', game.version)) {
        if (formData['texture.src']) {
          formData['icon.selected'] = formData['texture.src'];
          formData['icon.custom'] = formData['texture.src'];
        }
      }

      const selectedFields = {};
      const form = $(this.form);
      const addSubtractFields = this.addSubtractFields;

      form.find('.form-group').each(function (_) {
        const me_checkbox = $(this).find('.mass-edit-checkbox > input');
        if (me_checkbox.length && me_checkbox.is(':checked')) {
          $(this)
            .find('[name]')
            .each(function (_) {
              const name = $(this).attr('name');
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
            });
        }
      });

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
      if (!options.commonData) options.commonData = getCommonDocData(docs);

      super(target.document ? target.document : target, docs, options);

      // Add submit buttons
      let buttons = [];
      if (this.options.massSelect) {
        buttons = [
          { title: 'Search', value: 'search', icon: 'fas fa-search' },
          { title: 'Search and Edit', value: 'searchAndEdit', icon: 'fas fa-search' },
        ];
      } else if (this.options.massCopy) {
        buttons = [{ title: 'Copy', value: 'copy', icon: 'fas fa-copy' }];
        // Extra control for Tokens to update their Actors' Token prototype
        if (this.documentName === 'Token') {
          buttons.push({ title: 'Copy as Prototype', value: 'copyProto', icon: 'fas fa-copy' });
        }
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
        if (this.documentName === 'Token') {
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
      return this.massUpdateObject(event, formData);
    }

    async massUpdateObject(event, formData, { copyForm = false } = {}) {
      if (!event.submitter?.value) return;

      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields(formData);
      const docName = this.meObjects[0].document
        ? this.meObjects[0].document.documentName
        : this.meObjects[0].documentName;

      // Detection modes may have been selected out of order
      // Fix that here
      if (docName === 'Token') {
        TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
      }

      // Copy mode
      if (this.options.massCopy || copyForm) {
        this.performMassCopy(event.submitter.value, selectedFields, docName);
      }
      // Search and Select mode
      else if (this.options.massSelect) {
        this.performMassSearch(event.submitter.value, selectedFields, docName);
      } else {
        // Edit mode
        performMassUpdate.call(
          this,
          selectedFields,
          this.meObjects,
          docName,
          event.submitter.value
        );
      }
    }

    _performOnInputChangeUpdate() {
      const selectedFields = this.getSelectedFields();
      const docName = this.meObjects[0].document
        ? this.meObjects[0].document.documentName
        : this.meObjects[0].documentName;

      performMassUpdate.call(
        this,
        selectedFields,
        this.meObjects,
        docName,
        this.updateObjectOnInputType
      );
    }

    performMassCopy(command, selectedFields, docName) {
      if (emptyObject(selectedFields)) return;
      if (!emptyObject(this.randomizeFields)) {
        selectedFields['mass-edit-randomize'] = deepClone(this.randomizeFields);
      }
      if (!emptyObject(this.addSubtractFields)) {
        selectedFields['mass-edit-addSubtract'] = deepClone(this.addSubtractFields);
      }

      copyToClipboard(docName, selectedFields, command, this.isPrototype);
    }

    performMassSearch(command, selectedFields, docName) {
      const found = [];
      for (const layer of getLayerMappings()[docName]) {
        // First release/de-select the currently selected placeable on the scene
        canvas[layer].controlled.map((c) => c).forEach((c) => c.release());

        // Next select placeables that match the selected fields
        const placeables = canvas[layer].placeables.map((c) => c);
        for (const c of placeables) {
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
            c.control({ releaseOthers: false });
          }
        }
      }
      if (found.length && game.settings.get('multi-token-edit', 'panToSearch')) {
        panToFitPlaceables(found);
      }
      if (command === 'searchAndEdit') {
        showMassConfig(found);
      }
    }

    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      const docName = this.documentName;

      if (
        IS_PRIVATE &&
        !isNewerVersion('10', game.version) &&
        (SUPPORT_SHEET_CONFIGS.includes(docName) || SUPPORTED_COLLECTIONS.includes(docName))
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
              selectedFields,
              this.randomizeFields,
              this.addSubtractFields
            ).render(true);
          },
        });
      }

      if (SUPPORTED_PLACEABLES.includes(docName) && !isNewerVersion('10', game.version)) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-brush',
          icon: 'fas fa-paint-brush',
          onclick: () => {
            Brush.activate({ app: this });
          },
        });
      }

      buttons.unshift({
        label: ' ',
        class: 'mass-edit-json',
        icon: 'fas fa-code',
        onclick: () => {
          let content = `<textarea style="width:100%; height: 300px;">${JSON.stringify(
            this.getSelectedFields(),
            null,
            2
          )}</textarea>`;
          new Dialog({
            title: `Selected Fields`,
            content: content,
            buttons: {},
          }).render(true);
        },
      });

      if (['Token', 'Note', 'Actor'].includes(docName)) {
        let docs = [];
        const ids = new Set();
        for (const p of this.meObjects) {
          let d;
          if (docName === 'Actor' || docName === 'JournalEntry') d = p;
          else if (docName === 'Token' && p.actor) d = p.actor;
          else if (docName === 'Note' && p.entry) d = p.entry;

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

      buttons.unshift({
        label: '',
        class: 'mass-edit-presets',
        icon: 'fas fa-box',
        onclick: (ev) =>
          new MassEditPresets(this, async (preset) => this._processPreset(preset), docName).render(
            true
          ),
      });

      if (
        game.settings.get('multi-token-edit', 'enableHistory') &&
        SUPPORTED_HISTORY_DOCS.includes(docName)
      ) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-history',
          icon: 'fas fa-history',
          onclick: () => {
            new MassEditHistory(docName, async (preset) => this._processPreset(preset)).render(
              true
            );
          },
        });
      }

      if (this.documentName === 'Token' && this.meObjects.filter((t) => t.actor).length) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-actors',
          icon: 'fas fa-user',
          onclick: () => {
            if (
              showMassActorForm(this.meObjects, {
                massEdit: this.options.massEdit,
                massCopy: this.options.massCopy,
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
      // This will be called when a preset or history item is selected
      // The code bellow handled it being applied to the current form

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
      if (this.options.massCopy) return `Mass-${this.documentName} COPY`;
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
  if (!docs || !docs.length) return;

  let docName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;
  let data = preset ? deepClone(preset) : deepClone(CLIPBOARD[docName]);
  let applyType;

  // Special handling for Tokens/Actors
  if (!preset) {
    if (docName === 'Token') {
      if (!data) {
        data = CLIPBOARD['TokenProto'];
        applyType = 'applyToPrototype';
      }

      if (!data) {
        data = CLIPBOARD['Actor'];
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
    if (!suppressNotif) ui.notifications.info(`Pasted data onto ${docs.length} ${docName}s`);
  }
}

async function performMassUpdate(data, objects, docName, applyType) {
  if (emptyObject(data)) {
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

  // Token Magic FX specific processing
  if (typeof TokenMagic !== 'undefined' && (docName === 'Token' || docName === 'Tile')) {
    if ('tokenmagic.ddTint' in data) {
      for (let i = 0; i < updates.length; i++) {
        await applyDDTint(objects[i], updates[i]['tokenmagic.ddTint']);
      }
    }
    if ('tokenmagic.preset' in data) {
      for (let i = 0; i < updates.length; i++) {
        await applyTMFXPreset(
          objects[i],
          updates[i]['tokenmagic.preset'],
          this?.addSubtractFields?.['tokenmagic.preset']?.method === 'subtract'
        );
      }
    }
  }

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
    canvas.scene.updateEmbeddedDocuments(docName, updates, context);
  } else if (SUPPORTED_COLLECTIONS.includes(docName)) {
    objects[0].constructor?.updateDocuments(updates);
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
      if (actor) {
        if (isNewerVersion('10', game.version)) {
          actorUpdates[actor.id] = { _id: actor.id, token: updates[i] };
        } else {
          actorUpdates[actor.id] = { _id: actor.id, prototypeToken: updates[i] };
        }
      }
    }
    if (!emptyObject(actorUpdates)) {
      const updates = [];
      for (const id of Object.keys(actorUpdates)) {
        updates.push(actorUpdates[id]);
      }
      Actor.updateDocuments(updates);
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
  if (this._performOnInputChangeUpdate && this.updateObjectsOnInput)
    this._performOnInputChangeUpdate();
}

function selectTabs(target) {
  const tab = $(target).parent().closest('div.tab');
  if (tab.length) {
    tab
      .siblings('nav.tabs')
      .find(`[data-tab="${tab.attr('data-tab')}"]`)
      .addClass('mass-edit-tab-selected');
    selectTabs(tab[0]);
  }
}

function deselectTabs(target) {
  const tab = $(target).parent().closest('div.tab');
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
function getCommonDocData(docs) {
  const docName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;
  const objects = docs.map((d) => getObjFormData(d, docName));
  return getCommonData(objects);
}

export const WithMassPermissions = () => {
  let MEF = WithMassEditForm(
    isNewerVersion('10', game.version) ? PermissionControl : DocumentOwnershipConfig
  );

  class MassPermissions extends MEF {
    constructor(target, docs, options = {}) {
      // Generate common permissions
      const data = getData(docs[0]);
      const commonData = flattenObject(
        isNewerVersion('10', game.version) ? data.permission : data.ownership
      );

      const metaLevels = isNewerVersion('10', game.version)
        ? { DEFAULT: -1 }
        : CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

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
        const flatData = flattenObject(
          isNewerVersion('10', game.version) ? data.permission : data.ownership
        );
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

      const metaLevels = isNewerVersion('10', game.version)
        ? { DEFAULT: -1 }
        : CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

      if (emptyObject(selectedFields)) return;

      const ids = new Set();
      const updates = [];
      for (const d of this.meObjects) {
        if (!ids.has(d.id)) {
          const data = getData(d);
          const ownership = foundry.utils.deepClone(
            isNewerVersion('10', game.version) ? data.permission : data.ownership
          );

          for (let [user, level] of Object.entries(selectedFields)) {
            if (level === metaLevels.DEFAULT) delete ownership[user];
            else ownership[user] = level;
          }

          ids.add(d.id);
          if (isNewerVersion('10', game.version)) {
            updates.push({ _id: d.id, permission: ownership });
          } else {
            updates.push({ _id: d.id, ownership: ownership });
          }
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
  ui.notifications.info(`Copied ${docName} data to clipboard`);
}
