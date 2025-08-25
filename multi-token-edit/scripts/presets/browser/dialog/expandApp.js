import { PresetStorage } from '../../collection.js';
import { Preset } from '../../preset.js';
import { PresetDialog } from './dialogApp.js';

export async function openExpandPresets(presets) {
  await PresetStorage.batchLoad(presets);

  let incrementalUUID = 0;
  const expand = function (data, documentName, expanded) {
    const img = documentName === 'Token' || documentName === 'Tile' ? data.texture?.src : undefined;
    const preset = new Preset({ img, documentName, data: [data], uuid: incrementalUUID });
    preset.document = { pages: { size: 0 } }; // TODO: this is a hack to prevent preset from loading and throwing an error
    expanded.push(preset);
    incrementalUUID++;
  };

  for (const preset of presets) {
    if (preset.data.length > 1 || preset.attached?.length) {
      let expanded = [];
      preset.data.forEach((data) => {
        if (!foundry.utils.isEmpty(data)) expand(data, preset.documentName, expanded);
      });
      preset.attached?.forEach((d) => expand(d.data, d.documentName, expanded));

      new ExpandDialog({ preset, expanded }).render(true);
    }
  }
}

class ExpandDialog extends PresetDialog {
  constructor({ preset, expanded } = {}) {
    super({ presets: expanded, windowTitle: preset.name });
    this.preset = preset;
  }

  /** @override */
  _retrievePresets(uuid) {
    return (Array.isArray(uuid) ? uuid : [uuid]).map((uuid) => this.presets[uuid]);
  }
  /** @override */
  _getItemContextOptions() {
    const options = super._getItemContextOptions();

    const allowedOptions = {
      brush: true,
      applyToSelected: true,
      copyToClipboard: true,
      exportAsJson: true,
      exportToCompendium: true,
      delete: true,
    };

    return options.filter((opt) => allowedOptions[opt.id]);
  }
}
