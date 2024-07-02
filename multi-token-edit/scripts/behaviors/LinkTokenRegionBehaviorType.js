import { LinkerAPI } from '../presets/linker.js';
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
        initial: 'LinkTokenBehavior - ' + foundry.utils.randomID(),
      }),
      childLink: new foundry.data.fields.BooleanField({
        label: `Child`,
        hint: `Is this a 'child' link? Child links will not transfer updates to parents.`,
        initial: true,
      }),
    };
  }

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this._onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_MOVE_OUT]: this._onTokenExit,
  };

  static async _onTokenEnter(event) {
    if (!isResponsibleGM()) return;
    if (!LinkerAPI.hasLink(this.region, this.linkId)) LinkerAPI.addLink(this.region, this.linkId);
    LinkerAPI.addLink(event.data.token, this.linkId, this.childLink);
    return;
  }

  static async _onTokenExit(event) {
    if (!isResponsibleGM()) return;
    LinkerAPI.removeLink(event.data.token, this.linkId);
  }
}
