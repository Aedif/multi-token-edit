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

export function showMultiSelect(placeableSearchBase = null) {
  const controlled = placeableSearchBase ? [placeableSearchBase] : getControlled();

  if (!controlled.length) {
    let content = '';
    for (const key of Object.keys(CONFIG_MAPPINGS)) {
      content += `<option value="${key}">${key}</option>`;
    }
    content = `<label>Choose placeable type you wish to search and select:</label>
    <select style="width: 100%;" name="documentName">${content}</select>`;

    new Dialog({
      title: 'Multi-Placeable SEARCH',
      content: content,
      buttons: {
        select: {
          icon: '<i class="fas fa-check"></i>',
          label: 'Select',
          callback: (html) => {
            const documentName = html.find("select[name='documentName']").val();
            let placeables = [];
            for (const layer of LAYER_MAPPINGS[documentName]) {
              if (canvas[layer].placeables.length) {
                placeables = canvas[layer].placeables;
              }
            }
            if (placeables.length) {
              showMultiSelect(placeables[0]);
            } else {
              ui.notifications.warn(`No placeables found for the selected type. (${documentName})`);
            }
          },
        },
      },
    }).render(true);
    return;
  }

  const commonData = flattenObject(controlled[0].data.toObject());
  const config = CONFIG_MAPPINGS[controlled[0].document.documentName];
  if (config) {
    new config([controlled[0]], commonData).render(true, {});
  }
}

export function showMultiConfig(selected = null) {
  const controlled = selected ? selected : getControlled();

  // If there are no placeable in control or simply one, then either exit or display the default config window
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

  const config = CONFIG_MAPPINGS[controlled[0].document.documentName];
  if (config) {
    new config(controlled, commonData).render(true, {});
  }
}

// ==================================
// ========= Applications ===========
// ==================================

class MultiTokenConfig extends TokenConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiAmbientLightConfig extends AmbientLightConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
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
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiWallConfig extends WallConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiTileConfig extends TileConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
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
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiDrawingConfig extends DrawingConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiMeasuredTemplateConfig extends MeasuredTemplateConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiAmbientSoundConfig extends AmbientSoundConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

class MultiNoteConfig extends NoteConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.placeables = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet.call(this, html);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject.call(this, event, formData);
  }

  get id() {
    if (this.placeables.length === 1) {
      return `multi-token-select-config-${this.object.id}`;
    }
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    if (this.placeables.length === 1) {
      return `Multi-${this.placeables[0].document.documentName} SEARCH`;
    }
    return `Multi-${this.placeables[0].document.documentName} EDIT [ ${this.placeables.length} ]`;
  }
}

// ==================================
// ======== Shared methods ==========
// ==================================

// Add styles and controls to the sheet
function modifySheet(html) {
  // On any field being changed we want to automatically select the form-group to be included in the update
  $(html).on('change', 'input, select', onInputChange);
  $(html).on('click', 'button', onInputChange);

  // Attach classes and controls to all relevant form-groups
  const commonData = this.commonData;
  const processFormGroup = function (formGroup) {
    // We only want to attach extra controls if the form-group contains named fields
    if (!$(formGroup).find('[name]').length) return;

    // Check if fields within this form-group are part of common data or control a flag
    let fieldType = 'mteCommon';
    if (commonData) {
      $(formGroup)
        .find('[name]')
        .each(function (_) {
          const name = $(this).attr('name');
          if (name.startsWith('flags.')) {
            fieldType = 'mteFlag';
          } else if (!(name in commonData)) {
            fieldType = 'mteDiff';
          }
        });
    }

    // Insert the checkbox
    const checkbox = $(
      `<div class="multi-token-edit-checkbox ${fieldType}"><input class="multi-token-edit-control" type="checkbox" data-dtype="Boolean"}></div>`
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
}

// Update all selected placeable with the changed data
async function updateObject(event, formData) {
  // Gather up all named fields that have multi-token-edit-checkbox checked
  const selectedFields = {};
  const form = $(event.target).closest('form');
  form.find('.form-group').each(function (_) {
    const mte_checkbox = $(this).find('.multi-token-edit-checkbox > input');
    if (mte_checkbox.length && mte_checkbox.is(':checked')) {
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
      showMultiConfig(found);
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
}

// Toggle checkbox if input has been detected inside it's form-group
async function onInputChange(event) {
  if (event.target.className === 'multi-token-edit-control') return;
  $(event.target)
    .closest('.form-group')
    .find('.multi-token-edit-checkbox input')
    .prop('checked', true);
}

const CONFIG_MAPPINGS = {
  Token: MultiTokenConfig,
  Tile: MultiTileConfig,
  Drawing: MultiDrawingConfig,
  Wall: MultiWallConfig,
  AmbientLight: MultiAmbientLightConfig,
  AmbientSound: MultiAmbientSoundConfig,
  MeasuredTemplate: MultiMeasuredTemplateConfig,
  Note: MultiNoteConfig,
};

const LAYER_MAPPINGS = {
  Token: ['tokens'],
  Tile: ['background', 'foreground'],
  Drawing: ['drawings'],
  Wall: ['walls'],
  AmbientLight: ['lighting'],
  AmbientSound: ['sounds'],
  MeasuredTemplate: ['templates'],
  Note: ['notes'],
};
