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

      const { previews, layer, previewDocuments } = await this._genPreviews(preview);

      const setPositions = function (pos) {
        if (!pos) return;
        if (preview.snap && layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT))
          pos = canvas.grid.getSnappedPosition(pos.x, pos.y, layer.gridPrecision);

        for (const preview of previews) {
          if (preview.document.documentName === 'Wall') {
            const c = preview.document.c;
            c[0] = pos.x + preview._previewOffset[0];
            c[1] = pos.y + preview._previewOffset[1];
            c[2] = pos.x + preview._previewOffset[2];
            c[3] = pos.y + preview._previewOffset[3];
            preview.document.c = c;
          } else {
            preview.document.x = pos.x + preview._previewOffset.x;
            preview.document.y = pos.y + preview._previewOffset.y;
          }
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
    pickerOverlay.on('mouseup', (event) => (Picker.boundEnd = event.data.getLocalPosition(pickerOverlay)));
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

    let mainPreviewX;
    let mainPreviewY;

    for (const [documentName, dataArr] of preview.previewData.entries()) {
      const layer = canvas.getLayerByEmbeddedName(documentName);
      for (const data of dataArr) {
        // Create Preview
        const previewObject = await this._createPreview.call(layer, deepClone(data));
        previews.push(previewObject);
        previewDocuments.add(documentName);

        // Determine point around which other previews are to be placed
        if (mainPreviewX == null) {
          if (documentName === 'Wall') {
            if (data.c != null) {
              mainPreviewX = previewObject.document.c[0];
              mainPreviewY = previewObject.document.c[1];
            }
          } else {
            if (data.x != null && data.y != null) {
              mainPreviewX = previewObject.document.x;
              mainPreviewY = previewObject.document.y;
            }
          }
        }

        // Calculate offset from first preview
        if (documentName === 'Wall') {
          const off = [
            previewObject.document.c[0] - (mainPreviewX ?? 0),
            previewObject.document.c[1] - (mainPreviewY ?? 0),
            previewObject.document.c[2] - (mainPreviewX ?? 0),
            previewObject.document.c[3] - (mainPreviewY ?? 0),
          ];
          previewObject._previewOffset = off;
        } else {
          previewObject._previewOffset = {
            x: previewObject.document.x - (mainPreviewX ?? 0),
            y: previewObject.document.y - (mainPreviewY ?? 0),
          };
        }

        if (preview.taPreview && documentName === 'Token') {
          const documentNames = await this._genTAPreviews(data, preview.taPreview, previewObject, previews);
          documentNames.forEach((dName) => previewDocuments.add(dName));
        }
      }
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
      for (const data of dataList) {
        if (['Token', 'Tile', 'Drawing'].includes(name)) {
          data.width *= ratio;
          data.height *= ratio;
        }

        const taPreviewObject = await this._createPreview.call(canvas.getLayerByEmbeddedName(name), data);
        documentNames.add(name);
        previews.push(taPreviewObject);

        // Calculate offset from parent preview
        if (name === 'Wall') {
          taPreviewObject._previewOffset = [
            (data.c[0] - pos.xy.x) * ratio + parent._previewOffset.x,
            (data.c[1] - pos.xy.y) * ratio + parent._previewOffset.y,
            (data.c[2] - pos.xy.x) * ratio + parent._previewOffset.x,
            (data.c[3] - pos.xy.y) * ratio + parent._previewOffset.y,
          ];
        } else {
          taPreviewObject._previewOffset = {
            x: (data.x - pos.xy.x) * ratio + parent._previewOffset.x,
            y: (data.y - pos.xy.y) * ratio + parent._previewOffset.y,
          };
        }
      }
    }

    return documentNames;
  }
}
