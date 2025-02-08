import { MODULE_ID, PIVOTS, SUPPORTED_PLACEABLES } from './constants.js';
import { DataTransformer } from './data/transformer.js';
import { LinkerAPI } from './linker/linker.js';
import { Mouse3D } from './mouse3d.js';
import { getDataBounds, getPivotPoint, getPresetDataBounds } from './presets/utils.js';
import { Scenescape } from './scenescape/scenescape.js';
import { pickerSelectMultiLayerDocuments, updateEmbeddedDocumentsViaGM } from './utils.js';

export class TransformBus {
  static transformers = [];
  static _transformAccumulator = { rotation: 0, scale: 1 };

  static active() {
    return Boolean(this.transformers.length);
  }

  static register(transformer) {
    this.transformers.push(new WeakRef(transformer));
  }

  static unregister(transformer) {
    this.transformers = this.transformers.filter((ref) => ref.deref() != transformer);
  }

  static clear() {
    this.transformers = [];
  }

  static resolve(confirm) {
    this.transformers = this.transformers.filter((ref) => {
      const transformer = ref.deref();
      transformer.callback?.(confirm);
      return transformer;
    });
  }

  // ***********
  // Static functions to be called by external systems to feed transformations to an active crosshair/preview

  static addRotation(rotation) {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.rotate(rotation));
    this._transformAccumulator.rotation += rotation;
  }

  static addScaling(scale) {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.scale(1 + scale));
    this._transformAccumulator.scale *= 1 + scale;
  }

  static addElevation(elevation) {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.elevate(elevation));
  }

  static resetTransformAccumulator() {
    this._transformAccumulator.rotation = 0;
    this._transformAccumulator.scale = 1;
  }

  static getTransformAccumulator() {
    return foundry.utils.deepClone(this._transformAccumulator);
  }

  static mirrorX() {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.mirrorX());
  }

  static mirrorY() {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.mirrorY());
  }

  static position(pos) {
    this.transformers = this.transformers.filter((ref) => ref.deref()?.position(pos));
  }
}

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class MassTransformer {
  static crosshairOverlay;

  static active() {
    return Boolean(this.crosshairOverlay);
  }

  constructor(options = {}) {
    if (options instanceof PlaceableObject) {
      options = { documents: [options] };
    } else if (options instanceof Array) {
      options = { documents: options };
    }

    let {
      docToData = new Map(),
      documents,
      pivotDocument,
      snap = true,
      restrict = null,
      pivot = PIVOTS.CENTER,
      preview = false,
      crosshair = false,
      callback,
      scale = null,
      rotation = null,
      x = null,
      y = null,
    } = options;

    this.callback = callback;
    this._docToData = docToData;
    this._docToDataOriginal = new Map();
    this._restrict = restrict;

    if (documents) this.documents(documents);
    if (pivotDocument) this.pivotDocument(pivotDocument);
    this.pivot(pivot);
    this.snap(snap);
    if (rotation != null) this.rotate(rotation);
    if (scale != null) this.scale(scale);
    if (x != null && y != null) this.position({ x, y });
    if (preview) this.preview();
    if (crosshair) this.crosshair(crosshair instanceof Object ? crosshair : {});
  }

  _copyDocToData() {}

  /**
   * Add documents/placeables to the transformer
   * @param {PlaceableObject | Iterable<PlaceableObject> | Document | Iterable<Document>} documents
   * @returns {MassTransformer}
   */
  documents(documents) {
    if (!(Symbol.iterator in Object(documents))) {
      documents = [documents];
    }

    for (let document of documents) {
      document = document.document ?? document;

      // It is assumed that all documents belong to the same scene
      // let fetch it from one of them
      if (!this._scene) this._scene = document.parent;

      const dataArr = this._docToData.get(document.documentName) ?? [];
      if (!dataArr.find((d) => d._id === document.id)) dataArr.push(this._saveDataOriginal(document));
      this._docToData.set(document.documentName, dataArr);
    }

    return this;
  }

  /**
   * Adds currently selected documents to the transformer
   * @param linked      include placeables linked to the selected
   * @param hardLinked  only hard (SEND) links are considered
   * @returns {MassTransformer}
   */
  selected({ linked = true, hardLinked = true } = {}) {
    const selected = [...canvas.activeLayer.controlled].map((p) => p.document);
    if (!selected.length) return this;
    this.documents(selected);
    if (linked) this.documents(LinkerAPI.getLinkedDocuments(selected, { hardLinked }));
    return this;
  }

  _saveDataOriginal(document) {
    const data = document.toObject();
    const dataArr = this._docToDataOriginal.get(document.documentName) ?? [];
    dataArr.push(foundry.utils.deepClone(data));
    this._docToDataOriginal.set(document.documentName, dataArr);

    return data;
  }

  /**
   * Set a document to be used as a pivot for all transformations.
   * @see pivot
   * @param {PlaceableObject | Document} document
   * @returns {MassTransformer}
   */
  pivotDocument(document) {
    document = document.document ?? document;
    this.documents(document);

    const data = this._docToData.get(document.documentName).find((d) => d._id === document.id);
    this._pivotReferenceDocument = { documentName: document.documentName, data };
    return this;
  }

  /**
   * Set the pivot location.
   * @see PIVOTS
   * @param {string} pivot
   * @returns {MassTransformer}
   */
  pivot(pivot) {
    if (!PIVOTS.hasOwnProperty(pivot)) throw Error('Invalid Pivot');
    this._pivot = Scenescape.active ? PIVOTS.BOTTOM : pivot;
    return this;
  }

  /**
   * Should the data be snapped to the canvas grid
   * @param {boolean} val
   * @returns {MassTransformer}
   */
  snap(val) {
    this._snap = Scenescape.active ? false : val;
    return this;
  }

  /**
   * Rotate data by provided number of degrees
   * @param {number} degrees
   * @returns {MassTransformer}
   */
  rotate(degrees) {
    this.applyTransform({ rotation: degrees }, this.pivotPoint(this._pivot));
    return this;
  }

  /**
   * Raise or lower elevation
   * @param {number} elevation
   * @returns {MassTransformer}
   */
  elevate(elevation) {
    this.applyTransform({ z: elevation }, this.pivotPoint(this._pivot));
    if (MassTransformer._label) {
      MassTransformer._label.text = `[${getPresetDataBounds(this._docToData).elevation.bottom.toFixed(2)}]`;
      MassTransformer._label.anchor.set(1, -2);
    }
    return this;
  }

  /**
   * Scale data by the provided value
   * @param {number} val
   * @returns {MassTransformer}
   */
  scale(val) {
    this.applyTransform({ scale: val }, this.pivotPoint(this._pivot));

    // If we're on a scenescape we want manual changes to the token scale to override the actor defined token size
    if (Scenescape.active) {
      if (this._docToData.get('Token')) {
        this._docToData.get('Token').forEach((d) => {
          foundry.utils.setProperty(d, `flags.${MODULE_ID}.size`, d.height);
        });
      }
    }
    return this;
  }

  /**
   * Mirrors data on the x-axis around the center pivot
   * @returns {MassTransformer}
   */
  mirrorX() {
    this.applyTransform({ mirrorX: true }, this.pivotPoint(PIVOTS.CENTER));
    return this;
  }

  /**
   * Mirrors data on the y-axis around the center pivot
   * @returns {MassTransformer}
   */
  mirrorY() {
    this.applyTransform({ mirrorY: true }, this.pivotPoint(PIVOTS.CENTER));
    return this;
  }

  /**
   * Position data on the provided coordinates
   * @param {number | Object} x either a numerical x coordinate or an object containing x, y, and/or z coordinates
   * @param {number} y
   * @param {number} z
   * @returns {MassTransformer}
   */
  position(x, y, z) {
    if (x instanceof Object) ({ x, y, z } = x);
    if (x == null && y == null && z == null) throw Error('Invalid position.');
    let pos = { x, y, z };

    // Place the preview pivot point on the provided position
    const b = this._pivotReferenceBounds();
    let pivotPoint = this.pivotPoint(this._pivot);
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

      // TODO apply this to pivot point too?
    }

    let paraScale;
    if (Scenescape.active && Scenescape.autoScale) {
      const previousParams = Scenescape.getParallaxParameters(pivotPoint);
      const params = Scenescape.getParallaxParameters({ x, y });

      if (previousParams.scale !== params.scale) {
        paraScale = 1 * (params.scale / previousParams.scale);
      }

      // Correct token size by adjusting the scale to match the expected token size at the new parallax parameter
      // TODO: Move into a function?
      const data = this._docToData.get('Token')?.[0];
      if (data) {
        data.height = foundry.utils.getProperty(data, `flags.${MODULE_ID}.height`) ?? data.height;

        const expectedHeight = (Scenescape.getTokenSize(data) / canvas.dimensions.size) * params.scale;
        const actualHeight = paraScale * data.height;
        paraScale *= expectedHeight / actualHeight;
      }

      transform.z = params.elevation - b.elevation.bottom;
      if (this._label) this._label.text = '';
    }

    // - end of transform calculations
    this.applyTransform(transform, pos);
    if (paraScale) this.applyTransform({ scale: paraScale }, pos);

    if (MassTransformer._label) {
      MassTransformer._label.x = pos.x;
      MassTransformer._label.y = pos.y - 38;
    }
    return this;
  }

  applyTransform(transform, origin) {
    origin = origin ?? this.pivotPoint(this._pivot);
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
    return this;
  }

  /**
   * Clear previews
   * @see preview
   */
  destroyPreview(confirm) {
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

    if (confirm != null) this.callback?.(confirm);

    this._layer = null;
    this._previewDocuments = null;
    this._previews = null;
  }

  /**
   * Create a preview out of documents/data fed in via the constructor or documents(...)
   * @see documents
   * @returns {MassTransformer}
   */
  preview() {
    if (!this._docToData.size) throw Error('Cannot enable preview before assigning data/documents to the transformer.');

    this.destroyPreview(null);

    let { previews, previewDocuments } = MassTransformer._genPreviews(this._restrict, this._docToData);
    this._layer = previewDocuments.size !== 1 ? canvas.walls : canvas.getLayerByEmbeddedName(previewDocuments.first());
    this._previewDocuments = previewDocuments;
    this._previews = previews;
    return this;
  }

  /**
   * Create a crosshair cursor which continually feed its position via position(...) function
   * @see position
   * @param {Function} callback optional callback function to be called when crosshair is exited out of
   * @returns {MassTransformer}
   */
  crosshair({ callback } = {}) {
    if (callback) this.callback = callback;
    else if (!this.callback)
      this.callback = (confirm) => {
        if (confirm) this.update();
      };

    MassTransformer.destroyCrosshair();
    MassTransformer.createCrosshair({ transformer: this });
    return this;
  }

  static destroyCrosshair() {
    if (this.crosshairOverlay) {
      this.crosshairOverlay.transformer.destroyPreview(false);
      TransformBus.unregister(this.crosshairOverlay.transformer);
      this.crosshairOverlay.parent?.removeChild(this.crosshairOverlay);
      this.crosshairOverlay.destroy(true);
      this.crosshairOverlay.children?.forEach((c) => c.destroy(true));
      this.crosshairOverlay = null;
      this._label = null;
    }
    Mouse3D.deactivate();
  }

  /**
   * Performs document updates using the transformed data
   * @param {object} context
   * @param {Scene} scene
   * @returns {MassTransformer}
   */
  async update(context = {}, scene = this._scene) {
    for (let [documentName, dataArr] of this._docToData.entries()) {
      const originalDataArr = this._docToDataOriginal.get(documentName);
      if (originalDataArr) {
        dataArr = dataArr
          .map((data) => {
            const originalData = originalDataArr.find((d) => d._id === data._id);
            if (originalData) return { _id: data._id, ...foundry.utils.diffObject(originalData, data) };
            else return data;
          })
          .filter((data) => Object.keys(data).length > 1);
      }

      await updateEmbeddedDocumentsViaGM(documentName, dataArr, context, scene);
    }
    return this;
  }

  pivotPoint(pivot) {
    return getPivotPoint(pivot, null, this._pivotReferenceBounds());
  }

  _pivotReferenceBounds() {
    return this._pivotReferenceDocument
      ? getDataBounds(this._pivotReferenceDocument.documentName, this._pivotReferenceDocument.data)
      : getPresetDataBounds(this._docToData);
  }

  static createCrosshair({ transformer } = {}) {
    if (game.Levels3DPreview?._active) {
      Mouse3D.activate({
        transformer,
      });
    } else {
      const crosshairOverlay = new PIXI.Container();
      crosshairOverlay.transformer = transformer;

      let label = new PreciseText('', { ...CONFIG.canvasTextStyle, _fontSize: 24 });
      label.anchor.set(0.5, 1);
      this._label = crosshairOverlay.addChild(label);

      crosshairOverlay.on('pointermove', (event) => {
        const client = event.data.client;
        if (
          client.x !== MassTransformer.crosshairOverlay.lastX ||
          client.y !== MassTransformer.crosshairOverlay.lastY
        ) {
          MassTransformer.crosshairOverlay.lastX = client.x;
          MassTransformer.crosshairOverlay.lastY = client.y;
          TransformBus.position(canvas.mousePosition);
        }
      });

      crosshairOverlay.hitArea = canvas.dimensions.rect;
      crosshairOverlay.cursor = 'crosshair';
      crosshairOverlay.interactive = true;
      crosshairOverlay.zIndex = 5;
      crosshairOverlay.on('remove', () => crosshairOverlay.off('pick'));
      crosshairOverlay.on('mouseup', (event) => {
        TransformBus.resolve(event.nativeEvent.which !== 2);
        this.destroyCrosshair();
      });

      canvas.stage.addChild(crosshairOverlay);
      this.crosshairOverlay = crosshairOverlay;
      crosshairOverlay.transformer.position(canvas.mousePosition);
    }

    TransformBus.register(transformer);
    TransformBus.position(canvas.mousePosition);
  }

  static resolve(confirm) {
    this.crosshairOverlay?.callback?.(confirm);
    this.destroyCrosshair();
  }

  // Modified Foundry _createPreview
  // Does not throw warning if user lacks document create permissions
  static _createPreview(createData) {
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
    object.draw().then(() => {
      // Since we do elevation manipulation to force previews to be rendered on top
      // we don't want the user to see these temporary values
      if (object.tooltip) object.tooltip.renderable = false;
      if (object.controlIcon?.tooltip) object.controlIcon.tooltip.renderable = false;

      object.visible = false;

      // Foundry as well as various modules might have complex `isVisible` and 'visible' conditions
      // lets simplify by overriding this function to make sure the preview is always visible
      MassTransformer._overridePlaceableVisibility(object);

      // 3D Canvas
      if (game.Levels3DPreview?._active) {
        let l3dPreview;
        if (documentName === 'Tile') {
          game.Levels3DPreview.createTile(object);
          l3dPreview = game.Levels3DPreview.tiles[object.id];

          l3dPreview.castShadow = false;
          l3dPreview.collision = false;
        } else if (documentName === 'Token') {
          // Tokens get async loaded without a way to await them
          // We'll need to retrieve the 3D token when the transforms are actually getting applied
          game.Levels3DPreview.addToken(object);
        } else if (documentName === 'AmbientLight') {
          game.Levels3DPreview.addLight(object);
          l3dPreview = game.Levels3DPreview.lights[object.id];
        }

        if (l3dPreview) {
          // Disable interactivity with the 3D preview
          l3dPreview._onClickLeft = () => {};
          l3dPreview._onClickLeft2 = () => {};
          l3dPreview._onClickRight = () => {};
          l3dPreview._onClickRight2 = () => {};

          object._l3dPreview = l3dPreview;
        }
      }
    });

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

  static _genPreviews(restrict, docToData) {
    const toCreate = [];
    for (const [documentName, dataArr] of docToData.entries()) {
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
        previewContainer.preview = this._createPreview.call(
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

export async function editPreviewPlaceables({
  placeables,
  callback = null,
  mainPlaceable = null,
  hardLinked = false,
} = {}) {
  const controlled = new Set();
  let hoveredDocument = mainPlaceable?.document;

  if (placeables?.length) {
    placeables.forEach((p) => {
      controlled.add(p.document);
      LinkerAPI.getLinkedDocuments(p.document, { hardLinked }).forEach((d) => controlled.add(d));
    });
  } else {
    SUPPORTED_PLACEABLES.forEach((documentName) => {
      canvas.getLayerByEmbeddedName(documentName).controlled.forEach((p) => {
        controlled.add(p.document);
        LinkerAPI.getLinkedDocuments(p.document, { hardLinked }).forEach((d) => controlled.add(d));
      });
      const hover = canvas.getLayerByEmbeddedName(documentName).hover;
      if (hover) {
        if (!hoveredDocument) hoveredDocument = hover.document;
        controlled.add(hover.document);
        LinkerAPI.getLinkedDocuments(hover.document, { hardLinked }).forEach((d) => controlled.add(d));
      }
    });
  }

  if (!controlled.size && !game.Levels3DPreview?._active) {
    const pickerSelected = await pickerSelectMultiLayerDocuments();
    pickerSelected.forEach((d) => controlled.add(d));
  }

  if (!controlled.size) return false;

  const transformer = new MassTransformer({ documents: controlled, pivotDocument: hoveredDocument })
    .snap(true)
    .pivot(PIVOTS.CENTER)
    .preview()
    .crosshair({
      callback: async (confirm) => {
        if (!confirm) return callback?.();
        await transformer.update({
          ignoreLinks: true,
          animate: false,
        });

        callback?.(confirm);
      },
    });

  return true;
}
