import Color from '../color/color.js';
import { getData, regexStringReplace, wildcardStringReplace } from '../utils.js';

export function selectField(control) {
  const formGroup = control.closest('.form-group');
  formGroup.find('.mass-edit-checkbox input').prop('checked', true).trigger('change');
  formGroup.find('.mass-edit-randomize').addClass('active');
}

export function deselectField(control, configApp) {
  const formGroup = control.closest('.form-group');

  let allRandomizedRemoved = true;
  if (configApp) {
    formGroup.find('[name]').each(function () {
      if (allRandomizedRemoved) allRandomizedRemoved = !Boolean(configApp.randomizeFields[this.name]);
    });
  }

  if (allRandomizedRemoved) {
    formGroup.find('.mass-edit-checkbox input').prop('checked', false).trigger('change');
    formGroup.find('.mass-edit-randomize').removeClass('active');
  }
}

export function selectRandomizerFields(form, fields) {
  if (!fields) return;
  for (const key of Object.keys(fields)) {
    selectField(form.find(`[name="${key}"]`));
  }
}

export function applyRandomization(updates, objects, randomizeFields) {
  // See if any field is to be randomized
  if (!randomizeFields || isEmpty(randomizeFields)) return;

  let requiresCoordRandomization = false;

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    for (const field of Object.keys(update)) {
      if (field in randomizeFields) {
        const obj = randomizeFields[field];

        if (obj.type === 'select') {
          update[field] = obj.selection[Math.floor(Math.random() * obj.selection.length)];
        } else if (obj.type === 'number') {
          if (obj.step === 'any') obj.step = 1; // default to integer 1 just to avoid very large decimals
          else obj.step = Number(obj.step);

          if (obj.method === 'interpolate') {
            const stepsInRange = (obj.max - obj.min) / obj.step + 1;
            update[field] = (i % stepsInRange) * obj.step + obj.min;
          } else if (obj.method === 'interpolateReverse') {
            const stepsInRange = (obj.max - obj.min) / obj.step;
            update[field] = (stepsInRange - (i % (stepsInRange + 1))) * obj.step + obj.min;
          } else {
            const stepsInRange = (obj.max - obj.min + (Number.isInteger(obj.step) ? 1 : 0)) / obj.step;
            update[field] = Math.floor(Math.random() * stepsInRange) * obj.step + obj.min;
          }
        } else if (obj.type === 'boolean') {
          update[field] = Math.random() < 0.5;
        } else if (obj.type === 'color') {
          // Convert to new format if needed
          if (obj.color1) {
            obj.colors = [
              { hex: obj.color1, offset: 0 },
              { hex: obj.color2, offset: 100 },
            ];
          }

          // If space is discrete we simple choose a color, no blending required
          if (obj.space === 'discrete') {
            if (obj.method === 'interpolate') {
              update[field] = obj.colors[i % obj.colors.length].hex;
            } else if (obj.method === 'interpolateReverse') {
              update[field] = obj.colors[obj.colors.length - 1 - (i % obj.colors.length)].hex;
            } else {
              update[field] = obj.colors[Math.floor(Math.random() * obj.colors.length)].hex;
            }
            continue;
          }

          let colors = obj.colors.map((c) => c);
          if (colors[0].offset > 0) {
            colors.unshift({ hex: colors[0].hex, offset: 0 });
          }
          if (colors[colors.length - 1].offset < 100) {
            colors.push({ hex: colors[colors.length - 1].hex, offset: 100 });
          }

          // Calculate random offset
          let rOffset;
          if (obj.method === 'interpolate') {
            rOffset = 1 - (i + 1) / updates.length;
          } else if (obj.method === 'interpolateReverse') {
            rOffset = (i + 1) / updates.length;
          } else {
            rOffset = Math.random();
          }
          rOffset *= 100;

          // Find the two colors the random offset falls between
          let j = 0;
          while (j < colors.length - 1 && colors[j + 1].offset < rOffset) j++;
          let color1, color2;
          if (j === colors.length - 1) {
            color1 = colors[j - 1];
            color2 = colors[j];
          } else {
            color1 = colors[j];
            color2 = colors[j + 1];
          }

          // Normalize the random offset
          let rnOffset = rOffset - color1.offset;
          rnOffset = rnOffset / (color2.offset - color1.offset);

          // Create a Color.js range
          color1 = new Color(color1.hex);
          color2 = new Color(color2.hex);
          const space = obj.space || 'srgb';
          const hue = obj.hue || 'shorter';
          let range = color1.range(color2, {
            space: space, // interpolation space
            hue: hue,
            outputSpace: 'srgb',
          });

          // Pick a color from range using normalized random offset
          let rgb3 = range(rnOffset);
          let hexColor = rgb3.toString({ format: 'hex' });
          if (hexColor.length < 7) {
            // 3 char hex, duplicate chars
            hexColor = '#' + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2] + hexColor[3] + hexColor[3];
          }
          update[field] = hexColor;
        } else if (obj.type === 'image') {
          if (obj.method === 'sequential') {
            update[field] = obj.images[i % obj.images.length];
          } else {
            update[field] = obj.images[Math.floor(Math.random() * obj.images.length)];
          }
        } else if (obj.type === 'text') {
          if (obj.method === 'findAndReplace' || obj.method === 'findAndReplaceRegex') {
            if (objects) {
              const data = flattenObject(getData(objects[i]).toObject());
              if (!data[field] && !obj.find) {
                update[field] = obj.replace;
              } else if (data[field]) {
                // special handling for Tagger tags
                if (field === 'flags.tagger.tags') {
                  data[field] = data[field].join(',');
                }

                if (obj.method === 'findAndReplaceRegex') {
                  update[field] = regexStringReplace(obj.find, obj.replace, data[field]);
                } else {
                  update[field] = wildcardStringReplace(obj.find, obj.replace, data[field]);
                }
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
        (b.p.w ?? b.p.width ?? 0) + (b.p.h ?? b.p.height ?? 0) - (a.p.w ?? a.p.width ?? 0) - (a.p.h ?? a.p.height ?? 0)
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

/**
 * Returns the closest step increment to the provided number
 * @param {*} num
 * @param {*} step
 * @returns
 */
export function nearestStep(num, step) {
  if (num % step <= step / 2) {
    return num - (num % step);
  }
  return num - (num % step) + step;
}

/**
 * Generates a random number within the given range and step increment
 * @param {*} min
 * @param {*} max
 * @param {*} step
 * @returns
 */
function randomNum(min, max, step) {
  if (step === 'any') step = 1; // default to integer 1 just to avoid very large decimals
  else step = Number(step);
  const stepsInRange = (max - min) / step;
  return Math.floor(Math.random() * (stepsInRange + (Number.isInteger(step) ? 1 : 0))) * step + min;
}

/**
 * In-place random shuffle of an array
 * @param {*} array
 * @returns
 */
function shuffleArray(array) {
  var i = array.length,
    j = 0,
    temp;

  while (i--) {
    j = Math.floor(Math.random() * (i + 1));

    // swap randomly chosen element with current element
    temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }

  return array;
}

/* ================================
 * === Coordinate Randomization ==
 * =============================== */

function randomPlace(placeable, ctrl) {
  const width = nearestStep(placeable.w ?? placeable.width, ctrl.stepX);
  const height = nearestStep(placeable.h ?? placeable.height, ctrl.stepY);

  const rec = { x: 0, y: 0, width: width, height: height };
  const freeRectangles = ctrl.freeRectangles;

  // get all free rectangles that can contain rec
  let fittingRecs = Object.keys(freeRectangles).filter((id) => _canFit(freeRectangles[id], rec));

  // if there are no fitting places left, then place it randomly anywhere within the bounding box

  if (fittingRecs.length) {
    // Pick a random free rectangle and choose a random location within so that it fits rec
    const i = fittingRecs[Math.floor(Math.random() * fittingRecs.length)];
    rec.x = randomNum(
      freeRectangles[i].x,
      Math.max(freeRectangles[i].x + freeRectangles[i].width - rec.width, 0),
      ctrl.stepX
    );
    rec.y = randomNum(
      freeRectangles[i].y,
      Math.max(freeRectangles[i].y + freeRectangles[i].height - rec.height, 0),
      ctrl.stepY
    );
  } else {
    // if there are no fitting places left, then place it randomly anywhere within the bounding box
    rec.x = randomNum(
      ctrl.boundingBox.x,
      Math.max(ctrl.boundingBox.x + ctrl.boundingBox.width - rec.width, ctrl.boundingBox.x),
      ctrl.stepX
    );
    rec.y = randomNum(
      ctrl.boundingBox.y,
      Math.max(ctrl.boundingBox.y + ctrl.boundingBox.height - rec.height, ctrl.boundingBox.y),
      ctrl.stepY
    );
  }

  // Find all free rectangles that this spot overlaps
  let overlaps = Object.keys(freeRectangles).filter((id) => _intersectRec(freeRectangles[id], rec));

  for (const id of overlaps) {
    const overlap = freeRectangles[id];
    // remove original rectangle
    delete freeRectangles[id];

    // left split
    if (overlap.x < rec.x) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: overlap.y,
          width: rec.x - overlap.x,
          height: overlap.height,
        },
        ctrl
      );
    }

    // right split
    if (overlap.x + overlap.width > rec.x + rec.width) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: rec.x + rec.width,
          y: overlap.y,
          width: overlap.x + overlap.width - (rec.x + rec.width),
          height: overlap.height,
        },
        ctrl
      );
    }

    // top split
    if (overlap.y < rec.y) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: overlap.y,
          width: overlap.width,
          height: rec.y - overlap.y,
        },
        ctrl
      );
    }

    // bottom split
    if (overlap.y + overlap.height > rec.y + rec.height) {
      _addAndMergeFreeRectangle(
        freeRectangles,
        {
          x: overlap.x,
          y: rec.y + rec.height,
          width: overlap.width,
          height: overlap.y + overlap.height - (rec.y + rec.height),
        },
        ctrl
      );
    }
  }

  return [rec.x, rec.y];
}

