import { LAYER_MAPPINGS, showMassSelect } from '../applications/multiConfig.js';
import { SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES } from './constants.js';
import { localFormat, localize } from './utils.js';

export function showPlaceableTypeSelectDialog() {
  let content = '';
  for (const config of SUPPORTED_PLACEABLES.concat(SUPPORTED_COLLECTIONS)) {
    content += `<option value="${config}">${config}</option>`;
  }
  content = `<label>${localize('dialog.search-document')}</label>
    <select style="width: 100%;" name="documentName">${content}</select>`;

  new Dialog({
    title: 'Document SEARCH',
    content: content,
    buttons: {
      select: {
        icon: '<i class="fas fa-check"></i>',
        label: 'Select',
        callback: (html) => {
          const documentName = html.find("select[name='documentName']").val();

          let docs = [];
          if (SUPPORTED_PLACEABLES.includes(documentName)) {
            const layer = LAYER_MAPPINGS[documentName];
            if (layer && canvas[layer].placeables.length) {
              docs = canvas[layer].placeables;
            }
          } else {
            docs = Array.from(game.collections.get(documentName));
          }

          if (docs.length) {
            showMassSelect(docs[0]);
          } else {
            ui.notifications.warn(localFormat('dialog.document-not-found', { document: documentName }));
          }
        },
      },
    },
  }).render(true);
}

/**
 * Opens a dialog allowing JSON file upload
 * @returns Array of Presets as JSON
 */
export async function importPresetFromJSONDialog() {
  const html = `
  <div class="form-group">
      <label for="data">${localize('FILES.SelectFile', false)} </label>
      <input type="file" name="data">
  </div>
  `;

  const content = document.createElement('div');
  content.innerHTML = html;

  let file;

  await foundry.applications.api.DialogV2.wait({
    window: { title: localize('presets.import') },
    content: await foundry.applications.handlebars.renderTemplate('templates/apps/import-data.hbs', {
      hint1: 'You may import Preset data from an exported JSON file.',
      hint2: 'Newly created presets will be added to the current working compendium.',
    }),
    position: { width: 400 },
    buttons: [
      {
        action: 'import',
        label: 'Import',
        icon: 'fa-solid fa-file-import',
        callback: (event, button) => {
          const form = button.form;
          if (!form.data.files.length) {
            return ui.notifications.error('DOCUMENT.ImportDataError', { localize: true });
          }
          file = form.data.files[0];
        },
      },
      {
        action: 'cancel',
        label: 'Cancel',
      },
    ],
  });

  if (!file) return null;
  let text = await foundry.utils.readTextFromFile(file);

  let presets;
  try {
    presets = JSON.parse(text);
  } catch (e) {}

  return presets;
}
