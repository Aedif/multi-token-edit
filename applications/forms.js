import {
  IS_PRIVATE,
  applyRandomization,
  showRandomizeDialog,
  selectRandomizerFields,
  applyAddSubtract,
  selectAddSubtractFields,
} from '../scripts/private.js';
import { emptyObject, flagCompare, getData, hasFlagRemove } from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
import { NoteDataAdapter, TokenDataAdapter } from './dataAdapters.js';
import { getLayerMappings, showMassConfig } from './multiConfig.js';
import MassEditPresets from './presets.js';

export const SUPPORTED_CONFIGS = [
  'Token',
  'Tile',
  'Drawing',
  'Wall',
  'AmbientLight',
  'AmbientSound',
  'MeasuredTemplate',
  'Note',
  'Scene',
];

// ==================================
// ========= Applications ===========
// ==================================

export const WithMassEditForm = (cls) => {
  class MassEditForm extends cls {
    constructor(doc, docs, options) {
      super(doc, options);
      this.placeables = docs;
      this.commonData = options.commonData || {};
      this.randomizerEnabled = IS_PRIVATE && (options.massCopy || options.massEdit);
      this.massFormButtons = [{ title: 'Apply', value: 'permissions', icon: 'far fa-save' }];
    }

    // Add styles and controls to the sheet
    async activateListeners(html) {
      await super.activateListeners(html);

      this.randomizeFields = {};
      this.addSubtractFields = {};
      const docName = this.placeables[0].document
        ? this.placeables[0].document.documentName
        : this.placeables[0].documentName;

      // Set style
      const [styleName, css] = getInUseStyle();
      $(html).prepend(`<style>${css}</style>`);

      // On any field being changed we want to automatically select the form-group to be included in the update
      $(html).on('change', 'input, select', onInputChange);
      $(html).on('click', 'button', onInputChange);

      // Attach classes and controls to all relevant form-groups
      const commonData = flattenObject(this.commonData || {});
      const insertRNGControl = this.randomizerEnabled;
      const processFormGroup = function (formGroup) {
        // We only want to attach extra controls if the form-group contains named fields
        if (!$(formGroup).find('[name]').length) return;

        // Check if fields within this form-group are part of common data or control a flag
        let fieldType = 'meCommon';
        if (commonData) {
          $(formGroup)
            .find('[name]')
            .each(function () {
              const name = $(this).attr('name');
              if (name.startsWith('flags.')) {
                fieldType = 'meFlag';
              } else if (!(name in commonData)) {
                fieldType = 'meDiff';
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
        'input[type=range], input[type=number], input[name="flags.tagger.tags"]',
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
            this.addSubtractFields[name] = ctrl;
          }

          // Select nearest mass edit checkbox
          onInputChange(event);
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
      }

      const footer = $(html).find('.sheet-footer');
      if (footer.length) {
        footer.append(htmlButtons);
      } else {
        $(html).closest('form').append(htmlButtons);
      }

      // =====================
      // Module specific logic
      // =====================

      // Monk's Active Tiles
      if (this.object.documentName === 'Tile' && this._createAction) {
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
      //

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

      if (docName === 'Token' || docName === 'Actor') {
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

      // Token _getSubmitData() performs conversions related to scale, we need to undo them here
      // so that named fields on the form match up and can be selected
      if (this.object.documentName === 'Token' && !isNewerVersion('10', game.version)) {
        if (formData['texture.scaleX']) {
          formData.scale = Math.abs(formData['texture.scaleX']);
          formData.mirrorX = formData['texture.scaleX'] < 0;
          formData.mirrorY = formData['texture.scaleY'] < 0;
        }
      } else if (this.object.documentName === 'Note' && !isNewerVersion('10', game.version)) {
        if (formData['texture.src']) {
          formData['icon.selected'] = formData['texture.src'];
          formData['icon.custom'] = formData['texture.src'];
        }
      }

      const selectedFields = {};
      const form = $(this.form);

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
              }
            });
        }
      });

      return selectedFields;
    }

    // Overriding here to prevent the underlying object from being updated as inputs change on the form
    // Relevant for AmbientLight, Tile, and Token sheets
    async _onChangeInput(event) {
      if (!['AmbientLight', 'Tile', 'Token'].includes(this.object.documentName)) {
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

export const WithMassConfig = (docName) => {
  let cls;
  if (docName === 'Actor') docName = 'Token';
  const sheets = CONFIG[docName].sheetClasses;
  if (docName === 'Drawing') {
    if (CONFIG.Drawing.sheetClasses.e) {
      cls = CONFIG.Drawing.sheetClasses.e['core.DrawingConfig'].cls;
    } else {
      cls = CONFIG.Drawing.sheetClasses.base['core.DrawingConfig'].cls;
    }
  } else {
    cls = sheets.base[`core.${docName}Config`].cls;
  }

  const MEF = WithMassEditForm(cls);

  class MassConfig extends MEF {
    constructor(target, docs, options) {
      if (options.massSelect) options.randomizerEnabled = false;
      options.commonData = getCommonData(docs);
      if (target instanceof Actor) {
        super(target.prototypeToken ? target.prototypeToken : target, docs, options);
      } else {
        super(target.document ? target.document : target, docs, options);
      }

      // Add submit buttons
      let buttons = [];
      if (this.options.massSelect) {
        buttons = [
          { title: 'Search', value: 'search', icon: 'fas fa-search' },
          { title: 'Search and Edit', value: 'searchAndEdit', icon: 'fas fa-search' },
        ];
      } else if (this.options.massCopy) {
        buttons = [{ title: 'Copy', value: 'copy', icon: 'fas fa-copy' }];
        // Extra control for Tokens to update their Actors Token prototype
        if (this.object.documentName === 'Token') {
          buttons.push({ title: 'Copy as Prototype', value: 'copyProto', icon: 'fas fa-copy' });
        }
      } else if (this.object.documentName === 'Note') {
        // If we're editing notes and there are some on a different scene
        if (this.placeables.filter((n) => (n.scene ?? n.parent).id === canvas.scene.id).length) {
          buttons.push({
            title: 'Apply on Current Scene',
            value: 'currentScene',
            icon: 'far fa-save',
          });
        }
        if (this.placeables.filter((n) => (n.scene ?? n.parent).id !== canvas.scene.id).length) {
          buttons.push({
            title: 'Apply on ALL Scenes',
            value: 'allScenes',
            icon: 'fas fa-globe',
          });
        }
      } else {
        buttons = [{ title: 'Apply Changes', value: 'apply', icon: 'far fa-save' }];
        // Extra control for Tokens to update their Actors Token prototype
        if (this.object.documentName === 'Token') {
          buttons.push({
            title: 'Apply and Update Prototypes',
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
      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields(formData);
      const docName = this.placeables[0].document
        ? this.placeables[0].document.documentName
        : this.placeables[0].documentName;

      // Detection modes may have been selected out of order
      // Fix that here
      if (docName === 'Token') {
        TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
      } else if (docName === 'Actor') {
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
          this.placeables,
          docName,
          event.submitter.value
        );
      }
    }

    performMassCopy(command, selectedFields, docName) {
      if (emptyObject(selectedFields)) return;
      if (!emptyObject(this.randomizeFields)) {
        selectedFields['mass-edit-randomize'] = deepClone(this.randomizeFields);
      }
      if (!emptyObject(this.addSubtractFields)) {
        selectedFields['mass-edit-addSubtract'] = deepClone(this.addSubtractFields);
      }
      CLIPBOARD[docName] = selectedFields;

      // Special handling for Actors/Tokens
      if (docName === 'Actor') {
        delete CLIPBOARD['Actor'];
        CLIPBOARD['TokenProto'] = selectedFields;
      } else if (docName === 'Token') {
        if (command === 'copyProto') {
          delete CLIPBOARD['Token'];
          CLIPBOARD['TokenProto'] = selectedFields;
        }
      }
      ui.notifications.info(`Copied ${docName} data to clipboard`);
    }

    performMassSearch(command, selectedFields, docName) {
      const found = [];
      for (const layer of getLayerMappings()[docName]) {
        // First release/de-select the currently selected placeable on the scene
        for (const c of canvas[layer].controlled) {
          c.release();
        }

        // Next select placeables that match the selected fields
        for (const c of canvas[layer].placeables) {
          let matches = true;
          const data = flattenObject(getData(c).toObject());

          // Special processing for some placeable types
          // Necessary when form data is not directly mappable to placeable
          if (docName === 'Token') TokenDataAdapter.dataToForm(c, data);
          else if (docName === 'Actor') TokenDataAdapter.dataToForm(c, data);
          else if (docName === 'Note') NoteDataAdapter.dataToForm(c, data);

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
              if (docName === 'Token' || docName === 'Actor') {
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
            if (docName === 'Token' || docName === 'Actor') {
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
      if (command === 'searchAndEdit') {
        showMassConfig(found);
      }
    }

    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();

      const docName = this.placeables[0].document
        ? this.placeables[0].document.documentName
        : this.placeables[0].documentName;

      if (['Token', 'Note', 'Actor'].includes(docName)) {
        let docs = [];
        const ids = new Set();
        for (const p of this.placeables) {
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
            label: 'Permissions',
            class: 'mass-edit-permissions',
            icon: 'fas fa-lock fa-fw',
            onclick: () => {
              let MP = WithMassPermissions();
              new MP(docs[0], docs).render(true);
            },
          });
      }

      buttons.unshift({
        label: 'Presets',
        class: 'mass-edit-presets',
        icon: 'fas fa-box',
        onclick: (ev) => this._onConfigurePresets(ev),
      });
      return buttons;
    }

    // Some forms will manipulate themselves via modifying internal objects and re-rendering
    // In such cases we want to preserve the selected fields
    render(force, options) {
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

    _onConfigurePresets(event) {
      new MassEditPresets(this, async (preset) => {
        // This will be called when a preset is selected
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

        if (this.object.documentName === 'Token') {
          timeoutRequired = TokenDataAdapter.presetModify(this, preset);
        }

        if (timeoutRequired) {
          setTimeout(() => {
            this._applyPreset(preset);
          }, 250);
          return;
        }

        this._applyPreset(preset);
      }).render(true);
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
    }

    get id() {
      let pf = 'EDIT';
      if (this.options.massSelect) pf = 'SEARCH';
      else if (this.options.massCopy) pf = 'COPY';
      return super.id + pf;
    }

    get title() {
      if (this.options.massSelect) return `Mass-${this.object.documentName} SEARCH`;
      if (this.options.massCopy) return `Mass-${this.object.documentName} COPY`;
      return `Mass-${this.object.documentName} EDIT [ ${this.placeables.length} ]`;
    }
  }

  const constructorName = `Mass${docName}Config`;
  Object.defineProperty(MassConfig.prototype.constructor, 'name', { value: constructorName });
  return MassConfig;
};

// ====================
// ===== UTILS ========
// ====================

export function pasteDataUpdate(docs) {
  if (!docs || !docs.length) return;

  let docName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;
  let data = deepClone(CLIPBOARD[docName]);
  let applyType;

  // Special handling for Tokens/Actors
  if (docName === 'Actor') {
    data = CLIPBOARD['Token'];
    if (!data) data = CLIPBOARD['TokenProto'];
  } else if (docName === 'Token') {
    if (!data) {
      data = CLIPBOARD['TokenProto'];
      applyType = 'applyToPrototype';
    }
  }

  if (data) {
    const context = { placeables: docs };
    if (data['mass-edit-randomize']) {
      context.randomizeFields = data['mass-edit-randomize'];
      delete data['mass-edit-randomize'];
    }
    if (data['mass-edit-addSubtract']) {
      context.addSubtractFields = data['mass-edit-addSubtract'];
      delete data['mass-edit-addSubtract'];
    }
    performMassUpdate.call(context, data, docs, docName, applyType);
    ui.notifications.info(`Pasted data onto ${docs.length} ${docName}s`);
  }
}

function performMassUpdate(data, placeables, docName, applyType) {
  if (emptyObject(data)) return;

  // Update docs
  const updates = [];

  const total = placeables.length;
  for (let i = 0; i < total; i++) {
    const update = deepClone(data);
    update._id = placeables[i].id;

    // push update
    updates.push(update);
  }

  // Applies randomization
  if (this) applyRandomization.call(this, updates, placeables);
  if (this) applyAddSubtract.call(this, updates, placeables, docName);

  // Special processing for some placeable types
  // Necessary when form data is not directly mappable to placeable
  if (docName === 'Token') {
    for (let i = 0; i < total; i++) {
      TokenDataAdapter.formToData(placeables[i].document, updates[i]);
    }
  } else if (docName === 'Actor') {
    for (let i = 0; i < total; i++) {
      TokenDataAdapter.formToData(placeables[i].prototypeToken, updates[i]);
    }
  } else if (docName === 'Note') {
    for (let i = 0; i < total; i++) {
      NoteDataAdapter.formToData(updates[i]);
    }
  }

  // Need special handling for PrototypeTokens we don't update the Token itself but rather the actor
  if (docName === 'Actor') {
    // Do nothing
  } else if (docName === 'Scene') {
    Scene.updateDocuments(updates);
  } else if (docName === 'Note') {
    // Notes can be updated across different scenes
    const splitUpdates = {};
    for (let i = 0; i < updates.length; i++) {
      const scene = placeables[i].scene ?? placeables[i].parent;
      if (applyType === 'currentScene' && scene.id !== canvas.scene.id) continue;
      if (!(scene.id in splitUpdates)) {
        splitUpdates[scene.id] = { scene: scene, updates: [] };
      }
      splitUpdates[scene.id].updates.push(updates[i]);
    }
    for (const sceneUpdate of Object.values(splitUpdates)) {
      sceneUpdate.scene.updateEmbeddedDocuments(docName, sceneUpdate.updates);
    }
  } else {
    canvas.scene.updateEmbeddedDocuments(docName, updates);
  }

  // May need to also update Token prototypes
  if (docName === 'Actor' || (applyType === 'applyToPrototype' && docName === 'Token')) {
    const actorUpdates = {};
    for (let i = 0; i < placeables.length; i++) {
      const actor = placeables[i] instanceof Actor ? placeables[i] : placeables[i].actor;
      if (actor) actorUpdates[actor.id] = { _id: actor.id, token: updates[i] };
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
  if (event.target.className === 'mass-edit-control') return;
  $(event.target).closest('.form-group').find('.mass-edit-checkbox input').prop('checked', true);
}

function getTokenData(actor) {
  return isNewerVersion('10', game.version) ? getData(actor).token : actor.prototypeToken;
}

function getObjFormData(obj, docName) {
  let data = (docName === 'Actor' ? getTokenData(obj) : getData(obj)).toObject();
  data = flattenObject(data);

  // Special processing for some placeable types
  // Necessary when form data is not directly mappable to placeable
  if (docName === 'Token') TokenDataAdapter.dataToForm(obj, data);
  else if (docName === 'Actor') TokenDataAdapter.dataToForm(getTokenData(obj), data);
  else if (docName === 'Note') NoteDataAdapter.dataToForm(obj, data);

  return data;
}

// Merge all data and determine what is common between the docs
function getCommonData(docs) {
  const docName = docs[0].document ? docs[0].document.documentName : docs[0].documentName;

  const commonData = getObjFormData(docs[0], docName);
  for (let i = 1; i < docs.length; i++) {
    const flatData = getObjFormData(docs[i], docName);
    const diff = flattenObject(diffObject(commonData, flatData));
    for (const k of Object.keys(diff)) {
      // Special handling for empty/undefined data
      if ((diff[k] === '' || diff[k] == null) && (commonData[k] === '' || commonData[k] == null)) {
        // matches, do not remove
      } else {
        delete commonData[k];
      }
    }
  }
  return commonData;
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
      for (const d of this.placeables) {
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

      this.placeables[0].constructor.updateDocuments(updates, {
        diff: false,
        recursive: false,
        noHook: true,
      });
    }

    get title() {
      return `Mass-${this.object.documentName} PERMISSIONS EDIT [ ${this.placeables.length} ]`;
    }
  }

  return MassPermissions;
};

// ==================================
// ========== CLIPBOARD =============
// ==================================

const CLIPBOARD = {};
