import { MODULE_ID } from '../constants.js';
import { ScenescapeControls } from './controls.js';

export function registerScenescapeHooks() {
  ScenescapeControls.registerMainHooks();
}

export class Scenescape {
  static autoScale = true;

  static get active() {
    return this._active;
  }

  static get distanceRatio() {
    return this._distanceRatio;
  }

  static get stepDistanceX() {
    return this._stepDistanceX;
  }

  static get stepDistanceY() {
    return this._stepDistanceY;
  }

  static get movementLimits() {
    return this._movementLimits;
  }

  static get hideBorder() {
    return this._hideBorder;
  }

  static get depth() {
    if (this._markers?.length) {
      return this._markers[this._markers.length - 1].elevation;
    }
    return 0;
  }

  static loadFlags() {
    const flags = canvas.scene.getFlag(MODULE_ID, 'scenescape');
    this._active = Boolean(flags?.markers?.length);

    if (flags) {
      this._distanceRatio = (flags.scaleDistance ?? 32) / 2;
      this._stepDistanceX = flags.speed ?? 4.3;
      this._stepDistanceY = flags.speedY ?? 8.6;
      this._movementLimits = flags.movementLimits;
      this._markers = flags.markers;
      this._hideBorder = flags.hideBorder;
      this.pixelPerfect = Boolean(flags.pixelPerfect ?? true);
    }
  }

  static getParallaxParameters(pos) {
    const markers = canvas.scene.getFlag(MODULE_ID, 'scenescape')?.markers;
    if (!markers) return { scale: 1, elevation: 0 };

    const y = Math.clamp(pos.y, 0, canvas.dimensions.height);
    const { m1, m2 } = this._getBoundingMarkers(y, 'y');

    if (m1 == m2) return { scale: m1.height / m1.realHeight, elevation: m1.elevation };

    // Percentage wise where is pos between the markers
    const r = (y - m1.y) / (m2.y - m1.y);

    // Assume linear change in scale between the markers
    let scale1 = m1.height / m1.realHeight;
    let scale2 = m2.height / m2.realHeight;
    let scale = (scale2 - scale1) * r + scale1;

    let elevation = (m2.elevation - m1.elevation) * r + m1.elevation;

    return { scale, elevation };
  }

  /**
   * Retrieves markers that bound the provided value with param as the value's name
   * @param {number} val y coordinate or elevation
   * @param {String} param 'y' | 'elevation'
   * @param {object} markers
   * @returns
   */
  static _getBoundingMarkers(val, param) {
    if (!this._markers) return {};

    // Find the 2 markers pos is between
    let i = this._markers.length - 1;
    while (this._markers[i][param] > val) i--;
    let m1 = this._markers[i];

    i = 0;
    while (this._markers[i][param] < val) i++;
    let m2 = this._markers[i];

    return { m1, m2 };
  }

  static moveCoordinate(pos, dx, dy, ignoreLimits = false) {
    if (dx === 0 && dy === 0) return pos;

    let nX = pos.x;
    let nY = pos.y;

    let { scale, elevation } = this.getParallaxParameters(pos);

    if (dx !== 0) {
      dx = this.stepDistanceX * dx;
      nX += (100 / 6) * scale * dx;
      nX = Math.clamp(nX, 0, canvas.dimensions.width);
    }

    if (dy !== 0) {
      dy = this.stepDistanceY * dy;
      const markers = this._markers;

      let nElevation = Math.clamp(elevation + dy, 0, markers[markers.length - 1].elevation);
      let { m1, m2 } = this._getBoundingMarkers(nElevation, 'elevation', markers);

      if (m1 == m2) {
        nY = m1.y;
      } else {
        // Percentage wise where is new elevation between the markers
        const r = (nElevation - m1.elevation) / (m2.elevation - m1.elevation);

        nY = (m2.y - m1.y) * r + m1.y;
      }
    }

    // Enforce movement limits
    if (this.movementLimits && !ignoreLimits) {
      if (this.movementLimits.y1 != null) nY = Math.max(nY, this.movementLimits.y1);
      if (this.movementLimits.y2 != null) nY = Math.min(nY, this.movementLimits.y2);
    }

    return { x: nX, y: nY };
  }

