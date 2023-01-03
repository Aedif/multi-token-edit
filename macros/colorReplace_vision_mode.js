/**
 * Configures a Color Replace vision mode for the currently selected token.
 * Once the changes are applied a world script is generated so that the vision
 * mode can be used outside this macro.
 */

const data = {
  'Colors->': 16746496,
  '<-Colors': 16711854,
  hue: 0,
  saturation: 0,
  brightness: 0,
  mixHue: false,
  mixSaturation: true,
  mixBrightness: false,
  factor: 1.37,
};

async function updateFilter() {
  let lowerThanColor = new Color(data['Colors->']).hsv[0];
  let higherThanColor = new Color(data['<-Colors']).hsv[0];

  const PREC = 6;

  let diff = lowerThanColor - higherThanColor;
  if (lowerThanColor < higherThanColor) {
    diff = 1.0 - higherThanColor + lowerThanColor;
  }

  let halfDiff = diff / 2.0;
  let mid = (higherThanColor + halfDiff) % 1.0;

  VisualEffectsMaskingFilter.POST_PROCESS_TECHNIQUES['COLOR_REPLACE'] = {
    id: 'COLOR_REPLACE',
    glsl: `
  
     vec3 c = finalColor.rgb;
  
     vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
     vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
     vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
     float d = q.x - min(q.w, q.y);
     float e = 1.0e-10;
     vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);

     float distance = min( abs( ${mid.toFixed(PREC)} - hsv.x), abs( 1.0 - ${mid.toFixed(
      PREC
    )} + hsv.x) );
     float percent = 1.0 - distance / ${halfDiff.toFixed(PREC)};

     if(percent > 0.0 && hsv.y > 0.05 && hsv.z > 0.05) {
      ${data.factor != 1.0 ? `percent = min(percent * ${data.factor.toFixed(2)}, 1.0);` : ''}
      vec3 target =  vec3(${data.hue.toFixed(PREC)}, ${data.saturation.toFixed(
      PREC
    )}, ${data.brightness.toFixed(PREC)});
  
      ${data.mixHue ? '' : 'target.x = hsv.x;\n'}${
      data.mixSaturation ? '' : 'target.y = hsv.y;\n'
    }${data.mixBrightness ? '' : 'target.z = hsv.z;\n'}
      hsv = mix(hsv, target, percent);
      vec4 Kl = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 L = abs(fract(hsv.rrr + Kl.xyz) * 6.0 - Kl.www);
      finalColor.rgb = hsv.b * mix(Kl.xxx, clamp(L - Kl.xxx, 0.0, 1.0), hsv.g);
     }
     `,
  };

  console.log(VisualEffectsMaskingFilter.POST_PROCESS_TECHNIQUES['COLOR_REPLACE'].glsl);

  CONFIG.Canvas.visionModes['color_replace'] = new VisionMode({
    id: 'color_replace',
    label: 'Color Replace',
    lighting: {
      background: {
        postProcessingModes: ['COLOR_REPLACE'],
      },
      illumination: {
        postProcessingModes: ['COLOR_REPLACE'],
      },
      coloration: {
        postProcessingModes: ['COLOR_REPLACE'],
      },
    },
    vision: {
      defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
    },
  });

  await _token.document.update({ 'sight.visionMode': 'basic' });
  _token.document.update({ 'sight.visionMode': 'color_replace' });
}

function displayWorldScript() {
  let content = `
  <textarea style="width:100%; height: 300px;" readonly>
  Hooks.on('init', () => {
    VisualEffectsMaskingFilter.POST_PROCESS_TECHNIQUES['COLOR_REPLACE'] = {
      id: 'COLOR_REPLACE',
      glsl: \`
        ${VisualEffectsMaskingFilter.POST_PROCESS_TECHNIQUES['COLOR_REPLACE'].glsl}
      \`,
    };
  
    CONFIG.Canvas.visionModes['color_replace'] = new VisionMode({
      id: 'color_replace',
      label: 'Color Replace',
      lighting: {
        background: {
          postProcessingModes: ['COLOR_REPLACE'],
        },
        illumination: {
          postProcessingModes: ['COLOR_REPLACE'],
        },
        coloration: {
          postProcessingModes: ['COLOR_REPLACE'],
        },
      },
      vision: {
        defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
      },
    });
  });
  </textarea>
  `;
  new Dialog({
    title: `World Script`,
    content: content,
    buttons: {
      close: {
        label: 'Close',
      },
    },
  }).render(true);
}

const CUSTOM_CONTROLS = {
  VISION_MODE: {
    hue: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
    saturation: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
    brightness: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
    min: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
    exp: {
      range: true,
      min: '1.4',
      max: '25',
      step: '0.1',
    },
    factor: {
      range: true,
      min: '1',
      max: '3',
      step: '0.01',
    },
  },
};

game.modules.get('multi-token-edit').api.showGenericForm(data, 'VISION_MODE', {
  customControls: CUSTOM_CONTROLS,
  callback: async (obj) => displayWorldScript(),
  inputChangeCallback: (selected) => {
    mergeObject(data, selected, { inplace: true });
    updateFilter();
  },
});
