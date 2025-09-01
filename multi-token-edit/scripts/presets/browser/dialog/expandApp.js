import { PresetStorage } from '../../collection.js';
import { Preset } from '../../preset.js';
import { PresetDialog } from './dialogApp.js';

export async function openExpandPresets(presets) {
  await PresetStorage.batchLoad(presets);

  let incrementalUUID = 0;
  const expand = function (data, documentName, expanded, parentPreset) {
    const img = documentName === 'Token' || documentName === 'Tile' ? data.texture?.src : undefined;
    const name = img ? img.split('/').pop() : documentName;
    const preset = new Preset({ name, img, documentName, data: [data], uuid: incrementalUUID });
    preset.document = { pages: { size: 0 } }; // TODO: this is a hack to prevent preset from loading and throwing an error
    preset._temp = true;
    preset._loaded = true;
    if (parentPreset) {
      preset.randomize = foundry.utils.deepClone(parentPreset.randomize);
      preset.addSubtract = foundry.utils.deepClone(parentPreset.addSubtract);
    }
    expanded.push(preset);
    incrementalUUID++;
  };

  for (const preset of presets) {
    incrementalUUID = 0;
    if (preset.data.length > 1 || preset.attached?.length) {
      let expanded = [];
      preset.data.forEach((data) => {
        if (!foundry.utils.isEmpty(data)) expand(data, preset.documentName, expanded, preset);
      });
      preset.attached?.forEach((d) => expand(d.data, d.documentName, expanded));

      new ExpandDialog({ preset, expanded }).render(true);
    }
  }
}

class ExpandDialog extends PresetDialog {
  constructor({ preset, expanded } = {}) {
    super({ presets: expanded, windowTitle: preset.name, id: 'expand-dialog-' + preset.id });
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

  /** @override */
  _onSetDragDropData(data) {
    // Presets handled by ExpandDialog do not have a global UUID
    // So Drag/Drop needs to be handled by passing the references to presets directly
    data.transient = true;
    MassEdit._transientPresets = data.uuids.map((i) => this.presets[i]);
  }
}
