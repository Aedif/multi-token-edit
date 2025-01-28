import { MODULE_ID, SUPPORTED_PLACEABLES, THRESHOLDS } from '../constants.js';
import { DataTransformer } from '../data/transformer.js';
import { getDataBounds } from '../presets/utils.js';
import { libWrapper } from '../libs/shim/shim.js';

/**
 * Register/un-register pixel perfect hover wrappers
 */
let pixelPerfectTileWrapper;
let pixelPerfectTokenWrapper;

export function enablePixelPerfectSelect(force = false) {
  let tileWrapperChanged, tokenWrapperChanged;

  // Pixel perfect hover for tiles
  if (!game.settings.get(MODULE_ID, 'pixelPerfectTile') && !force) {
    if (pixelPerfectTileWrapper) {
      libWrapper.unregister(MODULE_ID, pixelPerfectTileWrapper);
      pixelPerfectTileWrapper = undefined;
      tileWrapperChanged = true;
    }
  } else if (!pixelPerfectTileWrapper) {
    pixelPerfectTileWrapper = libWrapper.register(
      MODULE_ID,
      'Tile.prototype._draw',
      async function (wrapped, ...args) {
        const result = await wrapped(...args);

        // Change the frame to use pixel contain function instead of rectangle contain
        const hitArea = this.frame.interaction.hitArea;
        hitArea._originalContains = hitArea.contains;
        hitArea._mesh = this.mesh;
        hitArea.contains = function (...args) {
          let contains = this._originalContains.call(this, ...args);
          if (contains && this._mesh)
            return this._mesh.containsCanvasPoint(canvas.mousePosition, THRESHOLDS.PIXEL_PERFECT_ALPHA);
          return contains;
        };

        return result;
      },
      'WRAPPER'
    );
    tileWrapperChanged = true;
  }

  // Pixel perfect hover for tokens
  if (!game.settings.get(MODULE_ID, 'pixelPerfectToken') && !force) {
    if (pixelPerfectTokenWrapper) {
      libWrapper.unregister(MODULE_ID, pixelPerfectTokenWrapper);
      pixelPerfectTokenWrapper = undefined;
      tokenWrapperChanged = true;
    }
  } else if (!pixelPerfectTokenWrapper) {
    pixelPerfectTokenWrapper = libWrapper.register(
      MODULE_ID,
      'Token.prototype.getShape',
      function (wrapped, ...args) {
        const shape = wrapped(...args);

        // Change the frame to use pixel contain function instead of rectangle contain
        shape._originalContains = shape.contains;
        shape._mesh = this.mesh;
        shape.contains = function (...args) {
          let contains = this._originalContains.call(this, ...args);
          if (contains && this._mesh)
            return this._mesh.containsCanvasPoint(canvas.mousePosition, THRESHOLDS.PIXEL_PERFECT_ALPHA);
          return contains;
        };

        return shape;
      },
      'WRAPPER'
    );
    tokenWrapperChanged = true;
  }

  if (tileWrapperChanged) canvas.tiles?.placeables.forEach((t) => t.renderFlags.set({ redraw: true }));
  if (tokenWrapperChanged) canvas.tokens?.placeables.forEach((t) => t.renderFlags.set({ refreshShape: true }));
}

/**
 * Enable 'Select' tool for layers that do not have it. (AmbientLight, AmbientSound, MeasuredTemplate, and Note)
 */
export function enableUniversalSelectTool() {
  if (game.modules.get('select-tool-everywhere')?.active) return;

  const missingLayers = ['AmbientLight', 'AmbientSound', 'MeasuredTemplate', 'Note'];

  missingLayers.forEach((layer) => {
    Hooks.on(`refresh${layer}`, _placeableRefresh);
  });

  Hooks.on('canvasReady', () => {
    missingLayers.forEach((layer) => (canvas.getLayerByEmbeddedName(layer).options.controllableObjects = true));
    if (SUPPORTED_PLACEABLES.includes('Region')) canvas.regions.options.rotatableObjects = true;
  });

  Hooks.on('getSceneControlButtons', (controls) => _getControlButtons(controls));

  // :: Fixes ::

  // For notes the refresh hook is called while ControlIcon is still loading its texture (see ControlIcon.draw())
  // Once the texture is loaded border visibility will be reset to false undoing our change in _placeableRefresh
  // Instead delay and set visibility after draw to account for this
  Hooks.on('drawNote', (note) => {
    setTimeout(() => _placeableRefresh(note), 10);
  });

  // To avoid race conditions between multiple AmbientLight _onDragLeftCancel calls we'll defer the
  // canvas.perception update within 'updateSource' via a 'defer' argument
  libWrapper.register(
    MODULE_ID,
    'AmbientLight.prototype._onDragLeftCancel',
    function (...args) {
      Object.getPrototypeOf(AmbientLight).prototype._onDragLeftCancel.apply(this, args);
      // V12
      if (this.initializeLightSource) this.initializeLightSource({ defer: true });
      else this.updateSource({ defer: true });
    },
    'OVERRIDE'
  );

  if (foundry.utils.isNewerVersion(game.version, 12)) registerRegionWrappers();
}

