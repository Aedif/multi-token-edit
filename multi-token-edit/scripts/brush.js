import { pasteDataUpdate } from '../applications/forms.js';
import { PresetAPI } from './presets/collection.js';
import { Preset } from './presets/preset.js';
import { MODULE_ID } from './utils.js';

export class Brush {
  static app;
  static deactivateCallback;
  static spawner;
  static lastSpawnTime;
  // @type {Preset}
  static preset;
  static brushOverlay;
  static updatedPlaceables = new Map();
  static hoveredPlaceables = new Set();
  static hoveredPlaceable;
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
    pasteDataUpdate([placeable], this.preset, true, true);
    this.updatedPlaceables.set(placeable.id, placeable);
  }

  static _performBrushDocumentCreate(pos) {
    const now = new Date().getTime();
    if (!this.lastSpawnTime || now - this.lastSpawnTime > 100) {
      this.lastSpawnTime = now;
      if (pos) this._animateCrossTranslate(pos.x, pos.y);
      PresetAPI.spawnPreset({ preset: this.preset, x: pos.x, y: pos.y, center: true });
    }
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

  static _hitTestTile(point, placeable) {
    const foreground = ui.controls.control.foreground ?? false;
    if (placeable.document.overhead !== foreground) return false;
    return this._hitTestArea(point, placeable);
  }

  static _hoverTestArea(placeable) {
    return (
      this.hoveredPlaceable &&
      this.hoveredPlaceable.hitArea.width * this.hoveredPlaceable.hitArea.height >
        placeable.hitArea.width * placeable.hitArea.height
    );
  }

  static _hitTestArea(point, placeable) {
    return (
      Number.between(point.x, placeable.x, placeable.x + placeable.hitArea.width) &&
      Number.between(point.y, placeable.y, placeable.y + placeable.hitArea.height)
    );
  }

  static _onBrushMove(event) {
    const pos = event.data.getLocalPosition(this.brushOverlay);
    const layer = canvas.getLayerByEmbeddedName(this.documentName);
    this._clearHover(event, pos);

    for (const p of layer.placeables) {
      if (p.visible && this.hitTest(pos, p) && !this.updatedPlaceables.has(p.id) && this.hoveredPlaceable !== p) {
        if (this.hoverTest?.(p)) {
          this.hoveredPlaceable._onHoverOut(event);
          this.hoveredPlaceable = p;
        } else if (!this.hoverTest && this.hoveredPlaceable && this.hoveredPlaceable !== p) {
          this.hoveredPlaceable._onHoverOut(event);
          this.hoveredPlaceable = p;
        } else if (!this.hoveredPlaceable) {
          this.hoveredPlaceable = p;
        }

        this.hoveredPlaceable._onHoverIn(event);
      }
    }
  }

  static _clearHover(event, pos, force = false) {
    if (this.hoveredPlaceable) {
      if (force || !this.hoveredPlaceable.visible || !this.hitTest(pos, this.hoveredPlaceable)) {
        this.hoveredPlaceable._onHoverOut(event);
        this.hoveredPlaceable = null;
      }
    }
  }

  static _onBrushClickMove(event) {
    if (this.spawner) {
      this._performBrushDocumentCreate(event.data.getLocalPosition(this.brushOverlay));
    } else if (
      this.hoveredPlaceable &&
      this.hoveredPlaceable.visible &&
      !this.updatedPlaceables.has(this.hoveredPlaceable.id)
    ) {
      this._performBrushDocumentUpdate(event.data.getLocalPosition(this.brushOverlay), this.hoveredPlaceable);
    }
  }

  static _on3DBrushClick(event) {
    if (this.brush3d) {
      if (this.spawner) {
        // TODO implement 3d brush spawning
        //this._performBrushDocumentCreate(event.data.getLocalPosition(this.brushOverlay));
      } else {
        const p = game.Levels3DPreview.interactionManager.currentHover?.placeable;
        if (p && p.document.documentName === this.documentName) {
          game.Levels3DPreview.interactionManager._downCameraPosition.set(0, 0, 0);
          this._performBrushDocumentUpdate(null, p);
        }
        this.updatedPlaceables.clear();
      }
    }
  }

  static refreshPreset() {
    if (this.active && this.app) {
      this.preset = new Preset({
        documentName: this.documentName,
        data: this.app.getSelectedFields(),
        randomize: this.app.randomizeFields,
        addSubtract: this.app.addSubtractFields,
      });
    }
  }

  /**
   * @param {Object} options
   * @param {MassEditForm} options.app
   * @param {Preset} options.preset
   * @returns
   */
  static activate({ app = null, preset = null, deactivateCallback = null, spawner = false } = {}) {
    if (this.deactivate() || !canvas.ready) return false;
    if (!app && !preset) return false;

    if (this.brushOverlay) {
      this.brushOverlay.destroy(true);
    }

    // Setup fields to be used for updates
    this.app = app;
    this.preset = preset;
    this.deactivateCallback = deactivateCallback;
    this.spawner = spawner;
    if (this.app) {
      this.documentName = this.app.documentName;
    } else {
      this.documentName = this.preset.documentName;
    }
    this.updatedPlaceables.clear();

    const interaction = canvas.app.renderer.events;
    if (!interaction.cursorStyles['brush']) {
      interaction.cursorStyles['brush'] = `url('modules/${MODULE_ID}/images/brush_icon.png'), auto`;
    }

    this.active = true;
    this.refreshPreset();

    if (game.Levels3DPreview?._active) {
      return this._activate3d();
    }

    // Determine hit test test function to be used for pointer hover detection
    if (this.spawner) {
      this.hitTest = () => false;
    } else {
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
        case 'Tile':
          this.hitTest = this._hitTestTile;
          this.hoverTest = this._hoverTestArea;
          break;
        default:
          this.hitTest = this._hitTestArea;
          this.hoverTest = this._hoverTestArea;
      }
    }

    // Create the brush overlay
    this.brushOverlay = new PIXI.Container();
    this.brushOverlay.hitArea = canvas.dimensions.rect;
    this.brushOverlay.cursor = 'brush';
    this.brushOverlay.interactive = true;
    this.brushOverlay.zIndex = Infinity;

    this.brushOverlay.on('mousemove', (event) => {
      this._onBrushMove(event);
      if (event.buttons === 1) this._onBrushClickMove(event);
    });
    this.brushOverlay.on('mouseup', (event) => {
      if (event.nativeEvent.which !== 2) {
        this._onBrushClickMove(event);
      }
      this.updatedPlaceables.clear();
    });

    this.brushOverlay.on('click', (event) => {
      if (event.nativeEvent.which == 2) {
        this.deactivate();
      }
    });

    canvas.stage.addChild(this.brushOverlay);

    // Disable canvas events to prevent selects and object placements on click
    canvas.mouseInteractionManager.permissions.clickLeft = false;
    // canvas.mouseInteractionManager.permissions.longPress = false;

    return true;
  }

  static brush3dDelayMoveTimer;

  static _on3dMouseMove() {
    if (!this.brush3d || this.brush3dDelayMoveTimer) return;

    const brush = this;
    this.brush3dDelayMoveTimer = setTimeout(function () {
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
        brush.brush3d.position.set(intersect.point.x, intersect.point.y, intersect.point.z);
      }
      brush.brush3dDelayMoveTimer = null;
    }, 100); // Will do the ajax stuff after 1000 ms, or 1 s
  }

  static deactivate3DListeners() {
    game.Levels3DPreview.renderer.domElement.removeEventListener('click', this._boundOn3DBrushClick, false);
    game.Levels3DPreview.renderer.domElement.removeEventListener('mousemove', this._boundOn3dMouseMove, false);
  }

  static _activate3DListeners() {
    // Remove listeners if they are already set
    this.deactivate3DListeners();

    game.Levels3DPreview.renderer.domElement.addEventListener('click', this._boundOn3DBrushClick, false);
    game.Levels3DPreview.renderer.domElement.addEventListener('mousemove', this._boundOn3dMouseMove, false);
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
      canvas.mouseInteractionManager.permissions.clickLeft = true;
      //canvas.mouseInteractionManager.permissions.longPress = true;
      if (this.brushOverlay) this.brushOverlay.parent?.removeChild(this.brushOverlay);
      if (this.brush3d && game.Levels3DPreview?._active) {
        game.Levels3DPreview.scene.remove(this.brush3d);
        this.brush3d = null;
        this.deactivate3DListeners();
      }
      this.active = false;
      this.updatedPlaceables.clear();
      this._clearHover(null, null, true);
      this.hoverTest = null;
      this.deactivateCallback?.();
      this.spawner = false;
      this.deactivateCallback = null;
      this.app = null;
      this.preset = null;
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
      name: foundry.utils.randomID(5),
    });
    if (completed) {
      this.brushOverlay.removeChild(cross).destroy();
    }
  }
}
