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
      }),
    };
  }

  /** @override */
  async _handleRegionEvent(event) {
    if (!isResponsibleGM()) return;

    if (!this.presetUuids) return;
    const uuids = this.presetUuids.split(',');
    if (!uuids.length) return;

    const token = event.data.token;
    if (token.object) {
      const animation = CanvasAnimation.getAnimation(token.object.animationName);
      if (animation) await animation.promise;
    }

    DeSpawnPresetBehaviorType.deSpawnPresets(uuids, this.parent.scene);
    return;
  }

  /**
   * Removes embedded documents with uuids matching spawnPreset flag
   * @param {Array[String]} uuids
   * @param {Scene} scene
   * @returns
   */
  static deSpawnPresets(uuids, scene) {
    SUPPORTED_PLACEABLES.forEach((embedName) => {
      const ids = [];
      scene.getEmbeddedCollection(embedName).forEach((d) => {
        const uuid = d.flags[MODULE_ID]?.spawnPreset?.uuid;
        if (uuid && uuids.some((u) => u === uuid)) ids.push(d.id);
      });
      if (ids.length) scene.deleteEmbeddedDocuments(embedName, ids);
    });
  }
}
