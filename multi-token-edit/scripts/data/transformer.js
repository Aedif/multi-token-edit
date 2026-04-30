import { MODULE_ID } from '../constants';
import { getDataBounds } from '../presets/utils';
import { Scenescape } from '../scenescape/scenescape';

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
        if (transform.z == null) transform.z = 0;

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

            const originOffsetX = origin.x - origin.x * scale;
            const originOffsetY = origin.y - origin.y * scale;

            for (const shape of data.shapes) {
                if (shape.type === 'polygon') {
                    for (let i = 0; i < shape.points.length; i++) {
                        shape.points[i] = shape.points[i] * scale + (i % 2 === 0 ? originOffsetX : originOffsetY);
                    }
                } else if (shape.type === 'emanation') {
                    shape.base.x = shape.base.x * scale + originOffsetX;
                    shape.base.y = shape.base.y * scale + originOffsetY;
                    shape.radius *= scale;
                    shape.base.width *= scale;
                    shape.base.height *= scale;
                } else {
                    shape.x = shape.x * scale + originOffsetX;
                    shape.y = shape.y * scale + originOffsetY;
                    if (shape.type === 'ellipse') {
                        shape.radiusX *= scale;
                        shape.radiusY *= scale;
                    } else if (shape.type === 'rectangle') {
                        shape.height *= scale;
                        shape.width *= scale;
                    } else if (shape.type === 'line') {
                        shape.length *= scale;
                        shape.width *= scale;
                    } else if (shape.type === 'cone' || shape.type === 'circle' || shape.type === 'ring') {
                        shape.radius *= scale;
                        if (shape.type === 'ring') {
                            shape.innerWidth *= scale;
                            shape.outerWidth *= scale;
                        }
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
                } else if (shape.type === 'emanation') {
                    shape.base.x += transform.x;
                    shape.base.y += transform.y;
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
                    RectangleUtils.rotate(shape, origin, transform);
                } else if (shape.type === 'line') {
                    LineUtils.rotate(shape, origin, transform);
                } else if (shape.type === 'polygon') {
                    const dr = Math.toRadians(transform.rotation % 360);
                    for (let i = 0; i < shape.points.length; i += 2) {
                        [shape.points[i], shape.points[i + 1]] = this.rotatePoint(
                            origin.x,
                            origin.y,
                            shape.points[i],
                            shape.points[i + 1],
                            dr,
                        );
                    }
                } else if (shape.type === 'emanation') {
                    const dr = Math.toRadians(transform.rotation % 360);
                    let base = shape.base;
                    [base.x, base.y] = this.rotatePoint(origin.x, origin.y, base.x, base.y, dr);
                } else {
                    const dr = Math.toRadians(transform.rotation % 360);
                    [shape.x, shape.y] = this.rotatePoint(origin.x, origin.y, shape.x, shape.y, dr);
                    if (shape.type === 'ellipse' || shape.type === 'cone') shape.rotation += Math.toDegrees(dr);
                }
            }
        }

        if (transform.mirrorX || transform.mirrorY) {
            for (const shape of data.shapes) {
                if (shape.type === 'rectangle') {
                    RectangleUtils.mirror(shape, origin, transform);
                } else if (shape.type === 'circle' || shape.type === 'ring' || shape.type === 'ellipse') {
                    if (transform.mirrorX) shape.x = origin.x - (shape.x - origin.x);
                    if (transform.mirrorY) shape.y = origin.y - (shape.y - origin.y);

                    if (shape.type === 'ellipse') {
                        if (transform.mirrorX) shape.rotation = -shape.rotation;
                        if (transform.mirrorY) shape.rotation = 180 - (shape.rotation - 180);
                    }
                } else if (shape.type === 'emanation') {
                    const base = shape.base;
                    if (transform.mirrorX) base.x = origin.x - (base.x - origin.x);
                    if (transform.mirrorY) base.y = origin.y - (base.y - origin.y);
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
                } else if (shape.type === 'cone' || shape.type === 'line') {
                    if (transform.mirrorX) {
                        shape.x = origin.x - (shape.x - origin.x);
                        if (shape.rotation > 180) shape.rotation = 360 - (shape.rotation - 180);
                        else shape.rotation = 180 - shape.rotation;
                    }
                    if (transform.mirrorY) {
                        shape.y = origin.y - (shape.y - origin.y);
                        shape.rotation = 180 - (shape.rotation - 180);
                    }
                }
            }
        }

        if (preview) {
            const doc = preview.document;
            doc.updateSource(data);
        }
    }

    static transformNote(data, origin, transform, preview) {
        if (transform.scale != null) {
            const scale = transform.scale;
            data.x *= scale;
            data.y *= scale;

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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
            const shape = doc.shape;
            shape.x = data.x;
            shape.y = data.y;

            const grid = preview.parent?.grid ?? foundry.documents.BaseScene.defaultGrid;
            const distancePixels = grid.size / grid.distance;
            shape.radius = data.radius * distancePixels;
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

            c[0] += origin.x - origin.x * scale;
            c[1] += origin.y - origin.y * scale;
            c[2] += origin.x - origin.x * scale;
            c[3] += origin.y - origin.y * scale;
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

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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
            if (!transform.gridScale && data.config) {
                data.config.dim *= scale;
                data.config.bright *= scale;
            }

            if (this._3dActive && data.elevation != null) {
                data.elevation *= scale;
            }

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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
            const shape = doc.shape;
            shape.x = data.x;
            shape.y = data.y;
            doc.rotation = data.rotation;
            if (data.config) {
                doc.config.dim = data.config.dim;
                doc.config.bright = data.config.bright;
                shape.radius = Math.max(preview.dimRadius, preview.brightRadius);
            }
            if (data.elevation) doc.elevation = data.elevation;

            if (preview._l3dPreview) {
                const pos = game.Levels3DPreview.ruler.constructor.posCanvasTo3d({
                    x: shape.x,
                    y: shape.y,
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

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;

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
            const rectangle = { ...data, anchorX: data.texture.anchorX, anchorY: data.texture.anchorY };
            RectangleUtils.rotate(rectangle, origin, transform);
            data.x = rectangle.x;
            data.y = rectangle.y;
            data.rotation = rectangle.rotation;
        }

        if (transform.mirrorX || transform.mirrorY) {
            if (transform.mirrorX) data.texture.scaleX *= -1;
            if (transform.mirrorY) data.texture.scaleY *= -1;

            const rectangle = {
                ...data,
                anchorX: data.texture.anchorX,
                anchorY: data.texture.anchorY,
            };
            RectangleUtils.mirror(rectangle, origin, transform);
            data.x = rectangle.x;
            data.y = rectangle.y;
            data.texture.anchorX = rectangle.anchorX;
            data.texture.anchorY = rectangle.anchorY;
            data.rotation = rectangle.rotation;
        }

        if (preview) {
            const doc = preview.document;
            const shape = doc.shape;
            shape.x = data.x;
            shape.y = data.y;
            shape.width = data.width;
            shape.height = data.height;
            shape.rotation = data.rotation;
            doc.texture.scaleX = data.texture.scaleX;
            doc.texture.scaleY = data.texture.scaleY;
            if (data.elevation != null) doc.elevation = data.elevation;

            if (preview._l3dPreview && preview._l3dPreview.mesh) {
                const pos = game.Levels3DPreview.ruler.constructor.posCanvasTo3d({
                    x: shape.x + shape.width / 2,
                    y: shape.y + shape.height / 2,
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

    static #getTileCenterPoint(data) {
        const a = Math.toRadians(data.rotation);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const dx = (0.5 - data.texture.anchorX) * data.width;
        const dy = (0.5 - data.texture.anchorY) * data.height;
        return { x: data.x + (cos * dx - sin * dy), y: data.y + (sin * dx + cos * dy) };
    }

    static #getTileAnchorPoint(center, data) {
        const a = Math.toRadians(data.rotation);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const dx = (0.5 - data.texture.anchorX) * data.width;
        const dy = (0.5 - data.texture.anchorY) * data.height;

        return [center.x - (cos * dx - sin * dy), center.y - (sin * dx + cos * dy)];
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

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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
            const bounds = getDataBounds('Drawing', data);
            const rectCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };

            if (transform.mirrorX) {
                data.x = origin.x - (rectCenter.x - origin.x);
                if (data.shape.points) {
                    const points = data.shape.points;
                    for (let i = 0; i < points.length; i += 2) {
                        points[i] = bounds.width / 2 - (points[i] - bounds.width / 2);
                    }
                }
                data.x = rectCenter.x - bounds.width / 2;
            }

            if (transform.mirrorY) {
                data.y = origin.y - (rectCenter.y - origin.y);
                if (data.shape.points) {
                    const points = data.shape.points;
                    for (let i = 1; i < points.length; i += 2) {
                        points[i] = bounds.height / 2 - (points[i] - bounds.height / 2);
                    }
                }
                data.y = rectCenter.y - bounds.height / 2;
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
            if (data.elevation != null) doc.elevation = data.elevation;
        }
    }

    static transformToken(data, origin, transform, preview) {
        if (Scenescape.active) {
            if (data.flags?.[MODULE_ID]?.width != null) data.width = data.flags[MODULE_ID].width;
            if (data.flags?.[MODULE_ID]?.height != null) data.height = data.flags[MODULE_ID].height;
        }

        if (transform.scale != null) {
            const scale = transform.scale;
            data.x *= scale;
            data.y *= scale;
            if (!transform.gridScale) {
                data.width *= scale;
                data.height *= scale;
                if (this._3dActive) data.elevation *= scale;
            }

            data.x += origin.x - origin.x * scale;
            data.y += origin.y - origin.y * scale;
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

        if (Scenescape.active) {
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
            if (Scenescape.active) {
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

                if (transform.scale != null) {
                    mesh.scale.multiplyScalar(transform.scale);
                }
                if (transform.rotation != null) {
                    mesh.rotation.y += game.Levels3DPreview.THREE.MathUtils.degToRad(-transform.rotation);
                }
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

class RectangleUtils {
    static mirror(rectangle, origin, transform) {
        let center = this.centerPoint(rectangle);
        if (transform.mirrorX) {
            center.x = origin.x - (center.x - origin.x);
            rectangle.rotation = -rectangle.rotation;
            rectangle.anchorX = 1 - rectangle.anchorX;
        }
        if (transform.mirrorY) {
            center.y = origin.y - (center.y - origin.y);
            rectangle.rotation = 180 - (rectangle.rotation - 180);
            rectangle.anchorY = 1 - rectangle.anchorY;
        }
        [rectangle.x, rectangle.y] = this.anchorPoint(center, rectangle);
    }

    static rotate(rectangle, origin, transform) {
        const dr = Math.toRadians(transform.rotation % 360);
        let rectCenter = this.centerPoint(rectangle);
        [rectCenter.x, rectCenter.y] = DataTransformer.rotatePoint(origin.x, origin.y, rectCenter.x, rectCenter.y, dr);

        rectangle.rotation += Math.toDegrees(dr);
        [rectangle.x, rectangle.y] = this.anchorPoint(rectCenter, rectangle);
    }

    static centerPoint(rectangle) {
        const a = Math.toRadians(rectangle.rotation);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const dx = (0.5 - rectangle.anchorX) * rectangle.width;
        const dy = (0.5 - rectangle.anchorY) * rectangle.height;
        return { x: rectangle.x + (cos * dx - sin * dy), y: rectangle.y + (sin * dx + cos * dy) };
    }

    static anchorPoint(center, rectangle) {
        const a = Math.toRadians(rectangle.rotation);
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const dx = (0.5 - rectangle.anchorX) * rectangle.width;
        const dy = (0.5 - rectangle.anchorY) * rectangle.height;

        return [center.x - (cos * dx - sin * dy), center.y - (sin * dx + cos * dy)];
    }
}

class LineUtils {
    static rotate(line, origin, transform) {
        const dr = Math.toRadians(transform.rotation % 360);
        let center = this.centerPoint(line);
        [center.x, center.y] = DataTransformer.rotatePoint(origin.x, origin.y, center.x, center.y, dr);

        line.rotation += Math.toDegrees(dr);
        [line.x, line.y] = this.anchorPoint(center, line);
    }

    static centerPoint(line) {
        const a = Math.toRadians(line.rotation);
        const r = line.length / 2;
        return { x: line.x + Math.cos(a) * r, y: line.y + Math.sin(a) * r };
    }

    static anchorPoint(center, line) {
        const a = Math.toRadians(line.rotation);
        const r = line.length / 2;
        return [center.x - Math.cos(a) * r, center.y - Math.sin(a) * r];
    }
}

// TODO
class ConeUtils {
    static centerPoint(cone) {
        if (cone.angle === 360) return { x: cone.x, y: cone.y };
        return new foundry.data.BaseShapeData.TYPES.cone(cone).center;
    }

    static anchorPoint(center, cone) {
        if (cone.angle === 360) return { x: center.x, y: center.y };
    }
}
