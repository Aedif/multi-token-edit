import { MODULE_ID } from '../constants';
import { SceneScape } from '../scenescape/scenescape';

export class DataTransformer {
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

    this._3dActive = game.Levels3DPreview?._active;

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

  static applyToMap(docToData, origin, transform) {
    docToData.forEach((dataArr, documentName) => {
      dataArr.forEach((data) => DataTransformer.apply(documentName, data, origin, transform));
    });
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

      if (this._3dActive && data.elevation != null) {
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
    if (!data.c) return;

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

      if (this._3dActive && data.elevation != null) {
        data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

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

      if (preview._l3dPreview) {
        const pos = game.Levels3DPreview.ruler.constructor.posCanvasTo3d({
          x: doc.x,
          y: doc.y,
          z: doc.elevation,
        });
        const mesh = preview._l3dPreview.mesh;
        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
        mesh.position.z = pos.z;
      }
    }
  }

  static transformTile(data, origin, transform, preview) {
    if (transform.scale != null) {
      const scale = transform.scale;
      data.x *= scale;
      data.y *= scale;
      data.width *= scale;
      data.height *= scale;

      // 3D Support
      if (this._3dActive) {
        const depth = data.flags?.['levels-3d-preview']?.depth;
        if (depth != null && depth != '') data.flags['levels-3d-preview'].depth = depth * scale;
        if (data.elevation != null) {
          data.elevation *= scale;
        }
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
      if (data.elevation != null) doc.elevation = data.elevation;

      if (preview._l3dPreview && preview._l3dPreview.mesh) {
        const pos = game.Levels3DPreview.ruler.constructor.posCanvasTo3d({
          x: doc.x + doc.width / 2,
          y: doc.y + doc.height / 2,
          z: doc.elevation,
        });
        const mesh = preview._l3dPreview.mesh;
        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
        mesh.position.z = pos.z;

        if (transform.scale != null) {
          mesh.scale.multiplyScalar(transform.scale);
        }
        if (transform.rotation != null) {
          mesh.rotation.y += game.Levels3DPreview.THREE.MathUtils.degToRad(-transform.rotation);
        }
      }
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
        if (this._3dActive) data.elevation *= scale;
      }
    }

    data.x += transform.x;
    data.y += transform.y;
    if (data.elevation != null) data.elevation += transform.z ?? 0;

    const grid = canvas.grid;
    if (transform.rotation != null) {
      const dr = Math.toRadians(transform.rotation % 360);
      let rectCenter = {
        x: data.x + (data.width * grid.sizeX) / 2,
        y: data.y + (data.height * grid.sizeY) / 2,
      };
      [rectCenter.x, rectCenter.y] = this.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);
      data.x = rectCenter.x - (data.width * grid.sizeX) / 2;
      data.y = rectCenter.y - (data.height * grid.sizeY) / 2;
      data.rotation = (data.rotation + Math.toDegrees(dr)) % 360;
    }

    if (transform.mirrorX || transform.mirrorY) {
      let rectCenter = {
        x: data.x + (data.width * grid.sizeX) / 2,
        y: data.y + (data.height * grid.sizeY) / 2,
      };
      if (transform.mirrorX) {
        rectCenter.x = origin.x - (rectCenter.x - origin.x);
        data.texture.scaleX *= -1;
        data.x = rectCenter.x - (data.width * grid.sizeX) / 2;
      }
      if (transform.mirrorY) {
        rectCenter.y = origin.y - (rectCenter.y - origin.y);
        data.texture.scaleY *= -1;
        data.y = rectCenter.y - (data.height * grid.sizeY) / 2;
      }
      data.rotation = 180 - (data.rotation - 180);
    }

    if (SceneScape.active) {
      if (data.width != null) foundry.utils.setProperty(data, `flags.${MODULE_ID}.width`, data.width);
      if (data.height != null) foundry.utils.setProperty(data, `flags.${MODULE_ID}.height`, data.height);
    }

    if (preview) {
      const doc = preview.document;
      doc.x = data.x;
      doc.y = data.y;
      doc.elevation = data.elevation;
      doc.rotation = data.rotation;
      doc.width = data.width;
      doc.height = data.height;
      if (SceneScape.active) {
        if (data.width != null) foundry.utils.setProperty(doc, `flags.${MODULE_ID}.width`, data.width);
        if (data.height != null) foundry.utils.setProperty(doc, `flags.${MODULE_ID}.height`, data.height);
      }
      doc.texture.scaleX = data.texture.scaleX;
      doc.texture.scaleY = data.texture.scaleY;
      if (data.elevation) doc.elevation = data.elevation;
      if (preview.hasOwnProperty('_l3dPreview')) {
        preview._l3dPreview = game.Levels3DPreview.tokens[preview.id];
        if (!preview._l3dPreview) return;

        const pos = game.Levels3DPreview.ruler.constructor.posCanvasTo3d({
          x: doc.x + (doc.width * canvas.grid.sizeX) / 2,
          y: doc.y + (doc.height * canvas.grid.sizeY) / 2,
          z: doc.elevation,
        });
        const mesh = preview._l3dPreview.mesh;
        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
        mesh.position.z = pos.z;
      }
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
