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

async function promptParamChoice(params) {
  return new Promise((resolve, reject) => {
    const buttons = {};
    for (let i = 0; i < params.length; i++) {
      const label = params[i].filterType ?? params[i].filterId;
      buttons[label] = {
        label,
        callback: () => {
          resolve(i);
        },
      };
    }

    const dialog = new Dialog({
      title: 'Select Filter To Edit',
      content: '',
      buttons,
      close: () => resolve(-1),
    });
    dialog.render(true);
  });
}

async function configureParam() {
  let param;
  if (params.length === 1) param = params[0];
  else {
    let i = await promptParamChoice(params);
    if (i < 0) return;
    param = params[i];
  }

  if (param)
    game.modules.get('multi-token-edit').api.showGenericForm(param, param.filterType ?? 'TMFX', {
      callback: async (obj) => {
        const confirmation = await Dialog.confirm({
          content: 'Continue Editing?',
        });

        if (confirmation) {
          configureParam();
        } else {
          let content = `
            <textarea style="width:100%; height: 300px;">let params = ${JSON.stringify(
              params,
              null,
              2
            )};</textarea>
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
      },
      inputChangeCallback: (selected) => {
        mergeObject(param, selected, { inplace: true });
        TokenMagic.addUpdateFiltersOnSelected(deepClone(params));
      },
    });
}

configureParam();
