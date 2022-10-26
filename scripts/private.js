import { GeneralDataAdapter } from '../applications/dataAdapters.js';
import { SUPPORTED_CONFIGS } from '../applications/forms.js';
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
      .addClass(fields[key].method === 'add' ? 'me-add' : 'me-subtract')
      .attr('title', fields[key].method === 'add' ? '+ Adding' : '- Subtracting');
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

  class WithHeader extends Dialog {
    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      buttons.unshift({
        label: 'Export ALL',
        class: 'mass-edit-presets-export-all',
        icon: 'fas fa-globe',
        onclick: (ev) => {
          saveDataToFile(
            JSON.stringify(game.settings.get('multi-token-edit', 'presets') || {}, null, 2),
            'text/json',
            'mass-edit-presets-ALL.json'
          );
        },
      });
      return buttons;
    }
  }

  new WithHeader({
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

    GeneralDataAdapter.formToData(docName, placeables[i], data);

    for (const field of Object.keys(update)) {
      if (field in this.addSubtractFields && field in data) {
        const ctrl = this.addSubtractFields[field];
        let val = data[field];

        // Special processing for Tagger module fields
        if (field === 'flags.tagger.tags') {
          const currentTags = Array.isArray(val)
            ? val
            : (val ?? '').split(',').map((s) => s.trim());
          const modTags = (update[field] ?? '').split(',').map((s) => s.trim());
          for (const tag of modTags) {
            if (ctrl.method === 'add') {
              if (!currentTags.includes(tag)) currentTags.push(tag);
            } else if (ctrl.method === 'subtract') {
              const index = currentTags.indexOf(tag);
              if (index > -1) currentTags.splice(index, 1);
            }
          }
          update[field] = currentTags.filter((t) => t).join(',');
          continue;
        } else if (ctrl.type === 'text') {
          if (ctrl.method === 'add') {
            const toAdd = 'value' in ctrl ? ctrl.value : update[field];
            if (toAdd.startsWith('>>')) {
              val = toAdd.replace('>>', '') + val;
            } else {
              val += toAdd;
            }
          } else {
            val = val.replace('value' in ctrl ? ctrl.value : update[field], '');
          }
          update[field] = val;
          continue;
        }

        if (ctrl.method === 'add') {
          val += 'value' in ctrl ? ctrl.value : update[field];
        } else {
          val -= 'value' in ctrl ? ctrl.value : update[field];
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

export async function generateMacro() {
  // empty
}
