function getControlled() {
  for (const [name, layers] of Object.entries(LAYER_MAPPINGS)) {
    for (const layer of layers) {
      if (canvas[layer].controlled.length) {
        return canvas[layer].controlled;
      }
    }
  }
  return [];
}

export function showMultiConfig() {
  const controlled = getControlled();

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
      delete commonData[k];
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
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiAmbientLightConfig extends AmbientLightConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiWallConfig extends WallConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiTileConfig extends TileConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiDrawingConfig extends DrawingConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiMeasuredTemplateConfig extends MeasuredTemplateConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiAmbientSoundConfig extends AmbientSoundConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

class MultiNoteConfig extends NoteConfig {
  constructor(placeables, commonData) {
    super(placeables[0].document, {});
    this.commonData = commonData;
    this.documentsToUpdate = placeables;
  }

  async activateListeners(html) {
    await super.activateListeners(html);
    modifySheet(html, this.commonData);
    this.setPosition(); // Resizes the window
  }

  async _updateObject(event, formData) {
    updateObject(event, formData, this.documentsToUpdate);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  get title() {
    return `Multi-${this.documentsToUpdate[0].document.documentName} Edit [ ${this.documentsToUpdate.length} ]`;
  }
}

// ==================================
// ======== Shared methods ==========
// ==================================

// Add styles and controls to the sheet
function modifySheet(html, commonData) {
  // On any field being changed we want to automatically select the form-group to be included in the update
  $(html).on('change', 'input, select', onInputChange);
  $(html).on('click', 'button', onInputChange);

  // Attach classes and controls to all relevant form-groups
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

  const applyButton =
    '<button type="submit" value="1"><i class="far fa-save"></i> Apply Changes</button>';
  const footer = $(html).find('.sheet-footer');
  if (footer.length) {
    footer.append(applyButton);
  } else {
    $(html).closest('form').append(applyButton);
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
async function updateObject(event, formData, documentsToUpdate) {
  // Gather up all named fields that have multi-token-edit-checkbox checked
  const fieldsToSave = {};
  const form = $(event.target).closest('form');
  form.find('.form-group').each(function (_) {
    const mte_checkbox = $(this).find('.multi-token-edit-checkbox > input');
    if (mte_checkbox.length && mte_checkbox.is(':checked')) {
      $(this)
        .find('[name]')
        .each(function (_) {
          const name = $(this).attr('name');
          fieldsToSave[name] = formData[name];
        });
    }
  });

  if (isObjectEmpty(fieldsToSave)) return;

  // Update docs
  const updates = [];
  for (const doc of documentsToUpdate) {
    const update = deepClone(fieldsToSave);
    update._id = doc.id;
    updates.push(update);
  }
  canvas.scene.updateEmbeddedDocuments(documentsToUpdate[0].document.documentName, updates);
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
