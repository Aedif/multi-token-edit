import {
  IS_PRIVATE,
  applyRandomization,
  showRandomizeDialog,
  selectRandomizerFields,
} from '../scripts/private.js';
import { emptyObject, getData } from '../scripts/utils.js';
import { getInUseStyle } from './cssEdit.js';
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

export const WithMassConfig = (docName) => {
  if (docName === 'Actor') docName = 'Token';
  const sheets = CONFIG[docName].sheetClasses;
  let cls;
  if (docName === 'Drawing') {
    if (CONFIG.Drawing.sheetClasses.e) {
      cls = CONFIG.Drawing.sheetClasses.e['core.DrawingConfig'].cls;
    } else {
      cls = CONFIG.Drawing.sheetClasses.base['core.DrawingConfig'].cls;
    }
  } else {
    cls = sheets.base[`core.${docName}Config`].cls;
  }

  class MassConfig extends cls {
    constructor(docs, options) {
      super(docs[0].document ? docs[0].document : docs[0], options);
      this.placeables = docs;
      this.commonData = options.commonData;
    }

    // Add styles and controls to the sheet
    async activateListeners(html) {
      await super.activateListeners(html);

      this.randomizeFields = {};

      // Set style
      const [styleName, css] = getInUseStyle();
      $(html).prepend(`<style>${css}</style>`);

      // On any field being changed we want to automatically select the form-group to be included in the update
      $(html).on('change', 'input, select', onInputChange);
      $(html).on('click', 'button', onInputChange);

      // Attach classes and controls to all relevant form-groups
      const commonData = flattenObject(this.commonData || {});
      const massSelect = this.options.massSelect;
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
        if (IS_PRIVATE && !massSelect) {
          randomControl =
            '<div class="mass-edit-randomize"><a><i class="fas fa-dice"></i></a></div>';
        }

        // Insert the checkbox
        const checkbox = $(
          `<div class="mass-edit-checkbox ${fieldType}"><input class="mass-edit-control" type="checkbox" data-dtype="Boolean"}>${randomControl}</div>`
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
      if (IS_PRIVATE) {
        $(html).on('click', '.mass-edit-randomize > a', (event) => {
          showRandomizeDialog($(event.target).closest('.form-group'), context);
        });
      }

      // Remove all buttons in the footer
      $(html).find('.sheet-footer > button').remove();

      // Special handling for Walls sheet
      $(html).find('button[type="submit"]').remove();

      // Add submit buttons
      let applyButtons;
      if (this.options.massSelect) {
        applyButtons = `<button type="submit" value="search"><i class="fas fa-search"></i> Search</button>
            <button type="submit" value="searchAndEdit"><i class="fas fa-search"></i> Search and Edit</button>`;
      } else if (this.options.massCopy) {
        applyButtons = `<button type="submit" value="copy"><i class="fas fa-copy"></i> Copy</button>`;
        // Extra control for Tokens to update their Actors Token prototype
        if (this.object.documentName === 'Token') {
          applyButtons +=
            '<button type="submit" value="copyProto"><i class="fas fa-copy"></i> Copy as Prototype</button>';
        }
      } else {
        applyButtons =
          '<button type="submit" value="apply"><i class="far fa-save"></i> Apply Changes</button>';
        // Extra control for Tokens to update their Actors Token prototype
        if (this.object.documentName === 'Token') {
          applyButtons +=
            '<button type="submit" value="applyToPrototype"><i class="far fa-save"></i> Apply and Update Prototypes</button>';
        }
      }
      const footer = $(html).find('.sheet-footer');
      if (footer.length) {
        footer.append(applyButtons);
      } else {
        $(html).closest('form').append(applyButtons);
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
    }

    getSelectedFields(formData) {
      if (!formData) formData = this._getSubmitData();

      // Token _getSubmitData() performs conversions related to scale, we need to undo them here
      // so that named fields on the form match up and can be selected
      if (this.object.documentName === 'Token' && !isNewerVersion('10', game.version)) {
        if (formData['texture.scaleX']) {
          formData.scale = Math.abs(formData['texture.scaleX']);
          formData.mirrorX = formData['texture.scaleX'] < 0;
          formData.mirrorY = formData['texture.scaleY'] < 0;
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
              selectedFields[name] = formData[name];
            });
        }
      });

      return selectedFields;
    }

    async _updateObject(event, formData) {
      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields(formData);

      // Flags are stored inconsistently. Absence of a flag, being set to null, undefined, empty object or empty string
      // should all be considered equal
      const flagCompare = function (data, flag, flagVal) {
        if (data[flag] == flagVal) return true;

        const falseyFlagVal =
          flagVal == null ||
          flagVal === false ||
          flagVal === '' ||
          (getType(flagVal) === 'Object' && emptyObject(flagVal));
        const falseyDataVal =
          data[flag] == null ||
          data[flag] === false ||
          data[flag] === '' ||
          (getType(data[flag]) === 'Object' && emptyObject(data[flag]));

        if (falseyFlagVal && falseyDataVal) return true;

        return false;
      };

      // Copy mode
      if (this.options.massCopy) {
        if (emptyObject(selectedFields)) return;
        if (!emptyObject(this.randomizeFields)) {
          selectedFields['mass-edit-randomize'] = this.randomizeFields;
        }
        CLIPBOARD[this.object.documentName] = selectedFields;

        // Special handling for Actors/Tokens
        if (this.object.documentName === 'Actor') {
          delete CLIPBOARD['Actor'];
          CLIPBOARD['TokenProto'] = selectedFields;
        } else if (this.object.documentName === 'Token') {
          if (event.submitter.value === 'copyProto') {
            delete CLIPBOARD['Token'];
            CLIPBOARD['TokenProto'] = selectedFields;
          }
        }
        ui.notifications.info(`Copied ${this.object.documentName} data to clipboard`);
      }
      // Search and Select mode
      else if (this.options.massSelect) {
        const found = [];
        for (const layer of getLayerMappings()[this.object.documentName]) {
          // First release/de-select the currently selected placeable on the scene
          for (const c of canvas[layer].controlled) {
            c.release();
          }

          // Next select placeable that match the selected fields
          for (const c of canvas[layer].placeables) {
            let matches = true;
            const data = flattenObject(getData(c).toObject());
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
                //
                // In v10 token data can't be directly compared due to it being morphed in _getSubmitData()
                //
                if (
                  !isNewerVersion('10', game.version) &&
                  this.object.documentName === 'Token' &&
                  ['scale', 'mirrorX', 'mirrorY'].includes(k)
                ) {
                  if (k === 'scale' && Math.abs(data['texture.scaleX']) === v) {
                    continue;
                  }

                  if (k === 'mirrorX') {
                    if ((!v && data['texture.scaleX'] >= 1) || (v && data['texture.scaleX'] < 0)) {
                      continue;
                    }
                  }

                  if (k === 'mirrorY') {
                    if ((!v && data['texture.scaleY'] >= 1) || (v && data['texture.scaleY'] < 0)) {
                      continue;
                    }
                  }
                }

                matches = false;
                break;
              }
            }
            if (matches) {
              found.push(c);
              c.control({ releaseOthers: false });
            }
          }
        }
        if (event.submitter.value === 'searchAndEdit') {
          showMassConfig(found);
        }
        // Edit mode
      } else {
        _applyUpdates.call(
          this,
          selectedFields,
          this.placeables,
          this.object.documentName,
          event.submitter.value
        );
      }
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
      const buttons = super._getHeaderButtons();
      buttons.unshift({
        label: 'Presets',
        class: 'mass-edit-presets',
        icon: 'fas fa-box',
        onclick: (ev) => this._onConfigurePresets(ev),
      });
      return buttons;
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
      if (preset['mass-edit-randomize']) {
        const customMerge = (obj1, obj2) => {
          for (const [k, v] of Object.entries(obj2)) {
            obj1[k] = v;
          }
          return obj1;
        };

        this.randomizeFields = customMerge(this.randomizeFields, preset['mass-edit-randomize']);
        delete preset['mass-edit-randomize'];
        selectRandomizerFields(form, this.randomizeFields);
      }
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
    _applyUpdates.call(context, data, docs, docName, applyType);
    ui.notifications.info(`Pasted data onto ${docs.length} ${docName}s`);
  }
}

function _applyUpdates(data, placeables, docName, applyType) {
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
  if (this) applyRandomization.call(this, updates);

  // Need special handling for PrototypeTokens we don't update the Token itself but rather the actor
  if (docName === 'Actor') {
    // Do nothing
  } else if (docName === 'Scene') {
    Scene.updateDocuments(updates);
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

// ==================================
// ========== CLIPBOARD =============
// ==================================

const CLIPBOARD = {};
