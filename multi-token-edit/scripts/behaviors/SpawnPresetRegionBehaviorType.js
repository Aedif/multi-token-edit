import { PresetAPI } from '../presets/collection.js';
import { getDataBounds } from '../presets/utils.js';
import { isResponsibleGM, MODULE_ID, SUPPORTED_PLACEABLES } from '../utils.js';
import { PresetField } from './fields.js';

/**
 * Region behavior to spawn presets
 */
export class SpawnPresetBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    const schema = {
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
      once: new foundry.data.fields.BooleanField({
        label: 'Once',
        hint: "Disable the behavior after the first time it's triggered",
        initial: false,
      }),
      presetUuids: new PresetField({
        label: 'Presets',
      }),
      destination: new foundry.data.fields.DocumentUUIDField({ label: 'Target Region UUID', type: 'Region' }),
    };

    if (game.modules.get('tagger')?.active) {
      schema.destinationTags = new foundry.data.fields.SetField(new foundry.data.fields.StringField({}), {
        label: 'Target Region Tags',
        hint: '',
      });
      schema.destinationSpawnInAll = new foundry.data.fields.BooleanField({
        label: 'All Regions',
        hint: 'When enabled the preset will be spawned in all regions if multiple have been found as valid destinations.',
        initial: true,
      });
    }

    schema.random = new foundry.data.fields.BooleanField({
      label: 'Randomize Position',
      hint: 'Randomized position will be chosen within the bounds of the target region.',
      initial: false,
    });

    return schema;
  }

  /** @override */
  async _handleRegionEvent(event) {
    if (!isResponsibleGM()) return;

    if (this.once) this.parent.update({ disabled: true });

    if (event.data.forced) return;

    let destinations = [];

    // Get destination by UUID
    const destination = fromUuidSync(this.destination);
    if (destination instanceof RegionDocument) destinations.push(destination);

    // Get destinations by tags
    if (this.destinationTags?.size && game.modules.get('tagger')?.active) {
      const taggedDestinations = Tagger.getByTag(Array.from(this.destinationTags), {
        matchAny: true,
        allScenes: false,
      }).filter((d) => d instanceof RegionDocument);
      if (taggedDestinations.length) destinations = destinations.concat(taggedDestinations);
    }

    if (!destinations.length) return;

    // Check if presets are already spawned on destination scenes
    const scenes = new Map();
    destinations.forEach((d) => {
      if (!scenes.get(d.parent.id)) scenes.set(d.parent.id, [d]);
      else scenes.get(d.parent.id).push(d);
    });

    scenes.forEach((destinations, sceneId) => {
      if (SpawnPresetBehaviorType.isSpawned(this.behavior.id, sceneId)) {
        scenes.delete(scene.id);
      }
    });

    if (!scenes.size) return;

    const token = event.data.token;
    if (token.object) {
      const animation = CanvasAnimation.getAnimation(token.object.animationName);
      if (animation) await animation.promise;
    }

    // Pick random preset
    const uuids = this.presetUuids.split(',');
    const presetUuid = uuids[Math.floor(Math.random() * uuids.length)];

    const preset = await PresetAPI.getPreset({ uuid: presetUuid });
    if (!preset) {
      console.error(`UUID (${this.presetUuid}) Name (${this.presetName}) does not exist`);
      return;
    }

    destinations = [];
    scenes.forEach((ds) => (destinations = destinations.concat(ds)));

    if (!this.destinationSpawnInAll) {
      destinations = [destinations[Math.floor(Math.random() * destinations.length)]];
    }

    for (const destination of destinations) {
      const destinationRegionObject = destination.object ?? new CONFIG.Region.objectClass(destination);
      SpawnPresetBehaviorType.spawnPreset(
        this.region.id,
        this.behavior.id,
        preset,
        destinationRegionObject,
        this.random
      ).then(() => {
        if (!destination.object) destinationRegionObject.destroy({ children: true });
      });
    }

    return;
  }

  /**
   * Check if a preset has already been spawned on the scene by this behavior
   * @param {String} behaviorId
   * @param {Scene} sceneId
   * @returns
   */
  static isSpawned(behaviorId, sceneId) {
    const scene = game.scenes.get(sceneId);
    return SUPPORTED_PLACEABLES.some((embedName) =>
      scene.getEmbeddedCollection(embedName).some((d) => d.flags[MODULE_ID]?.spawnPreset?.behaviorId === behaviorId)
    );
  }

  /**
   * Spawn given preset within the bounds of the region.
   * @param {String} regionId
   * @param {String} behaviorId
   * @param {Preset} preset
   * @param {Region} region
   * @param {object} center
   */
  static async spawnPreset(regionId, behaviorId, preset, region, random = true) {
    const position = random ? getRandomPosition(region) : SpawnPresetBehaviorType.getCenterPosition(region);
    if (position) {
      // Tracker flags for 'isSpawned' check and preset de-spawn behavior
      const flags = {
        [MODULE_ID]: {
          spawnPreset: { uuid: preset.uuid, behaviorId, regionId },
        },
      };

      PresetAPI.spawnPreset({
        preset,
        x: position.x,
        y: position.y,
        scaleToGrid: true,
        center: true,
        flags,
        sceneId: region.parent.id,
      });
    }
  }

  /**
   * Return center position off the given region
   * @param {Region|RegionDocument} region
   * @returns {Object} {x, y}
   */
  static getCenterPosition(region) {
    const { x1, y1, x2, y2 } = getDataBounds('Region', region.document ?? region);
    return { x: x1 + (x2 - x1) / 2, y: y1 + (y2 - y1) / 2 };
  }
}

