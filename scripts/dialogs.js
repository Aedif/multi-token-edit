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

export async function importPresetFromJSONDialog(docName) {
  const content = `
  <div class="form-group">
      <label for="data">JSON File </label>
      <input type="file" name="data">
  </div>
  <textarea class="preset" style="width:100%;height:300px;"></textarea>
  <div class="form-group presetName">
      <label>Preset Name </label>
      <input type="text" value="NEW PRESET">
  </div>
  `;

  const updateDisplayName = function (html, json) {
    html.find('.preset').val(json);

    let presets;
    try {
      presets = JSON.parse(json);
    } catch (e) {
      presets = {};
    }

    const supportedDocs = [...SUPPORTED_PLACEABLES, ...SUPPORTED_COLLECTIONS];
    if (!isEmpty(presets) && supportedDocs.includes(Object.keys(presets)[0])) {
      html.find('.presetName input').val('');
      html.find('.presetName').hide();
    } else {
      html.find('.presetName input').val('NEW PRESET');
      html.find('.presetName').show();
    }
  };

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
              try {
                presets = JSON.parse(html.find('.preset').val());
              } catch (e) {}
              if (!presets || isEmpty(presets)) resolve(false);

              let presetName = html.find('.presetName input').val();
              if (presetName) {
                let tmp = {};
                tmp[docName] = {};
                tmp[docName][presetName] = presets;
                presets = tmp;
              }
              resolve(presets);
            },
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(false),
          },
        },
        render: (html) => {
          html.find('[name="data"]').on('change', (event) => {
            if (event.target.files.length) {
              readTextFromFile(event.target.files[0]).then((json) => {
                updateDisplayName(html, json);
              });
            }
          });
          html.find('.preset').on('input', (event) => {
            updateDisplayName(html, event.target.value);
          });
        },
        default: 'import',
      },
      {
        width: 400,
      }
    ).render(true);
  });
  return await dialog;
}
