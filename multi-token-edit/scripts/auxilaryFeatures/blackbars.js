import { MODULE_ID } from '../constants.js';

export function registerBlackBarHooks() {
  Hooks.on('updateScene', (scene) => {
    if (scene.id === canvas.scene?.id) {
      displayBlackBars(scene.getFlag(MODULE_ID, 'blackBars'));
    }
  });

  Hooks.on('canvasInit', (canvas) => {
    displayBlackBars(canvas.scene.getFlag(MODULE_ID, 'blackBars'));
  });
}

function displayBlackBars(display) {
  let bars = canvas.primary.getChildByName('blackBars');
  if (!display && bars) {
    canvas.primary.removeChild(bars)?.destroy(true);
  } else if (display) {
    if (bars) canvas.primary.removeChild(bars)?.destroy(true);

    bars = new PIXI.Container();
    bars.name = 'blackBars';
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
}
