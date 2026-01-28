import { MODULE_ID, PIVOTS } from '../constants.js';
import { getDataPivotPoint } from '../presets/utils.js';
import { libWrapper } from '../libs/shim/shim.js';
import { enablePixelPerfectSelect } from '../tools/selectTool.js';
import { loadImageVideoDimensions } from '../utils.js';
import ScenescapeConfig from './configuration.js';
import { Scenescape } from './scenescape.js';
import { LinkerAPI } from '../linker/linker.js';
import { editPreviewPlaceables, MassTransformer, TransformBus } from '../transformer.js';
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
      enablePixelPerfectSelect(Scenescape.pixelPerfect);
    } else {
      ScenescapeControls._unregister();
      enablePixelPerfectSelect();
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

    id = Hooks.on('renderTokenApplication', async (app, html, options) => {
      const token = app.document ?? app.token;
      const formGroup = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/scenescapes/autoFlipFormGroup.html`,
        {
          autoFlipX: token.getFlag(MODULE_ID, 'autoFlipX'),
          autoFlipY: token.getFlag(MODULE_ID, 'autoFlipY'),
        },
      );
      html.querySelector('[name="mirrorX"]').closest('.form-group').insertAdjacentHTML('afterend', formGroup);
    });
    this._hooks.push({ hook: 'renderTokenApplication', id });

    id = Hooks.on('preCreateToken', async (token, data, options, userId) => {
      if (!options.spawnPreset) {
        const update = { ring: { enabled: false } };
        if (token.actor?.img) update.texture = { src: token.actor.img };
        token.updateSource(update);
      }
    });
    this._hooks.push({ hook: 'preCreateToken', id });

    // Prevent dimensions changes via non-scenescape updates
    id = Hooks.on('preUpdateToken', (document, change, options) => {
      if (('width' in change || 'height' in change) && !options.scenescape) return false;
    });
    this._hooks.push({ hook: 'preUpdateToken', id });

    // On token texture update we want to keep the token height and position the same while
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
          { animate: false, scenescape: true },
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

        const size = Scenescape._getActorSize(token.actor, token);
        const actorDefinedSize = (size / 6) * 100;
        const r = actorDefinedSize / height;

        width *= scale * r;
        height *= scale * r;

        const x = bottom.x - width / 2;
        const y = bottom.y - height;

        width /= canvas.dimensions.size;
        height /= canvas.dimensions.size;

        token.update(
          { x, y, width, height, elevation, flags: { [MODULE_ID]: { width, height, size } } },
          { scenescape: true },
        );
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
      'foundry.canvas.placeables.Token.prototype._getTooltipText',
      function (wrapped, ...args) {
        wrapped(...args);
        return '';
      },
      'WRAPPER',
    );
    this._wrapperIds.push(id);

    // Instead of token border, show a filter outline
    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._refreshState',
      function (wrapped, ...args) {
        const result = wrapped(...args);
        this.border.visible = false;

        if (!this.mesh.filters) this.mesh.filters = [];
        if (!this.document.isSecret && this.controlled && !Scenescape.hideBorder) {
          if (!this.mesh.filters.find((f) => f.ssOutline)) {
            const outlineFilter = OutlineFilter.create({
              outlineColor: Color.from(_token._getBorderColor()).rgb,
              animated: false,
            });
            outlineFilter.ssOutline = true;
            outlineFilter.animated = false;
            this.mesh.filters.push(outlineFilter);
          }
        } else {
          this.mesh.filters = this.mesh.filters.filter((f) => !f.ssOutline);
        }

        return result;
      },
      'WRAPPER',
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.layers.TokenLayer.prototype.moveMany',
      this._moveMany,
      'OVERRIDE',
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.layers.TilesLayer.prototype.moveMany',
      this._moveMany,
      'OVERRIDE',
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype.getSize',
      function (...args) {
        let { width, height } = ScenescapeControls._getTokenDimensions(this.document);

        const grid = this.scene.grid;
        width *= grid.sizeX;
        height *= grid.sizeY;
        return { width, height };
      },
      'OVERRIDE',
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._onUpdate',
      function (wrapped, changed, options, userId) {
        if (
          foundry.utils.getProperty(changed, `flags.${MODULE_ID}.width`) != null ||
          foundry.utils.getProperty(changed, `flags.${MODULE_ID}.height`) != null
        ) {
          this.renderFlags.set({ refreshSize: true });
        }
        return wrapped(changed, options, userId);
      },
      'WRAPPER',
    );
    this._wrapperIds.push(id);

    /**
     * Activate Picker preview instead of regular drag/drop flow
     */
    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.PlaceableObject.prototype._onDragLeftStart',
      function (event) {
        let objects = this.layer.options.controllableObjects ? this.layer.controlled : [this];

        objects = objects.filter((o) => o._canDrag(game.user, event) && !o.document.locked);

        if (objects.length) {
          const draggedObject = objects[0];
          editPreviewPlaceables(
            {
              placeables: [draggedObject],
              mainPlaceable: draggedObject,
              hardLinked: true,
            },
            { scenescape: true },
          );
        }

        event.interactionData.clones = [];
        return false;
      },
      'OVERRIDE',
    );
    this._wrapperIds.push(id);

    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.PlaceableObject.prototype._canDragLeftStart',
      function (wrapped, user, event) {
        if (TransformBus.active() || !this._canDrag(game.user, event)) return false;

        return wrapped(user, event);
      },
      'MIXED',
    );
    this._wrapperIds.push(id);

    /**
     * Improve Token drag box select by using the non-alpha pixel bounds
     */
    id = libWrapper.register(
      MODULE_ID,
      'foundry.canvas.placeables.Token.prototype._overlapsSelection',
      function (wrapped, rectangle) {
        if (!this.shape) return false;

        const bounds = this.mesh._canvasBounds;
        if (bounds) {
          const tRect = new PIXI.Rectangle(
            bounds.minX,
            bounds.minY,
            bounds.maxX - bounds.minX,
            bounds.maxY - bounds.minY,
          );

          if (!rectangle.intersects(tRect)) return false;
        }

        return wrapped(rectangle);
      },
      'MIXED',
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
    const incrementScale = game.keyboard.isModifierActive(
      foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT,
    )
      ? 0.5
      : 1.0;

    for (const obj of objects) {
      const bottom = getDataPivotPoint(documentName, obj.document, PIVOTS.BOTTOM);
      const nBottom = Scenescape.moveCoordinate(
        bottom,
        dx * incrementScale,
        dy * incrementScale,
        documentName === 'Tile',
      );

      const transformer = new MassTransformer()
        .documents(LinkerAPI.getHardLinkedDocuments(obj.document, true))
        .pivotDocument(obj);

      const document = obj.document;
      let update = {};
      if (document.documentName === 'Token') {
        if (dx !== 0 && document.getFlag(MODULE_ID, 'autoFlipX')) {
          if (dx < 0 && document.getFlag(MODULE_ID, 'flippedX')) {
            transformer.mirrorX();
            update[`flags.${MODULE_ID}.-=flippedX`] = null;
          } else if (dx > 0 && !document.getFlag(MODULE_ID, 'flippedX')) {
            transformer.mirrorX();
            update[`flags.${MODULE_ID}.flippedX`] = true;
          }
        }

        if (dy !== 0 && document.getFlag(MODULE_ID, 'autoFlipY')) {
          if (dy < 0 && document.getFlag(MODULE_ID, 'flippedY')) {
            transformer.mirrorY();
            update[`flags.${MODULE_ID}.-=flippedY`] = null;
          } else if (dy > 0 && !document.getFlag(MODULE_ID, 'flippedY')) {
            transformer.mirrorY();
            update[`flags.${MODULE_ID}.flippedY`] = true;
          }
        }
      }

      // If we're doing an auto-flip lets ignore position changes
      if (!foundry.utils.isEmpty(update)) await document.update(update, { scenescape: true });
      else transformer.pivot(PIVOTS.BOTTOM).position(nBottom);

      await transformer.update({ teleport: true, ignoreLinks: true, animate: false, scenescape: true });
    }

    return objects;
  }
}

/**
 * Modified FoundryVTT `OutlineOverlayFilter` filter to not knockout the mesh
 */
class OutlineFilter extends foundry.canvas.rendering.filters.OutlineOverlayFilter {
  /** @inheritdoc */
  static createFragmentShader() {
    return `
    varying vec2 vTextureCoord;
    varying vec2 vFilterCoord;
    uniform sampler2D uSampler;
    
    uniform vec2 thickness;
    uniform vec4 outlineColor;
    uniform vec4 filterClamp;
    uniform float alphaThreshold;
    uniform float time;
    uniform bool knockout;
    uniform bool wave;
    
    ${this.CONSTANTS}
    ${this.WAVE()}
    
    void main(void) {
        float dist = distance(vFilterCoord, vec2(0.5)) * 2.0;
        vec4 ownColor = texture2D(uSampler, vTextureCoord);
        vec4 wColor = wave ? outlineColor * 
                             wcos(0.0, 1.0, dist * 75.0, 
                                  -time * 0.01 + 3.0 * dot(vec4(1.0), ownColor)) 
                             * 0.33 * (1.0 - dist) : vec4(0.0);
        float texAlpha = smoothstep(alphaThreshold, 1.0, ownColor.a);
        vec4 curColor;
        float maxAlpha = 0.;
        vec2 displaced;
        for ( float angle = 0.0; angle <= TWOPI; angle += ${this.#quality.toFixed(7)} ) {
            displaced.x = vTextureCoord.x + thickness.x * cos(angle);
            displaced.y = vTextureCoord.y + thickness.y * sin(angle);
            curColor = texture2D(uSampler, clamp(displaced, filterClamp.xy, filterClamp.zw));
            curColor.a = clamp((curColor.a - 0.6) * 2.5, 0.0, 1.0);
            maxAlpha = max(maxAlpha, curColor.a);
        }
        float resultAlpha = max(maxAlpha, texAlpha);
        vec3 result = (ownColor.rgb + outlineColor.rgb * (1.0 - texAlpha)) * resultAlpha;
        gl_FragColor = vec4((ownColor.rgb + outlineColor.rgb * (1. - ownColor.a)) * resultAlpha, resultAlpha);
    }
    `;
  }

  static get #quality() {
    switch (canvas.performance.mode) {
      case CONST.CANVAS_PERFORMANCE_MODES.LOW:
        return (Math.PI * 2) / 10;
      case CONST.CANVAS_PERFORMANCE_MODES.MED:
        return (Math.PI * 2) / 20;
      default:
        return (Math.PI * 2) / 30;
    }
  }
}
