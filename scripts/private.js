import { SUPPORTED_CONFIGS } from '../applications/configs.js';
import { emptyObject, getData } from './utils.js';

export const IS_PRIVATE = false;

export function showRandomizeDialog() {
  // empty
}

export function randomize() {
  // empty
}

export function applyRandomization() {
  // empty
}

export function selectRandomizerFields() {
  // empty
}

export function selectAddSubtractFields(form, fields) {
  for (const key of Object.keys(fields)) {
    form
      .find(`[name="${key}"]`)
      .removeClass('me-add')
      .removeClass('me-subtract')
      .addClass(fields[key].method === 'add' ? 'me-add' : 'me-subtract');
  }
}

export function exportPresets(docType) {
  const presets = (game.settings.get('multi-token-edit', 'presets') || {})[docType];
  if (!presets || emptyObject(presets)) return;

  let content = '<form><h2>Select Presets to export:</h2>';
  for (const key of Object.keys(presets)) {
    content += `
    <div class="form-group">
      <label>${key}</label>
      <div class="form-fields">
          <input type="checkbox" name="${key}" data-dtype="Boolean">
      </div>
    </div>
    `;
  }
  content += `</form><div class="form-group"><button type="button" class="select-all">Select all</div>`;

  new Dialog({
    title: `Export`,
    content: content,
    buttons: {
      Ok: {
        label: `Export`,
        callback: (html) => {
          const exportData = {};
          html.find('input[type="checkbox"]').each(function () {
            if (this.checked && presets[this.name]) {
              exportData[this.name] = presets[this.name];
            }
          });
          if (!emptyObject(exportData)) {
            const data = {};
            data[docType] = exportData;
            const filename = `mass-edit-presets-${docType}.json`;
            saveDataToFile(JSON.stringify(data, null, 2), 'text/json', filename);
          }
        },
      },
    },
    render: (html) => {
      html.find('.select-all').click(() => {
        html.find('input[type="checkbox"]').prop('checked', true);
      });
    },
  }).render(true);
}

export async function importPresets() {
  let json = await _importFromJSONDialog();
  json = JSON.parse(json);
  if (!json || emptyObject(json)) return;

  const presets = game.settings.get('multi-token-edit', 'presets') || {};

  for (const dType of Object.keys(json)) {
    if (SUPPORTED_CONFIGS.includes(dType)) {
      for (const preset of Object.keys(json[dType])) {
        presets[dType][preset] = json[dType][preset];
      }
    }
  }

  await game.settings.set('multi-token-edit', 'presets', presets);
  this.render();
}

async function _importFromJSONDialog() {
  const content = await renderTemplate('templates/apps/import-data.html', {
    entity: 'multi-token-edit',
    name: 'presets',
  });
  let dialog = new Promise((resolve, reject) => {
    new Dialog(
      {
        title: 'Import Presets',
        content: content,
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: 'Import',
            callback: (html) => {
              const form = html.find('form')[0];
              if (!form.data.files.length)
                return ui.notifications?.error('You did not upload a data file!');
              readTextFromFile(form.data.files[0]).then((json) => {
                resolve(json);
              });
            },
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: (html) => resolve(false),
          },
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

export function applyAddSubtract(updates, placeables, docName) {
  // See if any field need to be added or subtracted
  if (!this.addSubtractFields || emptyObject(this.addSubtractFields)) return;

  const areActors = placeables[0] instanceof Actor;
  const getTokenData = function (actor) {
    return isNewerVersion('10', game.version) ? getData(actor).token : actor.prototypeToken;
  };

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const data = flattenObject(
      (areActors ? getTokenData(placeables[i]) : getData(placeables[i])).toObject()
    );

    if (docName === 'Token') TokenDataAdapter.dataToForm(placeables[i], data);
    if (docName === 'Actor') TokenDataAdapter.dataToForm(placeables[i].prototypeToken, data);

    for (const field of Object.keys(update)) {
      if (field in this.addSubtractFields && field in data) {
        let val = data[field];
        const ctrl = this.addSubtractFields[field];
        if (ctrl.method === 'add') {
          val += update[field];
        } else {
          val -= update[field];
        }
        if ('min' in ctrl && val < ctrl.min) {
          val = ctrl.min;
        } else if ('max' in ctrl && val > ctrl.max) {
          val = ctrl.max;
        }
        update[field] = val;
      }
    }
  }
}
