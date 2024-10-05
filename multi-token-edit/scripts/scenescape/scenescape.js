import { MODULE_ID } from '../constants.js';
import ScenescapeConfig from './configuration.js';
import { ScenescapeControls } from './controls.js';

export function registerSceneScapeHooks() {
  Hooks.on('renderSceneConfig', (app, html, options) => {
    const element = $(`
<div class="form-group">
    <label>Scenescape</label>
    <div class="form-fields">
        <button class="selectHorizon" type="button" data-tooltip="Define the horizon line.">
            <i class="fa-solid fa-reflect-horizontal fa-rotate-90"></i>
        </button>
        <button  class="configureScenescape" type="button" data-tooltip="Configure Scenescape">
          <i class="fa-regular fa-mountain-sun"></i>
        </button>
    </div>
</div>
        `);
    element.on('click', '.selectHorizon', () => HorizonSelector.select(app));
    element.on('click', '.configureScenescape', () => new ScenescapeConfig().render(true));

    html.find('.initial-position').after(element);
    app.setPosition({ height: 'auto' });
  });

  ScenescapeControls.registerMainHooks();
}

export class ScenescapeScaler {
  static distanceRatio = 400 / 2;

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
          distance = this.distanceRatio * (scale2 / scale1) * (6 / 100);
        } else if (scale1 > scale2) {
          distance = this.distanceRatio * (scale1 / scale2) * (6 / 100);
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

class HorizonSelector {
  static select(app) {
    if (this.overlay) return;

    let overlay = new PIXI.Container();
    overlay.app = app;
    overlay.hitArea = canvas.dimensions.rect;
    overlay.cursor = 'crosshair';
    overlay.interactive = true;
    overlay.zIndex = 5;

    overlay.addChild(new PIXI.Graphics());

    overlay.on('mouseup', (event) => {
      if (event.nativeEvent.which == 1) this._save(this.pos);
      this._exit();
    });
    overlay.on('contextmenu', () => {
      this._exit();
    });

    overlay.on('pointermove', (event) => {
      const pos = event.data.getLocalPosition(overlay);
      const dimensions = canvas.dimensions;
      pos.y = Math.clamp(pos.y, dimensions.sceneY, dimensions.sceneY + dimensions.sceneHeight);
      this._drawLine(pos);
      this.pos = pos;
    });

    canvas.stage.addChild(overlay);
    app.minimize();

    this.overlay = overlay;
  }

  static _drawLine(pos) {
    const graphics = this.overlay.children[0];
    graphics.clear();
    graphics.lineStyle(3, 0xff0000, 1.0, 0.5).moveTo(0, pos.y).lineTo(canvas.dimensions.rect.width, pos.y);
  }

  static _save(pos) {
    this.overlay.app?.object.setFlag(MODULE_ID, 'horizon', pos.y);
  }

  static _exit() {
    const overlay = this.overlay;
    if (overlay) {
      overlay.parent?.removeChild(overlay);
      overlay.destroy(true);
      overlay.children?.forEach((c) => c.destroy(true));
      overlay.app?.maximize();
      this.overlay = null;
    }
  }
}

export class SceneScape {
  static get active() {
    return canvas.scene.getFlag(MODULE_ID, 'scenescape')?.markers?.length;
  }

  static getStepSize() {
    return 1;
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

  static moveCoordinate(pos, dx, dy) {
    if (dx === 0 && dy === 0) return pos;

    let nX = pos.x;
    let nY = pos.y;

    let { scale, elevation } = this.getParallaxParameters(pos);

    if (dx !== 0) {
      dx = this.getStepSize() * dx;
      nX += (100 / 6) * scale * dx;
      nX = Math.clamp(nX, 0, canvas.dimensions.width);
    }

    if (dy !== 0) {
      dy = this.getStepSize() * dy;
      const markers = canvas.scene.getFlag(MODULE_ID, 'scenescape')?.markers;

      let nElevation = Math.clamp(elevation + dy, 0, markers[markers.length - 1].elevation);
      let { m1, m2 } = this._getBoundingMarkers(nElevation, 'elevation', markers);

      if (m1 == m2) return { x: nX, y: m1.y };

      // Percentage wise where is new elevation between the markers
      const r = (nElevation - m1.elevation) / (m2.elevation - m1.elevation);

      nY = (m2.y - m1.y) * r + m1.y;
    }

    return { x: nX, y: nY };
  }
}
