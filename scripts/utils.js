export function hexToRgb(hex) {
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });

  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

export function rgbToHex(rgb) {
  return '#' + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
}

export function interpolateColor(u, c1, c2) {
  return c1.map((a, i) => Math.floor((1 - u) * a + u * c2[i]));
}

function _randomInRange(num1, num2) {
  const h = Math.max(num1, num2);
  const l = Math.min(num1, num2);

  return Math.floor(Math.random() * (h - l) + 1) + l;
}

export function randomizeColor(c1, c2) {
  return [_randomInRange(c1[0], c2[0]), _randomInRange(c1[1], c2[1]), _randomInRange(c1[2], c2[2])];
}

/**
 * Returns true of provided path points to an image
 */
export function isImage(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(extension);
}

/**
 * Returns true of provided path points to a video
 */
export function isVideo(path) {
  var extension = path.split('.');
  extension = extension[extension.length - 1].toLowerCase();
  return ['mp4', 'ogg', 'webm', 'm4v'].includes(extension);
}

export async function recursiveTraverse(path, source, bucket, files = []) {
  const result = await FilePicker.browse(source, path, {
    bucket: bucket,
  });

  if (result) {
    for (const file of result.files) {
      files.push(file);
    }

    for (const dir of result.dirs) {
      await recursiveTraverse(dir, source, bucket, files);
    }
  }

  return files;
}

export function shuffleArray(array) {
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

export function nearestStep(num, step) {
  if (num % step <= step / 2) {
    return num - (num % step);
  }
  return num - (num % step) + step;
}

function _canFit(freeRec, rec) {
  return rec.width <= freeRec.width && rec.height <= freeRec.height;
}

function _fullyContains(freeRec, rec) {
  return (
    freeRec.x <= rec.x &&
    freeRec.x + freeRec.width >= rec.x + rec.width &&
    freeRec.y <= rec.y &&
    freeRec.y + freeRec.height >= rec.y + rec.height
  );
}

function _intersectRec(rec1, rec2) {
  if (rec1.x < rec2.x + rec2.width && rec2.x < rec1.x + rec1.width && rec1.y < rec2.y + rec2.height)
    return rec2.y < rec1.y + rec1.height;
  else return false;
}

export function randomPlace(placeable, ctrl) {
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

export function randomNum(min, max, step) {
  if (step === 'any') step = 1; // default to integer 1 just to avoid very large decimals
  else step = Number(step);
  const stepsInRange = (max - min) / step;
  return Math.floor(Math.random() * (stepsInRange + (Number.isInteger(step) ? 1 : 0))) * step + min;
}

// To get rid of v10 warnings
export function emptyObject(obj) {
  if (isNewerVersion('10', game.version)) {
    return foundry.utils.isObjectEmpty(obj);
  } else {
    return foundry.utils.isEmpty(obj);
  }
}

// To get rid of v10 warnings
export function getData(obj) {
  if (isNewerVersion('10', game.version)) {
    return obj.data;
  } else {
    return obj.document ? obj.document : obj;
  }
}

// Flags are stored inconsistently. Absence of a flag, being set to null, undefined, empty object or empty string
// should all be considered equal
export function flagCompare(data, flag, flagVal) {
  if (data[flag] == flagVal) return true;

  const falseyFlagVal =
    flagVal == null ||
    flagVal === false ||
    flagVal === '' ||
    (getType(flagVal) === 'Object' && emptyObject(flagVal));

  const falseyDataVal =
    data[flag] == null ||
    data[flag] === false ||
    data[flag] === '' ||
    (getType(data[flag]) === 'Object' && emptyObject(data[flag]));

  if (falseyFlagVal && falseyDataVal) return true;

  return false;
}

export function hasFlagRemove(flag, formData) {
  const comp = flag.split('.');
  for (let i = comp.length - 1; i >= 1; i--) {
    const tempFlag = comp.slice(0, i).join('.') + '.-=' + comp[i];
    if (tempFlag in formData) {
      return tempFlag;
    }
  }
  return null;
}