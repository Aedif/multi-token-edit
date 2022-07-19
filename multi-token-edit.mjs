import { showMultiConfig, showMultiSelect } from './applications/multiConfig.js';

// Initialize module
Hooks.once('init', () => {
  game.keybindings.register('multi-token-edit', 'editKey', {
    name: 'Open Multi-Placeable Edit',
    hint: 'When pressed will open a Configuration window to simultaneously update all selected placeables.',
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

  game.keybindings.register('multi-token-edit', 'selectKey', {
    name: 'Open Placeable Search and Select',
    hint: 'When pressed will open a Configuration window where you will be able to choose fields using which the module will search and select placeables on the current scene.',
    editable: [
      {
        key: 'KeyS',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      showMultiSelect();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});
