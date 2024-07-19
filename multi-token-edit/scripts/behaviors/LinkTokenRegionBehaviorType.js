import { LINK_TYPES, LinkerAPI } from '../linker/linker.js';
import { isResponsibleGM, localize } from '../utils.js';

/**
 * Region behavior to Link token to the region.
 */
export class LinkTokenRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    return {
      linkId: new foundry.data.fields.StringField({
        label: localize('behavior.linkToken.linkId.label'),
        hint: localize('behavior.linkToken.linkId.hint'),
        initial: 'LinkTokenBehavior - ' + foundry.utils.randomID(8),
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
    if (!LinkerAPI.hasLink(this.region, this.linkId)) LinkerAPI.addLink(this.region, this.linkId, LINK_TYPES.TWO_WAY);
    LinkerAPI.addLink(event.data.token, this.linkId, LINK_TYPES.RECEIVE);
    return;
  }

  static async _onTokenMoveOut(event) {
    if (!isResponsibleGM()) return;
    if (!event.data.forced) LinkerAPI.removeLink(event.data.token, this.linkId);
  }
}
