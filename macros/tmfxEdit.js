/**
 * Edit Token Magic FX filters on currently selected placeable.
 * Edited filters can be saved as a new preset.
 */

const controlled = TokenMagic.getControlledPlaceables();
if (!controlled.length) return;

const filters = controlled[0].document.getFlag('tokenmagic', 'filters') || [];
if (!filters.length) return;

let params = filters.map((f) => {
  const tmParams = deepClone(f.tmFilters.tmParams);
  ['placeableId', 'placeableType', 'filterInternalId', 'filterOwner', 'updateId'].forEach(
    (k) => delete tmParams[k]
  );
  return tmParams;
});
if (!params.length) return;

async function savePreset() {
  let content = `<label>Macro</label>
  <textarea style="width:100%; height: 300px;" readonly>let params = ${JSON.stringify(
    params,
    null,
    2
  )};

await TokenMagic.addUpdateFiltersOnSelected(params);</textarea>
  <label>Preset Name</label><input class="presetName" type="text" value="${
    params[0].filterId ?? params[0].filterType
  }"/>
  `;
  new Dialog({
    title: `Params`,
    content: content,
    buttons: {
      save: {
        label: 'Save As Preset',
        callback: async (html) => {
          const presetName = html.find('.presetName').val();
          if (TokenMagic.getPreset(presetName)) {
            TokenMagic.deletePreset(presetName);
          }
          TokenMagic.addPreset(presetName, params);
        },
      },
    },
  }).render(true);
}

async function promptParamChoice(params) {
  return new Promise((resolve, reject) => {
    const buttons = {};
    for (let i = 0; i < params.length; i++) {
      let label = params[i].filterType ?? params[i].filterId;
      if (label in buttons) label = label + ' ' + i;
      buttons[label] = {
        label: params[i].filterId + ' {' + params[i].filterType + '}',
        callback: () => {
          resolve(i);
        },
      };
    }

    let dialog;
    dialog = new Dialog({
      title: 'TMFX Filter Editor',
      content:
        '<button class="savePreset">Save as Preset</button><p></p><h2 style="text-align: center;">Edit Filter</h2>',
      buttons,
      render: (html) => {
        html.find('.dialog-button').attr('title', 'Right-click to remove filter.');
        html.find('.dialog-button').contextmenu((event) => {
          dialog.close();
          const index = $(event.target).index();
          TokenMagic.deleteFiltersOnSelected(params[index].filterId);
          params.splice(index, 1);
          configureParam();
        });
        html.find('.savePreset').click((event) => {
          savePreset();
          dialog.close();
        });
      },
      close: () => resolve(-1),
    });
    dialog.render(true);
  });
}

async function configureParam() {
  if (!params || !params.length) return;
  let i = await promptParamChoice(params);
  if (i < 0) return;
  let param = params[i];

  if (param)
    game.modules.get('multi-token-edit').api.showGenericForm(param, param.filterType ?? 'TMFX', {
      callback: async (obj) => configureParam(),
      inputChangeCallback: (selected) => {
        mergeObject(param, selected, { inplace: true });
        TokenMagic.addUpdateFiltersOnSelected(deepClone(params));
      },
    });
}

configureParam();
