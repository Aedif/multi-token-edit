/*
This is internal code not currently used for the future V11 -> V12 migration
For every document in the collection, we want to migrate "flags.levels.rangeBottom" to the new core "elevation" property.
*/

import { MODULE_ID } from '../../constants.js';
import { tileToRegion } from '../../levelUtils.js';

const regionSourceCodeMapping = {
    2: `CONFIG.Levels.handlers.RegionHandler.stair(region,event);\n//Check the wiki page for more region options https://wiki.theripper93.com/levels#regions`,
    3: `CONFIG.Levels.handlers.RegionHandler.elevator(region,event,elevatorData);`,
    21: `CONFIG.Levels.handlers.RegionHandler.stairDown(region,event);`,
    22: `CONFIG.Levels.handlers.RegionHandler.stairUp(region,event);`,
};

export class LevelsMigration {
    static #getDocumentLevel({ documentName, data }) {
        if (documentName === 'Wall') {
            const top = parseFloat(data.flags?.['wall-height']?.top) ?? Infinity;
            const bottom = parseFloat(data.flags?.['wall-height']?.bottom) ?? -Infinity;
            return { top, bottom };
        }
        if (documentName === 'Region') {
            return data.elevation;
        }
        const bottom = data.elevation;
        const top = parseFloat(data.flags?.levels?.rangeTop ?? bottom);
        return { top, bottom };
    }

    static #setDocumentLevel({ documentName, data }, bottom, top) {
        if (documentName === 'Wall') {
            //if (foundry.utils.getProperty('flags.wall-height.bottom') != null)
            foundry.utils.setProperty(data, 'flags.wall-height.bottom', bottom);
            // if (foundry.utils.getProperty('flags.wall-height.top') != null)
            foundry.utils.setProperty(data, 'flags.wall-height.top', top);
        } else if (documentName === 'Region') {
            if (data.elevation.bottom != null) data.elevation.bottom = bottom;
            if (data.elevation.top != null) data.elevation.top = top;
        } else {
            data.elevation = bottom;
            if (foundry.utils.getProperty(data, 'flags.levels.rangeTop') != null)
                foundry.utils.setProperty(data, 'flags.levels.rangeTop', top);
        }
    }

    static #insertDocument(preset, documentName, data) {
        if (preset.documentName === documentName) {
            preset.data.push(data);
        } else {
            if (!preset.attached) preset.attached = [];
            preset.attached.push({ documentName, data });
        }
    }

    static #getDataByType(preset, documentName) {
        const allData = [];
        if (preset.documentName === documentName) {
            preset.data.forEach((d) => {
                allData.push(d);
            });
        }
        preset.attached?.forEach((att) => {
            if (att.documentName === documentName) allData.push(att.data);
        });
        return allData;
    }

    static #deleteByReference(preset, toDelete) {
        preset.data = preset.data.filter((d) => d !== toDelete);
        if (preset.attached) preset.attached = preset.attached.filter((att) => att.data !== toDelete);

        // All core preset data has been removed
        // Need to change type to one of the attached
        if (!preset.data.length) {
            if (!preset.attached?.length) throw Error('Data removal resulted in an empty Preset.');

            const newCoreDocument = preset.attached.find((att) => att.documentName === 'Tile') ?? preset.attached[0];
            preset.documentName = newCoreDocument.documentName;
            preset.data = [newCoreDocument.data];
            preset.attached = preset.attached.filter((att) => att !== newCoreDocument);
        }
    }

    // TODO, generate a trackingobject of the surface defining tiles for the region, or create the surfaces here?
    static #analyze(preset, { log = true } = {}) {
        // Utility functions
        const keySort = function (a, b) {
            const [a1, a2] = a.split('|').map(Number);
            const [b1, b2] = b.split('|').map(Number);
            return a1 - b1 || a2 - b2;
        };

        const countDocuments = function (arr) {
            const counts = {};
            arr.forEach((document) => {
                counts[document.documentName] ??= 0;
                counts[document.documentName] += 1;
            });
            return counts;
        };

        const allDocuments = [];
        [
            'Token',
            'MeasuredTemplate',
            'Tile',
            'Drawing',
            'Wall',
            'AmbientLight',
            'AmbientSound',
            'Note',
            'Region',
        ].forEach((documentName) => {
            allDocuments.push(
                ...this.#getDataByType(preset, documentName).map((data) => {
                    return { documentName, data };
                }),
            );
        });

        // ===============================================
        // Find all placeable defined level ranges
        const levelRanges = {};
        const orphanedDocuments = [];
        const documentsWithElevation = [];

        allDocuments.forEach((document) => {
            const { bottom, top } = this.#getDocumentLevel(document);
            if (!Number.isFinite(bottom) || !Number.isFinite(top)) {
                orphanedDocuments.push(document);
            } else {
                const key = `${bottom}|${top}`;
                levelRanges[key] ??= [];
                levelRanges[key].push(document);
                documentsWithElevation.push(document);
            }
        });

        if (log) {
            console.log('=== Ranges ===');
            Object.keys(levelRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.log(
                        k.padEnd(10, ' '),
                        String(levelRanges[k].length).padEnd(5, ' '),
                        countDocuments(levelRanges[k]),
                    );
                });
            if (orphanedDocuments.length) {
                console.log('N/A'.padEnd(10, ' '), countDocuments(orphanedDocuments));
            }
        }

        // ===============================================
        // Normalize ranges to 5ft increments
        const normalized = {};
        const remappedRanges = {};

        const snap = (n) => Math.round(n / 5) * 5;

        for (const [key, value] of Object.entries(levelRanges)) {
            const [bottom, top] = key.split('|').map(Number);
            const newKey = `${snap(bottom)}|${snap(top)}`;

            normalized[newKey] ??= [];
            normalized[newKey].push(...levelRanges[key]);

            if (key !== newKey) remappedRanges[key] = newKey;
        }

        if (log) {
            console.log('=== Normalized ===');
            Object.keys(normalized)
                .sort(keySort)
                .forEach((k) => {
                    console.log(
                        k.padEnd(10, ' '),
                        String(normalized[k].length).padEnd(5, ' '),
                        countDocuments(normalized[k]),
                    );
                });

            console.log('=== Remapped Ranges ===');
            Object.keys(remappedRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.log(k.padEnd(10, ' '), remappedRanges[k]);
                });
        }

        // ===============================================
        // Split ranges into ones containing level defining and spanning documents
        const levelSpanningRanges = {};
        const levelDefiningRanges = {};
        const levelDefiningDocuments = ['Tile'];

        for (const [key, documents] of Object.entries(normalized)) {
            const containsLevelDefiningDocument = documents.some((document) =>
                levelDefiningDocuments.includes(document.documentName),
            );
            if (containsLevelDefiningDocument) {
                levelDefiningRanges[key] = documents;
            } else {
                levelSpanningRanges[key] = documents;
            }
        }

        if (log) {
            console.log('=== Level Defining Ranges ===');
            Object.keys(levelDefiningRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.log(
                        k.padEnd(10, ' '),
                        String(levelDefiningRanges[k].length).padEnd(5, ' '),
                        countDocuments(levelDefiningRanges[k]),
                    );
                });
            console.log('=== Level Spanning Ranges ===');
            Object.keys(levelSpanningRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.log(
                        k.padEnd(10, ' '),
                        String(levelSpanningRanges[k].length).padEnd(5, ' '),
                        countDocuments(levelSpanningRanges[k]),
                    );
                });
        }

        // ===============================================
        // Attempt to merge ranges that exist only on a very narrow elevation
        let rangesToCreate = new Set();
        for (const key of Object.keys(levelDefiningRanges)) {
            const [bottom, top] = key.split('|').map(Number);

            let isContainedKey;

            const size = top - bottom;
            if (size < 5) {
                for (const searchKey of Object.keys(levelDefiningRanges)) {
                    if (key === searchKey) continue;
                    const [bottom2, top2] = searchKey.split('|').map(Number);

                    if (bottom >= bottom2 && bottom <= top2) {
                        isContainedKey = searchKey;
                        break;
                    }
                }
            }

            rangesToCreate.add(isContainedKey ?? key);
        }

        rangesToCreate = [...rangesToCreate].sort(keySort);

        // ===============================================
        // Look for roof elevators/stairs, if they exist without a level to be created, lets insert that level
        if (rangesToCreate.length) {
            const legacyStairScripts = [
                'CONFIG.Levels.handlers.RegionHandler.stair(',
                'CONFIG.Levels.handlers.RegionHandler.stairDown',
                'CONFIG.Levels.handlers.RegionHandler.stairUp',
                'CONFIG.Levels.handlers.RegionHandler.elevator',
            ];

            const topRange = rangesToCreate[rangesToCreate.length - 1];
            const [topRangeBottom, topRangeTop] = topRange.split('|').map(Number);
            const roofElevatorRegion = documentsWithElevation
                .filter((d) => d.documentName === 'Region')
                .find((region) => {
                    if (region.data.elevation.top !== topRangeTop) return false;

                    const hasChangeLevel = region.data.behaviors?.find((b) => b.type === 'changeLevel');
                    if (hasChangeLevel) return true;

                    const hasLegacyStairs = region.data.behaviors?.filter(
                        (b) =>
                            b.type === 'executeScript' && legacyStairScripts.some((s) => b.system.source.includes(s)),
                    );
                    return hasLegacyStairs;
                });
            if (roofElevatorRegion) {
                const key = `${topRangeTop}|${Infinity}`;
                if (!rangesToCreate.includes(key)) rangesToCreate.push(key);
            }
        }

        if (log) {
            console.log('=== Level Ranges To Create ===');
            rangesToCreate.forEach((k) => {
                console.log(k);
            });
        }

        return { rangesToCreate, remappedRanges, orphanedDocuments, documentsWithElevation };
    }

    static async #generateRegionSurfaces(preset, levels, documents) {
        for (const level of levels) {
            let largestTile;
            let largestArea = 0;
            for (const document of documents) {
                const { documentName, data } = document;

                if (documentName !== 'Tile') continue;
                if (data.elevation !== level.elevation.bottom) continue;

                if (data.width * data.height > largestArea) {
                    largestArea = data.width * data.height;
                    largestTile = document;
                }
            }

            if (largestTile) {
                const region = await tileToRegion(largestTile.data, {
                    create: false,
                    name: 'Surface: ' + level.name,
                });

                region.levels = [level.id];

                region.elevation ??= {};
                region.elevation.bottom = level.elevation.bottom;
                region.elevation.top = level.elevation.top === Infinity ? null : level.elevation.top;
                region.elevation.topInclusive = true;

                region.behaviors ??= [];
                region.behaviors.push({
                    name: 'Define Surface',
                    type: 'defineSurface',
                    system: {
                        culling: false,
                        exposure: false,
                        light: true,
                        move: true,
                        occlusion: true,
                        placement: 'both', // determine if this is a roof level, and set placement to bot only
                        sight: true,
                        sound: true,
                    },
                });

                if (largestTile.data.flags?.[MODULE_ID]?.links) {
                    foundry.utils.setProperty(
                        region,
                        `flags.${MODULE_ID}.links`,
                        foundry.utils.deepClone(largestTile.data.flags[MODULE_ID].links),
                    );
                }

                this.#insertDocument(preset, 'Region', region);

                // Set light/weather restrictions to surface tile
                largestTile.data.restrictions ??= {};
                largestTile.data.restrictions.light = true;
                largestTile.data.restrictions.weather = true;
            }
        }
    }

    static #createLevels(rangesToCreate) {
        const createdLevels = rangesToCreate
            .map((k) => {
                const [bottom, top] = k.split('|').map(Number);

                return {
                    id: foundry.utils.randomID(),
                    name: `Level ( ${bottom} | ${top} )`,
                    elevation: { bottom, top },
                };
            })
            .sort((a, b) => a.elevation.bottom - b.elevation.bottom || a.elevation.top - b.elevation.top);
        createdLevels.forEach((level) => {
            foundry.utils.setProperty(
                level,
                'visibility.levels',
                createdLevels.filter((l) => l.elevation.bottom <= level.elevation.bottom).map((l) => l.id),
            );
        });
        return createdLevels;
    }

    static #remapElevation(documents, remappedRanges) {
        for (const document of documents) {
            const { bottom, top } = this.#getDocumentLevel(document);
            const key = `${bottom}|${top}`;
            if (key in remappedRanges) {
                const [bottom, top] = remappedRanges[key].split('|').map(Number);
                this.#setDocumentLevel(document, bottom, top);
            }
        }
    }

    static async migrateData(
        preset,
        { generateSurfaceRegions = false, generateRoofLevel = false, ripper = false } = {},
    ) {
        // TODO, remove
        if (ripper) return this.migrateDataRipper(preset, { generateSurfaceRegions, generateRoofLevel });

        const containsLevels = this.#getDataByType(preset, 'Wall').find(
            (wall) => wall.flags?.['wall-height']?.top || wall.flags?.['wall-height']?.bottom,
        );
        if (!containsLevels) return false;

        const containsLevelsMetadata = preset.metadata?.levels;
        if (containsLevelsMetadata) return;

        this.#getDataByType(preset, 'Tile').forEach((data) => {
            const collisions = data.flags?.levels?.noCollision === false;
            if (collisions) foundry.utils.setProperty(data, 'flags.levels.blockSightMovement', true);
        });

        // Migrate drawings first
        this.migrateDrawingsToRegions(preset);

        const { rangesToCreate, remappedRanges, documentsWithElevation, orphanedDocuments } = this.#analyze(preset);
        const createdLevels = this.#createLevels(rangesToCreate);

        this.#remapElevation(documentsWithElevation, remappedRanges);

        const backgroundLevel = createdLevels.find((l) => l.elevation.bottom >= 0) ?? createdLevels[0];
        const bgElevation = backgroundLevel.elevation.bottom;

        for (const document of documentsWithElevation) {
            const { documentName, data } = document;
            if (documentName === 'Region') {
                const levelsToAdd = [];
                const elevation = {};
                const behaviorsToRemove = [];
                for (const behavior of data.behaviors) {
                    if (behavior.type !== 'executeScript') continue;
                    const script = behavior.system.source;
                    const top = data.elevation.top;
                    const bottom = data.elevation.bottom;
                    const regionBottomLevels = createdLevels
                        .filter((l) => l.elevation.bottom === bottom)
                        .map((l) => l.id);
                    const regionTopLevels = createdLevels.filter((l) => l.elevation.bottom === top).map((l) => l.id);
                    if (script.includes('CONFIG.Levels.handlers.RegionHandler.stair(')) {
                        levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                    } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.stairDown')) {
                        levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                        const delta = top - bottom; // TODO, why is this necessary??
                        elevation.bottom = bottom + delta;
                        elevation.top = (top + delta) * 0.9;
                    } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.stairUp')) {
                        levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                        elevation.top = top * 0.9; // TODO, why is this necessary?
                    } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.elevator')) {
                        const snap = (n) => Math.round(n / 5) * 5;
                        const elevatorBottoms = script.match(/(-?\d+)(?=,)/g).map((x) => snap(parseFloat(x)));
                        const elevatorLevels = createdLevels
                            .filter((l) => elevatorBottoms.includes(l.elevation.bottom))
                            .map((l) => l.id);
                        levelsToAdd.push(...elevatorLevels);
                    } else {
                        continue;
                    }
                    behaviorsToRemove.push(behavior);
                }
                data.behaviors = data.behaviors.filter((b) => !behaviorsToRemove.includes(b));
                if (levelsToAdd.length) {
                    data.behaviors.push({ type: 'changeLevel' });
                    foundry.utils.mergeObject(data, { elevation });
                }
                const includedLevels = createdLevels
                    .filter(
                        (l) =>
                            Number.between(l.elevation.bottom, data.elevation.bottom, data.elevation.top) ||
                            Number.between(l.elevation.top, data.elevation.bottom, data.elevation.top),
                    )
                    .map((l) => l.id);
                data.levels = levelsToAdd.length ? levelsToAdd : includedLevels;
                continue;
            }
            if (documentName === 'Tile' && data.flags.levels) {
                const { rangeTop, showIfAbove, showAboveRange, isBasement } = data.flags.levels || {};
                const { bottom, top } = this.#getDocumentLevel(document);
                if (isBasement) {
                    data.levels = createdLevels
                        .filter(
                            (l) =>
                                Number.between(bottom, l.elevation.bottom, l.elevation.top) ||
                                Number.between(top, l.elevation.bottom, l.elevation.top),
                        )
                        .map((l) => l.id);
                    //data.levels = level.includedLevels; // TODO: verify if the above logic works ^
                } else if (showIfAbove && showAboveRange) {
                    const elevation = data.elevation;
                    const minElevation = elevation - showAboveRange;
                    data.levels = createdLevels.filter((l) => l.elevation.top > minElevation).map((l) => l.id);
                } else if (!Number.isFinite(rangeTop)) {
                    const elevation = data.elevation;
                    const showAboveRangeBg = elevation - bgElevation;
                    if (showAboveRangeBg < 0) {
                        data.levels = createdLevels.map((l) => l.id);
                    } else {
                        const minElevation = elevation - showAboveRangeBg;
                        data.levels = createdLevels.filter((l) => l.elevation.top > minElevation).map((l) => l.id);
                    }
                } else {
                    data.levels = createdLevels.filter((l) => l.elevation.bottom >= bottom).map((l) => l.id);
                    // data.levels = level.aboveLevels; // TODO confirm if the above logic ^ is a good substitute for this line
                }
                delete data.flags?.levels;
                continue;
            }
            if (documentName === 'Token') {
                data.level =
                    createdLevels.find((l) => Number.between(data.elevation, l.elevation.bottom, l.elevation.top))
                        ?.id ?? createdLevels[0].id;
                continue;
            }

            // TODO continue from her

            if (documentName === 'Wall') {
                const { bottom, top } = this.#getDocumentLevel(document);
                const includeLevels = createdLevels
                    .filter(
                        (l) =>
                            (bottom >= l.elevation.bottom && top <= l.elevation.top) ||
                            (bottom <= l.elevation.bottom && top >= l.elevation.top) ||
                            (top > l.elevation.top && bottom < l.elevation.top) ||
                            (bottom < l.elevation.bottom && top > l.elevation.bottom),
                    )
                    .map((l) => l.id);
                data.levels = includeLevels;
            } else {
                const { bottom, top } = this.#getDocumentLevel(document);
                data.levels = createdLevels.filter((l) => l.elevation.bottom >= bottom).map((l) => l.id);
            }
            // TODO confirm if the above ^ logic is a good approximation of the below code line
            // data.levels = includedWallDocuments.includes(documentName) ? level.includedLevels : level.aboveLevels;

            delete data.flags?.levels;
        }

        const allLevels = createdLevels.map((l) => l.id);
        for (const { documentName, data } of orphanedDocuments) {
            delete data.flags?.levels;
            if (documentName === 'Token') {
                data.level =
                    createdLevels.find((l) => Number.between(data.elevation, l.elevation.bottom, l.elevation.top))
                        ?.id ?? createdLevels[0].id;
            } else data.levels = allLevels;
        }

        // Lets create Region defined surfaces for each level
        if (generateSurfaceRegions) await this.#generateRegionSurfaces(preset, createdLevels, documentsWithElevation);

        // TODO might be a better way to handle this...
        createdLevels.forEach((level) => {
            if (level.elevation.top === Infinity) level.elevation.top = null;
        });

        preset.metadata ??= {};
        preset.metadata.levels = createdLevels;

        console.log(`Levels - Migrated preset [${preset.name}] to Core Foundry Levels`);

        return true;

        //return await this.migrateDataRipper(preset, { generateSurfaceRegions, generateRoofLevel });
    }

    static async migrateDataRipper(
        preset,
        { generateSurfaceRegions = false, roundTopElevation = false, generateRoofLevel = false } = {},
    ) {
        const containsLevels = this.#getDataByType(preset, 'Wall').find(
            (wall) => wall.flags?.['wall-height']?.top || wall.flags?.['wall-height']?.bottom,
        );
        if (!containsLevels) return false;

        const containsLevelsMetadata = preset.metadata?.levels;
        if (containsLevelsMetadata) return;

        this.#getDataByType(preset, 'Tile').forEach((data) => {
            const collisions = data.flags?.levels?.noCollision === false;
            if (collisions) foundry.utils.setProperty(data, 'flags.levels.blockSightMovement', true);
        });

        if (roundTopElevation) this.#roundTopElevation(preset);

        // Migrate drawings first
        this.migrateDrawingsToRegions(preset);

        const inferredLevels = {};
        const orphanedDocuments = [];

        [
            'Token',
            'MeasuredTemplate',
            'Tile',
            'Drawing',
            'Wall',
            'AmbientLight',
            'AmbientSound',
            'Note',
            'Region',
        ].forEach((documentName) => {
            const documents = this.#getDataByType(preset, documentName);
            for (const document of documents) {
                if (documentName === 'Tile' && !document.flags?.levels) continue;
                const { bottom, top } = this.#getDocumentLevel({ documentName, data: document });
                if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
                    orphanedDocuments.push(document);
                    continue;
                }
                const key = `${bottom}${top}`;
                if (inferredLevels[key]) {
                    inferredLevels[key].documents.push({ documentName, data: document });
                    continue;
                }
                inferredLevels[key] = {
                    name: `Level (${bottom}|${top})`,
                    bottom,
                    top,
                    documents: [{ documentName, data: document }],
                };
            }
        });

        const levelsWithContent = [];
        const levelsToMerge = [];
        const minRange = 5 * 1.5; // Hard coded scene.grid.distance to 5
        for (const level of Object.values(inferredLevels)) {
            const levelRange = level.top - level.bottom;
            level.size = levelRange;
            if (levelRange < minRange) {
                levelsToMerge.push(level);
                continue;
            }
            let isContained = false;
            for (const maybeContainingLevel of Object.values(inferredLevels)) {
                const maybeContainingRange = maybeContainingLevel.top - maybeContainingLevel.bottom;
                const touches = level.bottom === maybeContainingLevel.bottom || level.top === maybeContainingLevel.top;
                const isSmaller = levelRange > maybeContainingRange * 0.8 && levelRange < maybeContainingRange;
                if (touches && isSmaller) {
                    levelsToMerge.push(level);
                    isContained = true;
                }
            }
            if (isContained) continue;
            level.name = `Level (${level.bottom}|${level.top})`;
            levelsWithContent.push(level);
        }
        for (const level of levelsToMerge) {
            const containingLevel = levelsWithContent
                .filter((x) => level.bottom >= x.bottom && level.top <= x.top)
                .sort((a, b) => a.size - b.size)?.[0];
            if (!containingLevel) {
                levelsWithContent.push(level);
                continue;
            }
            containingLevel.documents.push(...level.documents);
        }
        levelsWithContent.sort((a, b) => a.bottom - b.bottom);

        // TODO optionally determine if roof exists?
        let roofTiles;
        if (generateRoofLevel) roofTiles = this.#generateRoofLevel(levelsWithContent);

        const levelsToCreate = levelsWithContent;

        const createdLevels = levelsToCreate.map((level) => {
            return {
                id: foundry.utils.randomID(),
                name: level.name,
                elevation: {
                    bottom: level.bottom,
                    top: level.top,
                },
            };
        });
        createdLevels.forEach((level) => {
            foundry.utils.setProperty(
                level,
                'visibility.levels',
                createdLevels.filter((x) => x.elevation.bottom <= level.elevation.bottom).map((x) => x.id),
            );
        });
        createdLevels.sort((a, b) => a.elevation.bottom - b.elevation.bottom);

        const backgroundLevel = createdLevels.find((x) => x.elevation.bottom >= 0) ?? createdLevels[0];
        const bgElevation = backgroundLevel.elevation.bottom;

        for (const level of levelsWithContent) {
            level.id = createdLevels.find((l) => l.name === level.name).id;
        }
        for (const level of levelsWithContent) {
            level.includedLevels = levelsWithContent
                .filter((x) => level.bottom <= x.bottom && level.top >= x.top)
                .map((x) => x.id);
            level.belowLevels = levelsWithContent.filter((x) => level.top >= x.top).map((x) => x.id);
            level.aboveLevels = levelsWithContent.filter((x) => level.bottom <= x.bottom).map((x) => x.id);
            level.allLevels = levelsWithContent.map((x) => x.id);
        }

        const includedWallDocuments = ['Wall', 'AmbientLight'];
        for (const level of levelsWithContent) {
            for (const { documentName, data: document } of level.documents) {
                if (documentName === 'Region') {
                    const levelsToAdd = [];
                    const elevation = {};
                    const behaviorsToRemove = [];
                    for (const behavior of document.behaviors) {
                        if (behavior.type !== 'executeScript') continue;
                        const script = behavior.system.source;
                        const top = document.elevation.top;
                        const bottom = document.elevation.bottom;
                        const regionBottomLevels = createdLevels
                            .filter((x) => x.elevation.bottom === bottom)
                            .map((x) => x.id);
                        const regionTopLevels = createdLevels
                            .filter((x) => x.elevation.bottom === top)
                            .map((x) => x.id);
                        if (script.includes('CONFIG.Levels.handlers.RegionHandler.stair(')) {
                            levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                        } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.stairDown')) {
                            levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                            const delta = top - bottom;
                            elevation.bottom = bottom + delta;
                            elevation.top = (top + delta) * 0.9;
                        } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.stairUp')) {
                            levelsToAdd.push(...regionBottomLevels, ...regionTopLevels);
                            elevation.top = top * 0.9;
                        } else if (script.includes('CONFIG.Levels.handlers.RegionHandler.elevator')) {
                            const elevatorBottoms = script.match(/(-?\d+)(?=,)/g).map((x) => parseFloat(x));
                            const elevatorLevels = createdLevels
                                .filter((x) => elevatorBottoms.includes(x.elevation.bottom))
                                .map((x) => x.id);
                            levelsToAdd.push(...elevatorLevels);
                        } else {
                            continue;
                        }
                        behaviorsToRemove.push(behavior);
                    }
                    document.behaviors = document.behaviors.filter((b) => !behaviorsToRemove.includes(b));
                    if (levelsToAdd.length) {
                        document.behaviors.push({ type: 'changeLevel' });
                        foundry.utils.mergeObject(document, { elevation });
                    }
                    const includedLevels = levelsWithContent
                        .filter(
                            (x) =>
                                Number.between(x.bottom, document.elevation.bottom, document.elevation.top) ||
                                Number.between(x.top, document.elevation.bottom, document.elevation.top),
                        )
                        .map((x) => x.id);
                    document.levels = levelsToAdd.length ? levelsToAdd : includedLevels;
                    continue;
                }
                if (documentName === 'Tile' && document.flags.levels) {
                    const { rangeTop, showIfAbove, showAboveRange, isBasement } = document.flags.levels || {};
                    if (isBasement) {
                        document.levels = level.includedLevels;
                    } else if (showIfAbove && showAboveRange) {
                        const elevation = document.elevation;
                        const minElevation = elevation - showAboveRange;
                        document.levels = levelsWithContent.filter((x) => x.top > minElevation).map((x) => x.id);
                    } else if (!Number.isFinite(rangeTop)) {
                        const elevation = document.elevation;
                        const showAboveRangeBg = elevation - bgElevation;
                        if (showAboveRangeBg < 0) {
                            document.levels = level.allLevels;
                        } else {
                            const minElevation = elevation - showAboveRangeBg;
                            document.levels = levelsWithContent.filter((x) => x.top > minElevation).map((x) => x.id);
                        }
                    } else {
                        document.levels = level.aboveLevels;
                    }
                    delete document.flags?.levels;
                    continue;
                }
                if (documentName === 'Token') {
                    document.levels = level.id;
                    continue;
                }
                delete document.flags?.levels;
                document.levels = includedWallDocuments.includes(documentName)
                    ? level.includedLevels
                    : level.aboveLevels;
            }
        }

        const allLevels = levelsWithContent.map((x) => x.id);
        for (const { documentName, data: document } of orphanedDocuments) {
            delete document.flags?.levels;
            document.levels = allLevels;
        }
        for (const tile of roofTiles) {
            tile.data.levels = allLevels;
        }

        // Lets create Region defined surfaces for each level
        if (generateSurfaceRegions) await this.#generateRegionSurfacesRipper(preset, levelsWithContent);

        // TODO might be a better way to handle this...
        createdLevels.forEach((level) => {
            if (level.elevation.top === Infinity) level.elevation.top = null;
        });

        preset.metadata ??= {};
        preset.metadata.levels = createdLevels;

        console.log(`Levels - Migrated preset [${preset.name}] to Core Foundry Levels`);

        return true;
    }

    static migrateDrawingsToRegions(preset) {
        const baseRegionData = {
            color: '#fe6c0b',
            elevation: { topInclusive: true },
            behaviors: [
                {
                    name: 'Execute Script',
                    type: 'executeScript',
                    system: {
                        events: ['tokenEnter'],
                    },
                },
            ],
        };

        const drawings = this.#getDataByType(preset, 'Drawing');
        const regionsData = [];
        const toDelete = [];
        let migratedCount = 0;
        for (const drawing of drawings) {
            if (!drawing.flags?.levels?.drawingMode || drawing.shape.type !== 'r') continue;
            if (drawing.flags?.levels?.drawingMode == 1) {
                toDelete.push(drawing);
                continue;
            }
            const bottom = drawing.elevation;
            const top = drawing.flags.levels?.rangeTop;
            const elevatorFloors = drawing.flags.levels?.elevatorFloors;
            if (!Number.isNumeric(bottom) || !Number.isNumeric(top)) continue;
            const name = drawing.text || 'Levels Stair ' + parseFloat(bottom) + '-' + parseFloat(top);
            const regionData = foundry.utils.deepClone(baseRegionData);
            regionData.name = name;
            regionData.elevation.bottom = parseFloat(bottom);
            regionData.elevation.top = parseFloat(top) + 1;

            const scriptSource = regionSourceCodeMapping[drawing.flags.levels?.drawingMode.toString()];
            if (!scriptSource) continue;
            regionData.behaviors[0].system.source = scriptSource.replace('elevatorData', `"${elevatorFloors}"`);
            regionData.shapes = [
                {
                    type: 'rectangle',
                    x: drawing.x,
                    y: drawing.y,
                    width: drawing.shape.width,
                    height: drawing.shape.height,
                    rotation: 0,
                    hole: false,
                },
            ];
            if (drawing.flags?.[MODULE_ID]?.links) {
                foundry.utils.setProperty(
                    regionData,
                    `flags.${MODULE_ID}.links`,
                    foundry.utils.deepClone(drawing.flags[MODULE_ID].links),
                );
            }
            migratedCount++;
            regionsData.push(regionData);
            toDelete.push(drawing);
        }

        regionsData.forEach((d) => this.#insertDocument(preset, 'Region', d));
        toDelete.forEach((d) => this.#deleteByReference(preset, d));

        console.log('Levels - Migrated ' + migratedCount + ' drawings to regions ');
        return migratedCount;
    }

    static #roundTopElevation(preset) {
        const round = function ({ documentName, data }) {
            if (documentName === 'Wall') {
                const top = parseFloat(data.flags?.['wall-height']?.top) ?? Infinity;
                if (top % 10 === 9) data.flags['wall-height'].top = top + 1;
                return;
            }
            if (documentName === 'Region') {
                if (data.elevation % 10 === 9) data.elevation += 1;
                return;
            }

            if (documentName === 'Tile') {
                const top = parseFloat(data.flags?.levels?.rangeTop ?? data.elevation);
                if (top % 10 === 9) {
                    if ('elevation' in data) data.elevation += 1;
                    else foundry.utils.setProperty(data, 'flags.levels.rangeTop', top + 1);
                }
            }
        };

        preset.data.forEach((d) => {
            round({ documentName: preset.documentName, data: d });
        });
        preset.attached?.forEach((att) => round(att));
    }

    static #generateRoofLevel(levels) {
        const topLevel = levels[levels.length - 1];
        const roofTiles = [];
        for (const tile of topLevel.documents) {
            if (tile.documentName !== 'Tile') continue;
            const { bottom, top } = this.#getDocumentLevel(tile);
            // TODO perhaps check if Fade occlusion has been set too?
            if (bottom === top && (topLevel.top === top || topLevel.top === top - 1 || topLevel.top === top + 1)) {
                roofTiles.push(tile);
            }
        }
        if (roofTiles.length) {
            roofTiles.forEach((t) => (t.data.elevation = topLevel.top));
            topLevel.documents = topLevel.documents.filter((d) => !roofTiles.includes(d));
            levels.push({
                name: `Level (${topLevel.top})`,
                bottom: topLevel.top,
                top: Infinity,
                documents: roofTiles,
            });
        }
        return roofTiles;
    }

    static async #generateRegionSurfacesRipper(preset, levels) {
        for (const level of levels) {
            let largestTile;
            let largestArea = 0;
            for (const { documentName, data } of level.documents) {
                if (documentName !== 'Tile') continue;
                if (data.width * data.height > largestArea) {
                    const { top, bottom } = this.#getDocumentLevel({ documentName, data });
                    if (bottom === level.bottom) {
                        largestArea = data.width * data.height;
                        largestTile = data;
                    }
                }
            }

            if (largestTile) {
                const region = await tileToRegion(largestTile, {
                    create: false,
                    name: 'Surface: ' + level.name,
                });

                region.levels = [level.id];

                region.elevation ??= {};
                region.elevation.bottom = level.bottom;
                region.elevation.top = level.top === Infinity ? null : level.top;
                region.elevation.topInclusive = true;

                region.behaviors ??= [];
                region.behaviors.push({
                    name: 'Define Surface',
                    type: 'defineSurface',
                    system: {
                        culling: false,
                        exposure: false,
                        light: true,
                        move: true,
                        occlusion: true,
                        placement: 'both', // determine if this is a roof level, and set placement to bot only
                        sight: true,
                        sound: true,
                    },
                });

                if (largestTile.flags?.[MODULE_ID]?.links) {
                    foundry.utils.setProperty(
                        region,
                        `flags.${MODULE_ID}.links`,
                        foundry.utils.deepClone(largestTile.flags[MODULE_ID].links),
                    );
                }

                this.#insertDocument(preset, 'Region', region);
            }
        }
    }
}
