export default class MultiTokenConfig extends TokenConfig {
  constructor(tokens, options) {
    if (!tokens || tokens.length < 2) {
      throw 'Attempting to open Multi Token Edit for fewer than 2 tokens.';
    }

    if (!options) options = {};
    options.title = 'Multi-Token Edit';

    // To avoid any accidental changes to original token data create a temporary token
    // using the data of the first token in the list. TokenConfig will be opened using it
    const tempToken = new TokenDocument(tokens[0].data, {});
    super(tempToken, options);

    // Merge all token data and determine what is common between all tokens
    const commonData = flattenObject(tokens[0].data.toObject());
    for (let i = 1; i < tokens.length; i++) {
      const flatData = flattenObject(tokens[i].data.toObject());
      const diff = diffObject(commonData, flatData);
      for (const k of Object.keys(diff)) {
        delete commonData[k];
      }
    }

    this.commonData = commonData;
    this.tokens = tokens;
  }

  async getData(options) {
    let data = await super.getData(options);
    mergeObject(data.object, this.commonData, {
      inplace: true,
    });
    return super.getData(options);
  }

  async activateListeners(html) {
    await super.activateListeners(html);

    // Remove 'Assign Token' button
    $(html).find('.assign-token').remove();

    // On any field being changed we want to automatically select the form-group to be included in the update
    $(html).on('change', 'input, select', this._onInputChange.bind(this));

    // Attach classes and controls to all relevant form-groups
    const commonData = this.commonData;
    const processFormGroup = function (formGroup) {
      // We only want to attach extra controls if the form-group contains named fields
      if (!$(formGroup).find('[name]').length) return;

      // Check if fields within this form-group are part of common data
      let commonField = true;
      if (commonData) {
        $(formGroup)
          .find('[name]')
          .each(function (_) {
            const name = $(this).attr('name');
            if (!(name in commonData)) {
              commonField = false;
            }
          });
      }

      // Insert the checkbox
      const checkbox = $(
        `<div class="multi-token-edit-checkbox ${
          commonField ? 'common' : 'diff'
        }"><input class="multi-token-edit-control" type="checkbox" data-dtype="Boolean"}></div>`
      );
      if ($(formGroup).find('p.hint').length) {
        $(formGroup).find('p.hint').before(checkbox);
      } else {
        $(formGroup).append(checkbox);
      }

      // Apply a style to the form-group
      $(formGroup).addClass(commonField ? 'common' : 'diff');
    };

    // Add checkboxes to each form-group to control highlighting and which fields will are to be saved
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

    // Pre-select appearance tab
    $(html).find('.tabs > .item[data-tab="appearance"] > i').trigger('click');
    document.activeElement.blur(); // Hack fix for key UP/DOWN effects not registering after config has been opened

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

  async _onInputChange(event) {
    if (event.target.className === 'multi-token-edit-control') return;
    $(event.target)
      .closest('.form-group')
      .find('.multi-token-edit-checkbox input')
      .prop('checked', true);
  }

  get id() {
    return `multi-token-edit-config-${this.object.id}`;
  }

  async _updateObject(event, formData) {
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

    // Update tokens
    const updates = [];
    for (const token of this.tokens) {
      const update = deepClone(fieldsToSave);
      update._id = token.id;
      updates.push(update);
    }
    canvas.scene.updateEmbeddedDocuments('Token', updates);
  }
}
