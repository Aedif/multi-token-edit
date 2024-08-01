import { isResponsibleGM, MODULE_ID, SUPPORTED_PLACEABLES } from '../utils.js';
import { PresetField } from './fields.js';

/**
 * Region behavior to de-spawn presets.
 */
export class DeSpawnPresetBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    return {
      events: this._createEventsField({
        events: [
          CONST.REGION_EVENTS.TOKEN_ENTER,
          CONST.REGION_EVENTS.TOKEN_EXIT,
          CONST.REGION_EVENTS.TOKEN_MOVE_IN,
          CONST.REGION_EVENTS.TOKEN_MOVE_OUT,
          CONST.REGION_EVENTS.TOKEN_TURN_START,
          CONST.REGION_EVENTS.TOKEN_TURN_END,
        ],
      }),
      presetUuids: new PresetField({
        label: 'Presets',
        hint: 'Select specific presets to be removed.',
      }),
      all: new foundry.data.fields.BooleanField({
        label: 'All',
        hint: 'If enabled all spawned presets will be removed.',
        initial: false,
      }),
      originRegionOnly: new foundry.data.fields.BooleanField({
        label: 'This Region Only',
        hint: 'If enabled only presets spawned by this region will be removed.',
        initial: true,
      }),
    };
  }

  /** @override */
  async _handleRegionEvent(event) {
    if (!isResponsibleGM()) return;

    if (!(this.presetUuids || this.all)) return;

    const token = event.data.token;
    if (token.object) {
      const animation = CanvasAnimation.getAnimation(token.object.animationName);
      if (animation) await animation.promise;
    }

    if (this.all) {
      DeSpawnPresetBehaviorType.deSpawnAllPresets(this.parent.scene, this.originRegionOnly ? this.region.id : null);
    } else {
      const uuids = this.presetUuids.split(',');
      if (!uuids.length) return;
      DeSpawnPresetBehaviorType.deSpawnPresets(uuids, this.parent.scene, this.originRegionOnly ? this.region.id : null);
    }
    return;
  }

  /**
   * Removes embedded documents with uuids matching spawnPreset flag
   * @param {Array[String]} uuids
   * @param {Scene} scene
   * @param {String|null} originRegionId
   * @returns
   */
  static deSpawnPresets(uuids, scene, originRegionId) {
    SUPPORTED_PLACEABLES.forEach((embedName) => {
      const ids = [];
      scene.getEmbeddedCollection(embedName).forEach((d) => {
        const uuid = d.flags[MODULE_ID]?.spawnPreset?.uuid;
        if (uuid && uuids.some((u) => u === uuid)) {
          if (!originRegionId) ids.push(d.id);
          else if (d.flags[MODULE_ID].spawnPreset.regionId === originRegionId) ids.push(d.id);
        }
      });
      if (ids.length) scene.deleteEmbeddedDocuments(embedName, ids);
    });
  }

  /**
   * Removed embedded documents with 'spawnPreset' flags that match the provided region id.
   * A null region ID will match all regionId flags.
   * @param {String|null} originRegionId
   */
  static deSpawnAllPresets(scene, originRegionId) {
    SUPPORTED_PLACEABLES.forEach((embedName) => {
      const ids = [];
      scene.getEmbeddedCollection(embedName).forEach((d) => {
        const regionId = d.flags[MODULE_ID]?.spawnPreset?.regionId;
        if (regionId && (!originRegionId || regionId === originRegionId)) ids.push(d.id);
      });
      if (ids.length) scene.deleteEmbeddedDocuments(embedName, ids);
    });
  }
}
