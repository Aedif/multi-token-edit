import { Mouse3D } from './mouse3d.js';
import { TransformBus } from './transformer.js';

/**
 * Activate a crosshair overlay that allows selection of a bounding box on the canvas
 */
export class Picker {
  static pickerOverlay;
  static boundStart;
  static boundEnd;

  static activate(callback) {
    this.destroy();
    this.callback = callback;
    this.createPickerOverlay();
  }

  static createPickerOverlay() {
    if (game.Levels3DPreview?._active) {
      Mouse3D.activate({
        mouseClickCallback: null, // Do something here?? Probably not.. not using 3D mouse to pick anything
        mouseWheelClickCallback: Picker.destroy.bind(Picker),
      });
    } else {
      const pickerOverlay = new PIXI.Container();
      pickerOverlay.hitArea = canvas.dimensions.rect;
      pickerOverlay.cursor = 'crosshair';
      pickerOverlay.interactive = true;
      pickerOverlay.zIndex = 5;
      pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
      pickerOverlay.on('mousedown', (event) => {
        this.boundStart = event.data.getLocalPosition(pickerOverlay);
      });
      pickerOverlay.on('mouseup', (event) => {
        this.boundEnd = event.data.getLocalPosition(pickerOverlay);
      });
      pickerOverlay.on('click', (event) => {
        if (event.nativeEvent.which == 2) {
          this.callback?.(null);
        } else {
          this.callback?.({
            x1: Math.min(this.boundStart.x, this.boundEnd.x),
            y1: Math.min(this.boundStart.y, this.boundEnd.y),
            x2: Math.max(this.boundStart.x, this.boundEnd.x),
            y2: Math.max(this.boundStart.y, this.boundEnd.y),
          });
          this.callback = null;
        }
        this.destroy();
      });
      canvas.stage.addChild(pickerOverlay);
      this.pickerOverlay = pickerOverlay;
    }
  }

  static destroy() {
    if (this.pickerOverlay) {
      this.pickerOverlay.parent?.removeChild(this.pickerOverlay);
      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.pickerOverlay = null;
      Mouse3D.deactivate();
      if (this.callback) {
        this.callback(null);
        this.callback = null;
      }
    }
  }
}
