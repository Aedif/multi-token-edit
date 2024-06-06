import { MODULE_ID } from './utils.js';

/**
 * Enable 'Select' tool for layers that do not have it. (AmbientLight, AmbientSound, MeasuredTemplate, and Note)
 */
export function enableUniversalSelectTool() {
  if (game.modules.get('select-tool-everywhere')?.active) return;

  const missingLayers = ['AmbientLight', 'AmbientSound', 'MeasuredTemplate', 'Note'];

  missingLayers.forEach((layer) => {
    Hooks.on(`refresh${layer}`, _placeableRefresh);
  });

  Hooks.on('canvasReady', () =>
    missingLayers.forEach((layer) => (canvas.getLayerByEmbeddedName(layer).options.controllableObjects = true))
  );

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
}

/**
 * Insert select tool if missing
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
}

function _placeableRefresh(placeable) {
  if (placeable.controlled) placeable.controlIcon.border.visible = true;
}
