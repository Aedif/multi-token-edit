import { MODULE_ID } from '../constants';
import { PresetStorage } from '../presets/collection';

export async function registerActions(MonksActiveTiles) {
    MonksActiveTiles.registerTileGroup(MODULE_ID, 'Mass Edit');

    MonksActiveTiles.registerTileAction(MODULE_ID, 'me-spawn-preset', {
        name: 'Spawn Preset',
        requiresGM: true,
        ctrls: [
            { type: 'line', help: 'Target' },
            {
                id: 'location',
                name: 'Location',
                type: 'select',
                subtype: 'location',
                options: { show: ['tile', 'token', 'within', 'players', 'previous', 'tagger'] },
                restrict: (entity, document) => {
                    return (
                        ((entity instanceof foundry.canvas.placeables.Token ||
                            entity instanceof foundry.canvas.placeables.Tile ||
                            entity instanceof foundry.canvas.placeables.Drawing ||
                            entity instanceof foundry.canvas.placeables.Region ||
                            entity instanceof foundry.canvas.placeables.AmbientLight ||
                            entity instanceof foundry.canvas.placeables.AmbientSound ||
                            entity instanceof foundry.canvas.placeables.Note) &&
                            document?.parent?.id == entity?.document?.parent?.id) ||
                        document?.parent?.id == entity?.id
                    );
                },
                required: true,
            },
            { type: 'line', help: 'Presets to Spawn' },
            {
                id: 'query',
                name: 'Query',
                type: 'text',
                placeholder: 'e.g. tree #summer -palm',
            },
            {
                id: 'uuids',
                name: 'UUIDs',
                type: 'text',
                subtype: 'multiline',
                placeholder: 'One UUID per line',
            },
        ],
        values: {},
        group: MODULE_ID,
        fn: async (args = {}) => {
            const { tile, action, userId, value, method, change } = args;

            let { uuids, query } = action.data;
            uuids = uuids.trim();
            query = query.trim();
            const presetCollection = new Collection();

            if (uuids) {
                const presets = await PresetStorage.retrieve({
                    uuid: uuids
                        .split('\n')
                        .map((id) => id.trim())
                        .filter(Boolean),
                });
                presets.forEach((p) => {
                    presetCollection.set(p.uuid, p);
                });
            }
            if (query) {
                const presets = await PresetStorage.retrieve({ query });
                presets.forEach((p) => {
                    presetCollection.set(p.uuid, p);
                });
            }
            if (!presetCollection.size) return;

            console.log({ presetCollection });

            const locations = await MonksActiveTiles.getLocation.call(tile, action.data.location, args);
            if (!locations?.length) return;

            console.log({ locations });

            // let result = {};
            // MonksActiveTiles.addToResult(entities, result);

            // return result;
        },
        content: async (trigger, action) => {
            // let ctrl = trigger.ctrls.find((c) => c.id == 'entity');
            // let entityName = await MonksActiveTiles.entityName(
            //     action.data?.entity || ctrl?.defvalue || 'previous',
            //     (action.data?.entity == 'previous' ? action.data?.collection : null) || 'tiles',
            // );

            // const state = action.data?.state;
            // const preposition = state === 'toggle' ? 'on' : state === 'remove' ? 'from' : 'to';

            // let forUser = '';
            // if (action.data?.transient) {
            //     const showto = action.data.showto.name ?? trigger.values.showto[action.data.showto];
            //     forUser = `, ${game.i18n.localize('MonksActiveTiles.ctrl.for')} <span class="action-style">${game.i18n.localize(showto)}</span>`;
            // }

            return `Mass Edit TESTING`;

            // return `<span class="action-style">TMFX</span> <span class="details-style">"${game.i18n.localize(trigger.values.state[action.data?.state])}"</span> <span class="value-style">&lt;${action.data.preset}&gt;</span> ${preposition} <span class="entity-style">${entityName}</span>${forUser}`;
        },
    });
}
