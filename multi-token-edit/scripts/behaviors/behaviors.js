import { MODULE_ID } from '../constants.js';
import { DeSpawnPresetBehaviorType } from './DeSpawnPresetRegionBehaviorType.js';
import { LinkTokenRegionBehaviorType } from './LinkTokenRegionBehaviorType.js';
import { SpawnPresetBehaviorType } from './SpawnPresetRegionBehaviorType.js';

/**
 * Register custom behaviors
 */
export function registerBehaviors() {
  Object.assign(CONFIG.RegionBehavior.dataModels, {
    [`${MODULE_ID}.linkToken`]: LinkTokenRegionBehaviorType,
    [`${MODULE_ID}.spawnPreset`]: SpawnPresetBehaviorType,
    [`${MODULE_ID}.deSpawnPreset`]: DeSpawnPresetBehaviorType,
  });

  Object.assign(CONFIG.RegionBehavior.typeIcons, {
    [`${MODULE_ID}.linkToken`]: 'fas fa-link',
    [`${MODULE_ID}.spawnPreset`]: 'fa-solid fa-books',
    [`${MODULE_ID}.deSpawnPreset`]: 'fa-duotone fa-books',
  });
}
