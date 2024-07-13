/**
 * Field Type for referencing Mass Edit presets
 * Both virtual and JournalEntry
 */
export class PresetField extends foundry.data.fields.DocumentUUIDField {
  /** @inheritdoc */
  static get _defaults() {
    return Object.assign(super._defaults, {
      required: true,
      blank: false,
      nullable: true,
      initial: null,
      type: 'JournalEntry',
      embedded: undefined,
    });
  }

  /** @override */
  _validateType(value) {
    if (value.startsWith('virtual@')) return true;
    const p = foundry.utils.parseUuid(value);
    if (p.type !== this.type) throw new Error(`Invalid document type "${p.type}" which must be a "Preset"`);
  }

  /** @override */
  _toInput(config) {
    Object.assign(config, { type: this.type, single: false });
    return foundry.applications.elements.HTMLDocumentTagsElement.create(config);
  }
}
