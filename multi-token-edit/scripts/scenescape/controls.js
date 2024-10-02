import { MODULE_ID } from '../constants.js';
import { libWrapper } from '../shim/shim.js';
import { loadImageVideoDimensions } from '../utils.js';
import { SceneScape } from './scenescape.js';

/**
 * Class to manage registering and un-registering of wrapper functions to change
 * token and tile control behavior on Scenescapes
 */
export class ScenescapeControls {
  static _wrapperIds = [];
  static _hooks = [];

  static registerMainHooks() {
    Hooks.on('updateScene', (scene) => {
      if (scene.id === canvas.scene?.id) this._checkActivateControls();
    });

    Hooks.on('canvasInit', (canvas) => {
      this._checkActivateControls();
    });
  }

  static _checkActivateControls() {
    if (SceneScape.active) ScenescapeControls._register();
    else ScenescapeControls._unregister();
  }

  static _register() {
    this._registerLibWrappers();
    this._registerHooks();
  }

  static _unregister() {
    this._wrapperIds.forEach((id) => {
      libWrapper.unregister(MODULE_ID, id);
    });
    this._hooks.forEach((h) => {
      Hooks.off(h.hook, h.id);
    });
    this._wrapperIds = [];
    this._hooks = [];
  }

  static _registerHooks() {
    if (this._hooks.length) return;

    let id;

    id = Hooks.on('preCreateToken', async (token, data, options, userId) => {
      if (!options.spawnPreset && token.actor?.img) token.updateSource({ 'texture.src': token.actor.img });
    });
    this._hooks.push({ hook: 'preCreateToken', id });

    id = Hooks.on('createToken', async (token, options, userId) => {
      if (game.user.id !== userId || options.spawnPreset) return;

      let { width, height } = await loadImageVideoDimensions(token.texture.src);
      if (width && height) {
        width /= canvas.dimensions.size;
        height /= canvas.dimensions.size;
        token.update({ width, height, flags: { [MODULE_ID]: { width, height } } });
      }
      // TODO scale
    });
    this._hooks.push({ hook: 'createToken', id });
  }

  static _registerLibWrappers() {
    if (this._wrapperIds.length) return;

    let id;

    // Hide token elevation tooltip
    id = libWrapper.register(
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
    const incrementScale = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT) ? 0.5 : 1.0;

    const updateData = objects.map((obj) => {
      let update = { _id: obj.id };

      const size = documentName === 'Token' ? obj.getSize() : obj.document;
      const bottom = { x: obj.document.x + size.width / 2, y: obj.document.y + size.height };
      const params = SceneScape.getParallaxParameters(bottom);
      const dimensions = canvas.dimensions;

      const nBottom = SceneScape.moveCoordinate(bottom, dx * incrementScale, dy * incrementScale);
      const nParams = SceneScape.getParallaxParameters(nBottom);

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

        update.x = nBottom.x - (update.width * dimensions.size) / 2;
        update.y = nBottom.y - update.height * dimensions.size;

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

        update.x = nBottom.x - update.width / 2;
        update.y = nBottom.y - update.height;
      }

      update.elevation = nParams.elevation;

      console.log(update);

      return update;
    });

    await canvas.scene.updateEmbeddedDocuments(documentName, updateData, { teleport: true });
    return objects;
  }
}
