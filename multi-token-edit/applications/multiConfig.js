import { MODULE_ID, SUPPORTED_COLLECTIONS, SUPPORTED_SHEET_CONFIGS } from '../scripts/constants.js';
import { showPlaceableTypeSelectDialog } from '../scripts/dialogs.js';
import { PresetAPI } from '../scripts/presets/collection.js';
import { getData, getDocumentName } from '../scripts/utils.js';
import { getClipboardData, pasteDataUpdate } from './formUtils.js';
import { WithMassConfig } from './forms.js';
import { MassEditGenericForm } from './generic/genericForm.js';

export const LAYER_MAPPINGS = {
  Token: 'tokens',
  Tile: 'tiles',
  Drawing: 'drawings',
  Wall: 'walls',
  AmbientLight: 'lighting',
  AmbientSound: 'sounds',
  MeasuredTemplate: 'templates',
  Note: 'notes',
};

export const SCENE_DOC_MAPPINGS = {
  Token: 'tokens',
  Tile: 'tiles',
  Drawing: 'drawings',
  Wall: 'walls',
  AmbientLight: 'lights',
  AmbientSound: 'sounds',
  MeasuredTemplate: 'templates',
  Note: 'notes',
};

// Retrieve currently controlled placeables
export function getControlled() {
  if (canvas.activeLayer.controlled.length) {
    return canvas.activeLayer.controlled;
  }
  return null;
}

// Retrieve hovered over placeable
function getHover() {
  let documentName = canvas.activeLayer.constructor.documentName;
  // Walls do not properly cleanup hover state
  if (!['Wall'].includes(documentName)) {
    if (canvas.activeLayer.hover) {
      return [canvas.activeLayer.hover];
    }
  }
  return null;
}

// Retrieve documents selected using Multiple Document Selection module (https://github.com/ironmonk88/multiple-document-selection)
function getSelectedDocuments(placeableSelect) {
  const supportedDocs = [
    { name: 'Actor', class: 'actor' },
    { name: 'Scene', class: 'scene' },
    { name: 'JournalEntry', class: 'journalentry' },
    { name: 'Playlist', class: 'sound' },
    { name: 'Item', class: 'item' },
    { name: 'RollTable', class: 'rolltable' },
    { name: 'Cards', class: 'cards' },
  ];
  for (const doc of supportedDocs) {
    const selected = [];
    $(`.directory-list .${doc.class}.selected`).each(function (_) {
      let d;
      if (doc.name === 'Playlist') {
        d = game.collections.get(doc.name).get(this.dataset.playlistId)?.sounds.get(this.dataset.soundId);
      } else {
        d = game.collections.get(doc.name).get(this.dataset.documentId);
      }

      if (d) {
        // JournalEntries themselves do not have configs, but notes that they correspond to on the scene do
        if (placeableSelect && doc.name === 'JournalEntry') {
          game.collections.get('Scene').forEach((s) =>
            s.notes.forEach((n) => {
              const eid = n.entryId ?? n.data.entryId;
              if (d.id === eid) {
                selected.push(n);
              }
            })
          );
          // canvas.notes.placeables
          //   .filter((n) => d.id === (n.entryId ?? n.data.entryId))
          //   .forEach((n) => selected.push(n));
        } else {
          if (d) selected.push(d);
        }
      }
    });
    if (selected.length) {
      return selected;
    }
  }
  return null;
}

export function getSelected(base, placeable = true) {
  let selected;
  if (base) {
    if (Array.isArray(base)) selected = base;
    else selected = [base];
  }
  if (!selected) selected = getSelectedDocuments(placeable);
  if (!selected) selected = getControlled();

  // Sort placeable on the scene using their (x, y) coordinates
  if (selected && selected.length > 1 && selected[0].x != null && selected[0].y != null) {
    selected.sort((p1, p2) => {
      const c = p1.y - p2.y;
      if (c === 0) {
        return p1.x - p2.x;
      }
      return c;
    });
  }

  // We want one object to be treated as the target for the form
  // Will prioritize hovered placeable for this purpose
  let hover = getHover();
  hover = hover ? hover[0] : hover;

  if (!selected && hover) selected = [hover];
  if (!hover && selected) hover = selected[0];

  if (!hover && !selected) return [null, null];

  if (hover && getDocumentName(hover) !== getDocumentName(selected[0])) {
    hover = selected[0];
  }

  return [hover, selected];
}

// Show placeable search
export function showMassSelect(basePlaceable) {
  let [target, selected] = getSelected(basePlaceable);

  if (!target) {
    showPlaceableTypeSelectDialog();
    return;
  }

  const documentName = getDocumentName(target);

  const options = {
    commonData: foundry.utils.flattenObject(getData(target).toObject()),
    massSelect: true,
    documentName: documentName,
  };

  if (SUPPORTED_SHEET_CONFIGS.includes(documentName) && documentName !== 'Actor') {
    const MassConfig = WithMassConfig(documentName);
    new MassConfig(target, selected, options).render(true, {});
  } else if (SUPPORTED_COLLECTIONS.includes(documentName)) {
    new MassEditGenericForm(selected, options).render(true);
  }
}

// show placeable edit
export async function showMassEdit(found = null, documentName, options = {}) {
  let [target, selected] = getSelected(found);

  // If there are no placeable in control or just one, then either exit or display the default config window
  if (!selected || !selected.length) return;

  if (!options.forceForm && game.settings.get(MODULE_ID, 'singleDocDefaultConfig')) {
    if (selected.length === 1) {
      if (selected[0].sheet) selected[0].sheet.render(true, {});
      return;
    }
  }

  // Display modified config window
  if (!documentName) documentName = getDocumentName(target);
  options = { ...options, massEdit: true, documentName };
  if (SUPPORTED_SHEET_CONFIGS.includes(documentName)) {
    if (documentName === 'Actor') {
      target = target.prototypeToken;
      selected = selected.map((s) => s.prototypeToken);
      options.documentName = 'Token';
    }
    const MassConfig = WithMassConfig(options.documentName);
    return new MassConfig(target, selected, options).render(true, {});
  } else {
    return new MassEditGenericForm(selected, options).render(true);
  }
}

export function showMassActorForm(selectedTokens, options) {
  const tokens = [];
  const actors = [];
  selectedTokens.forEach((s) => {
    if (s.actor) {
      tokens.push(s);
      actors.push(s.actor);
    }
  });

  if (actors.length) {
    new MassEditGenericForm(actors, {
      tokens,
      documentName: 'Actor',
      ...options,
    }).render(true);
    return true;
  }
  return false;
}

export function pasteData() {
  let selected;
  if (!selected) selected = getSelectedDocuments();
  if (!selected) selected = getControlled();
  if (!selected) selected = getHover();

  if (selected) return pasteDataUpdate(selected, null, false, true);
  else {
    let documentName = canvas.activeLayer.constructor.documentName;
    const preset = getClipboardData(documentName);
    if (preset) {
      PresetAPI.spawnPreset({ preset });
      return true;
    }
  }

  return false;
}

/**
 * Displays a Generic Mass Edit form for the passed in data object/s
 * @param {Array|Object} data Object/s to be edited using the form
 * @param {String} name the name to be assigned internally to this data which will be used to manage presets and pins
 * @returns Promised resolved once the opened form is submitted
 */
export function showGenericForm(data, name = 'GenericData', options) {
  return new Promise((resolve) => {
    new MassEditGenericForm(Array.isArray(data) ? data : [data], {
      documentName: name,
      callback: () => resolve(),
      ...options,
    }).render(true);
  });
}
