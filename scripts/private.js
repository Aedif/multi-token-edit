import { SPECIES_GENERATORS } from './generator/fantasticSpeciesGenerator.js';
import { GROUP_GENERATORS } from './generator/groupNamesGenerator.js';
import { NAME_GENERATOR } from './generator/nameGenerator.js';
import { TAVERN_GENERATOR } from './generator/tavernGenerator.js';
import Color from './color/color.js';
import {
  hexToRgb,
  isImage,
  isVideo,
  nearestStep,
  randomizeColor,
  recursiveTraverse,
  rgbToHex,
  shuffleArray,
  randomPlace,
  emptyObject,
  getData,
  wildcardStringReplace,
} from './utils.js';

export const IS_PRIVATE = false;

export default class RandomizerForm extends FormApplication {
  constructor(title, control, configApp, options) {
    let height = undefined;
    let width = 410;

    if (options.textForm) {
      width = 465;
      // height = 380;
    } else if (options.selectForm) {
      height = 210;
    } else if (options.imageForm) {
      width = 455;
    }

    super(
      {},
      {
        title,
        width,
        height,
      }
    );

    this.configuration = options;
    this.control = control;
    this.configApp = configApp;
    this.fieldName = control.attr('name');

    if (configApp.randomizeFields && configApp.randomizeFields[this.fieldName]) {
      if (options.rangeForm) {
        let ctrl = deepClone(configApp.randomizeFields[this.fieldName]);
        ctrl.minVal = ctrl.min;
        ctrl.maxVal = ctrl.max;
        delete ctrl.min;
        delete ctrl.max;
        mergeObject(this.configuration, ctrl);
      } else {
        mergeObject(this.configuration, configApp.randomizeFields[this.fieldName]);
      }
      this.configuration.existing = true;
    }
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-randomizer-form',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/randomizerForm.html',
      resizable: true,
      minimizable: false,
    });
  }

  get id() {
    return `mass-edit-randomizer-${this.fieldName}`;
  }

  async getData(options) {
    const data = super.getData(options);
    mergeObject(data, this.configuration);

    if (data.step != null) {
      if (data.step === 'any' || data.step === '') {
        data.step = 0.1;
      }
    }
    data.tokenVariantsActive = game.modules.get('token-variants')?.active;

    data.fieldName = this.fieldName;
    data.title = this.title;

    // Assign default values for some specific fields
    if (this.configuration.numberForm && !this.configuration.existing) {
      if (
        [
          'rotation',
          'sightAngle',
          'sight.angle',
          'light.angle',
          'config.angle',
          'flags.advanced-drawing-tools.fillStyle.transform.rotation',
        ].includes(this.fieldName)
      ) {
        data.min = 0;
        data.max = 360;
      } else if (
        [
          'dimSight',
          'brightSight',
          'light.dim',
          'light.bright',
          'config.dim',
          'config.bright',
        ].includes(this.fieldName)
      ) {
        data.min = 0;
      }
    }
    if (this.configuration.textForm) {
      data.generators = {};
      const addGeneratorGroup = function (group, generators) {
        data.generators[group] = Object.keys(generators).map((k) => {
          return {
            func: k,
            label: k
              .substring(3, k.length)
              .replace(/([A-Z])/g, ' $1')
              .trim(),
          };
        });
      };

      addGeneratorGroup('Fantasy', NAME_GENERATOR);
      addGeneratorGroup('Species', SPECIES_GENERATORS);
      addGeneratorGroup('Groups', GROUP_GENERATORS);
      addGeneratorGroup('Taverns', TAVERN_GENERATOR);

      if (this.configuration.strings) {
        data.strings = this.configuration.strings.join('\n');
      }
      data.duplicates = this.configuration.method === 'random';
      data.find = this.configuration.find ?? this.configuration.current;
      data.replace = this.configuration.replace ?? this.configuration.current;
    }

    if (this.configuration.imageForm) {
      if (this.configuration.images) {
        data.images = this.configuration.images.join('\n');
      }
      data.find = this.configuration.find ?? this.configuration.current;
      data.replace = this.configuration.replace ?? this.configuration.current;
    }

    if (this.configuration.rangeForm && !this.configuration.existing) {
      data.minVal = this.configuration.current;
      data.maxVal = this.configuration.current;
    }
    if (this.configuration.coordinateForm) {
      data.minX = this.configuration.x;
      data.maxX = this.configuration.x;
      data.minY = this.configuration.y;
      data.maxY = this.configuration.y;
      data.stepY = this.configuration.stepY ?? this.configuration.step;
      data.stepX = this.configuration.stepX ?? this.configuration.step;
      if (this.configuration.boundingBox) {
        let box = this.configuration.boundingBox;
        data.minX = box.x;
        data.maxX = box.x + box.width;
        data.minY = box.y;
        data.maxY = box.y + box.height;
      }
    }
    if (this.configuration.selectForm) {
      this.configuration.options.forEach((opt) => {
        opt.selected =
          !this.configuration.selection ||
          this.configuration.selection.find((sel) => sel == opt.value) != null;
      });
    }
    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    const docName = this.configApp.object?.documentName;
    $(html)
      .find('.folder-picker')
      .click(() => {
        new FilePicker({
          type: 'folder',
          callback: async (path, fp) => {
            let files = [];
            if ($(html).find('.subfolders').is(':checked')) {
              files = await recursiveTraverse(path, fp.activeSource, fp.result.bucket);
            } else if (fp.result?.files.length) {
              files = fp.result.files;
            }
            const images_ta = $(html).find('.images');
            images_ta.val(
              images_ta.val().trim() +
                '\n' +
                files.filter((f) => isImage(f) || isVideo(f)).join('\n')
            );
          },
        }).render(true);
      });
    html.find('.token-variants').click((ev) => {
      if (game.modules.get('token-variants')?.active && docName) {
        let type = docName;
        if (type === 'Actor') type = 'Portrait';
        else if (type === 'MeasuredTemplate') type = 'Tile';
        game.modules.get('token-variants').api.showArtSelect('image', {
          searchType: type,
          multipleSelection: true,
          callback: (results) => {
            if (!Array.isArray(results)) results = [results];
            const images_ta = $(html).find('.images');
            images_ta.val(
              images_ta.val().trim() +
                '\n' +
                results.filter((f) => isImage(f) || isVideo(f)).join('\n')
            );
          },
        });
      }
    });
    $(html)
      .find('.generate')
      .click(() => {
        const generator = $(html).find('.generator').val();

        for (const group of [
          NAME_GENERATOR,
          SPECIES_GENERATORS,
          GROUP_GENERATORS,
          TAVERN_GENERATOR,
        ]) {
          if (generator in group) {
            const names = [];
            for (let i = 0; i < 20; i++) {
              names.push(group[generator]());
            }

            $(html)
              .find('.strings')
              .val($(html).find('.strings').val() + '\n' + names.join('\n'));
            break;
          }
        }
      });
    $(html).find('.pickBounds').click(this._onPickBounds.bind(this));
    $(html).find('.snapToGrid').click(this._onSnapToGrid.bind(this));

    // Color gradient preview
    $(html).on('input', 'input[type="color"]', (e) => {
      $(e.target).siblings('.color').val(e.target.value).trigger('input');
    });

    if (this.configuration.textForm) {
      $(html).on('input', '[name="method"]', (e) => {
        if (e.target.value === 'findAndReplace') {
          html.find('.string-list').hide();
          html.find('.find-and-replace').show();
        } else {
          html.find('.string-list').show();
          html.find('.find-and-replace').hide();
        }
      });
      $(html).find('[name="method"]').trigger('input');
    } else if (this.configuration.imageForm) {
      $(html).on('input', '[name="method"]', (e) => {
        if (e.target.value === 'findAndReplace') {
          html.find('.image-controls').hide();
          html.find('.find-and-replace').show();
        } else {
          html.find('.image-controls').show();
          html.find('.find-and-replace').hide();
        }
      });
      $(html).find('[name="method"]').trigger('input');
    }

    if (this.configuration.colorForm) {
      const updateColorStrip = function (e) {
        const form = $(e.target).closest('form');
        if (Color !== undefined) {
          const c1 = form.find('[name="color1"]').val() || '#000000';
          const c2 = form.find('[name="color2"]').val() || '#FFFFFF';
          const space = form.find('[name="space"]').val() || 'lch';
          const hue = form.find('[name="hue"]').val() || 'shorter';
          let r = Color.range(c2, c1, { space: space, hue: hue });
          let stops = Color.steps(r, { steps: 5, maxDeltaE: 3 });
          let element = form.find('.colorStrip').get(0);
          element.style.background = `linear-gradient(to right, ${stops
            .map((c) => c.display())
            .join(', ')})`;
        }
      };

      var inputTimer; //timer identifier

      $(html).on('input', '.color, [name="method"], [name="space"], [name="hue"]', (e) => {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => updateColorStrip(e), 500);
      });
      // Respond better to DF Architect Color Picker
      html.on('focusout', '.df-arch-colourpicker', (e) => {
        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => updateColorStrip(e), 500);
      });

      // Draw the initial color range
      $(html).find('[name="method"]').trigger('input');
    }
  }

  _onPickBounds(event) {
    event.preventDefault();

    if (!canvas.ready) {
      return;
    }

    this.minimize();
    this.configApp.minimize();

    const t = this;
    canvas.stage.addChild(getPickerOverlay()).once('pick', (position) => {
      const form = $(event.target).closest('form');

      const minX = Math.min(position.start.x, position.end.x);
      const maxX = Math.max(position.start.x, position.end.x);
      const minY = Math.min(position.start.y, position.end.y);
      const maxY = Math.max(position.start.y, position.end.y);

      form.find('[name="minX"]').val(Math.floor(minX));
      form.find('[name="maxX"]').val(Math.floor(maxX));
      form.find('[name="minY"]').val(Math.floor(minY));
      form.find('[name="maxY"]').val(Math.floor(maxY));
      t.maximize();
      t.configApp.maximize();

      if (game.settings.get('multi-token-edit', 'autoSnap')) {
        t._onSnapToGrid(event);
      }
    });
  }

  _onSnapToGrid(event) {
    const form = $(event.target).closest('form');
    form.find('[name="minX"], [name="maxX"]').each(function () {
      this.value = nearestStep(this.value, canvas.grid.w);
    });
    form.find('[name="minY"], [name="maxY"]').each(function () {
      this.value = nearestStep(this.value, canvas.grid.h);
    });
    form.find('[name="stepX"]').val(canvas.grid.w);
    form.find('[name="stepY"]').val(canvas.grid.h);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const fieldName = this.control.attr('name');
    if (event.submitter?.value === 'delete') {
      delete this.configApp.randomizeFields[fieldName];
      deselectField(this.control, this.configApp);
      return;
    }

    if (this.configuration.selectForm) {
      if (formData[fieldName]?.length) {
        this.configApp.randomizeFields[fieldName] = {
          type: 'select',
          method: 'random',
          selection: formData[fieldName].map((v) =>
            this.configuration.dtype === 'Number' ? Number(v) : v
          ),
        };
      }
    } else if (this.configuration.numberForm || this.configuration.rangeForm) {
      if (formData.min != null && formData.max != null) {
        this.configApp.randomizeFields[fieldName] = {
          type: 'number',
          method: formData.method,
          min: formData.min,
          max: formData.max,
          step: formData.step,
        };
      }
    } else if (this.configuration.booleanForm) {
      this.configApp.randomizeFields[fieldName] = {
        type: 'boolean',
        method: 'random',
      };
    } else if (this.configuration.colorForm) {
      if (formData.color1 && formData.color2) {
        this.configApp.randomizeFields[fieldName] = {
          type: 'color',
          method: formData.method,
          space: formData.space,
          hue: formData.hue,
          color1: formData.color1,
          color2: formData.color2,
        };
      }
    } else if (this.configuration.imageForm) {
      if (formData.method === 'findAndReplace') {
        this.configApp.randomizeFields[fieldName] = {
          type: 'text',
          method: formData.method,
          find: formData.find,
          replace: formData.replace,
        };
      } else if (formData.images) {
        const images = formData.images
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((img) => img.trim())
          .filter((img) => isImage(img) || isVideo(img));
        this.configApp.randomizeFields[fieldName] = {
          type: 'image',
          method: formData.method,
          images: images,
        };
      }
    } else if (this.configuration.textForm) {
      if (formData.method === 'findAndReplace') {
        this.configApp.randomizeFields[fieldName] = {
          type: 'text',
          method: formData.method,
          find: formData.find,
          replace: formData.replace,
        };
      } else if (formData.strings) {
        const strings = formData.strings
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s);
        this.configApp.randomizeFields[fieldName] = {
          type: 'text',
          method: formData.duplicates ? 'random' : 'unique',
          strings: strings,
        };
      }
    } else if (this.configuration.coordinateForm) {
      if (
        formData.minX != null &&
        formData.maxX != null &&
        formData.minY != null &&
        formData.maxY != null
      ) {
        const minX = Math.min(formData.minX, formData.maxX);
        const maxX = Math.max(formData.minX, formData.maxX);
        const minY = Math.min(formData.minY, formData.maxY);
        const maxY = Math.max(formData.minY, formData.maxY);
        const boundingBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        this.configApp.randomizeFields['x'] = {
          type: 'coordinate',
          method: 'noOverlap',
          boundingBox: boundingBox,
          stepX: formData.stepX,
          stepY: formData.stepY,
        };
        this.configApp.randomizeFields['y'] = {
          type: 'coordinate',
          method: 'noOverlap',
          boundingBox: boundingBox,
          stepX: formData.stepX,
          stepY: formData.stepY,
        };
        selectField(this.configuration.controlY);
      } else {
        deselectField(this.configuration.controlY, this.configApp);
      }
    }

    if (this.configApp.randomizeFields[fieldName]) {
      selectField(this.control);
    } else {
      deselectField(this.control, this.configApp);
    }

    if (this.configApp.updateBrushFields) this.configApp.updateBrushFields();
  }
}

