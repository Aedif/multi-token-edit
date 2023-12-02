import { LAYER_MAPPINGS, showMassSelect } from '../applications/multiConfig.js';
import { SUPPORTED_COLLECTIONS, SUPPORTED_PLACEABLES } from './utils.js';

export function showPlaceableTypeSelectDialog() {
  let content = '';
  for (const config of SUPPORTED_PLACEABLES.concat(SUPPORTED_COLLECTIONS)) {
    content += `<option value="${config}">${config}</option>`;
  }
  content = `<label>Choose a document type you wish to search:</label>
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
            ui.notifications.warn(`No documents found for the selected type. (${documentName})`);
          }
        },
      },
    },
  }).render(true);
}

export async function importPresetFromJSONDialog() {
  const content = `
  <div class="form-group">
      <label for="data">JSON File </label>
      <input type="file" name="data">
  </div>
  `;

  let dialog = new Promise((resolve, reject) => {
    new Dialog(
      {
        title: 'Import Presets',
        content: content,
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: 'Import',
            callback: async (html) => {
              let presets;
              readTextFromFile(html.find('[name="data"]')[0].files[0]).then((json) => {
                try {
                  presets = JSON.parse(json);
                } catch (e) {}
                resolve(presets);
              });
            },
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(false),
          },
        },
        default: 'no',
      },
      {
        width: 400,
      }
    ).render(true);
  });
  return await dialog;
}
