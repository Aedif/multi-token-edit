import { getLayerMappings, showMassSelect } from '../applications/multiConfig.js';
import { SUPPORTED_PLACEABLES } from './utils.js';

export function showPlaceableTypeSelectDialog() {
  let content = '';
  for (const config of SUPPORTED_PLACEABLES) {
    content += `<option value="${config}">${config}</option>`;
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
          for (const layer of getLayerMappings()[documentName]) {
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
