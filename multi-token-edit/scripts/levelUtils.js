import { DataTransformer } from './data/transformer.js';
import { getDataBounds } from './presets/utils.js';

export async function tileToRegion(tile, { create = true, name, notification = false } = {}) {
    if (!tile) return;
    tile = tile.document ?? tile;

    const textureAlphaResolution = 0.25;
    const texture = await foundry.canvas.loadTexture(tile.texture.src);
    const textureAlphaData = foundry.canvas.TextureLoader.getTextureAlphaData(texture, textureAlphaResolution);

    const { data, maxX, maxY, minX, minY } = textureAlphaData;
    const width = maxX - minX;
    const height = maxY - minY;

    const alphaThreshold = 200;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[width * y + x] < alphaThreshold) {
                data[width * y + x] = 0;
            }
        }
    }

    const classified = classifyRings(await alphaToPolygons(data, width, height));

    const shapes = classified.map((p) => {
        const points = [];
        p.ring.forEach(({ x, y }) => points.push(x, y));
        return { type: 'polygon', hole: p.isHole, points };
    });

    const scale = 1 / textureAlphaResolution;
    const scaleX = (scale / (texture.width / tile.width)) * tile.texture.scaleX;
    const scaleY = (scale / (texture.height / tile.height)) * tile.texture.scaleY;

    DataTransformer.apply('Region', { shapes }, { x: 0, y: 0 }, { scaleX, scaleY });
    DataTransformer.apply(
        'Region',
        { shapes },
        { x: 0, y: 0 },
        {
            x: tile.x - tile.width * tile.texture.anchorX * tile.texture.scaleX + textureAlphaData.minX * scaleX,
            y: tile.y - tile.height * tile.texture.anchorY * tile.texture.scaleY + textureAlphaData.minY * scaleY,
        },
    );
    if (tile.rotation !== 0) {
        DataTransformer.apply(
            'Region',
            { shapes },
            {
                x: tile.x,
                y: tile.y,
            },
            { rotation: tile.rotation },
        );
    }

    const region = {
        name: name ?? (tile.name || 'Tile Region'),
        shapes,
    };

    if (create && notification) ui.notifications.info(`Creating region: "${region.name}"`);

    if (create) return await canvas.scene.createEmbeddedDocuments('Region', [region]);
    else return { shapes };
}

async function alphaToPolygons(alphaArray, width, height, threshold = 10, epsilon = 2) {
    // Build 2D binary grid (marching-squares wants a scalar field)
    const grid = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            row.push(alphaArray[y * width + x] > threshold ? 0 : 1);
        }
        grid.push(row);
    }

    // Trace contours at the 0.5 isoline
    const { isoContours } = await import('./libs/marchingsquares/marchingsquares-isolines.min.js');
    const contours = isoContours(grid, 0.5);

    // Simplify each contour ring
    const { default: simplify } = await import('./libs/simplify-js/simplify.js');
    return contours.map((ring) => {
        const pts = ring.map(([x, y]) => ({ x, y }));
        return simplify(pts, epsilon, true); // true = high quality
    });
}

function pointInPolygon(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x,
            yi = ring[i].y;
        const xj = ring[j].x,
            yj = ring[j].y;
        if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function classifyRings(rings) {
    return rings.map((ring, i) => {
        const depth = rings.reduce((count, other, j) => {
            if (i === j) return count;
            return count + (pointInPolygon(ring[0], other) ? 1 : 0);
        }, 0);
        return { ring, isHole: depth % 2 === 1 };
    });
}
