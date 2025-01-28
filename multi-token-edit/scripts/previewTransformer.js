import { MODULE_ID, PIVOTS, SUPPORTED_PLACEABLES } from './constants.js';
import { DataTransformer } from './data/transformer.js';
import { LinkerAPI } from './linker/linker.js';
import { Mouse3D } from './mouse3d.js';
import { getPivotPoint, getPresetDataBounds } from './presets/utils.js';
import { Scenescape } from './scenescape/scenescape.js';
import { pickerSelectMultiLayerDocuments, updateEmbeddedDocumentsViaGM } from './utils.js';

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class PreviewTransformer {
  static pickerOverlay;
  static callback;
  static _transformAccumulator = { rotation: 0, scale: 1 };

  static isActive() {
    return this._active;
  }

  static addRotation(rotation) {
    this.applyTransform({ rotation }, getPivotPoint(this._pivot, this._docToData));
    this._transformAccumulator.rotation += rotation;
  }

  static addScaling(scale, origin) {
    this.applyTransform({ scale: 1 + scale }, origin ?? getPivotPoint(this._pivot, this._docToData));
    this._transformAccumulator.scale *= 1 + scale;
  }

  static addElevation(elevation) {
    this.applyTransform({ z: elevation });

    if (this._label) {
      this._label.text = `[${getPresetDataBounds(this._docToData).elevation.bottom.toFixed(2)}]`;
      this._label.anchor.set(1, -2);
    }
  }

  static resetTransformAccumulator() {
    this._transformAccumulator.rotation = 0;
    this._transformAccumulator.scale = 1;
  }

  static getTransformAccumulator() {
    return foundry.utils.deepClone(this._transformAccumulator);
  }

  static mirrorX() {
    this.applyTransform({ mirrorX: true }, getPivotPoint(PIVOTS.CENTER, this._docToData));
  }

  static mirrorY() {
    this.applyTransform({ mirrorY: true }, getPivotPoint(PIVOTS.CENTER, this._docToData));
  }

  static applyTransform(transform, origin) {
    // Apply transformations
    if (this._previews) {
      for (const previewContainer of this._previews) {
        const preview = previewContainer.preview;

        const documentName = previewContainer.documentName;
        DataTransformer.apply(documentName, previewContainer.data, origin, transform, preview);

        // =====
        // Hacks
        // =====
        if (preview) {
          preview.renderFlags.set({ refresh: true });
          const doc = preview.document;

          // Elevation, sort, and z order hacks to make sure previews are always rendered on-top
          // TODO: improve _meSort, _meElevation
          if (doc.sort != null) {
            if (!preview._meSort) preview._meSort = doc.sort;
            doc.sort = preview._meSort + 10000;
          }
          if (!Scenescape.active) {
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
        }
        // End of Hacks
      }
    } else {
      DataTransformer.applyToMap(this._docToData, origin, transform);
    }
  }

  static setPosition({ x, y, z } = {}) {
    if (!x && !y && !z) return;
    let pos = { x, y, z };

    // Place the preview pivot point on the provided position
    const b = getPresetDataBounds(this._docToData);
    const pivotPoint = getPivotPoint(this._pivot, this._docToData, b);
    let transform = { x: pos.x - pivotPoint.x, y: pos.y - pivotPoint.y, z: 0 };

    if (pos.z != null) {
      transform.z = pos.z - b.elevation.bottom;
    }

    // Snap bounds after transform
    if (this._snap && this._layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
      const postTransformPos = { x: b.x + transform.x, y: b.y + transform.y };
      const snapped = this._layer.getSnappedPoint(postTransformPos);

      transform.x += snapped.x - postTransformPos.x;
      transform.y += snapped.y - postTransformPos.y;
    }

    // TODO REDO SCENESCAPE scaling
    let paraScale;
    if (Scenescape.active && Scenescape.autoScale) {
      const previousParams = Scenescape.getParallaxParameters(getPivotPoint(PIVOTS.BOTTOM, null, b));
      const params = Scenescape.getParallaxParameters({ x, y });

      if (previousParams.scale !== params.scale) {
        paraScale = 1 * (params.scale / previousParams.scale);
      }

      // Correct token sizes to get rid of accumulating errors
      // TODO: Move into a function?
      this._docToData.get('Token')?.forEach((data) => {
        data.width = foundry.utils.getProperty(data, `flags.${MODULE_ID}.width`) ?? data.width;
        data.height = foundry.utils.getProperty(data, `flags.${MODULE_ID}.height`) ?? data.height;

        const r = data.width / data.height;

        let height = (Scenescape.getTokenSize(data) / canvas.dimensions.size) * previousParams.scale;
        let width = height * r;

        // Adjust bottom position to take into account the fixed token size
        data.x += ((width - data.width) / 2) * canvas.dimensions.size;
        data.y += (data.height - height) * canvas.dimensions.size;

        data.width = width;
        data.height = height;
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.width`, data.width);
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.height`, data.height);
      });

      transform.z = params.elevation - b.elevation.bottom;
      if (this._label) this._label.text = '';
    }

    // - end of transform calculations
    this.applyTransform(transform, pos);
    if (paraScale) {
      this.applyTransform({ scale: paraScale }, pos);
    }

    if (this._label) {
      this._label.x = pos.x;
      this._label.y = pos.y - 38;
    }
  }

  /**
   * Activates the picker overlay.
   * @param {Function} callback callback function with coordinates returned as starting and ending bounds of a rectangles
   *                            { start: {x1, y1}, end: {x2, y2} }
   * @param {Object}  options
   * @param {String}  options.documentName (optional) preview placeables document name
   * @param {Map[String,Array]}  options.docToData    (req) preview placeables data
   *                                                e.g. "Tile", "Tile.1", "MeasuredTemplate.3"
   * @param {Boolean} options.snap                  (optional) if true returned coordinates will be snapped to grid
   * @param {String}  options.label                  (optional) preview placeables document name
   */
  static async activate({
    docToData = null,
    snap = true,
    restrict = null,
    pivot = PIVOTS.CENTER,
    preview = true,
    crosshair = true,
    callback = null,
    scale = null,
    rotation = null,
    x = null,
    y = null,
  } = {}) {
    this.destroy();

    if (!docToData || docToData.size === 0) throw Error('No data provided for transformation.');

    this.callback = callback;
    this._docToData = docToData;
    this._pivot = Scenescape.active ? PIVOTS.BOTTOM : pivot;
    this._snap = snap;

    // What 'preview' contains
    // documentName: preset.documentName,
    // previewData: docToData,
    // snap: snapToGrid,
    // label: previewLabel,
    // restrict: previewRestrictedDocuments,
    // pivot,
    // previewOnly,
    // ...transform,
    // spawner: true,

    // New parameters
    // docToData
    // snap
    // restrict  (these are document to ignore when generating previews)
    // pivot
    // scale (also passed in by Spawner API, which is most used by the BrushMenu)
    // rotation (same as scale)

    // If transforms have been provided as part of the activation, we will apply them now
    if (scale != null || rotation != null) {
      const pivotPoint = getPivotPoint(this._pivot, this._docToData);
      if (scale != null) this.applyTransform({ scale }, pivotPoint);
      if (rotation != null) this.applyTransform({ rotation }, pivotPoint);
    }
    if (x != null && y != null) {
      this.setPosition({ x, y });
    }

    if (preview) {
      let { previews, previewDocuments } = await this._genPreviews(restrict);
      this._layer =
        previewDocuments.size !== 1 ? canvas.walls : canvas.getLayerByEmbeddedName(previewDocuments.first());
      this._previewDocuments = previewDocuments;
      this._previews = previews;
    }

    if (crosshair) this.createPickerOverlay();

    this._active = true;
  }

  static createPickerOverlay() {
    if (game.Levels3DPreview?._active) {
      Mouse3D.activate({
        mouseMoveCallback: PreviewTransformer.feedPos.bind(PreviewTransformer),
        mouseClickCallback: PreviewTransformer.resolve.bind(PreviewTransformer),
        mouseWheelClickCallback: PreviewTransformer.destroy.bind(PreviewTransformer),
      });
    } else {
      const pickerOverlay = new PIXI.Container();

      let label = new PreciseText('', { ...CONFIG.canvasTextStyle, _fontSize: 24 });
      label.anchor.set(0.5, 1);
      this._label = pickerOverlay.addChild(label);

      pickerOverlay.on('pointermove', (event) => {
        const client = event.data.client;
        if (
          client.x !== PreviewTransformer.pickerOverlay.lastX ||
          client.y !== PreviewTransformer.pickerOverlay.lastY
        ) {
          PreviewTransformer.pickerOverlay.lastX = client.x;
          PreviewTransformer.pickerOverlay.lastY = client.y;
          PreviewTransformer.setPosition(event.data.getLocalPosition(pickerOverlay));
        }
      });

      pickerOverlay.hitArea = canvas.dimensions.rect;
      pickerOverlay.cursor = 'crosshair';
      pickerOverlay.interactive = true;
      pickerOverlay.zIndex = 5;
      pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
      pickerOverlay.on('mouseup', (event) => {
        if (event.nativeEvent.which == 2) {
          this.callback?.(false);
        } else {
          this.callback?.(true);
        }
        this.callback = null;
        this.destroy();
      });
      canvas.stage.addChild(pickerOverlay);
      this.pickerOverlay = pickerOverlay;
      this.feedPos(canvas.mousePosition);
    }
  }

  static feedPos(pos) {
    if (this.isActive()) this.setPosition(pos);
  }

  static resolve(confirm) {
    this.callback?.(confirm);
    this.callback = null;
    this.destroy();
  }

  static destroy() {
    if (this.pickerOverlay) {
      this.pickerOverlay.parent?.removeChild(this.pickerOverlay);
      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.callback?.(false);
      this.pickerOverlay = null;
      this._label = null;
      Mouse3D.deactivate();
    }

    if (this._previewDocuments) {
      this._previewDocuments.forEach((name) => {
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

    this._layer = null;
    this._previewDocuments = null;
    this._previews = null;
    this.callback = null;
    Scenescape.autoScale = true;
    this._active = false;
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
    if (!Scenescape.active) {
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
    PreviewTransformer._overridePlaceableVisibility(object);

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

  static async _genPreviews(restrict) {
    if (!this._docToData) return { previews: [] };

    const toCreate = [];
    for (const [documentName, dataArr] of this._docToData.entries()) {
      for (const data of dataArr) {
        toCreate.push({ documentName, data });

        if (documentName === 'Token') {
          this._genTAPreviews(data, data, toCreate);
        }

        if (documentName === 'Tile' && Scenescape.active) {
          // TODO: move setting of these fields to a more appropriate spot
          foundry.utils.setProperty(data, 'restrictions.light', true);
          foundry.utils.setProperty(data, 'occlusion.alpha', 1);
        }
      }
    }

    const previewDocuments = new Set();
    const previews = [];
    for (const { documentName, data } of toCreate) {
      const previewContainer = { documentName, data };

      if (!restrict?.includes(documentName)) {
        previewContainer.preview = await this._createPreview.call(
          canvas.getLayerByEmbeddedName(documentName),
          foundry.utils.deepClone(data)
        );
        previewDocuments.add(documentName);
      }

      previews.push(previewContainer);
    }
    return { previews, previewDocuments };
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

export async function editPreviewPlaceables(placeables, callback = null) {
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

  if (!controlled.size) return false;

  // Generate data from the selected placeables and pass them to Picker to create previews
  const docToData = new Map();

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
  });

  // Lets create copies of original data so that we can perform a diff after transforms have been
  // applied by the PreviewTransformer
  const originalDocToData = new Map();
  docToData.forEach((dataArr, documentName) => {
    originalDocToData.set(documentName, foundry.utils.deepClone(dataArr));
  });

  PreviewTransformer.activate({
    docToData,
    snap: true,
    pivot: PIVOTS.CENTER,
    callback: async (confirm) => {
      if (!confirm) return callback?.();

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
        if (updates.length) {
          updateEmbeddedDocumentsViaGM(
            documentName,
            updates,
            {
              ignoreLinks: true,
              animate: false,
              preventParallaxScaling: true,
            },
            canvas.scene
          );
        }

        callback?.(confirm);
      });
    },
  });

  return true;
}
