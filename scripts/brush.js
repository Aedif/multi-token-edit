import { pasteDataUpdate } from '../applications/forms.js';
import { emptyObject } from './utils.js';

export class Brush {
  static app;
  static fields;
  static brushOverlay;
  static updatedPlaceables = [];
  static documentName;
  static active = false;
  static hitTest;

  static registered3dListener = false;
  // Truck to keep consistent signatures for bound 3d brush callbacks
  // Required to be able to remove these function once the 3d brush is deactivated
  static {
    this._boundOn3DBrushClick = this._on3DBrushClick.bind(this);
    this._boundOn3dMouseMove = this._on3dMouseMove.bind(this);
  }

  static _performBrushDocumentUpdate(pos, placeable) {
    if (pos) this._animateCrossTranslate(pos.x, pos.y);
    pasteDataUpdate([placeable], this.fields, true);
    this.updatedPlaceables.push(placeable);
  }

  static _hitTestWall(point, wall) {
    return wall.line.hitArea.contains(point.x, point.y);
  }

  static _hitTestControlIcon(point, placeable) {
    return (
      Number.between(
        point.x,
        placeable.x - placeable.controlIcon.width / 2,
        placeable.x + placeable.controlIcon.width / 2
      ) &&
      Number.between(
        point.y,
        placeable.y - placeable.controlIcon.height / 2,
        placeable.y + placeable.controlIcon.height / 2
      )
    );
  }

  static _hitTestArea(point, placeable) {
    return (
      Number.between(point.x, placeable.x, placeable.x + placeable.hitArea.width) &&
      Number.between(point.y, placeable.y, placeable.y + placeable.hitArea.height)
    );
  }

  static _onBrushMove(event) {
    if (this.brushOverlay.isMouseDown) {
      const pos = event.data.getLocalPosition(this.brushOverlay);
      const layer = canvas.getLayerByEmbeddedName(this.documentName);
      for (const p of layer.placeables) {
        if (
          p.visible &&
          this.hitTest(pos, p) &&
          !this.updatedPlaceables.find((u) => u.id === p.id)
        ) {
          this._performBrushDocumentUpdate(pos, p);
        }
      }
    }
  }

  static _on3DBrushClick(event) {
    if (this.brush3d) {
      const p = game.Levels3DPreview.interactionManager.currentHover?.placeable;
      if (p && p.document.documentName === this.documentName) {
        game.Levels3DPreview.interactionManager._downCameraPosition.set(0, 0, 0);
        this._performBrushDocumentUpdate(null, p);
      }
      this.updatedPlaceables = [];
    }
  }

  static refreshFields() {
    if (this.active && this.app) {
      const selectedFields = this.app.getSelectedFields();
      if (!emptyObject(selectedFields)) {
        if (!emptyObject(this.app.randomizeFields)) {
          selectedFields['mass-edit-randomize'] = deepClone(this.app.randomizeFields);
        }
        if (!emptyObject(this.app.addSubtractFields)) {
          selectedFields['mass-edit-addSubtract'] = deepClone(this.app.addSubtractFields);
        }
      }
      this.fields = selectedFields;
    }
  }

  static activate({ app = null, fields = null, documentName = '' } = {}) {
    if (this.deactivate() || !canvas.ready) return false;
    if (!app && (!fields || !documentName)) return false;

    if (this.brushOverlay) {
      this.brushOverlay.destroy(true);
    }

    // Setup fields to be used for updates
    this.app = app;
    this.fields = fields;
    if (this.app) {
      this.documentName = this.app.documentName;
    } else {
      this.documentName = documentName;
    }
    this.updatedPlaceables = [];

    const interaction = canvas.app.renderer.plugins.interaction;
    if (!interaction.cursorStyles['brush']) {
      interaction.cursorStyles['brush'] =
        "url('modules/multi-token-edit/images/brush_icon.png'), auto";
    }

    this.active = true;
    this.refreshFields();

    if (game.Levels3DPreview?._active) {
      return this._activate3d();
    }

    // Determine hit test test function to be used for pointer hover detection
    switch (this.documentName) {
      case 'Wall':
        this.hitTest = this._hitTestWall;
        break;
      case 'AmbientLight':
      case 'MeasuredTemplate':
      case 'AmbientSound':
      case 'Note':
        this.hitTest = this._hitTestControlIcon;
        break;
      default:
        this.hitTest = this._hitTestArea;
    }

    // Create the brush overlay
    this.brushOverlay = new PIXI.Container();
    this.brushOverlay.hitArea = canvas.dimensions.rect;
    this.brushOverlay.cursor = 'brush';
    this.brushOverlay.interactive = true;
    this.brushOverlay.zIndex = Infinity;

    this.brushOverlay.on('mousedown', (event) => {
      event.stopPropagation();
      this.brushOverlay.isMouseDown = true;
    });
    this.brushOverlay.on('pointermove', (event) => {
      this._onBrushMove(event);
    });
    this.brushOverlay.on('mouseup', (event) => {
      if (event.data.originalEvent.which !== 2) {
        this._onBrushMove(event);
      }
      this.brushOverlay.isMouseDown = false;
      this.updatedPlaceables = [];
    });
    this.brushOverlay.on('click', (event) => {
      if (event.data.originalEvent.which == 2) {
        this.deactivate();
      }
    });

    canvas.stage.addChild(this.brushOverlay);
    return true;
  }

