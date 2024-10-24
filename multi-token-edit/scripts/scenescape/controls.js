import { MODULE_ID } from '../constants.js';
import { editPreviewPlaceables, Picker } from '../picker.js';
import { libWrapper } from '../shim/shim.js';
import { loadImageVideoDimensions } from '../utils.js';
import ScenescapeConfig from './configuration.js';
import { Scenescape } from './scenescape.js';

/**
 * Class to manage registering and un-registering of wrapper functions to change
 * token and tile control behavior on Scenescapes
 */
export class ScenescapeControls {
  static _wrapperIds = [];
  static _hooks = [];

  static registerMainHooks() {
    Hooks.on('updateScene', (scene) => {
      if (scene.id === canvas.scene?.id) {
        Scenescape.loadFlags();
        this._checkActivateControls();
      }
    });

    Hooks.on('canvasInit', (canvas) => {
      Scenescape.loadFlags();
      this._checkActivateControls();
      ScenescapeConfig.close();
    });
  }

  static _checkActivateControls() {
    if (Scenescape.active) {
      ScenescapeControls._register();
      this.displayBlackBars(Scenescape.blackBars);
    } else {
      ScenescapeControls._unregister();
      this.displayBlackBars(false);
    }
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

    // On token texture update we want to keep the token height and position to stay the same while
    // adopting the new aspect ratio
    id = Hooks.on('updateToken', async (token, change, options, userId) => {
      if (game.user.id === userId && foundry.utils.getProperty(change, 'texture.src') && token.object) {
        let { width, height } = token.object.getSize();
        let textureDimensions = await loadImageVideoDimensions(change.texture.src);

        let updatedWidth = textureDimensions.width * (height / textureDimensions.height);

        token.update(
          {
            width: updatedWidth / canvas.scene.grid.sizeX,
            [`flags.${MODULE_ID}.width`]: updatedWidth / canvas.scene.grid.sizeX,
            x: token.x + (width - updatedWidth) / 2,
          },
          { animate: false }
        );
      }
    });
    this._hooks.push({ hook: 'updateToken', id });

    id = Hooks.on('createToken', async (token, options, userId) => {
      if (game.user.id !== userId || options.spawnPreset) return;

      let { width, height } = await loadImageVideoDimensions(token.texture.src);
      if (width && height) {
        const bottom = {
          x: token.x + (token.width * canvas.dimensions.size) / 2,
          y: token.y + token.height * canvas.dimensions.size,
        };

        const { scale, elevation } = Scenescape.getParallaxParameters(bottom);

        const actorDefinedSize = (Scenescape._getActorSize(token.actor, token) / 6) * 100;
        const r = actorDefinedSize / height;

        width *= scale * r;
        height *= scale * r;

        const x = bottom.x - width / 2;
        const y = bottom.y - height;

        width /= canvas.dimensions.size;
        height /= canvas.dimensions.size;

        token.update({ x, y, width, height, elevation, flags: { [MODULE_ID]: { width, height } } });
      }
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

    // Hide AmbientLight warning on drag
    id = libWrapper.register(
      MODULE_ID,
      'AmbientLight.prototype._canDragLeftStart',
      function (wrapped, ...args) {
        if (this.layer?.preview?.children.length) return false;
        return wrapped(...args);
      },
      'MIXED'
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
        let { width, height } = ScenescapeControls._getTokenDimensions(this.document);

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

    /**
     * Activate Picker preview instead of regular drag/drop flow
     */
    id = libWrapper.register(
      MODULE_ID,
      'PlaceableObject.prototype._onDragLeftStart',
      function (event) {
        let objects = this.layer.options.controllableObjects ? this.layer.controlled : [this];

        objects = objects.filter((o) => o._canDrag(game.user, event) && !o.document.locked);

        if (objects.length) {
          const draggedObject = objects[0];
          draggedObject._meDragging = true;
          editPreviewPlaceables([draggedObject], true, () => {
            draggedObject._meDragging = undefined;
            draggedObject.renderFlags.set({ refreshState: true });
          });
        }

        event.interactionData.clones = [];
        return false;
      },
      'OVERRIDE'
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'PlaceableObject.prototype._canDragLeftStart',
      function (wrapped, user, event) {
        if (Picker.isActive() || !user.isGM) return false;

        return wrapped(user, event);
      },
      'MIXED'
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'PlaceableObject.prototype._getTargetAlpha',
      function (wrapped) {
        if (this._meDragging) return 0.4;
        return wrapped();
      },
      'MIXED'
    );
    this._wrapperIds.push(id);
  }

  static _getTokenDimensions(token) {
    let { width, height } = token;

    if (token.flags?.[MODULE_ID]?.width != null) width = token.flags[MODULE_ID].width;
    if (token.flags?.[MODULE_ID]?.height != null) height = token.flags[MODULE_ID].height;

    return { width, height };
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
      const params = Scenescape.getParallaxParameters(bottom);
      const dimensions = canvas.dimensions;

      const nBottom = Scenescape.moveCoordinate(
        bottom,
        dx * incrementScale,
        dy * incrementScale,
        documentName === 'Tile'
      );
      const nParams = Scenescape.getParallaxParameters(nBottom);

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

      return update;
    });

    await canvas.scene.updateEmbeddedDocuments(documentName, updateData, { teleport: true });
    return objects;
  }

  static displayBlackBars(display) {
    let bars = canvas.primary.getChildByName('scenescapeBlackBars');
    if (!display && bars) {
      canvas.primary.removeChild(bars)?.destroy(true);
    } else if (display) {
      if (bars) canvas.primary.removeChild(bars)?.destroy(true);

      bars = new PIXI.Container();
      bars.name = 'scenescapeBlackBars';
      bars.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.DRAWINGS;
      bars.elevation = 99999999;
      bars.restrictsLight = true;

      const graphics = new PIXI.Graphics();
      bars.addChild(graphics);

      const dimensions = canvas.scene.dimensions;

      graphics.beginFill(0x000000);
      graphics.drawRect(0, 0, dimensions.width, dimensions.height);
      graphics.endFill();

      graphics.beginHole();
      graphics.drawRect(dimensions.sceneX, dimensions.sceneY, dimensions.sceneWidth, dimensions.sceneHeight);
      graphics.endHole();

      canvas.primary.addChild(bars);
    }

    console.log(display, canvas.primary);
  }
}