  static processReferenceMarkers(scene) {
    this.loadFlags();
    // Retrieve marker tiles from the scene and sort them on the y-axis
    const markers = scene.tiles
      .filter((d) => d.getFlag(MODULE_ID, 'scenescape')?.marker)
      .map((d) => {
        const size = d.getFlag(MODULE_ID, 'scenescape').size;
        return {
          x: d.x + d.width / 2,
          y: d.y + d.height,
          size,
          height: d.height,
          realHeight: 100 * (size / 6),
        };
      })
      .sort((m1, m2) => m1.y - m2.y)
      .filter((m, pos, arr) => {
        return !pos || m.y !== arr[pos - 1].y;
      });

    // To simplify processing later, lets insert markers at y=0 and y=scene height
    if (markers.length) {
      if (markers[0].y > 0) {
        markers.unshift({ ...markers[0], y: 0, virtual: true });
      }
      if (markers[markers.length - 1].y < canvas.dimensions.height) {
        markers.push({ ...markers[markers.length - 1], y: canvas.dimensions.height, virtual: true });
      }
    }

    // Calculate and assign elevation to each marker
    if (markers.length) {
      let elevation = 0;
      markers[0].elevation = 0;
      for (let i = 1; i < markers.length; i++) {
        let m1 = markers[i - 1];
        let m2 = markers[i];

        let scale1 = m1.height / m1.realHeight;
        let scale2 = m2.height / m2.realHeight;

        let distance;
        if (scale1 < scale2) {
          distance = Scenescape.distanceRatio * (scale2 / scale1);
        } else if (scale1 > scale2) {
          distance = Scenescape.distanceRatio * (scale1 / scale2);
        } else {
          distance = ((m2.y - m1.y) / scale1) * (6 / 100); // TODO test
        }

        elevation += distance;

        markers[i].elevation = elevation;
      }
    }

    if (markers.length) {
      let lastM = markers[markers.length - 1];

      return {
        markers,
        foregroundElevation:
          Math.round(lastM.elevation + (lastM.size / lastM.height) * (canvas.dimensions.height - lastM.y)) + 1,
      };
    }
    return {};
  }

  /**
   * Determines actor size in feet
   * @param {Actor} actor
   * @returns {Number} feet
   */
  static _getActorSize(actor, token) {
    if (typeof actor === 'string') actor = game.actors.get(actor);
    if (!actor) return token.height * 6;

    // Retrieves numbers from a string assuming the first number represents feet and the 2nd inches
    // The total is returned in feet
    // e.g. "6 feet 6 inches" => 6.5
    // e.g. 4'3'' => 4.25
    const parseHeightString = function (heightString) {
      const matches = heightString.match(/[\d|,|.|\+]+/g);
      if (matches?.length) {
        let feet = Number(matches[0]);
        let inches = matches.length > 1 ? Number(matches[1]) : 0;
        feet += inches / 12;
        return feet;
      }
      return null;
    };

    if (game.system.id === 'dnd5e') {
      const height = parseHeightString(actor.system.details?.height ?? '');
      if (height) return height;
    } else if (game.system.id === 'pf2e') {
      const height = parseHeightString(actor.system.details?.height?.value ?? '');
      if (height) return height;
    }

    return actor.prototypeToken.height * 6;
  }

  static getTokenSize(token) {
    token = token.document ?? token;

    let size =
      foundry.utils.getProperty(token, `flags.${MODULE_ID}.size`) ??
      Scenescape._getActorSize(token.actor ?? token.actorId, token);
    return (size / 6) * 100;
  }
}
