import { getPresetDataCenterOffset } from './presets/utils.js';
import { SUPPORTED_PLACEABLES } from './utils.js';

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class Picker {
  static pickerOverlay;
  static boundStart;
  static boundEnd;
  static callback;

  static isActive() {
    return Boolean(this.pickerOverlay);
  }

  static addRotation(rotation) {
    this._rotation += rotation;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
  }

  static addScaling(scale) {
    this._scale += scale;
    this.pickerOverlay?.setPositions?.(canvas.mousePosition);
  }

  /**
   * Activates the picker overlay.
   * @param {Function} callback callback function with coordinates returned as starting and ending bounds of a rectangles
   *                            { start: {x1, y1}, end: {x2, y2} }
   * @param {Object}  preview
   * @param {String}  preview.documentName (optional) preview placeables document name
   * @param {Map[String,Array]}  preview.previewData    (req) preview placeables data
   * @param {String}  preview.taPreview            (optional) Designates the preview placeable when spawning a `Token Attacher` prefab.
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

      let { previews, layer, previewDocuments } = await this._genPreviews(preview);
      this._rotation = 0;
      this._scale = 1;

      // Position offset to center preview over the mouse
      let offset;
      if (preview.center) offset = getPresetDataCenterOffset(preview.previewData);
      else offset = { x: 0, y: 0 };

      const setPositions = function (pos) {
        if (!pos) return;
        if (preview.center) offset = getPresetDataCenterOffset(preview.previewData);
        if (preview.snap && layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT))
          pos = canvas.grid.getSnappedPosition(pos.x, pos.y, layer.gridPrecision);

        // calculate transform
        const fpX = previews[0].document.documentName === 'Wall' ? previews[0].document.c[0] : previews[0].document.x;
        const fpY = previews[0].document.documentName === 'Wall' ? previews[0].document.c[1] : previews[0].document.y;
        let transform = { x: pos.x - fpX - offset.x, y: pos.y - fpY - offset.y };
        if (Picker._rotation != 0) {
          transform.rotation = Picker._rotation;
          Picker._rotation = 0;
        }
        if (Picker._scale != 1) {
          transform.scale = Picker._scale;
          Picker._scale = 1;
        }

        for (const preview of previews) {
          const doc = preview.document;
          DataTransform.apply(doc.documentName, preview._pData ?? doc, pos, transform, preview);

          // =====
          // Hacks
          // =====
          preview.document.alpha = 0.4;
          preview.renderFlags.set({ refresh: true });
          preview.visible = true;

          // Tile z order, to make sure previews are rendered on-top
          if (!preview.z) preview.z = preview.document.z;
          if (preview.z) preview.document.z = preview.z + 9999999;

          if (preview.controlIcon && !preview.controlIcon._meVInsert) {
            preview.controlIcon.alpha = 0.4;

            // ControlIcon visibility is difficult to set and keep as true
            // Lets hack it by defining a getter that always returns true
            Object.defineProperty(preview.controlIcon, 'visible', {
              get: function () {
                return true;
              },
              set: function () {},
            });
            preview.controlIcon._meVInsert = true;
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
        if (preview.center && transform.scale != null) {
          setPositions(pos);
        }
      };

      pickerOverlay.on('pointermove', (event) => {
        setPositions(event.data.getLocalPosition(pickerOverlay));
      });
      setPositions(canvas.mousePosition);
      pickerOverlay.setPositions = setPositions;
    }

    pickerOverlay.hitArea = canvas.dimensions.rect;
    pickerOverlay.cursor = 'crosshair';
    pickerOverlay.interactive = true;
    pickerOverlay.zIndex = Infinity;
    pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
    pickerOverlay.on('mousedown', (event) => {
      Picker.boundStart = event.data.getLocalPosition(pickerOverlay);
    });
    pickerOverlay.on('mouseup', (event) => {
      Picker.boundEnd = event.data.getLocalPosition(pickerOverlay);
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
      pickerOverlay.parent?.removeChild(pickerOverlay);
      if (pickerOverlay.previewDocuments)
        pickerOverlay.previewDocuments.forEach((name) => canvas.getLayerByEmbeddedName(name)?.clearPreviewContainer());
      this.destroy();
    });

    this.pickerOverlay = pickerOverlay;

    canvas.stage.addChild(this.pickerOverlay);
  }

  static destroy() {
    if (this.pickerOverlay) {
      canvas.stage.removeChild(this.pickerOverlay);
      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.callback?.(null);
      this.pickerOverlay = null;
      this.callback = null;
    }
  }

  // Modified Foundry _createPreview
  // Does not throw warning if user lacks document create permissions
  static async _createPreview(createData) {
    const documentName = this.constructor.documentName;
    const cls = getDocumentClass(documentName);
    createData._id = foundry.utils.randomID(); // Needed to allow rendering of multiple previews at the same time
    const document = new cls(createData, { parent: canvas.scene });

    const object = new CONFIG[documentName].objectClass(document);
    this.preview.addChild(object);
    await object.draw();

    return object;
  }

  static async _genPreviews(preview) {
    if (!preview.previewData) return { previews: [] };

    const previewDocuments = new Set();
    const previews = [];
    const transform = {};

    for (const [documentName, dataArr] of preview.previewData.entries()) {
      const layer = canvas.getLayerByEmbeddedName(documentName);
      for (const data of dataArr) {
        // Create Preview
        const previewObject = await this._createPreview.call(layer, deepClone(data));
        previewObject._pData = data;
        previews.push(previewObject);
        previewDocuments.add(documentName);

        // Set initial transform which will set first preview to (0, 0) and all others relative to it
        if (transform.x == null) {
          if (documentName === 'Wall') {
            transform.x = -previewObject.document.c[0];
            transform.y = -previewObject.document.c[1];
          } else {
            transform.x = -previewObject.document.x;
            transform.y = -previewObject.document.y;
          }
        }

        if (preview.taPreview && documentName === 'Token') {
          const documentNames = await this._genTAPreviews(data, preview.taPreview, previewObject, previews);
          documentNames.forEach((dName) => previewDocuments.add(dName));
        }
      }
    }

    for (const preview of previews) {
      const doc = preview.document;
      DataTransform.apply(doc.documentName, preview._pData ?? doc, { x: 0, y: 0 }, transform, preview);
    }
    return { previews, layer: canvas.getLayerByEmbeddedName(preview.documentName), previewDocuments };
  }

  static _parseTAPreview(taPreview, attached) {
    if (taPreview === 'ALL') return attached;

    const attachedData = {};
    taPreview = taPreview.split(',');

    for (const taIndex of taPreview) {
      let [name, index] = taIndex.trim().split('.');
      if (!attached[name]) continue;

      if (index == null) {
        attachedData[name] = attached[name];
      } else {
        if (attached[name][index]) {
          if (!attachedData[name]) attachedData[name] = [];
          attachedData[name].push(attached[name][index]);
        }
      }
    }

    return attachedData;
  }

  static async _genTAPreviews(data, taPreview, parent, previews) {
    if (!game.modules.get('token-attacher')?.active) return [];

    const attached = getProperty(data, 'flags.token-attacher.prototypeAttached');
    const pos = getProperty(data, 'flags.token-attacher.pos');
    const grid = getProperty(data, 'flags.token-attacher.grid');

    if (!(attached && pos && grid)) return [];

    const documentNames = new Set();

    const ratio = canvas.grid.size / grid.size;
    const attachedData = this._parseTAPreview(taPreview, attached);

    for (const [name, dataList] of Object.entries(attachedData)) {
      for (let data of dataList) {
        if (['Token', 'Tile', 'Drawing'].includes(name)) {
          data.width *= ratio;
          data.height *= ratio;
        }

        const taPreviewObject = await this._createPreview.call(canvas.getLayerByEmbeddedName(name), data);
        documentNames.add(name);
        previews.push(taPreviewObject);

        const doc = taPreviewObject.document;
        if (name === 'Wall') {
          doc.c[0] = parent.document.x + (data.c[0] - pos.xy.x) * ratio;
          doc.c[1] = parent.document.y + (data.c[1] - pos.xy.y) * ratio;
          doc.c[2] = parent.document.x + (data.c[2] - pos.xy.x) * ratio;
          doc.c[3] = parent.document.y + (data.c[3] - pos.xy.y) * ratio;
        } else {
          doc.x = parent.document.x + (data.x - pos.xy.x) * ratio;
          doc.y = parent.document.y + (data.y - pos.xy.y) * ratio;
        }
      }
    }

    return documentNames;
  }
}

export class DataTransform {
  /**
   * Transform placeable data and optionally an accompanying preview with the provided delta transform
   * @param {String} docName
   * @param {Object} data
   * @param {Object} origin
   * @param {Object} transform
   * @param {PlaceableObject} preview
   */
  static apply(docName, data, origin, transform, preview) {
    if (transform.x == null) transform.x = 0;
    if (transform.y == null) transform.y = 0;

    if (docName === 'Wall') {
      this.transformWall(data, origin, transform, preview);
    } else if (docName === 'Tile') {
      this.transformTile(data, origin, transform, preview);
    } else if (docName == 'Note') {
      this.transformNote(data, origin, transform, preview);
    } else if (docName === 'Token') {
      this.transformToken(data, origin, transform, preview);
    } else if (docName === 'MeasuredTemplate') {
      this.transformMeasuredTemplate(data, origin, transform, preview);
    } else if (docName === 'AmbientLight') {
      this.transformAmbientLight(data, origin, transform, preview);
    } else if (docName === 'AmbientSound') {
      this.transformAmbientSound(data, origin, transform, preview);
    } else if (docName === 'Drawing') {
      this.transformDrawing(data, origin, transform, preview);
    } else {
      data.x += transform.x;
      data.y += transform.y;
      if (preview) {
        preview.document.x = data.x;
        preview.document.y = data.y;
      }
    }
  }

  static transformNote(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
    }

    data.x += transform.x;
    data.y += transform.y;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
    }

    if (preview) {
      preview.document.x = data.x;
      preview.document.y = data.y;
    }
  }

  static transformAmbientSound(data, origin, transform, preview) {
    // 3D support
    const bottom = data.flags?.levels?.rangeBottom;

    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.radius *= scale;

      // 3D Support
      if (bottom != null && bottom != '') {
        data.flags.levels.rangeBottom *= scale;
        data.flags.levels.rangeTop *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;

    // 3D Support
    if (transform.z != null) {
      setProperty(data, 'flags.levels.rangeBottom', (bottom ?? 0) + transform.z);
      setProperty(data, 'flags.levels.rangeTop', (bottom ?? 0) + transform.z);
    }

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.radius = data.radius;
    }
  }

  static transformWall(data, origin, transform, preview) {
    const c = deepClone(data.c);

    if (transform.scale != null) {
      const scale = transform.scale;
      c[0] *= scale;
      c[1] *= scale;
      c[2] *= scale;
      c[3] *= scale;
    }

    c[0] += transform.x;
    c[1] += transform.y;
    c[2] += transform.x;
    c[3] += transform.y;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [c[0], c[1]] = this.rotatePoint(origin.x, origin.y, c[0], c[1], dr);
      [c[2], c[3]] = this.rotatePoint(origin.x, origin.y, c[2], c[3], dr);
    }

    data.c = c;
    if (preview) preview.document.c = c;
  }

  static transformMeasuredTemplate(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.distance *= scale;
      if (data.width) data.width *= scale;
    }

    data.x += transform.x;
    data.y += transform.y;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
      data.direction += Math.toDegrees(dr);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.direction = data.direction;
      doc.distance = data.distance;
      doc.width = data.width;
    }
  }

  static transformAmbientLight(data, origin, transform, preview) {
    // 3D support
    const bottom = data.flags?.levels?.rangeBottom;

    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.config.dim *= scale;
      data.config.bright *= scale;

      // 3D Support
      if (bottom != null && bottom != '') {
        data.flags.levels.rangeBottom *= scale;
        data.flags.levels.rangeTop *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;

    // 3D Support
    if (transform.z != null) {
      setProperty(data, 'flags.levels.rangeBottom', (bottom ?? 0) + transform.z);
      setProperty(data, 'flags.levels.rangeTop', (bottom ?? 0) + transform.z);
    }

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
      data.rotation += Math.toDegrees(dr);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.rotation = data.rotation;
      doc.config.dim = data.config.dim;
      doc.config.bright = data.config.bright;
    }
  }

  static transformTile(data, origin, transform, preview) {
    // 3D support
    const depth = data.flags?.['levels-3d-preview']?.depth;
    const bottom = data.flags?.levels?.rangeBottom;

    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.width *= scale;
      data.height *= scale;

      // 3D Support
      if (depth != null && depth != '') data.flags['levels-3d-preview'].depth *= scale;
      if (bottom != null && bottom != '') {
        data.flags.levels.rangeBottom *= scale;
        data.flags.levels.rangeTop *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;

    // 3D Support
    if (transform.z != null) {
      setProperty(data, 'flags.levels.rangeBottom', (bottom ?? 0) + transform.z);
      setProperty(data, 'flags.levels.rangeTop', (bottom ?? 0) + transform.z);
    }

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + data.width / 2, y: data.y + data.height / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - data.width / 2;
      data.y = rectCenter.y - data.height / 2;
      data.rotation += Math.toDegrees(dr);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.width = data.width;
      doc.height = data.height;
      doc.rotation = data.rotation;
    }
  }

  static transformDrawing(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.shape.width *= scale;
      data.shape.height *= scale;
      if (data.shape.points) {
        const points = data.shape.points;
        for (let i = 0; i < points.length; i++) {
          points[i] *= scale;
        }
      }
    }

    data.x += transform.x;
    data.y += transform.y;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + data.shape.width / 2, y: data.y + data.shape.height / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - data.shape.width / 2;
      data.y = rectCenter.y - data.shape.height / 2;
      data.rotation += Math.toDegrees(dr);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.shape.width = data.shape.width;
      doc.shape.height = data.shape.height;
      doc.shape.points = data.shape.points;
      doc.rotation = data.rotation;
    }
  }

  static transformToken(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.width *= scale;
      data.height *= scale;
      data.elevation *= scale;
    }

    data.x += transform.x;
    data.y += transform.y;
    data.elevation += transform.z ?? 0;

    const grid = canvas.grid;
    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + (data.width * grid.w) / 2, y: data.y + (data.height * grid.h) / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - (data.width * grid.w) / 2;
      data.y = rectCenter.y - (data.height * grid.h) / 2;
      data.rotation = (data.rotation + Math.toDegrees(dr)) % 360;
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.elevation = data.elevation;
      doc.rotation = data.rotation;
      doc.width = data.width;
      doc.height = data.height;
    }
  }

  /**
   * Rotates one point around the other
   * @param {Number} x pivot point
   * @param {Number} y pivot point
   * @param {Number} x2 point to be rotated
   * @param {Number} y2 point to be rotated
   * @param {Number} rot rotation in radians
   * @returns
   */
  static rotatePoint(x, y, x2, y2, rot) {
    const dx = x2 - x,
      dy = y2 - y;
    return [x + Math.cos(rot) * dx - Math.sin(rot) * dy, y + Math.sin(rot) * dx + Math.cos(rot) * dy];
  }
}