  static brush3dDelayMoveTimer;

  static _on3dMouseMove() {
    if (!this.brush3d || this.brush3dDelayMoveTimer) return;

    const brush = this;
    this.brush3dDelayMoveTimer = setTimeout(function () {
      const mPos = game.Levels3DPreview.interactionManager.canvas3dMousePosition;
      const cPos = game.Levels3DPreview.interactionManager.camera.position;

      const intersects =
        game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(
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
        brush.brush3d.position.set(intersect.point.x, intersect.point.y, intersect.point.z);
      }
      brush.brush3dDelayMoveTimer = null;
    }, 100); // Will do the ajax stuff after 1000 ms, or 1 s
  }

  static deactivate3DListeners() {
    game.Levels3DPreview.renderer.domElement.removeEventListener(
      'click',
      this._boundOn3DBrushClick,
      false
    );
    game.Levels3DPreview.renderer.domElement.removeEventListener(
      'mousemove',
      this._boundOn3dMouseMove,
      false
    );
  }

  static _activate3DListeners() {
    // Remove listeners if they are already set
    this.deactivate3DListeners();

    game.Levels3DPreview.renderer.domElement.addEventListener(
      'click',
      this._boundOn3DBrushClick,
      false
    );
    game.Levels3DPreview.renderer.domElement.addEventListener(
      'mousemove',
      this._boundOn3dMouseMove,
      false
    );
  }

  static _activate3d() {
    const THREE = game.Levels3DPreview.THREE;

    if (!this.brush3d) {
      this.brush3d = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 8, 8),
        new THREE.MeshBasicMaterial({
          opacity: 0.5,
          transparent: true,
          color: 0x00ff00,
          wireframe: true,
        })
      );

      this.brush3d.userData.interactive = false;
      this.brush3d.userData.ignoreHover = true;

      const mPos = game.Levels3DPreview.interactionManager.canvas3dMousePosition;
      this.brush3d.position.set(mPos.x, mPos.y, mPos.z);

      game.Levels3DPreview.scene.add(this.brush3d);
    }

    // Activate listeners
    this._activate3DListeners();

    return true;
  }

  static deactivate() {
    if (this.active) {
      if (this.brushOverlay) this.brushOverlay.parent?.removeChild(this.brushOverlay);
      if (this.brush3d && game.Levels3DPreview?._active) {
        game.Levels3DPreview.scene.remove(this.brush3d);
        this.brush3d = null;
        this.deactivate3DListeners();
      }
      this.active = false;
      this.updatedPlaceables = [];
      this.app = null;
      this.fields = null;
      return true;
    }
  }

  static async _animateCrossTranslate(x, y) {
    let cross = new PIXI.Text('+', {
      fontFamily: 'Arial',
      fontSize: 11,
      fill: 0x00ff11,
      align: 'center',
    });
    cross = this.brushOverlay.addChild(cross);
    cross.x = x + Math.random() * 16 - 8;
    cross.y = y;
    const translate = [{ parent: cross, attribute: 'y', to: y - 50 }];

    const completed = await CanvasAnimation.animate(translate, {
      duration: 700,
      name: randomID(5),
    });
    if (completed) {
      this.brushOverlay.removeChild(cross).destroy();
    }
  }
}
