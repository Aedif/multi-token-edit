import { MODULE_ID, UI_DOCS } from '../../constants.js';
import { DOC_ICONS } from '../preset.js';

export default class PresetBrowserSettings extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2,
) {
    constructor(browser) {
        super({});
        this.browser = browser;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'mass-edit-browser-settings',
        tag: 'form',
        form: {
            handler: PresetBrowserSettings._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        window: {
            title: 'Settings',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 440,
            height: 'auto',
        },
        actions: {
            documentSelect: PresetBrowserSettings._onDocumentSelect,
        },
    };

    /** @override */
    static PARTS = {
        main: { template: `modules/${MODULE_ID}/templates/preset/browserSettings.hbs` },
        footer: { template: 'templates/generic/form-footer.hbs' },
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.buttons = [{ type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save' }];

        const config = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'presetBrowser'));
        config.dropdownDocuments = UI_DOCS.map((name) => {
            return { name, active: config.dropdownDocuments.includes(name), icon: DOC_ICONS[name] };
        });

        return Object.assign(context, config);
    }

    static _onDocumentSelect(event, element) {
        element.classList.toggle('active');
    }

    static async _onSubmit(event, form, formData) {
        const dropdownDocuments = [];
        form.querySelectorAll('.document-select.active').forEach((el) => {
            dropdownDocuments.push(el.dataset.name);
        });

        const config = formData.object;
        config.dropdownDocuments = dropdownDocuments;

        const settings = foundry.utils.mergeObject(game.settings.get(MODULE_ID, 'presetBrowser'), config);
        await game.settings.set(MODULE_ID, 'presetBrowser', settings);
        this.browser?.render(true);
    }
}
