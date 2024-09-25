import { MODULE_ID } from './constants';
import { DataTransformer } from './data/transformer';
import { Picker } from './picker';
import { libWrapper } from './shim/shim';

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

  // Foundry stores Token width/height values in increments of 0.5. We need to preserve more granular updates as a flag
  // and use that flag in getSize() to override normal rendering of Tokens
  // Hooks.on('preUpdateToken', (tokenDoc, update, options, userId) => {
  //   if (update.hasOwnProperty('x') || update.hasOwnProperty('y')) {
  //     if (!options.preventParallaxScaling) {
  //       let originalX =
  //         tokenDoc.x + ((tokenDoc.flags[MODULE_ID]?.width ?? tokenDoc.width) * canvas.dimensions.size) / 2;
  //       let originalY = tokenDoc.y + (tokenDoc.flags[MODULE_ID]?.height ?? tokenDoc.height) * canvas.dimensions.size;
  //       let updatedX =
  //         (update.x ?? tokenDoc.x) +
  //         ((update.width ?? tokenDoc.flags[MODULE_ID]?.width ?? tokenDoc.width) * canvas.dimensions.size) / 2;
  //       let updatedY =
  //         (update.y ?? tokenDoc.y) +
  //         (update.height ?? tokenDoc.flags[MODULE_ID]?.height ?? tokenDoc.height) * canvas.dimensions.size;

  //       let originalParaScale = Picker._calcParaScale({ x: originalX, y: originalY });
  //       let updatedParaScale = Picker._calcParaScale({ x: updatedX, y: updatedY });

  //       let paraScaleDiff = updatedParaScale - originalParaScale;

  //       let originalData = tokenDoc.toObject();
  //       originalData.width = tokenDoc.flags[MODULE_ID]?.width ?? originalData.width;
  //       originalData.height = tokenDoc.flags[MODULE_ID]?.height ?? originalData.height;
  //       let transformedData = foundry.utils.deepClone(originalData);

  //       DataTransformer.apply('Token', transformedData, { x: 0, y: 0 }, { scale: 1 + paraScaleDiff });

  //       update.width = transformedData.width;
  //       update.height = transformedData.height;
  //       update.elevation = SceneScape.getDepth() * updatedParaScale;
  //       update.x = tokenDoc.x - (tokenDoc.x - (update.x ?? tokenDoc.x)) * (1 + paraScaleDiff);
  //       update.y = tokenDoc.y - (tokenDoc.y - (update.y ?? tokenDoc.y)) * (1 + paraScaleDiff);
  //     }
  //   }

  //   if (update.hasOwnProperty('width')) {
  //     if (update.width % 0.5 != 0) foundry.utils.setProperty(update, `flags.${MODULE_ID}.width`, update.width);
  //     else foundry.utils.setProperty(update, `flags.${MODULE_ID}.-=width`, null);
  //   }
  //   if (update.hasOwnProperty('height')) {
  //     if (update.height % 0.5 != 0) foundry.utils.setProperty(update, `flags.${MODULE_ID}.height`, update.height);
  //     else foundry.utils.setProperty(update, `flags.${MODULE_ID}.-=height`, null);
  //   }
  // });

  // Hide token elevation tooltip
  libWrapper.register(
    MODULE_ID,
    'Token.prototype._getTooltipText',
    function (wrapped, ...args) {
      wrapped(...args);
      return '';
    },
    'WRAPPER'
  );

  // TODO: implement consistent y step size
  libWrapper.register(
    MODULE_ID,
    'TokenLayer.prototype.moveMany',
    async function (wrapped, { dx = 0, dy = 0, rotate = false, ids, includeLocked = false } = {}) {
      console.log('moveMany', { dx, dy, rotate, ids, includeLocked });

      const objects = this._getMovableObjects(ids, includeLocked);
      if (!objects.length) return objects;

      // Conceal any active HUD
      this.hud?.clear();

      const updateData = objects.map((obj) => {
        let update = { _id: obj.id };

        const size = obj.getSize();
        const bottom = { x: obj.document.x + size.width / 2, y: obj.document.y + size.height };
        const params = SceneScape.getParallaxParameters(bottom);
        const dimensions = canvas.dimensions;

        if (dx !== 0) {
          update.x = obj.document.x + params.scale * dimensions.size * dx;
          bottom.x = update.x + size.width / 2;
        }

        if (dy !== 0) {
          bottom.y = bottom.y + dimensions.size * params.scale * dy;
          // Bound within top and bottom of the scene
          if (bottom.y < dimensions.sceneY) bottom.y = dimensions.sceneY;
          if (bottom.y > dimensions.sceneY + dimensions.sceneHeight)
            bottom.y = dimensions.sceneY + dimensions.sceneHeight;

          let nParams = SceneScape.getParallaxParameters(bottom);
          // if (nParams.foreground !== params.foreground) {
          //   bottom.y = horizonY;
          //   nParams = SceneScape.getParallaxParameters(bottom);
          // }
          const deltaScale = nParams.scale / params.scale;

          update.width = (size.width * deltaScale) / dimensions.size;
          update.height = (size.height * deltaScale) / dimensions.size;

          update.flags = {
            [MODULE_ID]: {
              width: update.width,
              height: update.height,
            },
          };

          update.elevation = SceneScape.getDepth() * nParams.scale;
          update.x = bottom.x - (update.width * dimensions.size) / 2;
          update.y = bottom.y - update.height * dimensions.size;

          // Prevent foundry validation errors
          // We attempt to keep TokenDocument and the width/height flag as close as possible where we can
          // but we have to diverge at this threshold
          if (update.width < 0.3 || update.height < 0.3) {
            delete update.width;
            delete update.height;
          }

          console.log('update', update);
        }

        return update;
      });

      await canvas.scene.updateEmbeddedDocuments(this.constructor.documentName, updateData, { animate: false });
      objects[0].renderFlags.set({ redraw: true }); // TODO
      return objects;

      //return wrapped(...args);
    },
    'MIXED'
  );

  libWrapper.register(
    MODULE_ID,
    'Token.prototype.getSize',
    function (wrapped, ...args) {
      // _pData is set by Mass Edit in previews
      if (this._pData) return wrapped(...args);

      let { width, height } = this.document;

      if (this.document.flags?.[MODULE_ID]?.width != null) width = this.document.flags[MODULE_ID].width;
      if (this.document.flags?.[MODULE_ID]?.height != null) height = this.document.flags[MODULE_ID].height;

      const grid = this.scene.grid;
      width *= grid.sizeX;
      height *= grid.sizeY;
      return { width, height };
    },
    'MIXED'
  );
}

function getTokenCenterBottom(token) {
  token = token.object ?? token;
  const size = token.getSize();
  return { x: token.x + size.width / 2, y: token.document.y + size.height };
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
      if (event.nativeEvent.which == 1) this._save(event.data.getLocalPosition(overlay));
      this._exit();
    });
    overlay.on('contextmenu', () => {
      this._exit();
    });

    overlay.on('pointermove', (event) => {
      this._drawLine(event.data.getLocalPosition(overlay));
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
    return 100; // Make this a scene flag or use the foreground elevation
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
