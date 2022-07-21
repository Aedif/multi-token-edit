import { showMassConfig, showMassSelect } from './applications/multiConfig.js';
import CSSEdit, { STYLES } from './applications/cssEdit.js';

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
      showMassConfig();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'selectKey', {
    name: 'Open Placeable Search and Select',
    hint: 'When pressed will open a Configuration window where you will be able to choose fields using which the module will search and select placeables on the current scene.',
    editable: [
      {
        key: 'KeyF',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      showMassSelect();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  // Register Settings

  game.settings.register('multi-token-edit', 'cssStyle', {
    scope: 'world',
    config: false,
    type: String,
    default: 'Default',
  });

  game.settings.register('multi-token-edit', 'cssCustom', {
    scope: 'world',
    config: false,
    type: String,
    default: STYLES.Default,
  });

  game.settings.registerMenu('multi-token-edit', 'cssEdit', {
    name: 'Configure CSS',
    hint: 'Change the look of the modified configuration window.',
    label: '',
    scope: 'world',
    icon: 'fas fa-cog',
    type: CSSEdit,
    restricted: true,
  });
});

// Attach Mass Config buttons to Token and Tile HUDs

Hooks.on('renderTokenHUD', (hud, html, tokenData) => {
  if (canvas.tokens.controlled.length >= 2) {
    $(html)
      .find('.control-icon[data-action="config"]')
      .after(
        `<div class="control-icon" data-action="massConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="massConfig"]', () => {
      showMassConfig();
    });
  }
});
Hooks.on('renderTileHUD', (hud, html, tileData) => {
  if (canvas.background.controlled.concat(canvas.foreground.controlled).length >= 2) {
    $(html)
      .find('.control-icon[data-action="underfoot"]')
      .after(
        `<div class="control-icon" data-action="massConfig">
          <i class="fas fa-cogs"></i>
        </div>`
      );
    $(html).on('click', '[data-action="massConfig"]', () => {
      showMassConfig();
    });
  }
});
