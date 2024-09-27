import { MODULE_ID } from '../constants.js';
import { libWrapper } from '../shim/shim.js';

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

  Hooks.on('updateScene', (scene) => {
    if (scene.id === canvas.scene?.id) ScenescapeControls.register();
  });

  Hooks.on('canvasInit', (canvas) => {
    ScenescapeControls.register();
  });
}

/**
 * Class to manage registering and un-registering of wrapper functions to change
 * token and tile control behavior on Scenescapes
 */
class ScenescapeControls {
  static _wrapperIds = [];

  static register() {
    if (SceneScape.active) ScenescapeControls.registerLibWrappers();
    else ScenescapeControls.unregisterLibWrappers();
  }

  static unregisterLibWrappers() {
    this._wrapperIds.forEach((id) => {
      libWrapper.unregister(MODULE_ID, id);
    });
    this._wrapperIds = [];
  }

  static registerLibWrappers() {
    if (this._wrapperIds.length) return;

    // Hide token elevation tooltip
    let id = libWrapper.register(
      MODULE_ID,
      'Token.prototype._getTooltipText',
      function (wrapped, ...args) {
        wrapped(...args);
        return '';
      },
      'WRAPPER'
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(MODULE_ID, 'TokenLayer.prototype.moveMany', this._moveMany, 'OVERRIDE');
    this._wrapperIds.push(id);

    id = libWrapper.register(MODULE_ID, 'TilesLayer.prototype.moveMany', this._moveMany, 'OVERRIDE');
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'Token.prototype.getSize',
      function (...args) {
        let { width, height } = this.document;

        if (this.document.flags?.[MODULE_ID]?.width != null) width = this.document.flags[MODULE_ID].width;
        if (this.document.flags?.[MODULE_ID]?.height != null) height = this.document.flags[MODULE_ID].height;

        const grid = this.scene.grid;
        width *= grid.sizeX;
        height *= grid.sizeY;
        return { width, height };
      },
      'OVERRIDE'
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'Token.prototype._onUpdate',
      function (wrapped, changed, options, userId) {
        if (
          foundry.utils.getProperty(changed, `flags.${MODULE_ID}.width`) != null ||
          foundry.utils.getProperty(changed, `flags.${MODULE_ID}.height`) != null
        ) {
          this.renderFlags.set({ refreshSize: true });
        }
        return wrapped(changed, options, userId);
      },
      'WRAPPER'
    );
    this._wrapperIds.push(id);
  }

  static async _moveMany({ dx = 0, dy = 0, rotate = false, ids, includeLocked = false } = {}) {
    if (dx === 0 && dy === 0) return [];

    const objects = this._getMovableObjects(ids, includeLocked);
    if (!objects.length) return objects;

    // Conceal any active HUD
    this.hud?.clear();

    const documentName = this.constructor.documentName;

    const updateData = objects.map((obj) => {
      let update = { _id: obj.id };

      const size = documentName === 'Token' ? obj.getSize() : obj.document;
      const bottom = { x: obj.document.x + size.width / 2, y: obj.document.y + size.height };
      const params = SceneScape.getParallaxParameters(bottom);
      const dimensions = canvas.dimensions;

      if (dx !== 0) {
        update.x =
          obj.document.x +
          params.scale *
            (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT) ? 0.35 : 1.0) *
            dimensions.size *
            dx;
        bottom.x = update.x + size.width / 2;
      }

      if (dy !== 0) {
        bottom.y +=
          dimensions.size * (game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT) ? 0.35 : 1.0) * dy;

        // Bound within top and bottom of the scene
        if (bottom.y < dimensions.sceneY) bottom.y = dimensions.sceneY;
        if (bottom.y > dimensions.sceneY + dimensions.sceneHeight)
          bottom.y = dimensions.sceneY + dimensions.sceneHeight;

        const nParams = SceneScape.getParallaxParameters(bottom);
        const deltaScale = nParams.scale / params.scale;

        if (documentName === 'Token') {
          update.width = (size.width * deltaScale) / dimensions.size;
          update.height = (size.height * deltaScale) / dimensions.size;

          update.flags = {
            [MODULE_ID]: {
              width: update.width,
              height: update.height,
            },
          };

          update.x = bottom.x - (update.width * dimensions.size) / 2;
          update.y = bottom.y - update.height * dimensions.size;

          // Prevent foundry validation errors
          // We attempt to keep TokenDocument and the width/height flag as close as possible where we can
          // but we have to diverge at this threshold
          if (update.width < 0.5 || update.height < 0.5) {
            update.width = 0.5;
            update.height = 0.5;
          }
        } else {
          update.width = size.width * deltaScale;
          update.height = size.height * deltaScale;

          update.x = bottom.x - update.width / 2;
          update.y = bottom.y - update.height;
        }

        update.elevation = SceneScape.getDepth() * nParams.scale;
      }

      return update;
    });

    await canvas.scene.updateEmbeddedDocuments(documentName, updateData, { teleport: true });
    return objects;
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
