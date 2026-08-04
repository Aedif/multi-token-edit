import { MODULE_ID } from '../../constants.js';
import { META_INDEX_ID, PresetStorage } from '../collection.js';
import { PRESET_FIELDS } from '../preset.js';

export class Migrator {
    // Used when Presets do not contain an explicit coreVersion field
    static ASSUMED_CORE_VERSION = '13.351';

    static async migrateAllPacks({
        migrateFunc = null,
        transformFunc = null,
        coreMigration = false,
        levelsMigration = false,
    } = {}) {
        if (!migrateFunc && !transformFunc && !coreMigration && !levelsMigration) {
            ui.notifications.warn(
                'Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` or `levelsMigration` flag.',
            );
            return;
        }

        if (transformFunc && (migrateFunc || coreMigration || levelsMigration)) {
            ui.notifications.warn(
                '`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` or `levelsMigration` flag.',
            );
            return;
        }

        for (const pack of game.packs) {
            if (pack.documentName !== 'JournalEntry') continue;
            if (!pack.index.get(META_INDEX_ID)) continue;
            else if (pack.locked) {
                console.warn(`Mass Edit - Unable to migrate a locked compendium. ${pack.metadata.label}`);
                continue;
            }

            try {
                await this.migratePack({ pack, migrateFunc, transformFunc, coreMigration, levelsMigration });
            } catch (e) {
                console.warn(`Mass Edit - Ran into an issue while migrating ${pack.metadata.label}`);
                console.error(e);
            }
        }
    }

