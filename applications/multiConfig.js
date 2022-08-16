import { showPlaceableTypeSelectDialog } from '../scripts/dialogs.js';
import { pasteDataUpdate, WithMassConfig } from './configs.js';

export const LAYER_MAPPINGS = {
  Actor: ['tokens'],
  Token: ['tokens'],
  Tile: ['background', 'foreground'],
  Drawing: ['drawings'],
  Wall: ['walls'],
  AmbientLight: ['lighting'],
  AmbientSound: ['sounds'],
  MeasuredTemplate: ['templates'],
  Note: ['notes'],
};

// Retrieve currently controlled placeables
export function getControlled() {
  for (const layers of Object.values(LAYER_MAPPINGS)) {
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
  for (const layers of Object.values(LAYER_MAPPINGS)) {
    for (const layer of layers) {
      if (canvas[layer]._hover) {
        return [canvas[layer]._hover];
      }
    }
  }
  return null;
}

// Retrieve documents selected using Multiple Document Selection module (https://github.com/ironmonk88/multiple-document-selection)
function getSelectedDocuments() {
  const supportedDocs = [
    { name: 'Actor', class: 'actor' },
    { name: 'Scene', class: 'scene' },
  ];
  for (const doc of supportedDocs) {
    const selected = [];
    $(`.document.${doc.class}.selected`).each(function (_) {
      const d = game.collections.get(doc.name).get(this.dataset.documentId);
      if (d) selected.push(d);
    });
    if (selected.length) {
      return selected;
    }
  }
  return null;
}

// Show placeable search
export function showMassSelect(basePlaceable) {
  let selected;
  if (basePlaceable) selected = [basePlaceable];
  if (!selected) selected = getSelectedDocuments();
  if (!selected) selected = getControlled();
  if (!selected) selected = getHover();

  if (!selected || !selected.length) {
    showPlaceableTypeSelectDialog();
    return;
  }

  const docName = selected[0].document
    ? selected[0].document.documentName
    : selected[0].documentName;
  const MassConfig = WithMassConfig(docName);
  new MassConfig([selected[0]], {
    commonData: flattenObject(selected[0].data.toObject()),
    massSelect: true,
  }).render(true, {});
}

// show placeable edit
export function showMassConfig(found = null) {
  let selected = found;
  if (!selected) selected = getSelectedDocuments();
  if (!selected) selected = getControlled();
  if (!selected) selected = getHover();

  // If there are no placeable in control or just one, then either exit or display the default config window
  if (!selected || !selected.length) return;
  else if (selected.length === 1) {
    if (selected[0].sheet) selected[0].sheet.render(true, {});
    return;
  }

  // Display modified config window
  const docName = selected[0].document
    ? selected[0].document.documentName
    : selected[0].documentName;
  const MassConfig = WithMassConfig(docName);
  new MassConfig(selected, { commonData: getCommonData(selected) }).render(true, {});
}

// show placeable data copy
export function showMassCopy() {
  let selected;
  if (!selected) selected = getSelectedDocuments();
  if (!selected) selected = getControlled();
  if (!selected) selected = getHover();

  if (!selected || !selected.length) return;

  // Display modified config window
  const docName = selected[0].document
    ? selected[0].document.documentName
    : selected[0].documentName;
  const MassConfig = WithMassConfig(docName);
  new MassConfig(selected, { commonData: getCommonData(selected), massCopy: true }).render(
    true,
    {}
  );
}

// Merge all data and determine what is common between the docs
function getCommonData(docs) {
  const areActors = docs[0] instanceof Actor;
  const commonData = flattenObject((areActors ? docs[0].data.token : docs[0].data).toObject());
  for (let i = 1; i < docs.length; i++) {
    const flatData = flattenObject((areActors ? docs[i].data.token : docs[i].data).toObject());
    const diff = flattenObject(diffObject(commonData, flatData));
    for (const k of Object.keys(diff)) {
      // Special handling for empty/undefined data
      if ((diff[k] === '' || diff[k] == null) && (commonData[k] === '' || commonData[k] == null)) {
        // matches, do not remove
      } else {
        delete commonData[k];
      }
    }
  }
  return commonData;
}

export function pasteData() {
  let selected;
  if (!selected) selected = getSelectedDocuments();
  if (!selected) selected = getControlled();
  if (!selected) selected = getHover();
  pasteDataUpdate(selected);
}
