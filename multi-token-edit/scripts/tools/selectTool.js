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
            'foundry.canvas.placeables.Tile.prototype._draw',
            async function (wrapped, ...args) {
                const result = await wrapped(...args);

                // Change the frame to use pixel contain function instead of rectangle contain
                const hitArea = this.frame.hitArea;
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
            'WRAPPER',
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
            'foundry.canvas.placeables.Token.prototype.getShape',
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
            'WRAPPER',
        );
        tokenWrapperChanged = true;
    }

    if (tileWrapperChanged) canvas.tiles?.placeables.forEach((t) => t.renderFlags.set({ redraw: true }));
    if (tokenWrapperChanged) canvas.tokens?.placeables.forEach((t) => t.renderFlags.set({ refreshShape: true }));
}

/**
 * Enable 'Select' tool for layers that do not have it. (AmbientLight, AmbientSound, MeasuredTemplate, and Note)
 */
export function enableSelectToolEnhancements() {
    Hooks.on('canvasReady', () => {
        if (SUPPORTED_PLACEABLES.includes('Region')) canvas.regions.options.rotatableObjects = true;
    });

    Hooks.on('getSceneControlButtons', (controls) => _getControlButtons(controls));
    registerRegionWrappers();
}

/**
 * Insert pixel perfect controls
 */
function _getControlButtons(controls) {
    if (!game.settings.get(MODULE_ID, 'disablePixelPerfectHoverButton')) {
        controls.tiles.tools.pixelPerfect = {
            name: 'pixelPerfect',
            title: 'Pixel Perfect Hover',
            icon: 'fa-solid fa-bullseye-pointer',
            visible: true,
            active: game.settings.get(MODULE_ID, 'pixelPerfectTile'),
            toggle: true,
            onClick: () => {
                game.settings.set(MODULE_ID, 'pixelPerfectTile', !game.settings.get(MODULE_ID, 'pixelPerfectTile'));
            },
        };

        controls.tokens.tools.pixelPerfect = {
            name: 'pixelPerfect',
            title: 'Pixel Perfect Hover',
            icon: 'fa-solid fa-bullseye-pointer',
            visible: true,
            active: game.settings.get(MODULE_ID, 'pixelPerfectToken'),
            toggle: true,
            onClick: () => {
                game.settings.set(MODULE_ID, 'pixelPerfectToken', !game.settings.get(MODULE_ID, 'pixelPerfectToken'));
            },
        };
    }
}

function registerRegionWrappers() {
    // Enable rotation
    libWrapper.register(
        MODULE_ID,
        'foundry.canvas.placeables.Region.prototype.rotate',
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
        'OVERRIDE',
    );

    libWrapper.register(
        MODULE_ID,
        'foundry.canvas.layers.RegionLayer.prototype._onMouseWheel',
        function (event) {
            // Identify the hovered region
            const region = this.hover;
            if (!region || region.isPreview || region.document.shapes.some((s) => s.type === 'ellipse')) return;

            // Determine the incremental angle of rotation from event data
            const snap = event.shiftKey ? 15 : 3;
            const delta = snap * Math.sign(event.delta);

            region.rotate(delta, snap);
        },
        'OVERRIDE',
    );
}
