export function showMultiConfig() {
  let controlled = [];

  if (canvas.tokens.controlled.length) {
    controlled = canvas.tokens.controlled;
  } else if (canvas.background.controlled.length || canvas.foreground.controlled.length) {
    controlled = canvas.background.controlled.concat(canvas.foreground.controlled);
  } else if (canvas.drawings.controlled.length) {
    controlled = canvas.drawings.controlled;
  }

  // If there are no placeable in control or simply one, then either exit or display the default config window
  if (!controlled.length) return;
  else if (controlled.length === 1) {
    controlled[0].sheet.render(true);
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

  // Open up an appropriate configuration app
  switch (controlled[0].document.documentName) {
    case 'Token':
      new MultiTokenConfig(controlled, commonData).render(true);
      break;
    case 'Tile':
      new MultiTileConfig(controlled, commonData).render(true);
      break;
    case 'Drawing':
      new MultiDrawingConfig(controlled, commonData).render(true);
      break;
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

    // Pre-select 'appearance' tab
    $(html).find('.tabs > .item[data-tab="appearance"] > i').trigger('click');
    document.activeElement.blur(); // Hack fix for key UP/DOWN effects not registering after config has been opened
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

    // Pre-select 'overhead' tab
    $(html).find('.tabs > .item[data-tab="overhead"] > i').trigger('click');
    document.activeElement.blur(); // Hack fix for key UP/DOWN effects not registering after config has been opened
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

    // Pre-select 'lines' tab
    $(html).find('.tabs > .item[data-tab="lines"] > i').trigger('click');
    document.activeElement.blur(); // Hack fix for key UP/DOWN effects not registering after config has been opened
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
  $(html)
    .find('.sheet-footer')
    .append('<button type="submit" value="1"><i class="far fa-save"></i> Apply Changes</button>');

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
