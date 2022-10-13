import {
  getSelected,
  pasteData,
  showMassConfig,
  showMassCopy,
  showMassSelect,
} from './applications/multiConfig.js';
import CSSEdit, { STYLES } from './applications/cssEdit.js';
import { IS_PRIVATE } from './scripts/private.js';
import MassEditPresets from './applications/presets.js';
import { pasteDataUpdate } from './applications/forms.js';

// Initialize module
Hooks.once('init', () => {
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

  game.settings.register('multi-token-edit', 'singleDocDefaultConfig', {
    name: 'Single placeable: Default Config',
    hint: 'When a single placeable is selected or hovered over, open the default configuration window instead of the modified Mass Edit config.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'rangeToTextbox', {
    name: 'Allow manual input for range sliders',
    hint: 'Converts slider value labels to text boxes.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'presets', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  });

  if (IS_PRIVATE) {
    game.settings.register('multi-token-edit', 'autoSnap', {
      name: 'Auto-snap coordinates to Grid',
      hint: 'When using "Select Range" in the coordinate randomizer menu, the range values will automatically be snapped to the grid.',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });
  }

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

  game.keybindings.register('multi-token-edit', 'copyKey', {
    name: 'Open Placeable Data Copy',
    hint: 'When pressed will open a Configuration window where you will be able to choose fields you wish to copy.',
    editable: [
      {
        key: 'KeyC',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      // Check if a Mass Config form is already open and if so copy data from there
      const re = new RegExp('Mass.*Config');
      for (const app of Object.values(ui.windows)) {
        if (re.test(app.constructor.name)) {
          app.massUpdateObject({ submitter: { value: '' } }, null, { copyForm: true });
          return;
        }
      }

      // Otherwise open a copy form
      showMassCopy();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'pasteKey', {
    name: 'Paste Placeable Data on Selected',
    hint: 'Pastes copied placeable data on the selected placeables.',
    editable: [
      {
        key: 'KeyV',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      pasteData();
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });

  game.keybindings.register('multi-token-edit', 'presetApply', {
    name: 'Open Presets',
    hint: 'Opens Preset dialog for the hovered/selected placeables to immediately apply them.',
    editable: [
      {
        key: 'KeyX',
        modifiers: ['Shift'],
      },
    ],
    onDown: () => {
      const [target, selected] = getSelected();
      if (!target) return;
      const docName = target.document ? target.document.documentName : target.documentName;

      new MassEditPresets(
        null,
        (preset) => {
          const [target2, selected2] = getSelected();
          if (!(target2 || target)) return;
          pasteDataUpdate(target2 ? selected2 : selected, preset);
        },
        docName
      ).render(true);
    },
    restricted: true,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
});

// Fix for wrong default value being set
Hooks.on('ready', () => {
  const presets = game.settings.get('multi-token-edit', 'presets');
  if (getType(presets) !== 'Object') {
    game.settings.set('multi-token-edit', 'presets', {});
  }
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
  const controlledTiles = canvas.background
    ? canvas.background.controlled.concat(canvas.foreground.controlled)
    : canvas.tiles.controlled;

  if (controlledTiles.length >= 2) {
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
