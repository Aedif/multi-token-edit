/**
 * Mouse controls for Levels 3D
 */

import { BrushMenu } from './brush.js';
import { TransformBus } from './transformer.js';

export class Mouse3D {
  // Trick to keep consistent signatures for bound 3d listeners
  // Required to be able to remove these function once picker is de-activated
  static {
    this._boundOn3DMouseDown = this._on3DMouseDown.bind(this);
    this._boundOn3dMouseMove = this._on3dMouseMove.bind(this);
    this._boundOn3dMouseWheel = this._on3dMouseWheel.bind(this);
  }

  static activate({ mouseClickCallback = null, mouseWheelClickCallback = null, transformer } = {}) {
    this.mouseClickCallback = mouseClickCallback;
    this.mouseWheelClickCallback = mouseWheelClickCallback;
    this.transformer = transformer;

    this._createTracker();
    this._activate3DListeners();
    this._on3dMouseMove(true); // Set initial position
  }

  static deactivate() {
    if (this.tracker && game.Levels3DPreview?._active) {
      game.Levels3DPreview.scene.remove(this.tracker);
      TransformBus.unregister(this.transformer);
      this.transformer?.destroyPreview(false);
      this.transformer = null;
      this.tracker = null;
      this.deactivate3DListeners();
    }
  }

  static _createTracker() {
    if (!this.tracker) {
      const THREE = game.Levels3DPreview.THREE;

      this.tracker = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 8, 8),
        new THREE.MeshBasicMaterial({
          opacity: 0.5,
          transparent: true,
          color: 0x00ff00,
          wireframe: true,
        })
      );

      this.tracker.userData.interactive = false;
      this.tracker.userData.ignoreHover = true;

      const mPos = game.Levels3DPreview.interactionManager.canvas3dMousePosition;
      this.tracker.position.set(mPos.x, mPos.y, mPos.z);

      game.Levels3DPreview.scene.add(this.tracker);
    }
  }

  static _activate3DListeners() {
    // Remove listeners if they are already set
    this.deactivate3DListeners();

    game.Levels3DPreview.renderer.domElement.addEventListener('mousedown', this._boundOn3DMouseDown, false);
    game.Levels3DPreview.renderer.domElement.addEventListener('mousemove', this._boundOn3dMouseMove, false);
    game.Levels3DPreview.renderer.domElement.addEventListener('wheel', this._boundOn3dMouseWheel, true);
  }

  static deactivate3DListeners() {
    game.Levels3DPreview.renderer.domElement.removeEventListener('mousedown', this._boundOn3DMouseDown, false);
    game.Levels3DPreview.renderer.domElement.removeEventListener('mousemove', this._boundOn3dMouseMove, false);
    game.Levels3DPreview.renderer.domElement.removeEventListener('wheel', this._boundOn3dMouseWheel, true);
  }

  static _on3DMouseDown(event) {
    if (event.which === 1) {
      const posVec = game.Levels3DPreview.ruler.constructor.pos3DToCanvas(this.tracker.position);
      const p = game.Levels3DPreview.interactionManager.currentHover?.placeable;
      this.mouseClickCallback?.({ x: posVec.x, y: posVec.y, z: posVec.z, placeable: p });
      //game.Levels3DPreview.interactionManager._downCameraPosition.set(0, 0, 0);
      TransformBus.resolve({ x: posVec.x, y: posVec.y, z: posVec.z, placeable: p });
      this.deactivate();
    } else if (event.which === 2) {
      this.mouseWheelClickCallback?.();
      TransformBus.resolve(false);
      this.deactivate();
    }
  }

  static _on3dMouseMove(force = false) {
    if (this.delayMoveTimer && !force) return;

    this.delayMoveTimer = setTimeout(function () {
      const mPos = game.Levels3DPreview.interactionManager.canvas3dMousePosition;
      const cPos = game.Levels3DPreview.interactionManager.camera.position;

      const intersects = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(
        cPos,
        mPos,
        'collision',
        false,
        false,
        false,
        true
      );

      if (intersects[0]) {
        const intersect = intersects[0];
        Mouse3D.tracker?.position.set(intersect.point.x, intersect.point.y, intersect.point.z);
        const posVec = game.Levels3DPreview.ruler.constructor.pos3DToCanvas(intersect.point);

        TransformBus.position({ x: posVec.x, y: posVec.y, z: posVec.z });
      }
      Mouse3D.delayMoveTimer = null;
    }, 100);
  }

  static _on3dMouseWheel(event) {
    if (
      (TransformBus.active() || BrushMenu.isActive()) &&
      (event.ctrlKey || event.shiftKey || event.metaKey || event.altKey)
    ) {
      event.stopPropagation();
      event.preventDefault();

      let dy = (event.delta = event.deltaY);
      if (event.shiftKey && dy === 0) {
        dy = event.delta = event.deltaX;
      }
      if (dy === 0) return;

      if (event.altKey) TransformBus.addScaling(event.delta < 0 ? 0.05 : -0.05);
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey) BrushMenu.iterate(event.delta >= 0, true);
      else if (event.ctrlKey || event.metaKey) TransformBus.addRotation(event.delta < 0 ? 2.5 : -2.5);
      else if (event.shiftKey) TransformBus.addRotation(event.delta < 0 ? 15 : -15);
      return;
    }

    return false;
  }
}
