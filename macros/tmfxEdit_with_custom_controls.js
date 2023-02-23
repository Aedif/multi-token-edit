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
      customControls: CUSTOM_CONTROLS,
      callback: async (obj) => configureParam(),
      inputChangeCallback: async (selected) => {
        if (selected.imagePath !== param.imagePath) {
          await TokenMagic.deleteFiltersOnSelected(param.filterId);
        }
        mergeObject(param, selected, { inplace: true });
        TokenMagic.addUpdateFiltersOnSelected(deepClone(params));
      },
    });
}

// Manually Defined controls for various filters
// If you wish to replace these with your own controls either set CUSTOM_CONTROLS to {} or
// extract your controls using `game.settings.get("multi-token-edit", "customControls")`
const CUSTOM_CONTROLS = {
  field: {
    shieldType: {
      range: true,
      min: '0',
      max: '13',
      step: '1',
    },
    blend: {
      range: true,
      min: '0',
      max: '15',
      step: '1',
    },
    scale: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    radius: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    intensity: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    lightAlpha: {
      range: true,
      min: '0',
      max: '50',
      step: '0.1',
    },
    gridPadding: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    lightSize: {
      range: true,
      min: '0',
      max: '20',
      step: '0.1',
    },
    animated: {
      time: {
        speed: {
          range: true,
          min: '0',
          max: '0.05',
          step: '0.0001',
        },
      },
    },
  },
  fire: {
    fireBlend: {
      range: true,
      min: '0',
      max: '13',
      step: '1',
    },
    blend: {
      range: true,
      min: '0',
      max: '13',
      step: '1',
    },
    animated: {
      intensity: {
        animType: {
          select: true,
          options: [
            'syncChaoticOscillation',
            'syncSinOscillation',
            'syncCosOscillation',
            'chaoticOscillation',
            'halfSinOscillation',
            'sinOscillation',
            'halfCosOscillation',
            'cosOscillation',
            'syncColorOscillation',
            'halfColorOscillation',
            'colorOscillation',
          ],
        },
        val2: {
          range: true,
          min: '0',
          max: '5',
          step: '0.1',
        },
        val1: {
          range: true,
          min: '0',
          max: '5',
          step: '0.1',
        },
        loopDuration: {
          range: true,
          min: '0',
          max: '50000',
          step: '100',
        },
      },
      amplitude: {
        animType: {
          select: true,
          options: [
            'syncChaoticOscillation',
            'syncSinOscillation',
            'syncCosOscillation',
            'chaoticOscillation',
            'halfSinOscillation',
            'sinOscillation',
            'halfCosOscillation',
            'cosOscillation',
            'syncColorOscillation',
            'halfColorOscillation',
            'colorOscillation',
          ],
        },
        loopDuration: {
          range: true,
          min: '0',
          max: '50000',
          step: '100',
        },
        val1: {
          range: true,
          min: '0',
          max: '5',
          step: '0.1',
        },
        val2: {
          range: true,
          min: '0',
          max: '5',
          step: '0.1',
        },
      },
    },
    intensity: {
      range: true,
      min: '0',
      max: '100',
      step: '0.1',
    },
  },
  electric: {
    blend: {
      range: true,
      min: '0',
      max: '13',
      step: '1',
    },
  },
  xglow: {
    auraType: {
      range: true,
      min: '0',
      max: '2',
      step: '1',
    },
    scale: {
      range: true,
      min: '0',
      max: '30',
      step: '0.1',
    },
    auraIntensity: {
      range: true,
      min: '0',
      max: '20',
      step: '0.1',
    },
    subAuraIntensity: {
      range: true,
      min: '0',
      max: '20',
      step: '0.1',
    },
    threshold: {
      range: true,
      min: '0',
      max: '2',
      step: '0.01',
    },
  },
  glow: {
    outerStrength: {
      range: true,
      min: '0',
      max: '50',
      step: '0.1',
    },
    innerStrength: {
      range: true,
      min: '0',
      max: '50',
      step: '0.1',
    },
    padding: {
      range: true,
      min: '0',
      max: '100',
      step: '1',
    },
  },
  zapshadow: {
    alphaTolerance: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
  },
};

configureParam();