export function applyRandomization(updates, objects, randomizeFields) {
  // See if any field is to be randomized
  if (!randomizeFields || emptyObject(randomizeFields)) return;

  let requiresCoordRandomization = false;

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    for (const field of Object.keys(update)) {
      if (field in randomizeFields) {
        const obj = randomizeFields[field];

        if (obj.type === 'select') {
          update[field] = obj.selection[Math.floor(Math.random() * obj.selection.length)];
        } else if (obj.type === 'number') {
          if (obj.step === 'any')
            obj.step = 1; // default to integer 1 just to avoid very large decimals
          else obj.step = Number(obj.step);

          if (obj.method === 'interpolate') {
            const stepsInRange = (obj.max - obj.min) / obj.step + 1;
            update[field] = (i % stepsInRange) * obj.step + obj.min;
          } else if (obj.method === 'interpolateReverse') {
            const stepsInRange = (obj.max - obj.min) / obj.step;
            update[field] = (stepsInRange - (i % (stepsInRange + 1))) * obj.step + obj.min;
          } else {
            const stepsInRange =
              (obj.max - obj.min + (Number.isInteger(obj.step) ? 1 : 0)) / obj.step;
            update[field] = Math.floor(Math.random() * stepsInRange) * obj.step + obj.min;
          }
        } else if (obj.type === 'boolean') {
          update[field] = Math.random() < 0.5;
        } else if (obj.type === 'color') {
          if (Color !== undefined) {
            let color1 = new Color(obj.color1);
            let color2 = new Color(obj.color2);
            const space = obj.space || 'srgb';
            const hue = obj.hue || 'shorter';
            let range = color1.range(color2, {
              space: space, // interpolation space
              hue: hue,
              outputSpace: 'srgb',
            });
            let rgb3;
            if (obj.method === 'interpolate') {
              rgb3 = range(1 - (i + 1) / updates.length);
            } else if (obj.method === 'interpolateReverse') {
              rgb3 = range((i + 1) / updates.length);
            } else {
              rgb3 = range(Math.random());
            }
            let hexColor = rgb3.toString({ format: 'hex' });
            if (hexColor.length < 7) {
              // 3 char hex, duplicate chars
              hexColor =
                '#' +
                hexColor[1] +
                hexColor[1] +
                hexColor[2] +
                hexColor[2] +
                hexColor[3] +
                hexColor[3];
            }
            update[field] = hexColor;
          } else {
            const rgb1 = hexToRgb(obj.color1);
            const rgb2 = hexToRgb(obj.color2);
            const randomRGB = randomizeColor(rgb1, rgb2);
            update[field] = rgbToHex(randomRGB);
          }
        } else if (obj.type === 'image') {
          if (obj.method === 'sequential') {
            update[field] = obj.images[i % obj.images.length];
          } else {
            update[field] = obj.images[Math.floor(Math.random() * obj.images.length)];
          }
        } else if (obj.type === 'text') {
          if (obj.method === 'findAndReplace') {
            const data = flattenObject(getData(objects[i]).toObject());
            if (!data[field] && !obj.find) {
              update[field] = obj.replace;
            } else if (data[field]) {
              // special handling for Tagger tags
              if (field === 'flags.tagger.tags') {
                update[field] = wildcardStringReplace(obj.find, obj.replace, data[field].join(','));
              } else {
                update[field] = wildcardStringReplace(obj.find, obj.replace, data[field]);
              }
            }
          } else {
            if (obj.method === 'unique') {
              if (!obj.shuffled) {
                shuffleArray(obj.strings);
                obj.shuffled = true;
                obj.i = -1;
              }
              obj.i++;
              update[field] = obj.strings[obj.i % obj.strings.length];
            } else {
              update[field] = obj.strings[Math.floor(Math.random() * obj.strings.length)];
            }
          }
        } else if (obj.type === 'coordinate') {
          requiresCoordRandomization = true;
        }
      }
    }
  }

  if (requiresCoordRandomization) {
    let coordCtrl;

    // Sort placeables based on size
    let pUpdates = [];
    for (let i = 0; i < objects.length; i++) {
      pUpdates.push({ p: objects[i], update: updates[i] });
    }
    pUpdates.sort(
      (a, b) =>
        (b.p.w ?? b.p.width ?? 0) +
        (b.p.h ?? b.p.height ?? 0) -
        (a.p.w ?? a.p.width ?? 0) -
        (a.p.h ?? a.p.height ?? 0)
    );

    for (const pUpdate of pUpdates) {
      const obj = randomizeFields.x ?? randomizeFields.y;
      if (obj.method === 'noOverlap') {
        if (!coordCtrl) {
          coordCtrl = {
            freeId: 0,
            boundingBox: obj.boundingBox,
            freeRectangles: { 0: obj.boundingBox },
            stepX: obj.stepX,
            stepY: obj.stepY,
          };
        }
        const [x, y] = randomPlace(pUpdate.p, coordCtrl);
        pUpdate.update.x = x;
        pUpdate.update.y = y;
      }
    }
  }
}

