import { PIVOTS, SUPPORTED_PLACEABLES } from './constants.js';
import { DataTransformer } from './data/transformer.js';
import { LinkerAPI } from './linker/linker.js';
import { Mouse3D } from './mouse3d.js';
import { getPivotOffset, getPresetDataBounds } from './presets/utils.js';
import { SceneScape } from './scenescape/scenescape.js';
import { pickerSelectMultiLayerDocuments } from './utils.js';

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class Picker {
  static pickerOverlay;
  static boundStart;
  static boundEnd;
  static callback;
  static _transformAccumulator = { rotation: 0, scale: 1 };

  static isActive() {
    return Boolean(this.pickerOverlay);
  }

  static addRotation(rotation) {
    this._rotation += rotation;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
    this._transformAccumulator.rotation += rotation;
  }

  static addScaling(scale) {
    this._scale += scale;
    this._transformAccumulator.scale *= this._scale;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
  }

  static resetTransformAccumulator() {
    this._transformAccumulator.rotation = 0;
    this._transformAccumulator.scale = 1;
  }

  static getTransformAccumulator() {
    return foundry.utils.deepClone(this._transformAccumulator);
  }

  static mirrorX() {
    this._mirrorX = true;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
  }

  static mirrorY() {
    this._mirrorY = true;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
  }

  /**
   * Activates the picker overlay.
   * @param {Function} callback callback function with coordinates returned as starting and ending bounds of a rectangles
   *                            { start: {x1, y1}, end: {x2, y2} }
   * @param {Object}  preview
   * @param {String}  preview.documentName (optional) preview placeables document name
   * @param {Map[String,Array]}  preview.previewData    (req) preview placeables data
   *                                                e.g. "Tile", "Tile.1", "MeasuredTemplate.3"
   * @param {Boolean} preview.snap                  (optional) if true returned coordinates will be snapped to grid
   * @param {String}  preview.label                  (optional) preview placeables document name
   */
  static async activate(callback, preview) {
    this.destroy();

    const pickerOverlay = new PIXI.Container();
    this.callback = callback;

    if (preview) {
      let label;
      if (preview.label) {
        label = new PreciseText(preview.label, { ...CONFIG.canvasTextStyle, _fontSize: 24 });
        label.anchor.set(0.5, 1);
        pickerOverlay.addChild(label);
      }

      if (SceneScape.active) {
        preview.snap = false;

        const b = getPresetDataBounds(preview.previewData);
        const bottom = { x: b.x + b.width / 2, y: b.y + b.height };
        Picker._paraScale = SceneScape.getParallaxParameters(bottom).scale;

        // If Picker preview was triggered via a spawnPreset(...) we want to apply the initial
        // scenescape scale at the given position, as the data being previewed was not yet placed on the scene
        if (preview.spawner) preview.scale = (preview.scale ?? 1) * Picker._paraScale;
      }

      let { previews, layer, previewDocuments } = await this._genPreviews(preview);
      this._rotation = preview.rotation ?? 0;
      this._scale = preview.scale ?? 1;
      this._mirrorX = false;
      this._mirrorY = false;

      // Position offset to center preview over the mouse
      const setPositions = function (pos) {
        if (!pos) return;

        // Snap mouse if needed
        if (preview.snap && layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
          const snapped = layer.getSnappedPoint(pos);
          snapped.z = pos.z;
          pos = snapped;
        }

        // Place top-left preview corner on the mouse
        const b = getPresetDataBounds(preview.previewData);
        let transform = { x: pos.x - b.x, y: pos.y - b.y };

        // Change preview position relative to the mouse
        const offset = getPivotOffset(SceneScape.active ? PIVOTS.BOTTOM : preview.pivot, null, b);
        transform.x -= offset.x;
        transform.y -= offset.y;

        // Dynamic scenescape scaling
        if (SceneScape.active) {
          const params = SceneScape.getParallaxParameters(canvas.mousePosition);
          if (params.scale !== Picker._paraScale) {
            Picker._scale *= params.scale / Picker._paraScale;
            Picker._paraScale = params.scale;
          }
          pos.z = params.elevation;
        }

        if (pos.z != null) transform.z = pos.z - b.elevation.bottom;

        // Transforms that are applied in response to keybind presses
        if (Picker._rotation != 0) {
          transform.rotation = Picker._rotation;
          Picker._rotation = 0;
        }
        if (Picker._scale != 1) {
          transform.scale = Picker._scale;
          Picker._scale = 1;
        }

        transform.mirrorX = Picker._mirrorX;
        Picker._mirrorX = false;

        transform.mirrorY = Picker._mirrorY;
        Picker._mirrorY = false;

        // - end of transform calculations

        // Apply transformations
        for (const preview of previews) {
          const doc = preview.document;
          const documentName = doc.documentName;
          DataTransformer.apply(documentName, preview._pData ?? doc, pos, transform, preview);

          // =====
          // Hacks
          // =====
          preview.renderFlags.set({ refresh: true });

          // Elevation, sort, and z order hacks to make sure previews are always rendered on-top
          // TODO: improve _meSort, _meElevation
          if (doc.sort != null) {
            if (!preview._meSort) preview._meSort = doc.sort;
            doc.sort = preview._meSort + 10000;
          }
          if (!SceneScape.active) {
            if (!game.Levels3DPreview?._active && doc.elevation != null) {
              if (!preview._meElevation) preview._meElevation = doc.elevation;
              doc.elevation = preview._meElevation + 10000;
            }
          }
          // end of sort hacks

          // For some reason collision bool is refreshed after creation of the preview
          if (preview._l3dPreview) preview._l3dPreview.collision = false;

          // Special position update conditions
          // - Region: We need to simulate doc update via `_onUpdate` call
          // - AmbientLight and AmbientSound sources need to be re-initialized to have their fields properly rendered
          if (documentName === 'Region') {
            preview._onUpdate({ shapes: null });
          } else if (documentName === 'AmbientLight') {
            preview.initializeLightSource();
          } else if (documentName === 'AmbientSound') {
            preview.initializeSoundSource();
          }

          // End of Hacks
        }

        if (label) {
          label.x = pos.x;
          label.y = pos.y - 38;
        }

        pickerOverlay.previewDocuments = previewDocuments;

        // Changing scaling offsets the center position
        // Let's immediately reposition back to it
        if (transform.scale != null) {
          setPositions(pos);
        }
      };

      let lastX = Infinity;
      let lastY = Infinity;
      pickerOverlay.on('pointermove', (event) => {
        const client = event.data.client;
        if (client.x !== lastX || client.y !== lastY) {
          lastX = client.x;
          lastY = client.y;
          setPositions(event.data.getLocalPosition(pickerOverlay));
        }
      });

      //setTimeout(() => setPositions(canvas.mousePosition), 50);
      pickerOverlay.setPositions = setPositions;
    }

    if (!preview?.previewOnly) {
      if (game.Levels3DPreview?._active) {
        Mouse3D.activate({
          mouseMoveCallback: Picker.feedPos.bind(Picker),
          mouseClickCallback: Picker.resolve.bind(Picker),
          mouseWheelClickCallback: Picker.destroy.bind(Picker),
        });
      } else {
        pickerOverlay.hitArea = canvas.dimensions.rect;
        pickerOverlay.cursor = 'crosshair';
        pickerOverlay.interactive = true;
        pickerOverlay.zIndex = 5;
        pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
        pickerOverlay.on('mousedown', (event) => {
          Picker.boundStart = event.data.getLocalPosition(pickerOverlay);
        });
        pickerOverlay.on('mouseup', (event) => {
          Picker.boundEnd = event.data.getLocalPosition(pickerOverlay);
          if (preview?.confirmOnRelease) this.resolve(Picker.boundEnd);
        });
        pickerOverlay.on('click', (event) => {
          if (event.nativeEvent.which == 2) {
            this.callback?.(null);
          } else {
            const minX = Math.min(this.boundStart.x, this.boundEnd.x);
            const maxX = Math.max(this.boundStart.x, this.boundEnd.x);
            const minY = Math.min(this.boundStart.y, this.boundEnd.y);
            const maxY = Math.max(this.boundStart.y, this.boundEnd.y);
            this.callback?.({ start: { x: minX, y: minY }, end: { x: maxX, y: maxY } });
          }
          this.destroy();
        });

        canvas.stage.addChild(pickerOverlay);
      }
    }
    this.pickerOverlay = pickerOverlay;
    this.feedPos(canvas.mousePosition);
  }

  static feedPos(pos) {
    this.pickerOverlay?.setPositions?.(pos);
  }

  static resolve(pos) {
    if (this.callback) {
      if (pos == null) this.callback(null);
      else this.callback?.({ start: { x: pos.x, y: pos.y, z: pos.z }, end: { x: pos.x, y: pos.y, z: pos.z } });
    }
    this.destroy();
  }

  static destroy() {
    if (this.pickerOverlay) {
      this.pickerOverlay.parent?.removeChild(this.pickerOverlay);
      if (this.pickerOverlay.previewDocuments) {
        this.pickerOverlay.previewDocuments.forEach((name) => {
          const layer = canvas.getLayerByEmbeddedName(name);
          if (layer) {
            if (game.Levels3DPreview?._active) {
              layer.preview.children.forEach((c) => {
                c._l3dPreview?.destroy();
              });
            }
            layer.clearPreviewContainer();
          }
        });
      }

      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.callback?.(null);
      this.pickerOverlay = null;
      Mouse3D.deactivate();
    }
    this.callback = null;
  }

  // Modified Foundry _createPreview
  // Does not throw warning if user lacks document create permissions
  static async _createPreview(createData) {
    const documentName = this.constructor.documentName;
    const cls = getDocumentClass(documentName);
    createData._id = foundry.utils.randomID(); // Needed to allow rendering of multiple previews at the same time
    const document = new cls(createData, { parent: canvas.scene });

    const object = new CONFIG[documentName].objectClass(document);
    document._object = object;
    object.eventMode = 'none';
    if (!SceneScape.active) {
      object.document.alpha = 0.4;
      if (object.document.occlusion) object.document.occlusion.alpha = 0.4;
    }
    this.preview.addChild(object);
    await object.draw();

    // Since we do elevation manipulation to force previews to be rendered on top
    // we don't want the user to see these temporary values
    if (object.tooltip) object.tooltip.renderable = false;
    if (object.controlIcon?.tooltip) object.controlIcon.tooltip.renderable = false;

    object.visible = false;

    // Foundry as well as various modules might have complex `isVisible` and 'visible' conditions
    // lets simplify by overriding this function to make sure the preview is always visible
    Picker._overridePlaceableVisibility(object);

    // 3D Canvas
    if (game.Levels3DPreview?._active) {
      if (documentName === 'Tile') {
        game.Levels3DPreview.createTile(object);
        const l3dPreview = game.Levels3DPreview.tiles[object.id];

        l3dPreview.castShadow = false;
        l3dPreview.collision = false;

        object._l3dPreview = l3dPreview;
      } else if (documentName === 'Token') {
        // Tokens get async loaded without a way to await them
        // We'll need to retrieve the 3D token when the transforms are actually getting applied
        game.Levels3DPreview.addToken(object);
        object._l3dPreview = null;
      } else if (documentName === 'AmbientLight') {
        game.Levels3DPreview.addLight(object);
        const l3dPreview = game.Levels3DPreview.lights[object.id];
        object._l3dPreview = l3dPreview;
      }
    }

    return object;
  }

  static _overridePlaceableVisibility(placeable) {
    Object.defineProperty(placeable, 'isVisible', {
      get: function () {
        return true;
      },
      set: function () {},
    });
    Object.defineProperty(placeable, 'visible', {
      get: function () {
        return true;
      },
      set: function () {},
    });
    if (placeable.controlIcon) {
      placeable.controlIcon.alpha = 0.4;
      Object.defineProperty(placeable.controlIcon, 'visible', {
        get: function () {
          return true;
        },
        set: function () {},
      });
    }
  }

  static async _genPreviews(preview) {
    if (!preview.previewData) return { previews: [] };

    const transform = {};
    const toCreate = [];
    for (const [documentName, dataArr] of preview.previewData.entries()) {
      for (const data of dataArr) {
        // Set initial transform which will set first preview to (0, 0) and all others relative to it
        if (transform.x == null) {
          if (documentName === 'Wall') {
            transform.x = -data.c?.[0] ?? 0;
            transform.y = -data.c?.[1] ?? 0;
          } else if (documentName === 'Region') {
            const shape = data.shapes[0];
            transform.x = -(shape?.x ?? shape.points?.[0] ?? 0);
            transform.y = -(shape?.y ?? shape.points?.[1] ?? 0);
          } else {
            transform.x = -data.x ?? 0;
            transform.y = -data.y ?? 0;
          }
        }

        toCreate.push({ documentName, data });

        if (documentName === 'Token') {
          this._genTAPreviews(data, data, toCreate);
        }

        if (documentName === 'Tile' && SceneScape.active) {
          // TODO: move setting of these fields somewhere else
          foundry.utils.setProperty(data, 'restrictions.light', true);
        }
      }
    }

    const previewDocuments = new Set();
    const previews = [];
    for (const { documentName, data } of toCreate) {
      DataTransformer.apply(documentName, data, { x: 0, y: 0 }, transform);
      const p = await this._createPreview.call(
        canvas.getLayerByEmbeddedName(documentName),
        foundry.utils.deepClone(data)
      );
      p._pData = data;
      previews.push(p);
      previewDocuments.add(documentName);
    }
    return { previews, layer: canvas.getLayerByEmbeddedName(preview.documentName), previewDocuments };
  }

  static _genTAPreviews(data, parent, toCreate) {
    if (!game.modules.get('token-attacher')?.active) return;

    const attached = foundry.utils.getProperty(data, 'flags.token-attacher.prototypeAttached');
    const pos = foundry.utils.getProperty(data, 'flags.token-attacher.pos');
    const grid = foundry.utils.getProperty(data, 'flags.token-attacher.grid');

    if (!(attached && pos && grid)) return;

    const ratio = canvas.grid.size / grid.size;

    for (const [name, dataList] of Object.entries(attached)) {
      for (let data of dataList) {
        if (['Token', 'Tile', 'Drawing'].includes(name)) {
          data.width *= ratio;
          data.height *= ratio;
        }

        if (name === 'Wall') {
          data.c[0] = parent.x + (data.c[0] - pos.xy.x) * ratio;
          data.c[1] = parent.y + (data.c[1] - pos.xy.y) * ratio;
          data.c[2] = parent.x + (data.c[2] - pos.xy.x) * ratio;
          data.c[3] = parent.y + (data.c[3] - pos.xy.y) * ratio;
        } else if (name === 'Region') {
          data.shapes?.forEach((shape) => {
            if (shape.type === 'polygon') {
              for (let i = 0; i < shape.points.length; i += 2) {
                shape.points[i] = parent.x + (shape.points[i] - pos.xy.x) * ratio;
                shape.points[i + 1] = parent.y + (shape.points[i + 1] - pos.xy.y) * ratio;
              }
            } else {
              shape.x = parent.x + (shape.x - pos.xy.x) * ratio;
              shape.y = parent.y + (shape.y - pos.xy.y) * ratio;
              if (shape.type === 'ellipse') {
                shape.radiusX *= ratio;
                shape.radiusY *= ratio;
              } else if (shape.type === 'rectangle') {
                shape.width *= ratio;
                shape.height *= ratio;
              }
            }
          });
        } else {
          data.x = parent.x + (data.x - pos.xy.x) * ratio;
          data.y = parent.y + (data.y - pos.xy.y) * ratio;
        }

        toCreate.push({ documentName: name, data });
      }
    }
  }
}

