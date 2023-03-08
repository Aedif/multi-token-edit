export const CUSTOM_CONTROLS = {
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
      max: '16',
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
    thickness: {
      range: true,
      min: '0',
      max: '20',
      step: '0.1',
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
    alpha: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
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
  sprite: {
    blendMode: {
      range: true,
      min: '0',
      max: '16',
      step: '1',
    },
    gridPadding: {
      range: true,
      min: '0',
      max: '5',
      step: '0.1',
    },
    scaleX: {
      range: true,
      min: '0',
      max: '3',
      step: '0.01',
    },
    scaleY: {
      range: true,
      min: '0',
      max: '3',
      step: '0.01',
    },
    translationX: {
      range: true,
      min: '-1',
      max: '1',
      step: '0.001',
    },
    translationY: {
      range: true,
      min: '-1',
      max: '1',
      step: '0.001',
    },
    rotation: {
      range: true,
      min: '0',
      max: '360',
      step: '1',
    },
    alpha: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
  },
  xfire: {
    blend: {
      range: true,
      min: '0',
      max: '16',
      step: '1',
    },
    amplitude: {
      range: true,
      min: '0',
      max: '10',
      step: '0.01',
    },
    dispersion: {
      range: true,
      min: '0',
      max: '20',
      step: '0.1',
    },
    scaleX: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    scaleY: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    animated: {
      time: {
        speed: {
          range: true,
          min: '-0.0050',
          max: '0.0050',
          step: '0.0001',
        },
      },
    },
  },
  transform: {
    gridPadding: {
      range: true,
      min: '0',
      max: '50',
      step: '0.1',
    },
    scaleX: {
      range: true,
      min: '0',
      max: '5',
      step: '0.1',
    },
    scaleY: {
      range: true,
      min: '0',
      max: '5',
      step: '0.1',
    },
  },
  ascii: {
    animated: {
      size: {
        val1: {
          range: true,
          min: '-5',
          max: '5',
          step: '0.01',
        },
        val2: {
          range: true,
          min: '-5',
          max: '5',
          step: '0.01',
        },
      },
    },
    size: {
      range: true,
      min: '1',
      max: '64',
      step: '1',
    },
  },
  dot: {
    scale: {
      range: true,
      min: '0',
      max: '10',
      step: '0.1',
    },
    angle: {
      range: true,
      min: '0',
      max: '360',
      step: '1',
    },
  },
  godray: {
    blendMode: {
      range: true,
      min: '0',
      max: '20',
      step: '1',
    },
    padding: {
      range: true,
      min: '-5',
      max: '50',
      step: '0.1',
    },
  },
  rgbSplit: {
    redX: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
    redY: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
    greenX: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
    greenY: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
    blueX: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
    blueY: {
      range: true,
      min: '-50',
      max: '50',
      step: '1',
    },
  },
  polymorph: {
    type: {
      range: true,
      min: '0',
      max: '9',
      step: '1',
    },
  },
  shadow: {
    blur: {
      range: true,
      min: '0',
      max: '20',
      step: '1',
    },
  },
  flood: {
    billowy: {
      range: true,
      min: '0',
      max: '5',
      step: '0.01',
    },
    tintIntensity: {
      range: true,
      min: '0.0',
      max: '1',
      step: '0.01',
    },
    glint: {
      range: true,
      min: '0',
      max: '1',
      step: '0.01',
    },
    scale: {
      range: true,
      min: '5',
      max: '500',
      step: '1',
    },
    animated: {
      time: {
        speed: {
          range: true,
          min: '0.00001',
          max: '0.001',
          step: '0.00001',
        },
      },
    },
  },
};
