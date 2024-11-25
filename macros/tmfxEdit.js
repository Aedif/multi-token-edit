/**
 * Edit Token Magic FX filters on currently selected placeable.
 * Edited filters can be saved as a new preset.
 */

const controlled = TokenMagic.getControlledPlaceables();
if (!controlled.length) return;

const filters = controlled[0].document.getFlag('tokenmagic', 'filters') || [];
if (!filters.length) return;

let params = filters.map((f) => {
  const tmParams = foundry.utils.deepClone(f.tmFilters.tmParams);
  ['placeableId', 'placeableType', 'filterInternalId', 'filterOwner', 'updateId'].forEach((k) => delete tmParams[k]);
  return tmParams;
});
if (!params.length) return;

async function savePreset() {
  let content = `<label>Macro</label>
  <textarea style="width:100%; height: 300px;" readonly>let params = ${JSON.stringify(params, null, 2)};

await TokenMagic.addUpdateFiltersOnSelected(params);</textarea>
  <label>Preset Name</label><input class="presetName" type="text" value="${
    params[0].filterId ?? params[0].filterType
  }"/>
  <hr><label>Library</label> <select class="library"><option value="tmfx-main">MAIN</option><option value="tmfx-template">TEMPLATE</option></select>
  `;
  new Dialog({
    title: `Params`,
    content: content,
    buttons: {
      save: {
        label: 'Save As Preset',
        callback: async (html) => {
          const name = html.find('.presetName').val();
          const library = html.find('.library').val();
          if (TokenMagic.getPreset({ name, library })) {
            TokenMagic.deletePreset({ name, library });
          }
          TokenMagic.addPreset({ name, library }, params);
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
        label: `<span style="background-color: ${params[i].enabled ? 'none' : 'rgba(255, 80, 80, 0.5)'};">${
          params[i].filterId
        } {${params[i].filterType}}</span>`,
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
        let dialogButtons = html.find('.dialog-button');
        dialogButtons.attr('title', 'Right-click to remove filter.\nMiddle-click to disable filter.');
        dialogButtons.contextmenu((event) => {
          dialog.close();
          const index = dialogButtons.index($(event.target).closest('.dialog-button'));
          TokenMagic.deleteFiltersOnSelected(params[index].filterId);
          params.splice(index, 1);
          configureParam();
        });
        dialogButtons.on('mouseup ', async (event) => {
          if (event.which === 2) {
            dialog.close();
            const index = dialogButtons.index($(event.target).closest('.dialog-button'));
            params[index].enabled = !params[index].enabled;
            await TokenMagic.addUpdateFiltersOnSelected(params);
            configureParam();
          }
        });
        html.find('.savePreset').click((event) => {
          savePreset();
          dialog.close();
        });
        html.find('.dialog-button').parent().css('display', 'block');
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
    MassEdit.showGenericForm(param, param.filterType ?? 'TMFX', {
      closeCallback: async (obj) => configureParam(),
      inputChangeCallback: (selected) => {
        foundry.utils.mergeObject(param, selected, { inplace: true });
        TokenMagic.addUpdateFiltersOnSelected(foundry.utils.deepClone(params));
      },
    });
}

configureParam();