/**
 * Checks if rectangle rec2 can fit within rectangle rec1
 * @param {*} rec1
 * @param {*} rec2
 * @returns
 */
function _canFit(rec1, rec2) {
  return rec2.width <= rec1.width && rec2.height <= rec1.height;
}

/**
 * Checks whether rectangle rec1 and rectangle rec2 intersect
 * @param {*} rec1
 * @param {*} rec2
 * @returns
 */
function _intersectRec(rec1, rec2) {
  if (rec1.x < rec2.x + rec2.width && rec2.x < rec1.x + rec1.width && rec1.y < rec2.y + rec2.height)
    return rec2.y < rec1.y + rec1.height;
  else return false;
}

/**
 * Check if rectangle rec1 fully contains rectangle rec2
 * @param {*} rec1
 * @param {*} rec
 * @returns
 */
function _fullyContains(rec1, rec2) {
  return (
    rec1.x <= rec2.x &&
    rec1.x + rec1.width >= rec2.x + rec2.width &&
    rec1.y <= rec2.y &&
    rec1.y + rec1.height >= rec2.y + rec2.height
  );
}

/**
 *
 * @param {*} freeRectangles
 * @param {*} rec
 * @param {*} ctrl
 * @returns
 */
function _addAndMergeFreeRectangle(freeRectangles, rec, ctrl) {
  const keys = Object.keys(freeRectangles);
  for (const key of keys) {
    if (_fullyContains(freeRectangles[key], rec)) {
      return;
    }
  }
  ctrl.freeId++;
  freeRectangles[ctrl.freeId] = rec;
}
