import { LINK_TYPES, LinkerAPI } from '../presets/linker.js';
import { isResponsibleGM } from '../utils.js';

/**
 * Region behavior to Link token to the region.
 */
export class LinkTokenRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    return {
      linkId: new foundry.data.fields.StringField({
        label: `Link ID`,
        hint: `ID used to establish a link between the region and the token.`,
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
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this._onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_MOVE_OUT]: this._onTokenExit,
  };

  static async _onTokenEnter(event) {
    if (!isResponsibleGM()) return;
    if (!LinkerAPI.hasLink(this.region, this.linkId)) LinkerAPI.addLink(this.region, this.linkId, LINK_TYPES.TWO_WAY);
    LinkerAPI.addLink(event.data.token, this.linkId, LINK_TYPES.RECEIVE);
    return;
  }

  static async _onTokenExit(event) {
    if (!isResponsibleGM()) return;
    LinkerAPI.removeLink(event.data.token, this.linkId);
  }
}