export async function editPreviewPlaceables(placeables, confirmOnRelease = false) {
  const controlled = new Set();

  if (placeables?.length) {
    placeables.forEach((p) => {
      controlled.add(p.document);
      LinkerAPI.getLinkedDocuments(p.document).forEach((d) => controlled.add(d));
    });
  } else {
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      canvas.getLayerByEmbeddedName(documentName).controlled.forEach((p) => {
        controlled.add(p.document);
        LinkerAPI.getLinkedDocuments(p.document).forEach((d) => controlled.add(d));
      });
    });
  }

  if (!controlled.size) {
    const pickerSelected = await pickerSelectMultiLayerDocuments();
    pickerSelected.forEach((d) => controlled.add(d));
  }

  if (!controlled.size) return;

  // Generate data from the selected placeables and pass them to Picker to create previews
  const docToData = new Map();

  let mainDocumentName;

  controlled.forEach((document) => {
    const documentName = document.documentName;
    if (!SUPPORTED_PLACEABLES.includes(documentName)) return;

    let data = document.toObject();

    if (
      documentName === 'Token' &&
      game.modules.get('token-attacher')?.active &&
      tokenAttacher?.generatePrototypeAttached
    ) {
      const attached = data.flags?.['token-attacher']?.attached || {};
      if (!foundry.utils.isEmpty(attached)) {
        const prototypeAttached = tokenAttacher.generatePrototypeAttached(data, attached);
        foundry.utils.setProperty(data, 'flags.token-attacher.attached', null);
        foundry.utils.setProperty(data, 'flags.token-attacher.prototypeAttached', prototypeAttached);
        foundry.utils.setProperty(data, 'flags.token-attacher.grid', {
          size: canvas.grid.size,
          w: canvas.grid.sizeX,
          h: canvas.grid.sizeY,
        });
      }
    }

    if (docToData.get(documentName)) docToData.get(documentName).push(data);
    else docToData.set(documentName, [data]);

    if (!mainDocumentName) mainDocumentName = documentName;
  });

  // Lets create copies of original data so that we can perform a diff after transforms have been
  // applied by the Picker
  const originalDocToData = new Map();
  docToData.forEach((dataArr, documentName) => {
    originalDocToData.set(documentName, foundry.utils.deepClone(dataArr));
  });

  Picker.activate(
    async (coords) => {
      if (coords == null) return;

      docToData.forEach((data, documentName) => {
        let updates = [];

        const originalData = originalDocToData.get(documentName);
        for (let i = 0; i < originalData.length; i++) {
          const diff = foundry.utils.diffObject(originalData[i], data[i]);
          if (!foundry.utils.isEmpty(diff)) {
            diff._id = originalData[i]._id;
            updates.push(diff);
          }
        }
        if (updates.length)
          canvas.scene.updateEmbeddedDocuments(documentName, updates, {
            ignoreLinks: true,
            animate: false,
            preventParallaxScaling: true,
          });
      });
    },
    {
      documentName: mainDocumentName,
      previewData: docToData,
      snap: true,
      pivot: PIVOTS.CENTER,
      confirmOnRelease,
    }
  );
}
