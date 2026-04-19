import { MODULE_ID, SUPPORTED_PLACEABLES } from '../constants.js';
import { META_INDEX_ID, PresetStorage } from './collection.js';
import { PRESET_FIELDS } from './preset.js';

export class Migrator {
    // Used when Presets do not contain an explicit coreVersion field
    static ASSUMED_CORE_VERSION = '13.351';

    static async migrateAllPacks({ migrateFunc = null, transformFunc = null, coreMigration = false } = {}) {
        if (!migrateFunc && !transformFunc && !coreMigration) {
            ui.notifications.warn('Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` flag.');
            return;
        }

        if (transformFunc && (migrateFunc || coreMigration)) {
            ui.notifications.warn(
                '`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` flag.',
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
                await this.migratePack({ pack, migrateFunc, transformFunc, coreMigration });
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

        if (!migrateFunc && !transformFunc && !coreMigration) {
            ui.notifications.warn('Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` flag.');
            return;
        }

        if (transformFunc && (migrateFunc || coreMigration)) {
            ui.notifications.warn(
                '`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` flag.',
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
                const coreVersion = preset.coreVersion ?? Migrator.ASSUMED_CORE_VERSION;

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
                    foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.coreVersion`, game.version);
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
        if (SUPPORTED_PLACEABLES.includes(documentName) && foundry.utils.isNewerVersion(game.version, coreVersion)) {
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
                        foundry.utils.mergeObject(data, source[sl][0]);
                        return Object.keys(layerMap).find((k) => layer[k] === sl);
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
            if (source) foundry.utils.mergeObject(data, source);
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
