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

// Attach Multi-Config buttons to Token and Tile HUDs

Hooks.on('renderTokenHUD', (hud, html, tokenData) => {
  if (canvas.tokens.controlled.length >= 2) {
    $(html)
      .find('.control-icon[data-action="config"]')
      .after(
        `<div class="control-icon" data-action="multiConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="multiConfig"]', () => {
      showMultiConfig();
    });
  }
});
Hooks.on('renderTileHUD', (hud, html, tileData) => {
  if (canvas.background.controlled.concat(canvas.foreground.controlled).length >= 2) {
    $(html)
      .find('.control-icon[data-action="underfoot"]')
      .after(
        `<div class="control-icon" data-action="multiConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="multiConfig"]', () => {
      showMultiConfig();
    });
  }
});