// Show a dialog to select randomization settings for this form-group
export function showRandomizeDialog(formGroup, configApp) {
  const singleInput = formGroup.find('[name]').length === 1;

  // Special handling for coordinates
  // Depending on the placeable both x and y coordinates can either be set
  // under the same form or 2 separate forms. Either way we want to randomize
  // them both at the same time
  let ignoreXY = false;
  if (formGroup.find('[name="x"]').length || formGroup.find('[name="y"]').length) {
    ignoreXY = true;
    const inputX = formGroup.closest('form').find('[name="x"]');
    const inputY = formGroup.closest('form').find('[name="y"]');
    processCoordinate(inputX, inputY, configApp, 'Coordinates (X, Y)');
  }

  // Display randomize dialogs for each named element
  formGroup.find('[name]').each(function (_) {
    if (ignoreXY && ['x', 'y'].includes(this.name)) {
      // Do nothing
    } else {
      const type = this.nodeName;
      let label = this.name;
      if ($(this).prev('label').length) {
        label = $(this).prev('label').html();
      } else if (formGroup.find('label').length) {
        label = formGroup.find('label').first().html();
      }

      if (type === 'SELECT') {
        processSelect($(this), configApp, label);
      } else if (type === 'INPUT') {
        processInput($(this), configApp, label, singleInput);
      } else {
        console.log(label, type);
      }
    }
  });
}

