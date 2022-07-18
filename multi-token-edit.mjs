import { showMultiConfig } from './applications/multiConfig.js';
import MultiTokenConfig from './applications/multiTokenConfig.js';

// Initialize module
Hooks.once('init', () => {
  game.keybindings.register('multi-token-edit', 'editKey', {
    name: 'Open Multi-Token Edit',
    hint: 'When pressed will open a Token Configuration window to simultaneously update all selected tokens.',
    editable: [
      {
        key: 'KeyE',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      showMultiConfig();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});
