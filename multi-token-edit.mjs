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
      if (canvas.tokens.controlled.length >= 2) {
        new MultiTokenConfig(canvas.tokens.controlled).render(true);
      } else if (canvas.tokens.controlled.length === 1) {
        canvas.tokens.controlled[0].sheet.render(true);
      }
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});
