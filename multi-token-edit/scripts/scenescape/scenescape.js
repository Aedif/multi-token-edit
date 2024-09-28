import { MODULE_ID } from '../constants.js';
import { ScenescapeControls } from './controls.js';

export function registerSceneScapeHooks() {
  Hooks.on('renderSceneConfig', (app, html, options) => {
    const element = $(`
<div class="form-group">
    <label>Scenescape</label>
    <div class="form-fields">
        <label class="checkbox">
            Is this scene a Scenescape?
            <input type="checkbox" name="flags.${MODULE_ID}.scenescape" ${
      app.object.getFlag(MODULE_ID, 'scenescape') ? 'checked' : ''
    }>
        </label>
        <button class="selectHorizon" type="button" data-tooltip="Define the horizon line.">
            <i class="fa-solid fa-reflect-horizontal fa-rotate-90"></i>
        </button>
    </div>
</div>
        `);
    element.on('click', '.selectHorizon', () => HorizonSelector.select(app));

    html.find('.initial-position').after(element);
    app.setPosition({ height: 'auto' });
  });

  ScenescapeControls.registerMainHooks();
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
    return canvas.scene.getFlag(MODULE_ID, 'scenescape');
  }

  static getDepth() {
    return canvas.scene.foregroundElevation - 1 || 100;
  }

  static getParallaxParameters(pos) {
    const dimensions = canvas.dimensions;
    const horizonY = canvas.scene.getFlag(MODULE_ID, 'horizon') ?? dimensions.y;
    let foreground = true;
    let scale;
    if (pos.y >= horizonY) {
      // Foreground / Below horizon
      scale = Math.min(
        Math.max((pos.y - horizonY) / (dimensions.sceneY + dimensions.sceneHeight - horizonY), 0.01),
        1.0
      );
    } else {
      // Background / Above horizon
      scale = 1 - Math.min(Math.max((pos.y - dimensions.sceneY) / (horizonY - dimensions.sceneY), 0.0), 0.9);
      foreground = false;
    }

    return { scale, elevation: this.getDepth() * scale, foreground };
  }
}
