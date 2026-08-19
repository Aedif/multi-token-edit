import { MODULE_ID } from '../constants.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export class VehicleOptions extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(token) {
        super();
        this._token = token;
    }

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'me-vehicle-options',
        tag: 'form',
        window: {
            title: 'Vehicle Options',
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 550,
            height: 'auto',
        },
        form: {
            handler: VehicleOptions._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        body: {
            template: `modules/${MODULE_ID}/templates/vehicleOptions.hbs`,
        },
        footer: { template: 'templates/generic/form-footer.hbs' },
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        return Object.assign(context, {
            lockAutoRotation: this._token.getFlag(MODULE_ID, 'lockAutoRotation'),
            disableLinkToken: this._token.getFlag(MODULE_ID, 'disableLinkToken'),
            displace: this._token.movementAction === 'displace',
            buttons: [
                {
                    type: 'submit',
                    icon: 'fas fa-check',
                    label: 'SETTINGS.Save',
                },
            ],
        });
    }

    static async _onSubmit(event, form, formData) {
        const { displace, lockAutoRotation, disableLinkToken } = formData.object;

        const update = { [`flags.${MODULE_ID}`]: { lockAutoRotation, disableLinkToken } };
        if (displace && this._token.movementAction !== 'displace') {
            update.movementAction = 'displace';
        }

        this._token.update(update);
    }
}

export function insertVehicleOptionToggle(hud, html) {
    const leftColumn = html.querySelector('.placeable-hud .col.left');
    if (!leftColumn) return;

    if (leftColumn.querySelector('.meVO')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('control-icon', 'meVO');

    button.dataset.action = 'meVO';
    button.dataset.tooltip = 'Toggle Vehicle Movement Mode';

    if (
        hud.document.getFlag(MODULE_ID, 'lockAutoRotation') === true &&
        hud.document.getFlag(MODULE_ID, 'disableLinkToken') === true &&
        hud.document.movementAction === 'displace'
    ) {
        button.classList.add('active');
    }

    const icon = document.createElement('i');
    icon.classList.add('fa-solid', 'fa-truck');

    button.appendChild(icon);
    button.addEventListener('click', (event) => {
        if (event.pointerType) {
            if (!event.target.classList.contains('active')) {
                hud.document.update({
                    [`flags.${MODULE_ID}`]: { lockAutoRotation: true, disableLinkToken: true },
                    movementAction: 'displace',
                });
            } else {
                hud.document.update({
                    [`flags.${MODULE_ID}`]: { lockAutoRotation: false, disableLinkToken: false },
                    movementAction: CONFIG.Token.movement.defaultAction,
                });
            }
        }
    });

    leftColumn.appendChild(button);
}

export function insertTokenConfigVehicleOptionsButtons(app, html) {
    const container = html.querySelector('[name="lockRotation"]')?.parentElement;
    if (container && !container.querySelector('.meVO')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `meVO icon fa-solid fa-truck`;
        button.dataset.tooltip = 'Vehicle Options';
        button.ariaLabel = 'Vehicle Options';
        button.addEventListener('click', async () => {
            new VehicleOptions(app.document).render(true);
        });
        container.prepend(button);
    }
}
