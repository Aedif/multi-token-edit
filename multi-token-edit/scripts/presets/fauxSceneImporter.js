import { MODULE_ID } from '../constants.js';
import { META_INDEX_ID, PresetStorage } from './collection.js';
import { Preset } from './preset.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export function importScenes() {
    new CompendiumSelector().render(true);
}

class CompendiumSelector extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'me-faux-scene-compendium-select',
        tag: 'form',
        window: {
            title: 'Scene Importer',
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 650,
            height: 195,
        },
        form: {
            handler: CompendiumSelector._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        body: {
            template: `modules/${MODULE_ID}/templates/preset/fauxscene/compendium-select.hbs`,
        },
        footer: { template: 'templates/generic/form-footer.hbs' },
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        const sceneCompendiumOptions = {};
        game.packs
            .filter((p) => p.documentName === 'Scene')
            .forEach((p) => {
                sceneCompendiumOptions[p.collection] = p.metadata.label;
            });

        const meCompendiumOptions = {};
        game.packs
            .filter((p) => !p.locked && p.index.get(META_INDEX_ID))
            .forEach((p) => {
                meCompendiumOptions[p.collection] = p.metadata.label;
            });

        const buttons = [{ type: 'submit', icon: 'fa-solid fa-magnifying-glass', label: 'Preview', action: 'save' }];

        return Object.assign(context, { sceneCompendiumOptions, meCompendiumOptions, buttons });
    }

    static async _onSubmit(event, form, formData) {
        const { sceneCollection, meCollection } = formData.object;
        new FauxSceneImporter(sceneCollection, meCollection).render(true);
    }
}

class FauxSceneImporter extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(sceneCollection, meCollection) {
        super();
        this._sceneCompendium = game.packs.get(sceneCollection);
        if (!this._sceneCompendium) throw Error('Invalid scene compendium: ' + sceneCollection);
        if (this._sceneCompendium.documentName !== 'Scene')
            throw Error('Compendium selected is not a Scene compendium: ' + sceneCollection);

        this._meCompendium = game.packs.get(meCollection);
        if (!this._meCompendium) throw Error('Invalid preset compendium: ' + meCollection);
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'me-faux-scene-importer',
        tag: 'form',
        window: {
            title: 'Scene Importer',
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 920,
            height: 600,
        },
        actions: {
            create: FauxSceneImporter._onCreate,
            rename: FauxSceneImporter._onRename,
            delete: FauxSceneImporter._onDelete,
            tag: FauxSceneImporter._onTag,
        },
        form: {
            handler: FauxSceneImporter._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        body: {
            template: `modules/${MODULE_ID}/templates/preset/fauxscene/scene-importer.hbs`,
        },
        footer: { template: 'templates/generic/form-footer.hbs' },
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        const toCreateFauxScenes = [];
        const toRenameFauxScenes = [];
        const existingFauxScenes = [];
        const danglingFauxScenes = [];

        const meIndex = this._meCompendium.index;
        const sceneIndex = this._sceneCompendium.index;

        for (const sceneEntry of sceneIndex) {
            const meEntry = meIndex.get(sceneEntry._id);

            if (!meEntry) toCreateFauxScenes.push({ ...sceneEntry });
            else if (sceneEntry.name !== meEntry.name)
                toRenameFauxScenes.push({
                    _id: sceneEntry._id,
                    name: meEntry.name + ' -> ' + sceneEntry.name,
                    thumb: sceneEntry.thumb,
                    uuid: meEntry.uuid,
                });
            else existingFauxScenes.push(sceneEntry);
        }

        for (const meEntry of meIndex) {
            if (!sceneIndex.get(meEntry._id)) {
                const preset = await PresetStorage.retrieveSingle({ uuid: meEntry.uuid, load: false });
                if (preset?.documentName === 'FauxScene')
                    danglingFauxScenes.push({
                        _id: meEntry._id,
                        name: meEntry.name,
                        thumb: preset.img,
                        uuid: preset.uuid,
                    });
            }
        }

        await foundry.applications.handlebars.getTemplate(
            `modules/${MODULE_ID}/templates/preset/fauxscene/entry-partial.hbs`,
            'me-faux-scene-entry',
        );

        Object.assign(this, { toCreateFauxScenes, toRenameFauxScenes, danglingFauxScenes });

        return Object.assign(context, {
            toCreateFauxScenes,
            toRenameFauxScenes,
            existingFauxScenes,
            danglingFauxScenes,
        });
    }

    /** @override */
    _attachFrameListeners() {
        super._attachFrameListeners();
        this._createContextMenu(this._getCreateOptions, 'ol.create > .entry', {
            hookName: 'getFauxSceneImportCreateOptions',
        });
        this._createContextMenu(this._getRenameOptions, 'ol.rename > .entry', {
            hookName: 'getFauxSceneImportRenameOptions',
        });
        this._createContextMenu(this._getDeleteOptions, 'ol.dangling > .entry', {
            hookName: 'getFauxSceneImportDeleteOptions',
        });
    }

