import { LinkerAPI } from './linker/linker.js';
import { getDataBounds, getPresetDataCenterOffset } from './presets/utils.js';
import { pickerSelectMultiLayerDocuments, SUPPORTED_PLACEABLES } from './utils.js';

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
      this._rotation = preview.rotation ?? 0;
      this._scale = preview.scale ?? 1;
      this._mirrorX = false;
      this._mirrorY = false;

      const levelsActive = game.modules.get('levels')?.active;

      const centerOnCursor = () => {
        return preview.center && !(layer.name === 'TokenLayer' && preview.previewData.size === 1);
      };

      // Position offset to center preview over the mouse
      let offset;
      if (centerOnCursor()) offset = getPresetDataCenterOffset(preview.previewData);
      else offset = { x: 0, y: 0 };

      const setPositions = function (pos) {
        if (!pos) return;
        if (centerOnCursor()) offset = getPresetDataCenterOffset(preview.previewData);
        if (preview.snap && layer && !game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT)) {
          // v12
          if (layer.getSnappedPoint) {
            pos = layer.getSnappedPoint(pos);
          } else {
            pos = canvas.grid.getSnappedPosition(pos.x, pos.y, layer.gridPrecision);
          }
        }

        // calculate transform
        const pd = previews[0].document;
        const b = getDataBounds(pd.documentName, pd);
        let transform = { x: pos.x - b.x1 - offset.x, y: pos.y - b.y1 - offset.y };

        // Instant transforms
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

        for (const preview of previews) {
          const doc = preview.document;
          const documentName = doc.documentName;
          DataTransform.apply(documentName, preview._pData ?? doc, pos, transform, preview);

          // TODO: 3D Preview
          // if (preview._l3dPreview) {
          //   try {
          //     preview._l3dPreview.collision = false;
          //     const mPos = game.Levels3DPreview.interactionManager.canvas3dMousePosition;
          //     const cPos = game.Levels3DPreview.interactionManager.camera.position;

          //     const intersects = game.Levels3DPreview.interactionManager.computeSightCollisionFrom3DPositions(
          //       cPos,
          //       mPos,
          //       'collision',
          //       false,
          //       false,
          //       false,
          //       true
          //     );

          //     if (intersects[0]) {
          //       const mesh = preview._l3dPreview.mesh;
          //       mesh.position.x = intersects[0].point.x;
          //       mesh.position.y = intersects[0].point.y;
          //       mesh.position.z = intersects[0].point.z;
          //     }
          //   } catch (e) {
          //     console.log(e);
          //   }
          // }

          // =====
          // Hacks
          // =====
          preview.renderFlags.set({ refresh: true });

          // TODO: improve _meSort, _meElevation
          if (foundry.utils.isNewerVersion(game.version, 12)) {
            // Elevation, sort, and z order hacks to make sure previews are always rendered on-top
            if (doc.sort != null) {
              if (!preview._meSort) preview._meSort = doc.sort;
              doc.sort = preview._meSort + 10000;
            }

            if (doc.elevation != null) {
              if (!preview._meElevation) preview._meElevation = doc.elevation;
              doc.elevation = preview._meElevation + 10000;
            }

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
          } else {
            if (!preview.z) preview.z = doc.z;
            if (preview.z) doc.z = preview.z + 10000;

            if (documentName === 'Token') {
              if (!preview._meElevation) preview._meElevation = doc.elevation;
              doc.elevation = preview._meElevation + 10000;
            } else if (levelsActive) {
              if (!preview._meElevation)
                preview._meElevation = foundry.utils.getProperty('flags.levels.rangeBottom') ?? 0;
              foundry.utils.setProperty(doc, 'flags.levels.rangeBottom', preview._meElevation + 10000);
              doc.overhead = true;
            }

            // AmbientLight and AmbientSound sources need to be re-initialized to have their fields properly rendered
            if (preview.source) preview.updateSource();
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
    this.pickerOverlay = pickerOverlay;
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
            // TODO: 3D Preview
            // if (game.Levels3DPreview?._active) {
            //   layer.preview.children.forEach((c) => {
            //     c._l3dPreview?.destroy();
            //   });
            // }
            layer.clearPreviewContainer();
          }
        });
      }

      this.pickerOverlay.destroy(true);
      this.pickerOverlay.children?.forEach((c) => c.destroy(true));
      this.callback?.(null);
      this.pickerOverlay = null;
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
    object.document.alpha = 0.4;
    if (object.document.occlusion) object.document.occlusion.alpha = 0.4;
    this.preview.addChild(object);
    await object.draw();

    // Since we do elevation manipulation to force previews to be rendered on top
    // we don't want the user to see these temporary values
    if (object.tooltip) object.tooltip.renderable = false;
    if (object.controlIcon?.tooltip) object.controlIcon.tooltip.renderable = false;

    // Foundry as well as various modules might have complex `isVisible` and 'visible' conditions
    // lets simplify by overriding this function to make sure the preview is always visible
    Picker._overridePlaceableVisibility(object);

    // TODO: 3D Preview
    // if (game.Levels3DPreview._active) {
    //   if (documentName === 'Tile') {
    //     game.Levels3DPreview.createTile(object);
    //     object._l3dPreview = game.Levels3DPreview.tiles[object.id];
    //     console.log(object._l3dPreview);
    //   }
    // }

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

        if (preview.taPreview && documentName === 'Token') {
          this._genTAPreviews(data, preview.taPreview, data, toCreate);
        }
      }
    }

    const previewDocuments = new Set();
    const previews = [];
    for (const { documentName, data } of toCreate) {
      DataTransform.apply(documentName, data, { x: 0, y: 0 }, transform);
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

  static _genTAPreviews(data, taPreview, parent, toCreate) {
    if (!game.modules.get('token-attacher')?.active) return;

    const attached = foundry.utils.getProperty(data, 'flags.token-attacher.prototypeAttached');
    const pos = foundry.utils.getProperty(data, 'flags.token-attacher.pos');
    const grid = foundry.utils.getProperty(data, 'flags.token-attacher.grid');

    if (!(attached && pos && grid)) return;

    const ratio = canvas.grid.size / grid.size;
    const attachedData = this._parseTAPreview(taPreview, attached);

    for (const [name, dataList] of Object.entries(attachedData)) {
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
}

export class DataTransform {
  /**
   * Transform placeable data and optionally an accompanying preview with the provided delta transform
   * @param {String} documentName
   * @param {Object} data
   * @param {Object} origin
   * @param {Object} transform
   * @param {PlaceableObject} preview
   */
  static apply(documentName, data, origin, transform, preview) {
    if (transform.x == null) transform.x = 0;
    if (transform.y == null) transform.y = 0;

    if (documentName === 'Wall') {
      this.transformWall(data, origin, transform, preview);
    } else if (documentName === 'Tile') {
      this.transformTile(data, origin, transform, preview);
    } else if (documentName == 'Note') {
      this.transformNote(data, origin, transform, preview);
    } else if (documentName === 'Token') {
      this.transformToken(data, origin, transform, preview);
    } else if (documentName === 'MeasuredTemplate') {
      this.transformMeasuredTemplate(data, origin, transform, preview);
    } else if (documentName === 'AmbientLight') {
      this.transformAmbientLight(data, origin, transform, preview);
    } else if (documentName === 'AmbientSound') {
      this.transformAmbientSound(data, origin, transform, preview);
    } else if (documentName === 'Drawing') {
      this.transformDrawing(data, origin, transform, preview);
    } else if (documentName === 'Region') {
      this.transformRegion(data, origin, transform, preview);
    }

    return data;
  }

  static transformRegion(data, origin, transform, preview) {
    if (transform.scale != null && data.shapes) {
      const scale = transform.scale;

      for (const shape of data.shapes) {
        if (shape.type === 'polygon') {
          for (let i = 0; i < shape.points.length; i++) {
            shape.points[i] *= scale;
          }
        } else {
          shape.x *= scale;
          shape.y *= scale;
          if (shape.type === 'ellipse') {
            shape.radiusX *= scale;
            shape.radiusY *= scale;
          } else if (shape.type === 'rectangle') {
            shape.height *= scale;
            shape.width *= scale;
          }
        }
      }
    }

    if (data.shapes) {
      data.shapes.forEach((shape) => {
        if (shape.type === 'polygon') {
          for (let i = 0; i < shape.points.length; i += 2) {
            try {
              shape.points[i] += transform.x;
              shape.points[i + 1] += transform.y;
            } catch (e) {
              console.log(shape, transform);
            }
          }
        } else {
          shape.x += transform.x;
          shape.y += transform.y;
        }
      });
    }
    if (transform.z) {
      if (Number.isNumeric(data.elevation?.bottom)) data.elevation.bottom += transform.z;
      if (Number.isNumeric(data.elevation?.top)) data.elevation.top += transform.z;
    }

    if (transform.rotation != null && data.shapes) {
      for (const shape of data.shapes) {
        if (shape.type === 'rectangle') {
          // Foundry does not support rotation for rectangles
          // Convert it to a polygon instead
          shape.type = 'polygon';
          shape.points = [
            shape.x,
            shape.y,
            shape.x + shape.width,
            shape.y,
            shape.x + shape.width,
            shape.y + shape.height,
            shape.x,
            shape.y + shape.height,
          ];
          delete shape.width;
          delete shape.height;
          delete shape.x;
          delete shape.y;
          delete shape.rotation;
        }
        if (shape.type === 'polygon') {
          const dr = Math.toRadians(transform.rotation % 360);
          for (let i = 0; i < shape.points.length; i += 2) {
            [shape.points[i], shape.points[i + 1]] = this.rotatePoint(
              origin.x,
              origin.y,
              shape.points[i],
              shape.points[i + 1],
              dr
            );
          }
        } else {
          const dr = Math.toRadians(transform.rotation % 360);
          let rectCenter = {
            x: shape.x + (shape.radiusX ?? shape.width) / 2,
            y: shape.y + (shape.radiusY ?? shape.height) / 2,
          };
          [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
          shape.x = rectCenter.x - (shape.radiusX ?? shape.width) / 2;
          shape.y = rectCenter.y - (shape.radiusY ?? shape.height) / 2;
        }
      }
    }

    if (transform.mirrorX || transform.mirrorY) {
      for (const shape of data.shapes) {
        if (shape.type === 'rectangle' || shape.type === 'ellipse') {
          const rectCenter = {
            x: shape.x + (shape.width ?? shape.radiusX) / 2,
            y: shape.y + (shape.height ?? shape.radiusY) / 2,
          };
          if (transform.mirrorX) {
            rectCenter.x = origin.x - (rectCenter.x - origin.x);
            shape.x = rectCenter.x - (shape.width ?? shape.radiusX) / 2;
          }
          if (transform.mirrorY) {
            rectCenter.y = origin.y - (rectCenter.y - origin.y);
            shape.y = rectCenter.y - (shape.height ?? shape.radiusY) / 2;
          }
        } else if (shape.type === 'polygon') {
          if (transform.mirrorX) {
            for (let i = 0; i < shape.points.length; i += 2) {
              shape.points[i] = origin.x - (shape.points[i] - origin.x);
            }
          }
          if (transform.mirrorY) {
            for (let i = 1; i < shape.points.length; i += 2) {
              shape.points[i] = origin.y - (shape.points[i] - origin.y);
            }
          }
        }
      }
    }

    if (preview) {
      const doc = preview.document;
      if (data.elevation) doc.elevation = data.elevation;
      if (data.shapes) {
        for (let i = 0; i < data.shapes.length; i++) {
          const docShape = doc.shapes[i];
          const dataShape = data.shapes[i];

          if (docShape.type !== dataShape.type) {
            // We've performed a type change (rectangle -> polygon)
            doc.shapes[i] = new foundry.data.PolygonShapeData(dataShape);
          } else if (docShape.type === 'polygon') {
            docShape.points = dataShape.points;
          } else {
            docShape.x = dataShape.x;
            docShape.y = dataShape.y;

            if (docShape.type === 'rectangle') {
              docShape.width = dataShape.width;
              docShape.height = dataShape.height;
            } else if (docShape.type === 'ellipse') {
              docShape.radiusX = dataShape.radiusX;
              docShape.radiusY = dataShape.radiusY;
            }
          }
        }
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
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
    }

    if (transform.mirrorX) {
      data.x = origin.x - (data.x - origin.x);
    }
    if (transform.mirrorY) {
      data.y = origin.y - (data.y - origin.y);
    }

    if (preview) {
      preview.document.x = data.x;
      preview.document.y = data.y;
      if (data.elevation) preview.document.elevation = data.elevation;
    }
  }

  static transformAmbientSound(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      if (!transform.gridScale) {
        data.radius *= scale;
      }

      if (data.elevation != null) {
        data.elevation *= scale;
        data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    // 3D Support
    if (transform.z != null) {
      data.elevation = (data.elevation ?? 0) + transform.z;
    }

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
    }

    if (transform.mirrorX) {
      data.x = origin.x - (data.x - origin.x);
    }
    if (transform.mirrorY) {
      data.y = origin.y - (data.y - origin.y);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.radius = data.radius;
      if (data.elevation) doc.elevation = data.elevation;
    }
  }

  static transformWall(data, origin, transform, preview) {
    const c = foundry.utils.deepClone(data.c);

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

    if (transform.mirrorX) {
      c[0] = origin.x - (c[0] - origin.x);
      c[2] = origin.x - (c[2] - origin.x);
    }
    if (transform.mirrorY) {
      c[1] = origin.y - (c[1] - origin.y);
      c[3] = origin.y - (c[3] - origin.y);
    }

    data.c = c;
    if (preview) preview.document.c = c;
  }

  static transformMeasuredTemplate(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      if (!transform.gridScale) {
        data.distance *= scale;
        if (data.width) data.width *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
      data.direction += Math.toDegrees(dr);
    }

    if (transform.mirrorX || transform.mirrorY) {
      if (transform.mirrorX) {
        data.x = origin.x - (data.x - origin.x);
        if (data.direction > 180) data.direction = 360 - (data.direction - 180);
        else data.direction = 180 - data.direction;
      }
      if (transform.mirrorY) {
        data.y = origin.y - (data.y - origin.y);
        data.direction = 180 - (data.direction - 180);
      }
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.direction = data.direction;
      doc.distance = data.distance;
      doc.width = data.width;
      if (data.elevation) doc.elevation = data.elevation;
    }
  }

  static transformAmbientLight(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      if (!transform.gridScale) {
        data.config.dim *= scale;
        data.config.bright *= scale;
      }

      if (data.elevation != null) {
        data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    // 3D Support
    if (transform.z != null) {
      data.elevation = (data.elevation ?? 0) + transform.z;
    }

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      [data.x, data.y] = this.rotatePoint(origin.x, origin.y, data.x, data.y, dr);
      data.rotation += Math.toDegrees(dr);
    }

    if (transform.mirrorX || transform.mirrorY) {
      if (transform.mirrorX) {
        data.x = origin.x - (data.x - origin.x);
        data.rotation = 180 - (data.rotation - 180);
      }
      if (transform.mirrorY) {
        data.y = origin.y - (data.y - origin.y);
        if (data.rotation > 180) data.rotation = 360 - (data.rotation - 180);
        else data.rotation = 180 - data.rotation;
      }
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.rotation = data.rotation;
      doc.config.dim = data.config.dim;
      doc.config.bright = data.config.bright;
      if (data.elevation) doc.elevation = data.elevation;
    }
  }

  static transformTile(data, origin, transform, preview) {
    // 3D support
    const depth = data.flags?.['levels-3d-preview']?.depth;

    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.width *= scale;
      data.height *= scale;

      // 3D Support
      if (depth != null && depth != '') data.flags['levels-3d-preview'].depth *= scale;
      if (data.elevation != null) {
        data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + data.width / 2, y: data.y + data.height / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - data.width / 2;
      data.y = rectCenter.y - data.height / 2;
      data.rotation += Math.toDegrees(dr);
    }

    if (transform.mirrorX || transform.mirrorY) {
      let rectCenter = { x: data.x + data.width / 2, y: data.y + data.height / 2 };
      if (transform.mirrorX) {
        rectCenter.x = origin.x - (rectCenter.x - origin.x);
        data.texture.scaleX *= -1;
        data.x = rectCenter.x - data.width / 2;
      }
      if (transform.mirrorY) {
        rectCenter.y = origin.y - (rectCenter.y - origin.y);
        data.texture.scaleY *= -1;
        data.y = rectCenter.y - data.height / 2;
      }
      data.rotation = 180 - (data.rotation - 180);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.width = data.width;
      doc.height = data.height;
      doc.rotation = data.rotation;
      doc.texture.scaleX = data.texture.scaleX;
      doc.texture.scaleY = data.texture.scaleY;
      if (data.elevation) doc.elevation = data.elevation;
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
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = { x: data.x + data.shape.width / 2, y: data.y + data.shape.height / 2 };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - data.shape.width / 2;
      data.y = rectCenter.y - data.shape.height / 2;
      data.rotation += Math.toDegrees(dr);
    }

    if (transform.mirrorX || transform.mirrorY) {
      const rectCenter = { x: data.x + data.shape.width / 2, y: data.y + data.shape.height / 2 };

      if (transform.mirrorX) {
        data.x = origin.x - (rectCenter.x - origin.x);
        if (data.shape.points) {
          const points = data.shape.points;
          for (let i = 0; i < points.length; i += 2) {
            points[i] = data.shape.width / 2 - (points[i] - data.shape.width / 2);
          }
        }
        data.x = rectCenter.x - data.shape.width / 2;
      }

      if (transform.mirrorY) {
        data.y = origin.y - (rectCenter.y - origin.y);
        if (data.shape.points) {
          const points = data.shape.points;
          for (let i = 1; i < points.length; i += 2) {
            points[i] = data.shape.height / 2 - (points[i] - data.shape.height / 2);
          }
        }
        data.y = rectCenter.y - data.shape.height / 2;
      }

      data.rotation = 180 - (data.rotation - 180);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.shape.width = data.shape.width;
      doc.shape.height = data.shape.height;
      doc.shape.points = data.shape.points;
      doc.rotation = data.rotation;
      if (data.elevation) doc.elevation = data.elevation;
    }
  }

  static transformToken(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      if (!transform.gridScale) {
        data.width *= scale;
        data.height *= scale;
        data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    const grid = canvas.grid;
    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = {
        x: data.x + (data.width * (grid.sizeX ?? grid.w)) / 2,
        y: data.y + (data.height * (grid.sizeY ?? grid.h)) / 2,
      };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - (data.width * (grid.sizeX ?? grid.w)) / 2;
      data.y = rectCenter.y - (data.height * (grid.sizeY ?? grid.h)) / 2;
      data.rotation = (data.rotation + Math.toDegrees(dr)) % 360;
    }

    if (transform.mirrorX || transform.mirrorY) {
      let rectCenter = {
        x: data.x + (data.width * (grid.sizeX ?? grid.w)) / 2,
        y: data.y + (data.height * (grid.sizeY ?? grid.h)) / 2,
      };
      if (transform.mirrorX) {
        rectCenter.x = origin.x - (rectCenter.x - origin.x);
        data.texture.scaleX *= -1;
        data.x = rectCenter.x - (data.width * (grid.sizeX ?? grid.w)) / 2;
      }
      if (transform.mirrorY) {
        rectCenter.y = origin.y - (rectCenter.y - origin.y);
        data.texture.scaleY *= -1;
        data.y = rectCenter.y - (data.height * (grid.sizeY ?? grid.h)) / 2;
      }
      data.rotation = 180 - (data.rotation - 180);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.elevation = data.elevation;
      doc.rotation = data.rotation;
      doc.width = data.width;
      doc.height = data.height;
      doc.texture.scaleX = data.texture.scaleX;
      doc.texture.scaleY = data.texture.scaleY;
      if (data.elevation) doc.elevation = data.elevation;
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
  const controlled = new Set();

  SUPPORTED_PLACEABLES.forEach((documentName) => {
    canvas.getLayerByEmbeddedName(documentName).controlled.forEach((p) => {
      controlled.add(p.document);
      LinkerAPI.getLinkedDocuments(p.document).forEach((d) => controlled.add(d));
    });
  });

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

    let data = document.toCompendium(null, { keepId: true });

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
          w: canvas.grid.sizeX ?? canvas.grid.w, // v12
          h: canvas.grid.sizeY ?? canvas.grid.h, // v12
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
            delete diff.flags;
            updates.push(diff);
          }
        }
        if (updates.length)
          canvas.scene.updateEmbeddedDocuments(documentName, updates, { ignoreLinks: true, animate: false });
      });
    },
    {
      documentName: mainDocumentName,
      previewData: docToData,
      snap: true,
      taPreview: 'ALL',
      center: true,
    }
  );
}