/**
 * Insert select tools if missing
 */
function _getControlButtons(controls) {
  for (const control of controls) {
    if (['lighting', 'sounds', 'measure'].includes(control.name)) {
      if (!control.tools.find((t) => t.name === 'select')) {
        control.tools.unshift({
          name: 'select',
          title: 'CONTROLS.CommonSelect',
          icon: 'fas fa-expand',
        });
        control.activeTool = 'select';
      }
    }
  }

  if (!game.settings.get(MODULE_ID, 'disablePixelPerfectHoverButton')) {
    for (const control of controls) {
      if (control.name === 'tiles') {
        control.tools.push({
          name: 'pixelPerfect',
          title: 'Pixel Perfect Hover',
          icon: 'fa-solid fa-bullseye-pointer',
          visible: true,
          active: game.settings.get(MODULE_ID, 'pixelPerfectTile'),
          toggle: true,
          onClick: () => {
            game.settings.set(MODULE_ID, 'pixelPerfectTile', !game.settings.get(MODULE_ID, 'pixelPerfectTile'));
          },
        });
      } else if (control.name === 'token') {
        control.tools.push({
          name: 'pixelPerfect',
          title: 'Pixel Perfect Hover',
          icon: 'fa-solid fa-bullseye-pointer',
          visible: true,
          active: game.settings.get(MODULE_ID, 'pixelPerfectToken'),
          toggle: true,
          onClick: () => {
            game.settings.set(MODULE_ID, 'pixelPerfectToken', !game.settings.get(MODULE_ID, 'pixelPerfectToken'));
          },
        });
      }
    }
  }
}

function _placeableRefresh(placeable) {
  if (placeable.controlled) placeable.controlIcon.border.visible = true;
}

function registerRegionWrappers() {
  // Enable drag
  libWrapper.register(
    MODULE_ID,
    'Region.prototype._canDrag',
    function () {
      return game.user.isGM;
    },
    'OVERRIDE'
  );

  libWrapper.register(
    MODULE_ID,
    'Region.prototype._onDragLeftMove',
    function (event) {
      canvas._onDragCanvasPan(event);
      const { clones, destination, origin } = event.interactionData;
      const { x1, y1 } = getDataBounds('Region', this.document);

      // Calculate the (snapped) position of the dragged object
      let position = {
        x: x1 + (destination.x - origin.x),
        y: y1 + (destination.y - origin.y),
      };

      if (!event.shiftKey) position = this.layer.getSnappedPoint(position);

      const dx = position.x - x1;
      const dy = position.y - y1;
      for (const c of clones || []) {
        DataTransformer.apply('Region', c.document.toObject(), { x: 0, y: 0 }, { x: dx, y: dy }, c);
        c.visible = true;
        c._onUpdate({ shapes: null });
      }
    },
    'OVERRIDE'
  );

  libWrapper.register(
    MODULE_ID,
    'Region.prototype._prepareDragLeftDropUpdates',
    function (event) {
      const updates = [];
      for (const clone of event.interactionData.clones) {
        updates.push({ _id: clone._original.id, shapes: clone.document.toObject(false).shapes });
      }
      return updates;
    },
    'OVERRIDE'
  );

  // Enable rotation
  libWrapper.register(
    MODULE_ID,
    'Region.prototype.rotate',
    async function (delta, snap) {
      if (game.paused && !game.user.isGM) {
        ui.notifications.warn('GAME.PausedWarning', { localize: true });
        return this;
      }

      const data = this.document.toObject();
      const { x1, y1, x2, y2 } = getDataBounds('Region', data);
      const origin = {
        x: x1 + (x2 - x1) / 2,
        y: y1 + (y2 - y1) / 2,
      };

      DataTransformer.apply('Region', data, origin, { rotation: delta });
      await this.document.update({ shapes: data.shapes }, { meRotation: delta });
      return this;
    },
    'OVERRIDE'
  );

  libWrapper.register(
    MODULE_ID,
    'RegionLayer.prototype._onMouseWheel',
    function (event) {
      // Identify the hovered light source
      const region = this.hover;
      if (!region || region.isPreview || region.document.shapes.some((s) => s.type === 'ellipse')) return;

      // Determine the incremental angle of rotation from event data
      const snap = event.shiftKey ? 15 : 3;
      const delta = snap * Math.sign(event.delta);

      region.rotate(delta, snap);
    },
    'OVERRIDE'
  );
}
