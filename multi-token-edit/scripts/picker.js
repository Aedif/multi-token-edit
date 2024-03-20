import { getPresetDataCenterOffset } from './presets/utils.js';

/**
 * Cross-hair and optional preview image/label that can be activated to allow the user to select
 * an area on the screen.
 */
export class Picker {
  static pickerOverlay;
  static boundStart;
  static boundEnd;
  static callback;

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
      this._lastPos = { x: 0, y: 0 };

      // Position offset to center preview over the mouse
      let offset;
      if (preview.center) offset = getPresetDataCenterOffset(preview.previewData);
      else offset = { x: 0, y: 0 };

      const setPositions = function (pos) {
        if (!pos) return;
        const realPos = { x: pos.x, y: pos.y };
        pos.x -= offset.x;
        pos.y -= offset.y;
        if (preview.snap && layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT))
          pos = canvas.grid.getSnappedPosition(pos.x, pos.y, layer.gridPrecision);

        // calculate transform
        //let transform = { x: pos.x - Picker._lastPos.x, y: pos.y - Picker._lastPos.y, rotation: 1 }; // TODO remove static roation
        let transform = { x: pos.x - Picker._lastPos.x, y: pos.y - Picker._lastPos.y };
        Picker._lastPos = pos;

        for (const preview of previews) {
          const doc = preview.document;
          DataTransform.apply(doc.documentName, preview._pData ?? doc, realPos, transform, preview);

          // Hacks
          preview.document.alpha = 0.4;
          preview.renderFlags.set({ refresh: true });
          preview.visible = true;

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
        }

        if (label) {
          label.x = pos.x;
          label.y = pos.y - 38;
        }

        pickerOverlay.previewDocuments = previewDocuments;
      };

      pickerOverlay.on('pointermove', (event) => {
        setPositions(event.data.getLocalPosition(pickerOverlay));
      });
      setPositions(canvas.mousePosition);
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
        this.callback?.({ start: this.boundStart, end: this.boundEnd });
      }
      pickerOverlay.parent.removeChild(pickerOverlay);
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
        data = deepClone(data);
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

class DataTransform {
  static apply(docName, data, origin, transform, preview) {
    if (transform.rotation == null) transform.rotation = 0;

    if (docName === 'Wall') {
      this.transformWall(data, origin, transform, preview);
    } else if (docName === 'Tile') {
      this.transformTile(data, origin, transform, preview);
    } else {
      data.x += transform.x;
      data.y += transform.y;
      if (preview) {
        preview.document.x = data.x;
        preview.document.y = data.y;
      }
    }
  }

  static transformWall(data, origin, transform, preview) {
    const c = deepClone(data.c);
    c[0] += transform.x;
    c[1] += transform.y;
    c[2] += transform.x;
    c[3] += transform.y;

    if (transform.rotation != null) {
      const dRotation = Math.toRadians(transform.rotation % 360);
      [c[0], c[1]] = this.rotatePoint(origin.x, origin.y, c[0], c[1], dRotation);
      [c[2], c[3]] = this.rotatePoint(origin.x, origin.y, c[2], c[3], dRotation);
    }

    data.c = c;
    if (preview) preview.document.c = c;
  }

  static transformTile(data, origin, transform, preview) {
    data.x += transform.x;
    data.y += transform.y;

    if (transform.rotation != null) {
      const dRotation = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + data.width / 2, y: data.y + data.height / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dRotation);
      data.x = rectCenter.x - data.width / 2;
      data.y = rectCenter.y - data.height / 2;
      data.rotation += Math.toDegrees(dRotation);
    }

    if (preview) {
      preview.document.x = data.x;
      preview.document.y = data.y;
      preview.document.rotation = data.rotation;
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