// Handle <input> tag
function processInput(input, configApp, label, singleInput) {
  const type = input.attr('type');
  if (type === 'number' || (type === 'text' && input.attr('data-dtype') === 'Number')) {
    showRandomNumberDialog(input, configApp, label);
  } else if (type === 'range') {
    showRandomRangeDialog(input, configApp, label);
  } else if (type === 'checkbox') {
    showRandomBoolDialog(input, configApp, label, singleInput);
  } else if (type === 'text' && input.hasClass('color')) {
    showRandomColorDialog(input, configApp, label);
  } else if (type === 'text' && input.hasClass('image')) {
    showRandomImageDialog(input, configApp, label);
  } else if (type === 'text') {
    showRandomTextDialog(input, configApp, label);
  } else if (input.attr('list')) {
    processList(input, configApp, label);
  }
}

function processCoordinate(inputX, inputY, configApp, label) {
  const x = inputX.val() ?? 0;
  const y = inputY.val() ?? 0;
  const step = 1;
  new RandomizerForm(label, inputX, configApp, {
    coordinateForm: true,
    x: x,
    y: y,
    step: step,
    controlY: inputY,
  }).render(true);
}

function showRandomTextDialog(input, configApp, label) {
  new RandomizerForm(label, input, configApp, { textForm: true, current: input.val() }).render(
    true
  );
}

