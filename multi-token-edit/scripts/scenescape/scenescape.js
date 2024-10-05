import { MODULE_ID } from '../constants.js';
import ScenescapeConfig from './configuration.js';
import { ScenescapeControls } from './controls.js';

export function registerSceneScapeHooks() {
  Hooks.on('renderSceneConfig', (app, html, options) => {
    const element = $(`
<div class="form-group">
    <label>Scenescape</label>
    <div class="form-fields">
        <button  class="configureScenescape" type="button" data-tooltip="Configure Scenescape">
          <i class="fa-regular fa-mountain-sun"></i>
        </button>
    </div>
    <p class="notes">Configure this scene as a 'Scenescape' allowing dynamic scaling and positioning of assets on a landscape background.</p>
</div>
        `);
    element.on('click', '.configureScenescape', () => new ScenescapeConfig().render(true));

    html.find('.initial-position').after(element);
    app.setPosition({ height: 'auto' });
  });

  ScenescapeControls.registerMainHooks();
}

export class ScenescapeScaler {
  static lockScale() {
    // TODO replace realHeight with scale?

    // Retrieve marker tiles from the scene and sort them on the y-axis
    const markers = canvas.tiles.placeables
      .filter((p) => p.document.getFlag(MODULE_ID, 'scenescape')?.marker)
      .map((p) => {
        const size = p.document.getFlag(MODULE_ID, 'scenescape').size;
        return {
          x: p.document.x + p.document.width / 2,
          y: p.document.y + p.document.height,
          size,
          height: p.document.height,
          realHeight: 100 * (size / 6),
        };
      })
      .sort((c1, c2) => c1.y - c2.y);

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
          distance = SceneScape.distanceRatio * (scale2 / scale1) * (6 / 100);
        } else if (scale1 > scale2) {
          distance = SceneScape.distanceRatio * (scale1 / scale2) * (6 / 100);
        } else {
          distance = (m1.size / m1.height) * (m2.y - m1.y); // TODO test
        }

        elevation += distance;

        markers[i].elevation = elevation;
      }
    }

    let update = {};
    if (!markers.length) update[`flags.${MODULE_ID}.scenescape.-=markers`] = null;
    else {
      update[`flags.${MODULE_ID}.scenescape.markers`] = markers;
      const lastM = markers[markers.length - 1];
      update.foregroundElevation =
        Math.round(lastM.elevation + (lastM.size / lastM.height) * (canvas.dimensions.height - lastM.y)) + 1;
    }
    canvas.scene.update(update);
  }
}

export class SceneScape {
  static get active() {
    return this._active;
  }

  static get distanceRatio() {
    return this._distanceRatio;
  }

  static get stepDistance() {
    return this._stepDistance;
  }

  static get movementLimits() {
    return this._movementLimits;
  }

  static loadFlags() {
    const flags = canvas.scene.getFlag(MODULE_ID, 'scenescape');
    console.log('LOAD FLAGS', flags);
    if (flags) {
      this._active = Boolean(flags.markers?.length);
      this._distanceRatio = (flags.distanceRatio ?? 400) / 2;
      this._stepDistance = flags.stepDistance ?? 1;
      this._movementLimits = flags.movementLimits;
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
  static _getBoundingMarkers(val, param, markers = canvas.scene.getFlag(MODULE_ID, 'scenescape')?.markers) {
    if (!markers) return {};

    // Find the 2 markers pos is between
    let i = markers.length - 1;
    while (markers[i][param] > val) i--;
    let m1 = markers[i];

    i = 0;
    while (markers[i][param] < val) i++;
    let m2 = markers[i];

    return { m1, m2 };
  }

  static moveCoordinate(pos, dx, dy, ignoreLimits = false) {
    if (dx === 0 && dy === 0) return pos;

    let nX = pos.x;
    let nY = pos.y;

    let { scale, elevation } = this.getParallaxParameters(pos);

    if (dx !== 0) {
      dx = this.stepDistance * dx;
      nX += (100 / 6) * scale * dx;
      nX = Math.clamp(nX, 0, canvas.dimensions.width);
    }

    if (dy !== 0) {
      dy = this.stepDistance * dy;
      const markers = canvas.scene.getFlag(MODULE_ID, 'scenescape')?.markers;

      let nElevation = Math.clamp(elevation + dy, 0, markers[markers.length - 1].elevation);
      let { m1, m2 } = this._getBoundingMarkers(nElevation, 'elevation', markers);

      if (m1 == m2) return { x: nX, y: m1.y };

      // Percentage wise where is new elevation between the markers
      const r = (nElevation - m1.elevation) / (m2.elevation - m1.elevation);

      nY = (m2.y - m1.y) * r + m1.y;
    }

    // Enforce movement limits
    if (this.movementLimits && !ignoreLimits) {
      if (this.movementLimits.y1 != null) nY = Math.max(nY, this.movementLimits.y1);
      if (this.movementLimits.y2 != null) nY = Math.min(nY, this.movementLimits.y2);
    }

    return { x: nX, y: nY };
  }
}