/**
 * Code taken from Foundry VTT Teleport Token Region Behavior.
 * TeleportTokenRegionBehaviorType.#getDestination(region, token)
 * Foundry Virtual Tabletop © Copyright 2024, Foundry Gaming, LLC
 * https://foundryvtt.com/
 * @param {Region} region
 * @returns
 */
function getRandomPosition(region) {
  let pivot = { x: 0, y: 0 };

  // Calculate the areas of each triangle of the triangulation
  const { vertices, indices } = region.triangulation;
  const areas = [];
  let totalArea = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const i0 = indices[k] * 2;
    const i1 = indices[k + 1] * 2;
    const i2 = indices[k + 2] * 2;
    const x0 = vertices[i0];
    const y0 = vertices[i0 + 1];
    const x1 = vertices[i1];
    const y1 = vertices[i1 + 1];
    const x2 = vertices[i2];
    const y2 = vertices[i2 + 1];
    const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
    totalArea += area;
    areas.push(area);
  }

  let position;
  // Try to find a position that places the token inside the region
  for (let n = 0; n < 10; n++) {
    position = undefined;

    // Choose a triangle randomly weighted by area
    let j;
    let a = totalArea * Math.random();
    for (j = 0; j < areas.length - 1; j++) {
      a -= areas[j];
      if (a < 0) break;
    }
    const k = 3 * j;
    const i0 = indices[k] * 2;
    const i1 = indices[k + 1] * 2;
    const i2 = indices[k + 2] * 2;
    const x0 = vertices[i0];
    const y0 = vertices[i0 + 1];
    const x1 = vertices[i1];
    const y1 = vertices[i1 + 1];
    const x2 = vertices[i2];
    const y2 = vertices[i2 + 1];

    // Select a random point within the triangle
    const r1 = Math.sqrt(Math.random());
    const r2 = Math.random();
    const s = r1 * (1 - r2);
    const t = r1 * r2;
    const x = Math.round(x0 + (x1 - x0) * s + (x2 - x0) * t - pivot.x);
    const y = Math.round(y0 + (y1 - y0) * s + (y2 - y0) * t - pivot.y);
    position = { x, y };

    // The center point of the token must be inside the region
    if (!region.polygonTree.testPoint(position)) continue;
  }
  return position;
}