export async function editPreviewPlaceables() {
  const docToPlaceables = new Map();

  SUPPORTED_PLACEABLES.forEach((docName) => {
    const controlled = canvas.getLayerByEmbeddedName(docName).controlled;
    if (controlled.length) {
      docToPlaceables.set(
        docName,
        controlled.map((p) => p)
      );
    }
  });

  if (!docToPlaceables.size) {
    // Activate picker to define select box
    const coords = await new Promise(async (resolve) => {
      Picker.activate(resolve);
    });
    if (!coords) return;

    // Selects placeables within the bounding box
    const selectionRect = new PIXI.Rectangle(
      coords.start.x,
      coords.start.y,
      coords.end.x - coords.start.x,
      coords.end.y - coords.start.y
    );

    SUPPORTED_PLACEABLES.forEach((docName) => {
      let insideRect = [];
      canvas.getLayerByEmbeddedName(docName).placeables.forEach((p) => {
        const c = p.center;
        if (selectionRect.contains(c.x, c.y)) insideRect.push(p);
      });
      if (insideRect.length) docToPlaceables.set(docName, insideRect);
    });
  }

  if (!docToPlaceables.size) return;

  // Generate data from the selected placeables and pass them to Picker to create previews
  const docToData = new Map();
  const originalDocTolData = new Map();

  let mainDocName;
  docToPlaceables.forEach((placeables, documentName) => {
    if (SUPPORTED_PLACEABLES.includes(documentName)) {
      let data = placeables.map((p) => p.document.toCompendium(null, { keepId: true }));

      if (
        documentName === 'Token' &&
        game.modules.get('token-attacher')?.active &&
        tokenAttacher?.generatePrototypeAttached
      ) {
        for (const d of data) {
          const attached = d.flags?.['token-attacher']?.attached || {};
          if (!foundry.utils.isEmpty(attached)) {
            const prototypeAttached = tokenAttacher.generatePrototypeAttached(d, attached);
            setProperty(d, 'flags.token-attacher.attached', null);
            setProperty(d, 'flags.token-attacher.prototypeAttached', prototypeAttached);
            setProperty(d, 'flags.token-attacher.grid', {
              size: canvas.grid.size,
              w: canvas.grid.w,
              h: canvas.grid.h,
            });
          }
        }
      }

      docToData.set(documentName, data);
      originalDocTolData.set(documentName, deepClone(data));
      if (!mainDocName) mainDocName = documentName;
    }
  });

  if (!docToData.size) return;

  Picker.activate(
    async (coords) => {
      if (coords == null) return;

      docToData.forEach((data, documentName) => {
        let updates = [];

        const originalData = originalDocTolData.get(documentName);
        for (let i = 0; i < originalData.length; i++) {
          const diff = foundry.utils.diffObject(originalData[i], data[i]);
          if (!foundry.utils.isEmpty(diff)) {
            diff._id = originalData[i]._id;
            delete diff.flags;
            updates.push(diff);
          }
        }
        if (updates.length) canvas.scene.updateEmbeddedDocuments(documentName, updates);
      });
    },
    {
      documentName: mainDocName,
      previewData: docToData,
      snap: true,
      taPreview: 'ALL',
      center: true,
    }
  );
}
