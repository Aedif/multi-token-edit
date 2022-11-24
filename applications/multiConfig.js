import { showPlaceableTypeSelectDialog } from '../scripts/dialogs.js';
import { getData, SUPPORTED_PLACEABLES, SUPPORT_SHEET_CONFIGS } from '../scripts/utils.js';
import { pasteDataUpdate, WithMassConfig } from './forms.js';
import { MassEditGenericForm } from './genericForm.js';

export function getLayerMappings() {
  return isNewerVersion('10', game.version)
    ? {
        // v9
        Token: ['tokens'],
        Tile: ['background', 'foreground'],
        Drawing: ['drawings'],
        Wall: ['walls'],
        AmbientLight: ['lighting'],
        AmbientSound: ['sounds'],
        MeasuredTemplate: ['templates'],
        Note: ['notes'],
      }
    : // v10
      {
        Token: ['tokens'],
        Tile: ['tiles'],
        Drawing: ['drawings'],
        Wall: ['walls'],
        AmbientLight: ['lighting'],
        AmbientSound: ['sounds'],
        MeasuredTemplate: ['templates'],
        Note: ['notes'],
      };
}

// Retrieve currently controlled placeables
export function getControlled() {
  for (const layers of Object.values(getLayerMappings())) {
    for (const layer of layers) {
      if (canvas[layer].controlled.length) {
        return canvas[layer].controlled;
      }
    }
  }
  return null;
}

// Retrieve hovered over placeable
function getHover() {
  for (const layers of Object.values(getLayerMappings())) {
    for (const layer of layers) {
      // v9
      if (canvas[layer]._hover) {
        return [canvas[layer]._hover];
      }
      // v10
      if (canvas[layer].hover) {
        return [canvas[layer].hover];
      }
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
        d = game.collections
          .get(doc.name)
          .get(this.dataset.playlistId)
          ?.sounds.get(this.dataset.soundId);
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

function documentName(doc) {
  return doc.document ? doc.document.documentName : doc.documentName;
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

  if (hover && documentName(hover) !== documentName(selected[0])) {
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

  const docName = target.document ? target.document.documentName : target.documentName;
  if (!SUPPORTED_PLACEABLES.includes(docName)) return;

  const MassConfig = WithMassConfig(docName);
  new MassConfig(target, selected, {
    commonData: flattenObject(getData(target).toObject()),
    massSelect: true,
    documentName: docName,
  }).render(true, {});
}

// show placeable edit
export function showMassConfig(found = null, documentName) {
  let [target, selected] = getSelected(found);

  // If there are no placeable in control or just one, then either exit or display the default config window
  if (!selected || !selected.length) return;

  if (game.settings.get('multi-token-edit', 'singleDocDefaultConfig')) {
    if (selected.length === 1) {
      if (selected[0].sheet) selected[0].sheet.render(true, {});
      return;
    }
  }

  // Display modified config window
  if (!documentName)
    documentName = target.document ? target.document.documentName : target.documentName;
  const options = { massEdit: true, documentName };
  if (SUPPORT_SHEET_CONFIGS.includes(documentName)) {
    if (documentName === 'Actor') {
      target = target.prototypeToken ?? target.token;
      selected = selected.map((s) => s.prototypeToken ?? s.token);
      options.documentName = 'Token';
    }
    const MassConfig = WithMassConfig(options.documentName);
    new MassConfig(target, selected, options).render(true, {});
  } else {
    new MassEditGenericForm(selected, options).render(true);
  }
}

// show placeable data copy
export function showMassCopy() {
  let [target, selected] = getSelected();

  if (!selected || !selected.length) return;

  // Display modified config window
  const documentName = target.document ? target.document.documentName : target.documentName;
  const options = { massCopy: true, documentName };
  if (SUPPORT_SHEET_CONFIGS.includes(documentName)) {
    if (documentName === 'Actor') {
      target = target.prototypeToken ?? target.token;
      selected = selected.map((s) => s.prototypeToken ?? s.token);
      options.documentName = 'Token';
    }

    const MassConfig = WithMassConfig(options.documentName);
    new MassConfig(target, selected, options).render(true, {});
  } else {
    new MassEditGenericForm(selected, options).render(true);
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
  pasteDataUpdate(selected);
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
