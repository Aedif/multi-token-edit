import { CONFIG_MAPPINGS } from '../applications/configs.js';
import { LAYER_MAPPINGS, showMassSelect } from '../applications/multiConfig.js';

export function showPlaceableTypeSelectDialog() {
  let content = '';
  for (const key of Object.keys(CONFIG_MAPPINGS)) {
    content += `<option value="${key}">${key}</option>`;
  }
  content = `<label>Choose placeable type you wish to search:</label>
    <select style="width: 100%;" name="documentName">${content}</select>`;

  new Dialog({
    title: 'Placeable SEARCH',
    content: content,
    buttons: {
      select: {
        icon: '<i class="fas fa-check"></i>',
        label: 'Select',
        callback: (html) => {
          const documentName = html.find("select[name='documentName']").val();
          let placeables = [];
          for (const layer of LAYER_MAPPINGS[documentName]) {
            if (layer && canvas[layer].placeables.length) {
              placeables = canvas[layer].placeables;
            }
          }
          if (placeables.length) {
            showMassSelect(placeables[0]);
          } else {
            ui.notifications.warn(`No placeables found for the selected type. (${documentName})`);
          }
        },
      },
    },
  }).render(true);
}
