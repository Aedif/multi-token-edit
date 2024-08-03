/**
 * Field Type for referencing Mass Edit presets
 * Both virtual and JournalEntry
 */
export class PresetField extends foundry.data.fields.SetField {
  constructor(...args) {
    super(new foundry.data.fields.StringField({}), ...args);
  }

  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: false,
      blank: true,
      nullable: true,
      initial: null,
      type: null,
      embedded: undefined,
    });
  }

  /** @override */
  _toInput(config) {
    return CustomStringElement.create(config);
  }
}

class CustomStringElement extends foundry.applications.elements.HTMLStringTagsElement {
  /** @override */
  static tagName = 'preset-tags';

  /** @override */
  static labels = {
    add: 'ELEMENTS.TAGS.Add',
    remove: 'ELEMENTS.TAGS.Remove',
    placeholder: 'Enter UUID',
  };

  /** @override */
  static renderTag(tag, label, editable = true) {
    if (tag.startsWith('virtual@')) {
      label = tag.split('\\').pop().split('/').pop();
    } else {
      const record = fromUuidSync(tag);
      if (record) label = record.name ?? tag;
    }

    return super.renderTag(tag, label, editable);
  }
}

window.customElements.define(CustomStringElement.tagName, CustomStringElement);
