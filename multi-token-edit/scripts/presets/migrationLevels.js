/*
This is internal code not currently used for the future V11 -> V12 migration
For every document in the collection, we want to migrate "flags.levels.rangeBottom" to the new core "elevation" property.
*/

const regionSourceCodeMapping = {
    2: `CONFIG.Levels.handlers.RegionHandler.stair(region,event);\n//Check the wiki page for more region options https://wiki.theripper93.com/levels#regions`,
    3: `CONFIG.Levels.handlers.RegionHandler.elevator(region,event,elevatorData);`,
    21: `CONFIG.Levels.handlers.RegionHandler.stairDown(region,event);`,
    22: `CONFIG.Levels.handlers.RegionHandler.stairUp(region,event);`,
};

export class LevelsMigration {
    static #getDocumentLevel(documentName, document) {
        if (documentName === 'Wall') {
            const top = parseFloat(document.flags?.['wall-height']?.top) ?? Infinity;
            const bottom = parseFloat(document.flags?.['wall-height']?.bottom) ?? -Infinity;
            return { top, bottom };
        }
        if (documentName === 'Region') {
            return document.elevation;
        }
        const bottom = document.elevation;
        const top = parseFloat(document.flags?.levels?.rangeTop ?? bottom);
        return { top, bottom };
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

    static async migrateData(preset) {
        const containsLevels = this.#getDataByType(preset, 'Wall').find(
            (wall) => wall.flags?.['wall-height']?.top || wall.flags?.['wall-height']?.bottom,
        );
        if (!containsLevels) return false;

        this.#getDataByType(preset, 'Tile').forEach((data) => {
            const collisions = data.flags?.levels?.noCollision === false;
            if (collisions) foundry.utils.setProperty(data, 'flags.levels.blockSightMovement', true);
        });

        // Migrate drawings first
        await this.migrateDrawingsToRegions(preset);

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
                const { bottom, top } = this.#getDocumentLevel(documentName, document);
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
                    name: `${preset.name} - Level (${bottom}|${top})`,
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
            level.name = `${preset.name} - Level (${level.bottom}|${level.top})`;
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

        const includedWallDocuments = ['Wall', 'Light'];
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
                    console.log(document);
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

        preset.metadata ??= {};
        preset.metadata.levels = createdLevels;

        console.log(`Levels Module - Migrated preset [${preset.name}] to Core Foundry Levels`);

        return true;
    }

    static async migrateDrawingsToRegions(preset) {
        const baseRegionData = {
            color: '#fe6c0b',
            elevation: {},
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

            // TODO: how to handle this?
            // Construct full script or leave as dependency on levels?
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
            migratedCount++;
            regionsData.push(regionData);
            toDelete.push(drawing);
        }

        regionsData.forEach((d) => this.#insertDocument(preset, 'Region', d));
        toDelete.forEach((d) => this.#deleteByReference(preset, d));

        console.log('Levels - Migrated ' + migratedCount + ' drawings to regions ');
        return migratedCount;
    }
}
