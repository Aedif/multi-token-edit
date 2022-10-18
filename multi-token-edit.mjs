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
import { getObjFormData, pasteDataUpdate, SUPPORTED_CONFIGS } from './applications/forms.js';
import { emptyObject, flagCompare } from './scripts/utils.js';

export const HISTORY = {};

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

  game.settings.register('multi-token-edit', 'enableHistory', {
    name: 'Update History',
    hint: '(REQUIRED GAME RELOAD) When enabled updates made to placeables will be stored and accessible via Mass Edit forms.',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register('multi-token-edit', 'historyMaxLength', {
    name: 'History Max Length',
    hint: 'Number of updates to be recorded in history.',
    scope: 'world',
    config: true,
    type: Number,
    default: 10,
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

  // Register history related hooks
  if (game.settings.get('multi-token-edit', 'enableHistory'))
    SUPPORTED_CONFIGS.forEach((docName) => {
      Hooks.on(`preUpdate${docName}`, (doc, update, options, userId) => {
        updateHistory(doc, update, userId);
      });
    });

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

//
// History Utilities
//

// Retrieve only the data that is different
function getDiffData(obj, update) {
  const docName = obj.document ? obj.document.documentName : obj.documentName;

  const cUpdate = deepClone(update);
  const flatObjData = getObjFormData(obj, docName);
  const flatUpdate = flattenObject(cUpdate);
  const diff = diffObject(flatObjData, flatUpdate);

  for (const [k, v] of Object.entries(diff)) {
    // Special handling for empty/undefined data
    if ((v === '' || v == null) && (flatObjData[k] === '' || flatObjData[k] == null)) {
      // matches
      delete diff[k];
    }

    if (k.startsWith('flags.'))
      if (flagCompare(flatObjData, k, v)) {
        delete diff[k];
      }

    if (docName === 'Token' && ['light.angle', 'rotation'].includes(k)) {
      if (v % 360 === flatObjData[k] % 360) {
        delete diff[k];
      }
    }
  }

  return diff;
}

function updateHistory(obj, update, userId) {
  if (game.user.id !== userId || !game.settings.get('multi-token-edit', 'enableHistory')) return;

  const historyItem = { timestamp: new Date().toLocaleTimeString(), ctrl: {} };
  ['mass-edit-randomize', 'mass-edit-addSubtract'].forEach((ctrl) => {
    if (ctrl in update) {
      historyItem.ctrl[ctrl] = update[ctrl][0];
      delete update[ctrl];
    }
  });
  const cUpdate = flattenObject(deepClone(update));
  delete cUpdate._id;

  if (emptyObject(cUpdate)) return;

  historyItem.update = cUpdate;
  historyItem.diff = getDiffData(obj, update);
  historyItem._id = update._id;

  const maxLength = game.settings.get('multi-token-edit', 'historyMaxLength') ?? 0;
  const docName = obj.document ? obj.document.documentName : obj.documentName;
  const docHistory = HISTORY[docName] ?? [];
  docHistory.push(historyItem);

  if (docHistory.length > maxLength) {
    docHistory.splice(0, 1);
  }

  HISTORY[docName] = docHistory;
}
