import { getInUseStyle } from './cssEdit.js';
import { showPlaceableTypeSelectDialog } from '../scripts/dialogs.js';
import { IS_PRIVATE, showRandomizeDialog } from '../scripts/private.js';

export function getControlled() {
  for (const layers of Object.values(LAYER_MAPPINGS)) {
    for (const layer of layers) {
      if (canvas[layer].controlled.length) {
        return canvas[layer].controlled;
      }
    }
  }
  return [];
}

export function showMassSelect(basePlaceable) {
  const controlled = basePlaceable ? [basePlaceable] : getControlled();

  if (!controlled.length) {
    showPlaceableTypeSelectDialog();
    return;
  }

  const commonData = flattenObject(controlled[0].data.toObject());
  const config = CONFIG_MAPPINGS[controlled[0].document.documentName];
  if (config) {
    new config([controlled[0]], commonData).render(true, {});
  }
}

export function showMassConfig(selected = null) {
  const controlled = selected ? selected : getControlled();

  // If there are no placeable in control or just one, then either exit or display the default config window
  if (!controlled.length) return;
  else if (controlled.length === 1) {
    if (controlled[0].sheet) controlled[0].sheet.render(true, {});
    return;
  }

  // Merge all data and determine what is common between the controlled placeables
  const commonData = flattenObject(controlled[0].data.toObject());
  for (let i = 1; i < controlled.length; i++) {
    const flatData = flattenObject(controlled[i].data.toObject());
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

  // Display modified config window
  const config = CONFIG_MAPPINGS[controlled[0].document.documentName];
  if (config) {
    new config(controlled, commonData).render(true, {});
  }
}

// ==================================
// ========= Applications ===========
// ==================================

class MassTokenConfig extends TokenConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassAmbientLightConfig extends AmbientLightConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  /** @inheritdoc */
  async _onChangeInput(event) {
    // Overriding here to prevent the underlying object from being updated as inputs change on the form

    // // Handle form element updates
    const el = event.target;
    if (el.type === 'color' && el.dataset.edit) this._onChangeColorPicker(event);
    else if (el.type === 'range') this._onChangeRange(event);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassWallConfig extends WallConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassTileConfig extends TileConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  /** @inheritdoc */
  async _onChangeInput(event) {
    // Overriding here to prevent the underlying object from being updated as inputs change on the form

    // // Handle form element updates
    const el = event.target;
    if (el.type === 'color' && el.dataset.edit) this._onChangeColorPicker(event);
    else if (el.type === 'range') this._onChangeRange(event);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassDrawingConfig extends DrawingConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassMeasuredTemplateConfig extends MeasuredTemplateConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassAmbientSoundConfig extends AmbientSoundConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

class MassNoteConfig extends NoteConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    MassConfig.modifySheet.call(this, html);
  }

  async _updateObject(event, formData) {
    MassConfig.updateObject.call(this, event, formData);
  }

  get id() {
    return MassConfig.id.call(this);
  }

  get title() {
    return MassConfig.title.call(this);
  }
}

// ==================================
// ======== Shared methods ==========
// ==================================

const MassConfig = {
  id: function () {
    if (this.placeables.length === 1) {
      return `mass-select-config-${this.object.id}`;
    }
    return `mass-edit-config-${this.object.id}`;
  },
  title: function () {
    if (this.placeables.length === 1) {
      return `Mass-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Mass-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  },
  // Add styles and controls to the sheet
  modifySheet: function (html) {
    const [styleName, css] = getInUseStyle();
    $(html).prepend(`<style>${css}</style>`);

    // On any field being changed we want to automatically select the form-group to be included in the update
    $(html).on('change', 'input, select', onInputChange);
    $(html).on('click', 'button', onInputChange);

    // Attach classes and controls to all relevant form-groups
    const commonData = this.commonData;
    const processFormGroup = function (formGroup) {
      // We only want to attach extra controls if the form-group contains named fields
      if (!$(formGroup).find('[name]').length) return;

      // Check if fields within this form-group are part of common data or control a flag
      let fieldType = 'meCommon';
      let inputType = '';
      if (commonData) {
        $(formGroup)
          .find('[name]')
          .each(function (_) {
            const name = $(this).attr('name');
            inputType = $(this).prop('nodeName');
            if (name.startsWith('flags.')) {
              fieldType = 'meFlag';
            } else if (!(name in commonData)) {
              fieldType = 'meDiff';
            }
          });
      }

      // Add randomizer controls
      let randomControl = '';
      if (IS_PRIVATE) {
        randomControl = '<div class="mass-edit-randomize"><a><i class="fas fa-dice"></i></a></div>';
      }

      // Insert the checkbox
      const checkbox = $(
        `<div class="mass-edit-checkbox ${fieldType}"><input class="mass-edit-control" type="checkbox" data-dtype="Boolean"}>${randomControl}</div>`
      );
      if ($(formGroup).find('p.hint, p.notes').length) {
        $(formGroup).find('p.hint, p.notes').before(checkbox);
      } else {
        $(formGroup).append(checkbox);
      }

      // Draw a border around this form group style according to determined type
      $(formGroup).addClass(fieldType);
    };

    // Add checkboxes to each form-group to control highlighting and which fields are to be saved
    $(html)
      .find('.form-group')
      .each(function (_) {
        processFormGroup(this);
      });

    if (IS_PRIVATE) {
      $(html).on('click', '.mass-edit-randomize > a', (event) => {
        showRandomizeDialog($(event.target).closest('.form-group').find('select'));
      });
    }

    // Remove all buttons in the footer and replace with 'Apply Changes' button
    $(html).find('.sheet-footer > button').remove();

    // Special handling for walls
    $(html).find('button[type="submit"]').remove();

    let applyButtons;
    if (this.placeables.length === 1) {
      applyButtons = `<button type="submit" value="search"><i class="fas fa-search"></i> Search</button>
        <button type="submit" value="searchAndEdit"><i class="fas fa-search"></i> Search and Edit</button>`;
    } else {
      applyButtons =
        '<button type="submit" value="apply"><i class="far fa-save"></i> Apply Changes</button>';
      // Extra control for Tokens to update their Actors Token prototype
      if (this.placeables[0].document.documentName === 'Token') {
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

    // Resizes the window
    this.setPosition();

    // TokenConfig might be changed by some modules after activateListeners is processed
    // Look out for these updates and add checkboxes for any newly added form-groups
    const mutate = (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'DIV' && node.className === 'form-group') {
            processFormGroup(node);
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
  },
  // Update all selected placeable with the changed data
  updateObject: async function (event, formData) {
    // Gather up all named fields that have mass-edit-checkbox checked
    const selectedFields = {};
    const form = $(event.target).closest('form');
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

    // Flags are stored inconsistently. Absence of a flag, being set to null, undefined, empty object or empty string
    // should all be considered equal
    const flagCompare = function (data, flag, flagVal) {
      if (data[flag] == flagVal) return true;

      const falseyFlagVal =
        flagVal == null ||
        flagVal === false ||
        flagVal === '' ||
        (getType(flagVal) === 'Object' && isObjectEmpty(flagVal));
      const falseyDataVal =
        data[flag] == null ||
        data[flag] === false ||
        data[flag] === '' ||
        (getType(data[flag]) === 'Object' && isObjectEmpty(data[flag]));

      if (falseyFlagVal && falseyDataVal) return true;

      return false;
    };

    // If there is only one placeable, it means we're in placeable select mode, otherwise we're in edit mode
    if (this.placeables.length === 1) {
      const found = [];
      for (const layer of LAYER_MAPPINGS[this.placeables[0].document.documentName]) {
        // First release/de-select the currently selected placeable on the scene
        for (const c of canvas[layer].controlled) {
          c.release();
        }

        // Next select placeable that match the selected fields
        for (const c of canvas[layer].placeables) {
          let matches = true;
          const data = flattenObject(c.data.toObject());
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
    } else {
      if (isObjectEmpty(selectedFields)) return;
      // Update docs
      const updates = [];
      for (const doc of this.placeables) {
        const update = deepClone(selectedFields);
        update._id = doc.id;
        updates.push(update);
      }
      canvas.scene.updateEmbeddedDocuments(this.placeables[0].document.documentName, updates);

      // May need to also update Token prototypes
      if (
        event.submitter.value === 'applyToPrototype' &&
        this.placeables[0].document.documentName === 'Token'
      ) {
        const actorUpdates = {};
        for (const token of this.placeables) {
          if (token.actor) {
            actorUpdates[token.actor.id] = { _id: token.actor.id, token: selectedFields };
          }
        }
        if (!isObjectEmpty(actorUpdates)) {
          const updates = [];
          for (const id of Object.keys(actorUpdates)) {
            updates.push(actorUpdates[id]);
          }
          Actor.updateDocuments(updates);
        }
      }
    }
  },
};

// Toggle checkbox if input has been detected inside it's form-group
async function onInputChange(event) {
  if (event.target.className === 'mass-edit-control') return;
  $(event.target).closest('.form-group').find('.mass-edit-checkbox input').prop('checked', true);
}

// ==================================
// ========== Mappings ==============
// ==================================

export const CONFIG_MAPPINGS = {
  Token: MassTokenConfig,
  Tile: MassTileConfig,
  Drawing: MassDrawingConfig,
  Wall: MassWallConfig,
  AmbientLight: MassAmbientLightConfig,
  AmbientSound: MassAmbientSoundConfig,
  MeasuredTemplate: MassMeasuredTemplateConfig,
  Note: MassNoteConfig,
};

export const LAYER_MAPPINGS = {
  Token: ['tokens'],
  Tile: ['background', 'foreground'],
  Drawing: ['drawings'],
  Wall: ['walls'],
  AmbientLight: ['lighting'],
  AmbientSound: ['sounds'],
  MeasuredTemplate: ['templates'],
  Note: ['notes'],
};
