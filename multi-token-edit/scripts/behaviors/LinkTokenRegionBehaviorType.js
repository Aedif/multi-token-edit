import { MODULE_ID } from '../constants.js';
import { LINK_TYPES, LinkerAPI } from '../linker/linker.js';
import { isResponsibleGM, localize } from '../utils.js';

/**
 * Region behavior to Link token to the region.
 */
export class LinkTokenRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static {
    class PromiseQueue {
      queue = Promise.resolve();

      add(operation) {
        this.queue = this.queue.then(operation).catch(() => {});
      }
    }

    this.queue = new PromiseQueue();
  }

  static defineSchema() {
    return {
      linkId: new foundry.data.fields.StringField({
        label: localize('behavior.linkToken.linkId.label'),
        hint: localize('behavior.linkToken.linkId.hint'),
        initial: () => 'LinkTokenBehavior - ' + foundry.utils.randomID(8),
      }),
      // linkType: new foundry.data.fields.NumberField({
      //   choices: Object.keys(LINK_TYPES).reduce((obj, t) => {
      //     obj[LINK_TYPES[t]] = t;
      //     return obj;
      //   }, {}),
      //   label: `Link Type`,
      //   hint: `One-way links will not transfer Token updates back to the region.`,
      //   initial: LINK_TYPES.RECEIVE,
      // }),
    };
  }

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this._onTokenMoveIn,
    [CONST.REGION_EVENTS.TOKEN_MOVE_OUT]: this._onTokenMoveOut,
  };

  static async _onTokenMoveIn(event) {
    if (!isResponsibleGM()) return;

    if (
      event.data.token.getFlag(MODULE_ID, 'disableLinkToken') ||
      !['dragging', 'keyboard', 'undo'].includes(event.data.movement.method)
    )
      return;

    if (LinkerAPI.areLinked(this.region, event.data.token)) return;

    if (!LinkerAPI.hasLink(this.region, this.linkId))
      LinkerAPI.addLink(this.region, this.linkId, LINK_TYPES.TWO_WAY, 'LinkTokenBehavior');

    LinkTokenRegionBehaviorType.queue.add(async () =>
      LinkerAPI.addLink(event.data.token, this.linkId, LINK_TYPES.RECEIVE, 'LinkTokenBehavior')
    );
    return;g
  }

  static async _onTokenMoveOut(event) {
    if (!isResponsibleGM()) return;
    if (['dragging', 'keyboard', 'undo'].includes(event.data.movement.method)) {
      LinkTokenRegionBehaviorType.queue.add(async () => LinkerAPI.removeLink(event.data.token, this.linkId));
    }
  }
}