    static async migratePack({
        pack = PresetStorage.workingPack,
        migrateFunc = null,
        transformFunc = null,
        coreMigration = false,
        levelsMigration = false,
    } = {}) {
        if (foundry.utils.getType(pack) === 'string') {
            let fPack = game.packs.get(pack) || game.packs.find((p) => p.metadata.label === pack);
            if (!fPack) {
                console.warn('Invalid pack: ' + pack);
                return;
            }
            pack = fPack;
        }

        if (!pack.index.get(META_INDEX_ID)) {
            console.warn(`Mass Edit - This is not a preset compendium. ${pack.metadata.label}`);
            return;
        }

        if (pack.locked) {
            console.warn(`Mass Edit - Unable to migrate a locked compendium. ${pack.metadata.label}`);
            return;
        }

        if (!migrateFunc && !transformFunc && !coreMigration && !levelsMigration) {
            ui.notifications.warn(
                'Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` or `levelsMigration` flag.',
            );
            return;
        }

        if (transformFunc && (migrateFunc || coreMigration || levelsMigration)) {
            ui.notifications.warn(
                '`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` or `levelsMigration` flag.',
            );
            return;
        }

        const updates = [];
        const documents = await pack.getDocuments();

        if (migrateFunc || coreMigration) {
            for (const document of documents) {
                const preset = document.getFlag(MODULE_ID, 'preset');
                if (!preset) continue;

                let update = {};
                const coreVersion = preset.metadata?.coreVersion ?? Migrator.ASSUMED_CORE_VERSION;

                // Migrate Preset data
                if (preset.data?.length) {
                    const documentChange = await this._migrateData(preset.data, preset.documentName, {
                        coreMigration,
                        migrateFunc,
                        coreVersion,
                        fullCoreMigration: preset.data.length > 1 || preset.data[0].hasOwnProperty('x'),
                    });
                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.data`, preset.data);
                    if (documentChange)
                        foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.documentName`, documentChange);
                }

                // Convert attached Preset data
                if (preset.attached?.length) {
                    for (const attached of preset.attached) {
                        const documentChange = await this._migrateData([attached.data], attached.documentName, {
                            coreMigration,
                            migrateFunc,
                            coreVersion,
                            fullCoreMigration: true,
                        });
                        if (documentChange) attached.documentName = documentChange;
                    }
                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.attached`, preset.attached);
                }

                if (coreMigration && foundry.utils.isNewerVersion(game.version, coreVersion)) {
                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.metadata.coreVersion`, game.version);
                }

                if (!foundry.utils.isEmpty(update)) {
                    update._id = document.id;
                    updates.push(update);
                }
            }
        }

        if (transformFunc) {
            for (const document of documents) {
                let preset = document.getFlag(MODULE_ID, 'preset');
                if (!preset) continue;

                const original = preset;
                preset = foundry.utils.deepClone(original);

                await transformFunc(preset, document);

                const diff = foundry.utils.diffObject(original, preset);
                Object.keys(diff).forEach((field) => {
                    if (!PRESET_FIELDS.includes(field)) delete diff[field];
                });

                if (!foundry.utils.isEmpty(diff)) {
                    let update = {};
                    update._id = document.id;

                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset`, diff);
                    updates.push(update);
                }
            }
        }

        if (levelsMigration) {
            const { LevelsMigration } = await import('./migrationLevels.js');

            for (const document of documents) {
                let preset = document.getFlag(MODULE_ID, 'preset');
                if (!preset) continue;

                const original = preset;
                preset = foundry.utils.deepClone(original);

                await LevelsMigration.migrateData(preset);

                const diff = foundry.utils.diffObject(original, preset);
                Object.keys(diff).forEach((field) => {
                    if (!PRESET_FIELDS.includes(field)) delete diff[field];
                });

                if (!foundry.utils.isEmpty(diff)) {
                    let update = {};
                    update._id = document.id;

                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset`, diff);
                    updates.push(update);
                }
            }
        }

        if (updates.length <= 0) {
            ui.notifications.info('Mass Edit - No data to migrate: ' + pack.metadata.label);
        } else {
            await JournalEntry.updateDocuments(updates, { pack: pack.collection });

            setTimeout(() => {
                PresetStorage.reloadIndex(pack).then(() => {
                    ui.notifications.notify(
                        'Mass Edit - Migrated ' + updates.length + ' presets within "' + pack.metadata.label,
                    );
                });
            }, 5000);
        }

        return pack;
    }

    static async migrateScene(scene, options1, options2) {
        if (options1.levelsMigration) {
            const isLevelsScene =
                scene.flags.levels?.sceneLevels?.length ||
                scene.walls.find((wall) => wall.flags?.['wall-height']?.top || wall.flags?.['wall-height']?.bottom);
            if (!isLevelsScene) {
                ui.notifications.warn(`Scene "${scene.name}" does not contain levels.`);
                return;
            }
            const is3DScene =
                scene.flags['levels-3d-preview']?.enablePlayers ||
                scene.flags['levels-3d-preview']?.auto3d ||
                scene.flags['levels-3d-preview']?.object3dSight;
            if (is3DScene) {
                ui.notifications.warn(`Scene "${scene.name}" is a 3D scene, Levels migration is not applicable.`);
                return;
            }
        }

        let allDocumentData = [];
        for (const collection of Object.values(scene.collections)) {
            const documentName = collection.documentClass.documentName;
            if (documentName === 'Level') continue;

            const documents = collection.contents;
            for (const document of documents) {
                allDocumentData.push({ documentName, data: document.toObject() });
            }
        }

        if (!allDocumentData.length) return;

        const tempPreset = allDocumentData.pop();
        tempPreset.name = scene.name;
        tempPreset.data = [tempPreset.data];
        tempPreset.attached = allDocumentData;

        await this._migratePreset(tempPreset, options1, options2);

        if (tempPreset.metadata?.levels?.length) {
            const firstLevel = scene.firstLevel;

            const createdLevels = await scene.createEmbeddedDocuments(
                'Level',
                foundry.utils.deepClone(tempPreset.metadata.levels).map((l) => {
                    l._id = l.id;
                    return l;
                }),
                {
                    keepId: true,
                },
            );

            const backgroundElevation = scene.flags.levels?.backgroundElevation;
            const foundBackgroundLevel = createdLevels.find((x) => x.elevation.bottom === backgroundElevation);
            const backgroundLevel =
                foundBackgroundLevel ??
                (Number.isFinite(backgroundElevation)
                    ? createdLevels[0]
                    : createdLevels.find((x) => x.elevation.bottom >= 0)) ??
                createdLevels[0];

            await backgroundLevel.update({
                background: {
                    src: firstLevel.background.src,
                },
            });

            await firstLevel.delete();
        }

        allDocumentData = [...tempPreset.attached, { documentName: tempPreset.documentName, data: tempPreset.data[0] }];

        for (const collection of Object.values(scene.collections)) {
            const documentName = collection.documentName;
            if (documentName === 'Level') continue;

            const presentInPreset = new Set(
                allDocumentData.filter((d) => d.documentName === documentName).map((d) => d.data.id ?? d.data._id),
            );

            const toDelete = [];

            const documents = collection.contents;
            for (const document of documents) {
                if (!presentInPreset.has(document.id)) toDelete.push(document.id);
            }

            if (toDelete.length) await scene.deleteEmbeddedDocuments(documentName, toDelete, { linkerDelete: true });
        }

        const documentUpdates = {};
        for (const { documentName, data } of allDocumentData) {
            documentUpdates[documentName] ??= [];
            documentUpdates[documentName].push(data);
        }

        for (const [documentName, updates] of Object.entries(documentUpdates)) {
            const collection = scene.getEmbeddedCollection(documentName);
            const toUpdate = [];
            const toCreate = [];

            for (let update of updates) {
                if (collection.has(update.id ?? update._id)) {
                    const original = collection.get(update.id ?? update._id).toObject();
                    update = foundry.utils.diffObject(original, update, { bidirectional: true });
                    if (!foundry.utils.isEmpty(update)) {
                        update._id = original._id;
                        toUpdate.push(update);
                    }
                } else {
                    toCreate.push(update);
                }
            }

            if (toUpdate.length) scene.updateEmbeddedDocuments(documentName, toUpdate, { ignoreLinks: true });
            if (toCreate.length) scene.createEmbeddedDocuments(documentName, toCreate);
        }

        if (options1.levelsMigration) await scene.update({ 'flags.levels.sceneLevels': _del });
    }

    /**
     * Functions used for testing migration of individual presets
     * @param {Preset} preset
     * @param {object} options
     */
    static async _migratePreset(
        preset,
        { migrateFunc = null, transformFunc = null, coreMigration = false, levelsMigration = false } = {},
        options = {},
    ) {
        if (migrateFunc || coreMigration) {
            const coreVersion = preset.metadata?.coreVersion ?? Migrator.ASSUMED_CORE_VERSION;

            // Migrate Preset data
            if (preset.data?.length) {
                const documentChange = await this._migrateData(preset.data, preset.documentName, {
                    coreMigration,
                    migrateFunc,
                    coreVersion,
                    fullCoreMigration: preset.data.length > 1 || preset.data[0].hasOwnProperty('x'),
                });

                if (documentChange) preset.documentName = documentChange;
            }

            if (preset.attached?.length) {
                for (const attached of preset.attached) {
                    const documentChange = await this._migrateData([attached.data], attached.documentName, {
                        coreMigration,
                        migrateFunc,
                        coreVersion,
                        fullCoreMigration: true,
                    });
                    if (documentChange) attached.documentName = documentChange;
                }
            }

            if (coreMigration && foundry.utils.isNewerVersion(game.version, coreVersion)) {
                preset.metadata ??= {};
                preset.metadata.coreVersion = game.version;
            }
        }

        if (transformFunc) await transformFunc(preset, preset.document);

        if (levelsMigration) {
            const { LevelsMigration } = await import('./migrationLevels.js');
            await LevelsMigration.migrateData(preset, {
                generateSurfaceRegions: true,
                generateRoofLevel: true,
                ...options,
            });
        }
    }

    static async _migrateData(
        dataArr,
        documentName,
        { coreMigration = true, migrateFunc, coreVersion, fullCoreMigration = true } = {},
    ) {
        let documentChange;
        for (const data of dataArr) {
            if (coreMigration) {
                documentChange = await this._coreMigrate(documentName, data, coreVersion, fullCoreMigration);
            }
            if (migrateFunc) migrateFunc(data, documentName); // Custom migration function

            // Token Attacher data traversal
            const prototypeAttached = data.flags?.['token-attacher']?.prototypeAttached;
            if (prototypeAttached)
                await this._migratePrototypeAttached(prototypeAttached, coreMigration, migrateFunc, coreVersion);
        }

        if (documentChange) return documentChange;
    }

    /**
     * Perform core Foundry migration using the `migrateDocumentData` socket.
     * @param {string} documentName
     * @param {object} data
     * @param {string} coreVersion
     * @param {boolean} fullCoreMigration
     * @returns {null|string} documentName is only returned if after migration it has been transformed to another
     */
    static async _coreMigrate(documentName, data, coreVersion, fullCoreMigration) {
        const layerMap = {
            Token: 'tokens',
            Tile: 'tiles',
            Drawing: 'drawings',
            AmbientLight: 'lighting',
            Note: 'notes',
            Region: 'regions',
            AmbientSound: 'sounds',
            MeasuredTemplate: 'templates',
            Wall: 'walls',
        };

        if (layerMap[documentName] && foundry.utils.isNewerVersion(game.version, coreVersion)) {
            const layer = layerMap[documentName];

            // `migrateDocumentData` does not accept embeds
            // Lets submit a minimum viable scene instead which includes the placeable data we want to migrate
            const response = await new Promise((resolve) => {
                game.socket.emit(
                    'migrateDocumentData',
                    'Scene',
                    {
                        name: 'Migrate',
                        _stats: { exportSource: { coreVersion }, coreVersion },
                        [layer]: [data],
                    },
                    resolve,
                );
            });

            const source = response.source;
            if (source) {
                if (source[layer]?.length) {
                    foundry.utils.mergeObject(data, source[layer][0], { insertKeys: fullCoreMigration });
                } else {
                    // If we can't find the data in the expected layer then it has likely been transformed into
                    // another types of placeable. Lets look for it.
                    const sl = Object.values(layerMap).find((l) => source[l]?.length);
                    if (sl) {
                        Object.keys(data).forEach((k) => delete data[k]);
                        foundry.utils.mergeObject(data, source[sl][0]);
                        return Object.keys(layerMap).find((k) => layerMap[k] === sl);
                    }
                }
            }
        } else {
            const response = await new Promise((resolve) => {
                game.socket.emit(
                    'migrateDocumentData',
                    documentName,
                    { ...data, _stats: data._stats ?? { exportSource: { coreVersion }, coreVersion } },
                    resolve,
                );
            });
            const source = response.source;
            if (source) {
                Object.keys(data).forEach((k) => delete data[k]);
                foundry.utils.mergeObject(data, source);
            }
        }
    }

    static async _migratePrototypeAttached(prototypeAttached, coreMigration = true, migrateFunc = null, coreVersion) {
        for (const [documentName, attached] of Object.entries(prototypeAttached)) {
            const documentChange = await this._migrateData(attached, documentName, {
                coreMigration,
                migrateFunc,
                coreVersion,
                fullCoreMigration: true,
            });
            if (documentChange) {
                prototypeAttached[documentChange] = prototypeAttached[documentChange]?.concat(attached) ?? attached;
            }
        }
    }
}