function showRandomImageDialog(input, configApp, label) {
  new RandomizerForm(label, input, configApp, { imageForm: true, current: input.val() }).render(
    true
  );
}

function showRandomColorDialog(input, configApp, label) {
  new RandomizerForm(label, input, configApp, {
    colorForm: true,
    color1: '#ff0000',
    color2: '#ff0000',
  }).render(true);
}

// Show dialog for checkboxes
function showRandomBoolDialog(input, configApp, label, singleInput) {
  if (singleInput) {
    const fieldName = input.attr('name');
    configApp.randomizeFields[fieldName] = {
      type: 'boolean',
      method: 'random',
    };
    selectField(input);
  } else {
    new RandomizerForm(label, input, configApp, { booleanForm: true }).render(true);
  }
}

// show dialog for number inputs
function showRandomNumberDialog(input, configApp, label) {
  const current = input.val() ?? 0;
  const step = input.attr('step') ?? 1;
  const min = input.attr('min') ?? current;
  const max = input.attr('max') ?? current;

  new RandomizerForm(label, input, configApp, {
    numberForm: true,
    min: min,
    max: max,
    step: step,
    dtype: 'Number',
  }).render(true);
}

// show dialog for range inputs
function showRandomRangeDialog(input, configApp, label) {
  const current = input.val() ?? 0;
  const step = input.attr('step') ?? 1;
  const min = input.attr('min') ?? 0;
  const max = input.attr('max') ?? 10;

  new RandomizerForm(label, input, configApp, {
    rangeForm: true,
    min: min,
    max: max,
    current: current,
    step: step,
    dtype: 'Number',
  }).render(true);
}

