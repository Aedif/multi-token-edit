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

    static #logHeader(text, width = 80) {
        console.info('_'.repeat(width));
        text = ' ' + text.trim() + ' ';
        text = '='.repeat((width - text.length) / 2) + text;
        console.info(text.padEnd(width, '='));
        console.info('‾'.repeat(width));
    }

    static #snap(n, to = 5) {
        return Math.round(n / to) * to;
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

    static #mergeWallRange(ranges, wallRange) {
        const sorted = [...ranges].sort((a, b) => a.bottom - b.bottom);
        const gapsToFill = [];

        for (let i = 0; i < sorted.length - 1; i++) {
            const gapBottom = sorted[i].top;
            const gapTop = sorted[i + 1].bottom;

            // Is there actually a gap between these two ranges?
            if (gapTop <= gapBottom) continue;

            // Does the new range overlap into this gap (not just touch its edge)?
            const overlapsGap = wallRange.bottom <= gapTop && wallRange.top >= gapBottom;

            if (overlapsGap) {
                gapsToFill.push({ bottom: gapBottom, top: gapTop });
            }
        }

        return [...sorted, ...gapsToFill].sort((a, b) => a.bottom - b.bottom);
    }

    static #analyze(preset, { expandFlatLevels = false } = {}) {
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

        if (this.log) {
            this.#logHeader('Step 1: Identifying Ranges');
            Object.keys(levelRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.info(
                        k.padEnd(10, ' '),
                        String(levelRanges[k].length).padEnd(5, ' '),
                        countDocuments(levelRanges[k]),
                    );
                });
            if (orphanedDocuments.length) {
                console.info('N/A'.padEnd(10, ' '), countDocuments(orphanedDocuments));
            }
        }

        // ===============================================
        // Normalize ranges to 5ft increments
        const normalized = {};
        const remappedRanges = {};

        for (const [key, value] of Object.entries(levelRanges)) {
            const [bottom, top] = key.split('|').map(Number);
            const newKey = `${this.#snap(bottom)}|${this.#snap(top)}`;

            normalized[newKey] ??= [];
            normalized[newKey].push(...levelRanges[key]);

            if (key !== newKey) remappedRanges[key] = newKey;
        }

        if (this.log) {
            this.#logHeader('Step 2: Normalizing Ranges');
            Object.keys(normalized)
                .sort(keySort)
                .forEach((k) => {
                    console.info(
                        k.padEnd(10, ' '),
                        String(normalized[k].length).padEnd(5, ' '),
                        countDocuments(normalized[k]),
                    );
                });

            console.info('[Remapped Elevations]');
            Object.keys(remappedRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.info(k.padEnd(10, ' '), remappedRanges[k]);
                });
            if (!Object.keys(remappedRanges).length) console.info('** none **');
        }

        // ===============================================
        // Split ranges into ones containing level defining and spanning
        const levelSpanningRanges = {};

        const tileDefinedRanges = {};
        const wallDefinedRanges = {};

        for (const [key, documents] of Object.entries(normalized)) {
            if (documents.some((d) => d.documentName === 'Tile')) {
                tileDefinedRanges[key] = documents;
            } else if (documents.some((d) => d.documentName === 'Wall')) {
                wallDefinedRanges[key] = documents;
            } else {
                levelSpanningRanges[key] = documents;
            }
        }

        if (this.log) {
            this.#logHeader('Step 3a: Tile Defined Ranges');
            Object.keys(tileDefinedRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.info(
                        k.padEnd(10, ' '),
                        String(tileDefinedRanges[k].length).padEnd(5, ' '),
                        countDocuments(tileDefinedRanges[k]),
                    );
                });
            if (!Object.keys(tileDefinedRanges).length) console.info('** none **');

            this.#logHeader('Step 3b: Wall Defined Ranges');
            Object.keys(wallDefinedRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.info(
                        k.padEnd(10, ' '),
                        String(wallDefinedRanges[k].length).padEnd(5, ' '),
                        countDocuments(wallDefinedRanges[k]),
                    );
                });
            if (!Object.keys(wallDefinedRanges).length) console.info('** none **');

            this.#logHeader('Step 3c: Level Spanning Ranges');
            Object.keys(levelSpanningRanges)
                .sort(keySort)
                .forEach((k) => {
                    console.info(
                        k.padEnd(10, ' '),
                        String(levelSpanningRanges[k].length).padEnd(5, ' '),
                        countDocuments(levelSpanningRanges[k]),
                    );
                });
            if (!Object.keys(levelSpanningRanges).length) console.info('** none **');
        }

        let levelDefiningRanges;
        if (Object.keys(wallDefinedRanges).length) {
            // ===============================================
            // Merge Wall defined ranges into
            let ranges = Object.keys(tileDefinedRanges).map((k) => {
                const [bottom, top] = k.split('|').map(Number);
                return { bottom, top };
            });
            const wallRanges = Object.keys(wallDefinedRanges).map((k) => {
                const [bottom, top] = k.split('|').map(Number);
                return { bottom, top };
            });

            const lowestWallBottom = Math.min(...wallRanges.map((r) => r.bottom));
            const isLowest = ranges.every((r) => lowestWallBottom < r.bottom);
            if (isLowest) {
                ranges.push({ bottom: lowestWallBottom, top: Math.min(...ranges.map((r) => r.bottom)) });
            }

            const highestWallTop = Math.max(...wallRanges.map((r) => r.top));
            const isHighest = ranges.every((r) => highestWallTop > r.top);
            if (isHighest) {
                ranges.push({ bottom: Math.max(...ranges.map((r) => r.top)), top: highestWallTop });
            }

            for (const range of wallRanges) {
                ranges = this.#mergeWallRange(ranges, range);
            }
            levelDefiningRanges = ranges;
        } else {
            levelDefiningRanges = Object.keys(tileDefinedRanges)
                .sort(keySort)
                .map((k) => {
                    const [bottom, top] = k.split('|').map(Number);
                    return { bottom, top };
                });
        }

        // ===============================================
        // Attempt to merge ranges that exist on a very narrow elevation
        let rangesToCreate = new Set();
        for (const { bottom, top } of levelDefiningRanges) {
            let isContainedKey;
            const size = top - bottom;
            if (size < 5) {
                for (const { bottom: bottom2, top: top2 } of levelDefiningRanges) {
                    if (bottom === bottom2 && top === top2) continue;
                    if (bottom >= bottom2 && top <= top2) {
                        isContainedKey = `${bottom2}|${top2}`;
                        break;
                    }
                }
            }

            rangesToCreate.add(isContainedKey ?? `${bottom}|${top}`);
        }

        rangesToCreate = [...rangesToCreate].sort(keySort);

        if (this.log) {
            this.#logHeader('Step 4: Flat Range Merge');
            if (rangesToCreate.length) {
                rangesToCreate.forEach((k) => {
                    console.info(k);
                });
            } else console.info('None');
        }

        // ===============================================
        // Expand single level ranges
        if (expandFlatLevels) {
            const flatRanges = [];
            const otherRanges = [];
            rangesToCreate.forEach((range) => {
                const [bottom, top] = range.split('|').map(Number);
                if (Number.isFinite(bottom) && Number.isFinite(top) && top === bottom) {
                    flatRanges.push({ bottom, top });
                } else {
                    otherRanges.push({ bottom, top });
                }
            });
            if (flatRanges.length) {
                const newRanges = [...otherRanges];
                for (const flatRange of flatRanges) {
                    const elevation = flatRange.bottom;
                    let closestElevation;
                    let closestDistance = Infinity;
                    for (const otherRange of [...flatRanges, ...otherRanges]) {
                        if (otherRange !== flatRange && Math.abs(otherRange.bottom - elevation) < closestDistance) {
                            closestDistance = Math.abs(otherRange.bottom - elevation);
                            closestElevation = otherRange.bottom;
                        }
                    }
                    if (elevation < closestElevation) {
                        newRanges.push({ bottom: elevation, top: closestElevation });
                    } else {
                        newRanges.push({ bottom: elevation, top: elevation });
                    }
                }
                rangesToCreate = newRanges.map((r) => `${r.bottom}|${r.top}`).sort(keySort);
            }
            if (this.log) {
                this.#logHeader('(optional) Flat Range Upward Expand');
                if (rangesToCreate.length) {
                    rangesToCreate.forEach((k) => {
                        console.info(k);
                    });
                } else console.info('** none **');
            }
        }

        // ===============================================
        // Look for roof elevators/stairs, if they exist without a level to be created, lets insert that level
        if (rangesToCreate.length) {
            if (this.log) this.#logHeader('Step 5: Check/Create Infinite Roof Range');
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
                    if (this.#snap(region.data.elevation.top) !== topRangeTop) return false;

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
                if (!rangesToCreate.includes(key)) {
                    rangesToCreate.push(key);
                    if (this.log) console.info('New Range Added: ', key);
                }
            } else if (this.log) console.info('** no elevator found leading to the roof **');
        }

        if (this.log) {
            this.#logHeader('Final Levels');
            if (rangesToCreate.length) {
                rangesToCreate.forEach((k) => {
                    console.info(k);
                });
            } else console.info('** none **');
        }

        return { rangesToCreate, remappedRanges, orphanedDocuments, documentsWithElevation };
    }

    static async #generateRegionSurfaces(preset, levels, documents) {
        if (this.log) this.#logHeader('(optional) Generating Region Surfaces');

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
                let region;

                try {
                    region = await tileToRegion(largestTile.data, {
                        create: false,
                    });
                } catch (e) {}
                if (!region) {
                    console.log('UNABLE TO CREATE REGION FOR LEVEL', level, largestTile);
                    continue;
                }

                region.name = 'Surface: ' + level.name;
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
                if (this.log) console.info('Region Created: ', region.elevation);

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
        const tileTokenResort = {};
        let resort = false;

        for (const document of documents) {
            if (document.documentName == 'Wall') continue;
            const { bottom, top } = this.#getDocumentLevel(document);

            const key = `${bottom}|${top}`;
            let newBottom;
            if (key in remappedRanges) {
                const [bottom, top] = remappedRanges[key].split('|').map(Number);

                newBottom = bottom;
                resort ||= document.documentName === 'Tile' || document.documentName === 'Token';

                this.#setDocumentLevel(document, bottom, top);
            }

            if (document.documentName === 'Tile' || document.documentName === 'Token') {
                tileTokenResort[newBottom ?? bottom] ??= [];
                tileTokenResort[newBottom ?? bottom].push({ document, oldElevation: document.data.elevation });
            }
        }

        if (resort) {
            for (const documents of Object.values(tileTokenResort)) {
                documents.sort(
                    (d1, d2) =>
                        (d1.document.data.oldElevation ?? 0) - (d2.document.oldElevation ?? 0) ||
                        (d1.document.data.sort ?? 0) - (d2.document.data.sort ?? 0),
                );
                documents.forEach((d, i) => {
                    d.document.data.sort = i;
                });
            }
        }
    }

    static async migrateData(
        preset,
        { generateSurfaceRegions = false, logging = false, expandFlatLevels = false } = {},
    ) {
        this.log = logging;

        //
        // Check if this preset requires levels migration
        //
        const containsLevelsMetadata = preset.metadata?.levels;
        if (containsLevelsMetadata) return;

        const containsLevels = this.#getDataByType(preset, 'Wall').find(
            (wall) => wall.flags?.['wall-height']?.top || wall.flags?.['wall-height']?.bottom,
        );

        if (!containsLevels) return false;

        // if (!containsLevels) {
        //     let sampleElevation = null;
        //     const containsVariedElevation = this.#getDataByType(preset, 'Tile').some((tile) => {
        //         if (tile.flags?.levels && sampleElevation != null && sampleElevation != tile.elevation) return true;
        //         sampleElevation = tile.elevation;
        //         return false;
        //     });
        //     console.log({ sampleElevation });
        //     if (!containsVariedElevation) return false;
        // }

        //
        // BEGIN MIGRATION
        //
        this.#getDataByType(preset, 'Tile').forEach((data) => {
            const collisions = data.flags?.levels?.noCollision === false;
            if (collisions) foundry.utils.setProperty(data, 'flags.levels.blockSightMovement', true);
        });

        // Migrate drawings first
        this.migrateDrawingsToRegions(preset);

        const { rangesToCreate, remappedRanges, documentsWithElevation, orphanedDocuments } = this.#analyze(preset, {
            expandFlatLevels,
        });
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
                        const elevatorBottoms = script.match(/(-?\d+)(?=,)/g).map((x) => this.#snap(parseFloat(x)));
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
                // console.log(
                //     data.texture.src,
                //     { rangeTop, showAboveRange, showAboveRange, isBasement },
                //     { bottom, top },
                // );
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
                    // console.log({ elevation, showAboveRangeBg, bgElevation });
                    if (showAboveRangeBg < 0) {
                        data.levels = createdLevels.map((l) => l.id);
                    } else {
                        const minElevation = elevation - showAboveRangeBg;
                        //console.log({ minElevation });
                        data.levels = createdLevels.filter((l) => l.elevation.top >= minElevation).map((l) => l.id);
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
                if (!includeLevels.length) {
                    console.log('Unmatched wall', { documentName, document, bottom, top });
                }
                delete data.flags?.['wall-height'];
            } else {
                const { bottom, top } = this.#getDocumentLevel(document);
                data.levels = createdLevels.filter((l) => l.elevation.bottom >= bottom).map((l) => l.id);
            }

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

        createdLevels.forEach((level) => {
            if (level.elevation.top === Infinity) level.elevation.top = null;
        });

        preset.metadata ??= {};
        preset.metadata.levels = createdLevels;

        console.info(`Levels - Migrated preset [${preset.name}] to Core Foundry Levels`);

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

        console.info('Levels - Migrated ' + migratedCount + ' drawings to regions ');
        return migratedCount;
    }
}