    _getCreateOptions() {
        return [
            {
                name: 'Create',
                icon: '<i class="fa-solid fa-plus"></i>',
                callback: async (item) => {
                    const entry = this.toCreateFauxScenes.find((entry) => entry._id === item.dataset.id);
                    await this._createFauxScenes([entry], false);
                    this.toCreateFauxScenes = this.toCreateFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
            {
                name: 'Remove from list',
                icon: '<i class="fa-solid fa-x"></i>',
                callback: (item) => {
                    this.toCreateFauxScenes = this.toCreateFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
        ];
    }

    _getRenameOptions() {
        return [
            {
                name: 'Rename',
                icon: '<i class="fa-solid fa-pen"></i>',
                callback: async (item) => {
                    const entry = this._meCompendium.index.get(item.dataset.id);
                    await this._renameFauxScenes([entry], false);
                    this.toRenameFauxScenes = this.toRenameFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
            {
                name: 'Remove from list',
                icon: '<i class="fa-solid fa-x"></i>',
                callback: (item) => {
                    this.toRenameFauxScenes = this.toRenameFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
        ];
    }

    _getDeleteOptions() {
        return [
            {
                name: 'Delete',
                icon: '<i class="fa-solid fa-x"></i>',
                callback: async (item) => {
                    const entry = this._meCompendium.index.get(item.dataset.id);
                    await this._deleteFauxScenes([entry], false);
                    this.danglingFauxScenes = this.danglingFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
            {
                name: 'Remove from list',
                icon: '<i class="fa-solid fa-x"></i>',
                callback: (item) => {
                    this.danglingFauxScenes = this.danglingFauxScenes.filter((entry) => entry._id !== item.dataset.id);
                    item.remove();
                },
            },
        ];
    }

    async _createFauxScenes(entries, render = false) {
        const presets = [];
        const meIndex = this._meCompendium.index;
        for (const sceneEntry of entries) {
            if (meIndex.get(sceneEntry._id)) continue;
            const preset = new Preset({
                documentName: 'FauxScene',
                id: sceneEntry._id,
                name: sceneEntry.name,
                img: sceneEntry.thumb,
                data: [{ uuid: sceneEntry.uuid }],
                tags: sceneEntry.tags ?? [],
            });
            presets.push(preset);
        }

        await PresetStorage.createDocuments(presets, this._meCompendium.collection);
        ui.notifications.info(`Imported ${presets.length} scenes.`);
        if (render) this.render(true);
    }

    static async _onCreate() {
        this._createFauxScenes(this.toCreateFauxScenes, true);
    }

    async _renameFauxScenes(entries, render = false) {
        let renamedCount = 0;

        const sceneIndex = this._sceneCompendium.index;
        for (const meEntry of entries) {
            const sceneEntry = sceneIndex.get(meEntry._id);
            if (!sceneEntry) continue;

            const preset = await PresetStorage.retrieveSingle({ uuid: meEntry.uuid, load: true });
            if (preset) {
                preset.update({ name: sceneEntry.name }, true);
                renamedCount++;
            }
        }

        if (renamedCount) await Preset.processBatchUpdates();
        ui.notifications.info(`Updated ${renamedCount} FauxScene names`);
        if (render) this.render(true);
    }

    static async _onRename() {
        this._renameFauxScenes(this.toRenameFauxScenes, true);
    }

    async _deleteFauxScenes(entries, render = false) {
        const presets = await PresetStorage.retrieve({ uuid: entries.map((d) => d.uuid), load: false });
        await PresetStorage.delete(presets);
        ui.notifications.info(`Deleted ${presets.length} FauxScenes`);
        if (render) this.render(true);
    }

    static async _onDelete() {
        this._deleteFauxScenes(this.danglingFauxScenes, true);
    }

    static async _onTag(event, button) {
        const presets = [];
        const type = button.dataset.type;

        let callback;

        if (type === 'create') {
            callback = (tags) => {
                this.toCreateFauxScenes.forEach((entry) => {
                    entry.tags = [...new Set([...tags, ...[entry.tags ?? []]])];
                });
            };
        } else if (type === 'rename' || type === 'dangling') {
            callback = async (tags) => {
                const entries = type === 'rename' ? this.toRenameFauxScenes : this.danglingFauxScenes;
                const presets = await PresetStorage.retrieve({
                    uuid: entries.map((d) => d.uuid),
                    load: true,
                });

                for (const p of presets) {
                    const nTags = new Set([...p.tags, ...tags]);
                    await p.update({ tags: [...nTags] }, true);
                }

                await Preset.processBatchUpdates();
                ui.notifications.info(`Tags applied to ${presets.length} FauxScenes.`);
            };
        }

        new FauxSceneTagger(callback).render(true);
    }
}

class FauxSceneTagger extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(callback) {
        super();
        this._callback = callback;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'me-faux-scene-tagger',
        tag: 'form',
        window: {
            title: 'Tags',
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 343,
            height: 'auto',
        },
        form: {
            handler: FauxSceneTagger._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        body: {
            template: `modules/${MODULE_ID}/templates/preset/fauxscene/tagger.hbs`,
        },
        footer: { template: 'templates/generic/form-footer.hbs' },
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.buttons = [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'Apply' }];
        return context;
    }

    static async _onSubmit(event, form, formData) {
        this._callback(formData.object.tags);
    }
}