function processSelect(select, configApp, label) {
  const options = [];
  const dtype = select.attr('data-dtype') ?? 'String';
  select.find('option').each(function (_) {
    options.push({ value: this.value, label: this.innerHTML });
  });

  new RandomizerForm(label, select, configApp, {
    selectForm: true,
    options: options,
    dtype: dtype,
  }).render(true);
}

function processList(input, configApp, label) {
  const dataList = input.closest('.form-group').find(`#${input.attr('list')}`);
  const options = [];
  dataList.find('option').each(function (_) {
    options.push({ value: this.value, label: this.value });
  });

  new RandomizerForm(label, input, configApp, {
    selectForm: true,
    options: options,
    dtype: 'String',
  }).render(true);
}

function selectField(control) {
  const formGroup = control.closest('.form-group');
  formGroup.find('.mass-edit-checkbox input').prop('checked', true).trigger('change');
  formGroup.find('.mass-edit-randomize').addClass('active');
}

function deselectField(control, configApp) {
  const formGroup = control.closest('.form-group');

  let allRandomizedRemoved = true;
  if (configApp) {
    formGroup.find('[name]').each(function () {
      if (allRandomizedRemoved)
        allRandomizedRemoved = !Boolean(configApp.randomizeFields[this.name]);
    });
  }

  if (allRandomizedRemoved) {
    formGroup.find('.mass-edit-checkbox input').prop('checked', false).trigger('change');
    formGroup.find('.mass-edit-randomize').removeClass('active');
  }
}

export function selectRandomizerFields(form, fields) {
  for (const key of Object.keys(fields)) {
    selectField(form.find(`[name="${key}"]`));
  }
}

let pickerOverlay;
let boundStart;
let boundEnd;

function getPickerOverlay() {
  if (pickerOverlay) {
    pickerOverlay.destroy(true);
  }

  pickerOverlay = new PIXI.Container();
  pickerOverlay.hitArea = canvas.dimensions.rect;
  pickerOverlay.cursor = 'crosshair';
  pickerOverlay.interactive = true;
  pickerOverlay.zIndex = Infinity;
  pickerOverlay.on('remove', () => pickerOverlay.off('pick'));
  pickerOverlay.on('mousedown', (event) => {
    boundStart = event.data.getLocalPosition(pickerOverlay);
  });
  pickerOverlay.on('mouseup', (event) => (boundEnd = event.data.getLocalPosition(pickerOverlay)));
  pickerOverlay.on('click', (event) => {
    pickerOverlay.emit('pick', { start: boundStart, end: boundEnd });
    pickerOverlay.parent.removeChild(pickerOverlay);
  });
  return pickerOverlay;
}
