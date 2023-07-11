// A is m x n. B is n x p. product is m x p.
function multiplyMatrices(A, B) {
  let m = A.length;

  if (!Array.isArray(A[0])) {
    // A is vector, convert to [[a, b, c, ...]]
    A = [A];
  }

  if (!Array.isArray(B[0])) {
    // B is vector, convert to [[a], [b], [c], ...]]
    B = B.map((x) => [x]);
  }

  let p = B[0].length;
  let B_cols = B[0].map((_, i) => B.map((x) => x[i])); // transpose B
  let product = A.map((row) =>
    B_cols.map((col) => {
      let ret = 0;

      if (!Array.isArray(row)) {
        for (let c of col) {
          ret += row * c;
        }

        return ret;
      }

      for (let i = 0; i < row.length; i++) {
        ret += row[i] * (col[i] || 0);
      }

      return ret;
    })
  );

  if (m === 1) {
    product = product[0]; // Avoid [[a, b, c, ...]]
  }

  if (p === 1) {
    return product.map((x) => x[0]); // Avoid [[a], [b], [c], ...]]
  }

  return product;
}

/**
 * Various utility functions
 */

/**
 * Check if a value is a string (including a String object)
 * @param {*} str - Value to check
 * @returns {boolean}
 */
function isString(str) {
  return type(str) === 'string';
}

/**
 * Determine the internal JavaScript [[Class]] of an object.
 * @param {*} o - Value to check
 * @returns {string}
 */
function type(o) {
  let str = Object.prototype.toString.call(o);

  return (str.match(/^\[object\s+(.*?)\]$/)[1] || '').toLowerCase();
}

/**
 * Round a number to a certain number of significant digits
 * @param {number} n - The number to round
 * @param {number} precision - Number of significant digits
 */
function toPrecision(n, precision) {
  n = +n;
  precision = +precision;
  let integerLength = (Math.floor(n) + '').length;

  if (precision > integerLength) {
    return +n.toFixed(precision - integerLength);
  } else {
    let p10 = 10 ** (integerLength - precision);
    return Math.round(n / p10) * p10;
  }
}

/**
 * Parse a CSS function, regardless of its name and arguments
 * @param String str String to parse
 * @return {{name, args, rawArgs}}
 */
function parseFunction(str) {
  if (!str) {
    return;
  }

  str = str.trim();

  const isFunctionRegex = /^([a-z]+)\((.+?)\)$/i;
  const isNumberRegex = /^-?[\d.]+$/;
  let parts = str.match(isFunctionRegex);

  if (parts) {
    // It is a function, parse args
    let args = [];
    parts[2].replace(/\/?\s*([-\w.]+(?:%|deg)?)/g, ($0, arg) => {
      if (/%$/.test(arg)) {
        // Convert percentages to 0-1 numbers
        arg = new Number(arg.slice(0, -1) / 100);
        arg.type = '<percentage>';
      } else if (/deg$/.test(arg)) {
        // Drop deg from degrees and convert to number
        // TODO handle other units too
        arg = new Number(+arg.slice(0, -3));
        arg.type = '<angle>';
        arg.unit = 'deg';
      } else if (isNumberRegex.test(arg)) {
        // Convert numerical args to numbers
        arg = new Number(arg);
        arg.type = '<number>';
      }

      if ($0.startsWith('/')) {
        // It's alpha
        arg = arg instanceof Number ? arg : new Number(arg);
        arg.alpha = true;
      }

      args.push(arg);
    });

    return {
      name: parts[1].toLowerCase(),
      rawName: parts[1],
      rawArgs: parts[2],
      // An argument could be (as of css-color-4):
      // a number, percentage, degrees (hue), ident (in color())
      args,
    };
  }
}

function last(arr) {
  return arr[arr.length - 1];
}

function interpolate(start, end, p) {
  if (isNaN(start)) {
    return end;
  }

  if (isNaN(end)) {
    return start;
  }

  return start + (end - start) * p;
}

function interpolateInv(start, end, value) {
  return (value - start) / (end - start);
}

function mapRange(from, to, value) {
  return interpolate(to[0], to[1], interpolateInv(from[0], from[1], value));
}

function parseCoordGrammar(coordGrammars) {
  return coordGrammars.map((coordGrammar) => {
    return coordGrammar.split('|').map((type) => {
      type = type.trim();
      let range = type.match(/^(<[a-z]+>)\[(-?[.\d]+),\s*(-?[.\d]+)\]?$/);

      if (range) {
        let ret = new String(range[1]);
        ret.range = [+range[2], +range[3]];
        return ret;
      }

      return type;
    });
  });
}

var util = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  isString: isString,
  type: type,
  toPrecision: toPrecision,
  parseFunction: parseFunction,
  last: last,
  interpolate: interpolate,
  interpolateInv: interpolateInv,
  mapRange: mapRange,
  parseCoordGrammar: parseCoordGrammar,
  multiplyMatrices: multiplyMatrices,
});

/**
 * A class for adding deep extensibility to any piece of JS code
 */
class Hooks {
  add(name, callback, first) {
    if (typeof arguments[0] != 'string') {
      // Multiple hooks
      for (var name in arguments[0]) {
        this.add(name, arguments[0][name], arguments[1]);
      }

      return;
    }

    (Array.isArray(name) ? name : [name]).forEach(function (name) {
      this[name] = this[name] || [];

      if (callback) {
        this[name][first ? 'unshift' : 'push'](callback);
      }
    }, this);
  }

  run(name, env) {
    this[name] = this[name] || [];
    this[name].forEach(function (callback) {
      callback.call(env && env.context ? env.context : env, env);
    });
  }
}
/**
 * The instance of {@link Hooks} used throughout Color.js
 */
const hooks = new Hooks();

// Global defaults one may want to configure

var defaults = {
  gamut_mapping: 'lch.c',
  precision: 5,
  deltaE: '76', // Default deltaE method
};

const WHITES = {
  // for compatibility, the four-digit chromaticity-derived ones everyone else uses
  D50: [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585],
  D65: [0.3127 / 0.329, 1.0, (1.0 - 0.3127 - 0.329) / 0.329],
};

function getWhite(name) {
  if (Array.isArray(name)) {
    return name;
  }

  return WHITES[name];
}

// Adapt XYZ from white point W1 to W2
function adapt$1(W1, W2, XYZ, options = {}) {
  W1 = getWhite(W1);
  W2 = getWhite(W2);

  if (!W1 || !W2) {
    throw new TypeError(
      `Missing white point to convert ${!W1 ? 'from' : ''}${!W1 && !W2 ? '/' : ''}${!W2 ? 'to' : ''}`
    );
  }

  if (W1 === W2) {
    // Same whitepoints, no conversion needed
    return XYZ;
  }

  let env = { W1, W2, XYZ, options };

  hooks.run('chromatic-adaptation-start', env);

  if (!env.M) {
    if (env.W1 === WHITES.D65 && env.W2 === WHITES.D50) {
      env.M = [
        [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
        [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
        [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
      ];
    } else if (env.W1 === WHITES.D50 && env.W2 === WHITES.D65) {
      env.M = [
        [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
        [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
        [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
      ];
    }
  }

  hooks.run('chromatic-adaptation-end', env);

  if (env.M) {
    return multiplyMatrices(env.M, env.XYZ);
  } else {
    throw new TypeError('Only Bradford CAT with white points D50 and D65 supported for now.');
  }
}

const ε$4 = 0.000075;

/**
 * Class to represent a color space
 */
class ColorSpace {
  constructor(options) {
    this.id = options.id;
    this.name = options.name;
    this.base = options.base ? ColorSpace.get(options.base) : null;
    this.aliases = options.aliases;

    if (this.base) {
      this.fromBase = options.fromBase;
      this.toBase = options.toBase;
    }

    // Coordinate metadata

    let coords = options.coords ?? this.base.coords;
    this.coords = coords;

    // White point

    let white = options.white ?? this.base.white ?? 'D65';
    this.white = getWhite(white);

    // Sort out formats

    this.formats = options.formats ?? {};

    for (let name in this.formats) {
      let format = this.formats[name];
      format.type ||= 'function';
      format.name ||= name;
    }

    if (options.cssId && !this.formats.functions?.color) {
      this.formats.color = { id: options.cssId };
      Object.defineProperty(this, 'cssId', { value: options.cssId });
    } else if (this.formats?.color && !this.formats?.color.id) {
      this.formats.color.id = this.id;
    }

    // Other stuff
    this.referred = options.referred;

    // Compute ancestors and store them, since they will never change
    this.#path = this.#getPath().reverse();

    hooks.run('colorspace-init-end', this);
  }

  inGamut(coords, { epsilon = ε$4 } = {}) {
    if (this.isPolar) {
      // Do not check gamut through polar coordinates
      coords = this.toBase(coords);

      return this.base.inGamut(coords, { epsilon });
    }

    let coordMeta = Object.values(this.coords);

    return coords.every((c, i) => {
      let meta = coordMeta[i];

      if (meta.type !== 'angle' && meta.range) {
        if (Number.isNaN(c)) {
          // NaN is always in gamut
          return true;
        }

        let [min, max] = meta.range;
        return (min === undefined || c >= min - epsilon) && (max === undefined || c <= max + epsilon);
      }

      return true;
    });
  }

  get cssId() {
    return this.formats.functions?.color?.id || this.id;
  }

  get isPolar() {
    for (let id in this.coords) {
      if (this.coords[id].type === 'angle') {
        return true;
      }
    }

    return false;
  }

  #processFormat(format) {
    if (format.coords && !format.coordGrammar) {
      format.type ||= 'function';
      format.name ||= 'color';

      // Format has not been processed
      format.coordGrammar = parseCoordGrammar(format.coords);

      let coordFormats = Object.entries(this.coords).map(([id, coordMeta], i) => {
        // Preferred format for each coord is the first one
        let outputType = format.coordGrammar[i][0];

        let fromRange = coordMeta.range || coordMeta.refRange;
        let toRange = outputType.range,
          suffix = '';

        // Non-strict equals intentional since outputType could be a string object
        if (outputType == '<percentage>') {
          toRange = [0, 100];
          suffix = '%';
        } else if (outputType == '<angle>') {
          suffix = 'deg';
        }

        return { fromRange, toRange, suffix };
      });

      format.serializeCoords = (coords, precision) => {
        return coords.map((c, i) => {
          let { fromRange, toRange, suffix } = coordFormats[i];

          if (fromRange && toRange) {
            c = mapRange(fromRange, toRange, c);
          }

          c = toPrecision(c, precision);

          if (suffix) {
            c += suffix;
          }

          return c;
        });
      };
    }

    return format;
  }

  getFormat(format) {
    if (typeof format === 'object') {
      format = this.#processFormat(format);
      return format;
    }

    let ret;
    if (format === 'default') {
      // Get first format
      ret = Object.values(this.formats)[0];
    } else {
      ret = this.formats[format];
    }

    if (ret) {
      ret = this.#processFormat(ret);
      return ret;
    }

    return null;
  }

  #path;

  #getPath() {
    let ret = [this];

    for (let space = this; (space = space.base); ) {
      ret.push(space);
    }

    return ret;
  }

  to(space, coords) {
    if (arguments.length === 1) {
      [space, coords] = [space.space, space.coords];
    }

    space = ColorSpace.get(space);

    if (this === space) {
      // Same space, no change needed
      return coords;
    }

    // Convert NaN to 0, which seems to be valid in every coordinate of every color space
    coords = coords.map((c) => (Number.isNaN(c) ? 0 : c));

    // Find connection space = lowest common ancestor in the base tree
    let myPath = this.#path;
    let otherPath = space.#path;

    let connectionSpace, connectionSpaceIndex;

    for (let i = 0; i < myPath.length; i++) {
      if (myPath[i] === otherPath[i]) {
        connectionSpace = myPath[i];
        connectionSpaceIndex = i;
      } else {
        break;
      }
    }

    if (!connectionSpace) {
      // This should never happen
      throw new Error(`Cannot convert between color spaces ${this} and ${space}: no connection space was found`);
    }

    // Go up from current space to connection space
    for (let i = myPath.length - 1; i > connectionSpaceIndex; i--) {
      coords = myPath[i].toBase(coords);
    }

    // Go down from connection space to target space
    for (let i = connectionSpaceIndex + 1; i < otherPath.length; i++) {
      coords = otherPath[i].fromBase(coords);
    }

    return coords;
  }

  from(space, coords) {
    if (arguments.length === 1) {
      [space, coords] = [space.space, space.coords];
    }

    space = ColorSpace.get(space);

    return space.to(this, coords);
  }

  toString() {
    return `${this.name} (${this.id})`;
  }

  getMinCoords() {
    let ret = [];

    for (let id in this.coords) {
      let meta = this.coords[id];
      let range = meta.range || meta.refRange;
      ret.push(range?.min ?? 0);
    }

    return ret;
  }

  static registry = {};

  // Returns array of unique color spaces
  static get all() {
    return [...new Set(Object.values(ColorSpace.registry))];
  }

  static register(id, space) {
    if (arguments.length === 1) {
      space = arguments[0];
      id = space.id;
    }

    space = this.get(space);

    if (this.registry[id] && this.registry[id] !== space) {
      throw new Error(`Duplicate color space registration: '${id}'`);
    }
    this.registry[id] = space;

    // Register aliases when called without an explicit ID.
    if (arguments.length === 1 && space.aliases) {
      for (let alias of space.aliases) {
        this.register(alias, space);
      }
    }

    return space;
  }

  /**
   * Lookup ColorSpace object by name
   * @param {ColorSpace | string} name
   */
  static get(space, ...alternatives) {
    if (!space || space instanceof ColorSpace) {
      return space;
    }

    let argType = type(space);

    if (argType === 'string') {
      // It's a color space id
      let ret = ColorSpace.registry[space.toLowerCase()];

      if (!ret) {
        throw new TypeError(`No color space found with id = "${space}"`);
      }

      return ret;
    }

    if (alternatives.length) {
      return ColorSpace.get(...alternatives);
    }

    throw new TypeError(`${space} is not a valid color space`);
  }

  /**
   * Get metadata about a coordinate of a color space
   *
   * @static
   * @param {Array | string} ref
   * @param {ColorSpace | string} [workingSpace]
   * @return {Object}
   */
  static resolveCoord(ref, workingSpace) {
    let coordType = type(ref);
    let space, coord;

    if (coordType === 'string') {
      if (ref.includes('.')) {
        // Absolute coordinate
        [space, coord] = ref.split('.');
      } else {
        // Relative coordinate
        [space, coord] = [, ref];
      }
    } else if (Array.isArray(ref)) {
      [space, coord] = ref;
    } else {
      // Object
      space = ref.space;
      coord = ref.coordId;
    }

    space = ColorSpace.get(space);

    if (!space) {
      space = workingSpace;
    }

    if (!space) {
      throw new TypeError(
        `Cannot resolve coordinate reference ${ref}: No color space specified and relative references are not allowed here`
      );
    }

    coordType = type(coord);

    if (coordType === 'number' || (coordType === 'string' && coord >= 0)) {
      // Resolve numerical coord
      let meta = Object.entries(space.coords)[coord];

      if (meta) {
        return { space, id: meta[0], index: coord, ...meta[1] };
      }
    }

    space = ColorSpace.get(space);

    let normalizedCoord = coord.toLowerCase();

    let i = 0;
    for (let id in space.coords) {
      let meta = space.coords[id];

      if (id.toLowerCase() === normalizedCoord || meta.name?.toLowerCase() === normalizedCoord) {
        return { space, id, index: i, ...meta };
      }

      i++;
    }

    throw new TypeError(
      `No "${coord}" coordinate found in ${space.name}. Its coordinates are: ${Object.keys(space.coords).join(', ')}`
    );
  }

  static DEFAULT_FORMAT = {
    type: 'functions',
    name: 'color',
  };
}

var XYZ_D65 = new ColorSpace({
  id: 'xyz-d65',
  name: 'XYZ D65',
  coords: {
    x: { name: 'X' },
    y: { name: 'Y' },
    z: { name: 'Z' },
  },
  white: 'D65',
  formats: {
    color: {
      ids: ['xyz-d65', 'xyz'],
    },
  },
  aliases: ['xyz'],
});

/**
 * Convenience class for RGB color spaces
 * @extends {ColorSpace}
 */
class RGBColorSpace extends ColorSpace {
  /**
   * Creates a new RGB ColorSpace.
   * If coords are not specified, they will use the default RGB coords.
   * Instead of `fromBase()` and `toBase()` functions,
   * you can specify to/from XYZ matrices and have `toBase()` and `fromBase()` automatically generated.
   * @param {*} options - Same options as {@link ColorSpace} plus:
   * @param {number[][]} options.toXYZ_M - Matrix to convert to XYZ
   * @param {number[][]} options.fromXYZ_M - Matrix to convert from XYZ
   */
  constructor(options) {
    if (!options.coords) {
      options.coords = {
        r: {
          range: [0, 1],
          name: 'Red',
        },
        g: {
          range: [0, 1],
          name: 'Green',
        },
        b: {
          range: [0, 1],
          name: 'Blue',
        },
      };
    }

    if (!options.base) {
      options.base = XYZ_D65;
    }

    if (options.toXYZ_M && options.fromXYZ_M) {
      options.toBase ??= (rgb) => {
        let xyz = multiplyMatrices(options.toXYZ_M, rgb);

        if (this.white !== this.base.white) {
          // Perform chromatic adaptation
          xyz = adapt$1(this.white, this.base.white, xyz);
        }

        return xyz;
      };

      options.fromBase ??= (xyz) => {
        xyz = adapt$1(this.base.white, this.white, xyz);
        return multiplyMatrices(options.fromXYZ_M, xyz);
      };
    }

    options.referred ??= 'display';

    super(options);
  }
}

// CSS color to Color object
function parse(str) {
  let env = { str: String(str)?.trim() };
  hooks.run('parse-start', env);

  if (env.color) {
    return env.color;
  }

  env.parsed = parseFunction(env.str);

  if (env.parsed) {
    // Is a functional syntax
    let name = env.parsed.name;

    if (name === 'color') {
      // color() function
      let id = env.parsed.args.shift();
      let alpha = env.parsed.rawArgs.indexOf('/') > 0 ? env.parsed.args.pop() : 1;

      for (let space of ColorSpace.all) {
        let colorSpec = space.getFormat('color');

        if (colorSpec) {
          if (id === colorSpec.id || colorSpec.ids?.includes(id)) {
            // From https://drafts.csswg.org/css-color-4/#color-function
            // If more <number>s or <percentage>s are provided than parameters that the colorspace takes, the excess <number>s at the end are ignored.
            // If less <number>s or <percentage>s are provided than parameters that the colorspace takes, the missing parameters default to 0. (This is particularly convenient for multichannel printers where the additional inks are spot colors or varnishes that most colors on the page won’t use.)
            let argCount = Object.keys(space.coords).length;
            let coords = Array(argCount).fill(0);
            coords.forEach((_, i) => (coords[i] = env.parsed.args[i] || 0));

            return { spaceId: space.id, coords, alpha };
          }
        }
      }

      // Not found
      let didYouMean = '';
      if (id in ColorSpace.registry) {
        // Used color space id instead of color() id, these are often different
        let cssId = ColorSpace.registry[id].formats?.functions?.color?.id;

        if (cssId) {
          didYouMean = `Did you mean color(${cssId})?`;
        }
      }
      throw new TypeError(`Cannot parse color(${id}). ` + (didYouMean || 'Missing a plugin?'));
    } else {
      for (let space of ColorSpace.all) {
        // color space specific function
        let format = space.getFormat(name);
        if (format && format.type === 'function') {
          let alpha = 1;

          if (format.lastAlpha || last(env.parsed.args).alpha) {
            alpha = env.parsed.args.pop();
          }

          let coords = env.parsed.args;

          if (format.coordGrammar) {
            Object.entries(space.coords).forEach(([id, coordMeta], i) => {
              let coordGrammar = format.coordGrammar[i];
              let providedType = coords[i]?.type;

              // Find grammar alternative that matches the provided type
              // Non-strict equals is intentional because we are comparing w/ string objects
              coordGrammar = coordGrammar.find((c) => c == providedType);

              // Check that each coord conforms to its grammar
              if (!coordGrammar) {
                // Type does not exist in the grammar, throw
                let coordName = coordMeta.name || id;
                throw new TypeError(`${providedType} not allowed for ${coordName} in ${name}()`);
              }

              let fromRange = coordGrammar.range;

              if (providedType === '<percentage>') {
                fromRange ||= [0, 1];
              }

              let toRange = coordMeta.range || coordMeta.refRange;

              if (fromRange && toRange) {
                coords[i] = mapRange(fromRange, toRange, coords[i]);
              }
            });
          }

          return {
            spaceId: space.id,
            coords,
            alpha,
          };
        }
      }
    }
  } else {
    // Custom, colorspace-specific format
    for (let space of ColorSpace.all) {
      for (let formatId in space.formats) {
        let format = space.formats[formatId];

        if (format.type !== 'custom') {
          continue;
        }

        if (format.test && !format.test(env.str)) {
          continue;
        }

        let color = format.parse(env.str);

        if (color) {
          color.alpha ??= 1;
          return color;
        }
      }
    }
  }

  // If we're here, we couldn't parse
  throw new TypeError(`Could not parse ${str} as a color. Missing a plugin?`);
}

/**
 * Resolves a color reference (object or string) to a plain color object
 * @param {Color | {space, coords, alpha} | string} color
 * @returns {{space, coords, alpha}}
 */
function getColor(color) {
  if (!color) {
    throw new TypeError('Empty color reference');
  }

  if (isString(color)) {
    color = parse(color);
  }

  // Object fixup
  let space = color.space || color.spaceId;

  if (!(space instanceof ColorSpace)) {
    // Convert string id to color space object
    color.space = ColorSpace.get(space);
  }

  if (color.alpha === undefined) {
    color.alpha = 1;
  }

  return color;
}

/**
 * Get the coordinates of a color in another color space
 *
 * @param {string | ColorSpace} space
 * @returns {number[]}
 */
function getAll(color, space) {
  space = ColorSpace.get(space);
  return space.from(color);
}

function get(color, prop) {
  let { space, index } = ColorSpace.resolveCoord(prop, color.space);
  let coords = getAll(color, space);
  return coords[index];
}

function setAll(color, space, coords) {
  space = ColorSpace.get(space);
  color.coords = space.to(color.space, coords);
  return color;
}

// Set properties and return current instance
function set$1(color, prop, value) {
  color = getColor(color);

  if (arguments.length === 2 && type(arguments[1]) === 'object') {
    // Argument is an object literal
    let object = arguments[1];
    for (let p in object) {
      set$1(color, p, object[p]);
    }
  } else {
    if (typeof value === 'function') {
      value = value(get(color, prop));
    }

    let { space, index } = ColorSpace.resolveCoord(prop, color.space);
    let coords = getAll(color, space);
    coords[index] = value;
    setAll(color, space, coords);
  }

  return color;
}

var XYZ_D50 = new ColorSpace({
  id: 'xyz-d50',
  name: 'XYZ D50',
  white: 'D50',
  base: XYZ_D65,
  fromBase: (coords) => adapt$1(XYZ_D65.white, 'D50', coords),
  toBase: (coords) => adapt$1('D50', XYZ_D65.white, coords),
  formats: {
    color: {},
  },
});

// κ * ε  = 2^3 = 8
const ε$3 = 216 / 24389; // 6^3/29^3 == (24/116)^3
const ε3$1 = 24 / 116;
const κ$1 = 24389 / 27; // 29^3/3^3

let white$1 = WHITES.D50;

var lab = new ColorSpace({
  id: 'lab',
  name: 'Lab',
  coords: {
    l: {
      refRange: [0, 100],
      name: 'L',
    },
    a: {
      refRange: [-125, 125],
    },
    b: {
      refRange: [-125, 125],
    },
  },

  // Assuming XYZ is relative to D50, convert to CIE Lab
  // from CIE standard, which now defines these as a rational fraction
  white: white$1,

  base: XYZ_D50,
  // Convert D50-adapted XYX to Lab
  //  CIE 15.3:2004 section 8.2.1.1
  fromBase(XYZ) {
    // compute xyz, which is XYZ scaled relative to reference white
    let xyz = XYZ.map((value, i) => value / white$1[i]);

    // now compute f
    let f = xyz.map((value) => (value > ε$3 ? Math.cbrt(value) : (κ$1 * value + 16) / 116));

    return [
      116 * f[1] - 16, // L
      500 * (f[0] - f[1]), // a
      200 * (f[1] - f[2]), // b
    ];
  },
  // Convert Lab to D50-adapted XYZ
  // Same result as CIE 15.3:2004 Appendix D although the derivation is different
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  toBase(Lab) {
    // compute f, starting with the luminance-related term
    let f = [];
    f[1] = (Lab[0] + 16) / 116;
    f[0] = Lab[1] / 500 + f[1];
    f[2] = f[1] - Lab[2] / 200;

    // compute xyz
    let xyz = [
      f[0] > ε3$1 ? Math.pow(f[0], 3) : (116 * f[0] - 16) / κ$1,
      Lab[0] > 8 ? Math.pow((Lab[0] + 16) / 116, 3) : Lab[0] / κ$1,
      f[2] > ε3$1 ? Math.pow(f[2], 3) : (116 * f[2] - 16) / κ$1,
    ];

    // Compute XYZ by scaling xyz by reference white
    return xyz.map((value, i) => value * white$1[i]);
  },

  formats: {
    lab: {
      coords: ['<percentage> | <number>', '<number>', '<number>'],
    },
  },
});

function constrain(angle) {
  return ((angle % 360) + 360) % 360;
}

function adjust(arc, angles) {
  if (arc === 'raw') {
    return angles;
  }

  let [a1, a2] = angles.map(constrain);

  let angleDiff = a2 - a1;

  if (arc === 'increasing') {
    if (angleDiff < 0) {
      a2 += 360;
    }
  } else if (arc === 'decreasing') {
    if (angleDiff > 0) {
      a1 += 360;
    }
  } else if (arc === 'longer') {
    if (-180 < angleDiff && angleDiff < 180) {
      if (angleDiff > 0) {
        a2 += 360;
      } else {
        a1 += 360;
      }
    }
  } else if (arc === 'shorter') {
    if (angleDiff > 180) {
      a1 += 360;
    } else if (angleDiff < -180) {
      a2 += 360;
    }
  }

  return [a1, a2];
}

var lch = new ColorSpace({
  id: 'lch',
  name: 'LCH',
  coords: {
    l: {
      refRange: [0, 100],
      name: 'Lightness',
    },
    c: {
      refRange: [0, 150],
      name: 'Chroma',
    },
    h: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
  },

  base: lab,
  fromBase(Lab) {
    // Convert to polar form
    let [L, a, b] = Lab;
    let hue;
    const ε = 0.02;

    if (Math.abs(a) < ε && Math.abs(b) < ε) {
      hue = NaN;
    } else {
      hue = (Math.atan2(b, a) * 180) / Math.PI;
    }

    return [
      L, // L is still L
      Math.sqrt(a ** 2 + b ** 2), // Chroma
      constrain(hue), // Hue, in degrees [0 to 360)
    ];
  },
  toBase(LCH) {
    // Convert from polar form
    let [Lightness, Chroma, Hue] = LCH;
    // Clamp any negative Chroma
    if (Chroma < 0) {
      Chroma = 0;
    } // Deal with NaN Hue
    if (isNaN(Hue)) {
      Hue = 0;
    }
    return [
      Lightness, // L is still L
      Chroma * Math.cos((Hue * Math.PI) / 180), // a
      Chroma * Math.sin((Hue * Math.PI) / 180), // b
    ];
  },

  formats: {
    lch: {
      coords: ['<percentage> | <number>', '<number>', '<number> | <angle>'],
    },
  },
});

// deltaE2000 is a statistically significant improvement
// and is recommended by the CIE and Idealliance
// especially for color differences less than 10 deltaE76
// but is wicked complicated
// and many implementations have small errors!
// DeltaE2000 is also discontinuous; in case this
// matters to you, use deltaECMC instead.

const Gfactor = 25 ** 7;
const π$1 = Math.PI;
const r2d = 180 / π$1;
const d2r$1 = π$1 / 180;

function deltaE2000(color, sample, { kL = 1, kC = 1, kH = 1 } = {}) {
  // Given this color as the reference
  // and the function parameter as the sample,
  // calculate deltaE 2000.

  // This implementation assumes the parametric
  // weighting factors kL, kC and kH
  // for the influence of viewing conditions
  // are all 1, as sadly seems typical.
  // kL should be increased for lightness texture or noise
  // and kC increased for chroma noise

  let [L1, a1, b1] = lab.from(color);
  let C1 = lch.from(lab, [L1, a1, b1])[1];
  let [L2, a2, b2] = lab.from(sample);
  let C2 = lch.from(lab, [L2, a2, b2])[1];

  // Check for negative Chroma,
  // which might happen through
  // direct user input of LCH values

  if (C1 < 0) {
    C1 = 0;
  }
  if (C2 < 0) {
    C2 = 0;
  }

  let Cbar = (C1 + C2) / 2; // mean Chroma

  // calculate a-axis asymmetry factor from mean Chroma
  // this turns JND ellipses for near-neutral colors back into circles
  let C7 = Cbar ** 7;

  let G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Gfactor)));

  // scale a axes by asymmetry factor
  // this by the way is why there is no Lab2000 colorspace
  let adash1 = (1 + G) * a1;
  let adash2 = (1 + G) * a2;

  // calculate new Chroma from scaled a and original b axes
  let Cdash1 = Math.sqrt(adash1 ** 2 + b1 ** 2);
  let Cdash2 = Math.sqrt(adash2 ** 2 + b2 ** 2);

  // calculate new hues, with zero hue for true neutrals
  // and in degrees, not radians

  let h1 = adash1 === 0 && b1 === 0 ? 0 : Math.atan2(b1, adash1);
  let h2 = adash2 === 0 && b2 === 0 ? 0 : Math.atan2(b2, adash2);

  if (h1 < 0) {
    h1 += 2 * π$1;
  }
  if (h2 < 0) {
    h2 += 2 * π$1;
  }

  h1 *= r2d;
  h2 *= r2d;

  // Lightness and Chroma differences; sign matters
  let ΔL = L2 - L1;
  let ΔC = Cdash2 - Cdash1;

  // Hue difference, getting the sign correct
  let hdiff = h2 - h1;
  let hsum = h1 + h2;
  let habs = Math.abs(hdiff);
  let Δh;

  if (Cdash1 * Cdash2 === 0) {
    Δh = 0;
  } else if (habs <= 180) {
    Δh = hdiff;
  } else if (hdiff > 180) {
    Δh = hdiff - 360;
  } else if (hdiff < -180) {
    Δh = hdiff + 360;
  } else {
    console.log('the unthinkable has happened');
  }

  // weighted Hue difference, more for larger Chroma
  let ΔH = 2 * Math.sqrt(Cdash2 * Cdash1) * Math.sin((Δh * d2r$1) / 2);

  // calculate mean Lightness and Chroma
  let Ldash = (L1 + L2) / 2;
  let Cdash = (Cdash1 + Cdash2) / 2;
  let Cdash7 = Math.pow(Cdash, 7);

  // Compensate for non-linearity in the blue region of Lab.
  // Four possibilities for hue weighting factor,
  // depending on the angles, to get the correct sign
  let hdash;
  if (Cdash1 * Cdash2 === 0) {
    hdash = hsum; // which should be zero
  } else if (habs <= 180) {
    hdash = hsum / 2;
  } else if (hsum < 360) {
    hdash = (hsum + 360) / 2;
  } else {
    hdash = (hsum - 360) / 2;
  }

  // positional corrections to the lack of uniformity of CIELAB
  // These are all trying to make JND ellipsoids more like spheres

  // SL Lightness crispening factor
  // a background with L=50 is assumed
  let lsq = (Ldash - 50) ** 2;
  let SL = 1 + (0.015 * lsq) / Math.sqrt(20 + lsq);

  // SC Chroma factor, similar to those in CMC and deltaE 94 formulae
  let SC = 1 + 0.045 * Cdash;

  // Cross term T for blue non-linearity
  let T = 1;
  T -= 0.17 * Math.cos((hdash - 30) * d2r$1);
  T += 0.24 * Math.cos(2 * hdash * d2r$1);
  T += 0.32 * Math.cos((3 * hdash + 6) * d2r$1);
  T -= 0.2 * Math.cos((4 * hdash - 63) * d2r$1);

  // SH Hue factor depends on Chroma,
  // as well as adjusted hue angle like deltaE94.
  let SH = 1 + 0.015 * Cdash * T;

  // RT Hue rotation term compensates for rotation of JND ellipses
  // and Munsell constant hue lines
  // in the medium-high Chroma blue region
  // (Hue 225 to 315)
  let Δθ = 30 * Math.exp(-1 * ((hdash - 275) / 25) ** 2);
  let RC = 2 * Math.sqrt(Cdash7 / (Cdash7 + Gfactor));
  let RT = -1 * Math.sin(2 * Δθ * d2r$1) * RC;

  // Finally calculate the deltaE, term by term as root sume of squares
  let dE = (ΔL / (kL * SL)) ** 2;
  dE += (ΔC / (kC * SC)) ** 2;
  dE += (ΔH / (kH * SH)) ** 2;
  dE += RT * (ΔC / (kC * SC)) * (ΔH / (kH * SH));
  return Math.sqrt(dE);
  // Yay!!!
}

const ε$2 = 0.000075;

/**
 * Check if a color is in gamut of either its own or another color space
 * @return {Boolean} Is the color in gamut?
 */
function inGamut(color, space = color.space, { epsilon = ε$2 } = {}) {
  color = getColor(color);
  space = ColorSpace.get(space);
  let coords = color.coords;

  if (space !== color.space) {
    coords = space.from(color);
  }

  return space.inGamut(coords, { epsilon });
}

function clone(color) {
  return {
    space: color.space,
    coords: color.coords.slice(),
    alpha: color.alpha,
  };
}

/**
 * Force coordinates to be in gamut of a certain color space.
 * Mutates the color it is passed.
 * @param {Object} options
 * @param {string} options.method - How to force into gamut.
 *        If "clip", coordinates are just clipped to their reference range.
 *        If in the form [colorSpaceId].[coordName], that coordinate is reduced
 *        until the color is in gamut. Please note that this may produce nonsensical
 *        results for certain coordinates (e.g. hue) or infinite loops if reducing the coordinate never brings the color in gamut.
 * @param {ColorSpace|string} options.space - The space whose gamut we want to map to
 */
function toGamut(color, { method = defaults.gamut_mapping, space = color.space } = {}) {
  if (isString(arguments[1])) {
    space = arguments[1];
  }

  space = ColorSpace.get(space);

  if (inGamut(color, space, { epsilon: 0 })) {
    return color;
  }

  // 3 spaces:
  // color.space: current color space
  // space: space whose gamut we are mapping to
  // mapSpace: space with the coord we're reducing
  let spaceColor = to(color, space);

  if (method !== 'clip' && !inGamut(color, space)) {
    let clipped = toGamut(clone(spaceColor), { method: 'clip', space });
    if (deltaE2000(color, clipped) > 2) {
      // Reduce a coordinate of a certain color space until the color is in gamut
      let coordMeta = ColorSpace.resolveCoord(method);
      let mapSpace = coordMeta.space;
      let coordId = coordMeta.id;

      let mappedColor = to(spaceColor, mapSpace);
      let bounds = coordMeta.range || coordMeta.refRange;
      let min = bounds[0];
      let ε = 0.01; // for deltaE
      let low = min;
      let high = get(mappedColor, coordId);

      while (high - low > ε) {
        let clipped = clone(mappedColor);
        clipped = toGamut(clipped, { space, method: 'clip' });
        let deltaE = deltaE2000(mappedColor, clipped);

        if (deltaE - 2 < ε) {
          low = get(mappedColor, coordId);
        } else {
          high = get(mappedColor, coordId);
        }

        set$1(mappedColor, coordId, (low + high) / 2);
      }

      spaceColor = to(mappedColor, space);
    } else {
      spaceColor = clipped;
    }
  }

  if (
    method === 'clip' || // Dumb coord clipping
    // finish off smarter gamut mapping with clip to get rid of ε, see #17
    !inGamut(spaceColor, space, { epsilon: 0 })
  ) {
    let bounds = Object.values(space.coords).map((c) => c.range || []);

    spaceColor.coords = spaceColor.coords.map((c, i) => {
      let [min, max] = bounds[i];

      if (min !== undefined) {
        c = Math.max(min, c);
      }

      if (max !== undefined) {
        c = Math.min(c, max);
      }

      return c;
    });
  }

  if (space !== color.space) {
    spaceColor = to(spaceColor, color.space);
  }

  color.coords = spaceColor.coords;
  return color;
}

toGamut.returns = 'color';

/**
 * Convert to color space and return a new color
 * @param {Object|string} space - Color space object or id
 * @param {Object} options
 * @param {boolean} options.inGamut - Whether to force resulting color in gamut
 * @returns {Color}
 */
function to(color, space, { inGamut } = {}) {
  color = getColor(color);
  space = ColorSpace.get(space);

  let coords = space.from(color);
  let ret = { space, coords, alpha: color.alpha };

  if (inGamut) {
    ret = toGamut(ret);
  }

  return ret;
}

to.returns = 'color';

/**
 * Generic toString() method, outputs a color(spaceId ...coords) function, a functional syntax, or custom formats defined by the color space
 * @param {Object} options
 * @param {number} options.precision - Significant digits
 * @param {boolean} options.inGamut - Adjust coordinates to fit in gamut first? [default: false]
 */
function serialize(
  color,
  { precision = defaults.precision, format = 'default', inGamut: inGamut$1 = true, ...customOptions } = {}
) {
  let ret;

  color = getColor(color);

  let formatId = format;
  format = color.space.getFormat(format) ?? color.space.getFormat('default') ?? ColorSpace.DEFAULT_FORMAT;

  inGamut$1 ||= format.toGamut;

  let coords = color.coords;

  // Convert NaN to zeros to have a chance at a valid CSS color
  // Also convert -0 to 0
  // This also clones it so we can manipulate it
  coords = coords.map((c) => (c ? c : 0));

  if (inGamut$1 && !inGamut(color)) {
    coords = toGamut(clone(color), inGamut$1 === true ? undefined : inGamut$1).coords;
  }

  if (format.type === 'custom') {
    customOptions.precision = precision;

    if (format.serialize) {
      ret = format.serialize(coords, color.alpha, customOptions);
    } else {
      throw new TypeError(`format ${formatId} can only be used to parse colors, not for serialization`);
    }
  } else {
    // Functional syntax
    let name = format.name || 'color';

    if (format.serializeCoords) {
      coords = format.serializeCoords(coords, precision);
    } else {
      if (precision !== null) {
        coords = coords.map((c) => toPrecision(c, precision));
      }
    }

    let args = [...coords];

    if (name === 'color') {
      // If output is a color() function, add colorspace id as first argument
      let cssId = format.id || format.ids?.[0] || color.space.id;
      args.unshift(cssId);
    }

    let alpha = color.alpha;
    if (precision !== null) {
      alpha = toPrecision(alpha, precision);
    }

    let strAlpha = color.alpha < 1 ? ` ${format.commas ? ',' : '/'} ${alpha}` : '';
    ret = `${name}(${args.join(format.commas ? ', ' : ' ')}${strAlpha})`;
  }

  return ret;
}

// convert an array of linear-light rec2020 values to CIE XYZ
// using  D65 (no chromatic adaptation)
// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
// 0 is actually calculated as  4.994106574466076e-17
const toXYZ_M$5 = [
  [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
  [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
  [0.0, 0.028072693049087428, 1.060985057710791],
];

// from ITU-R BT.2124-0 Annex 2 p.3
const fromXYZ_M$5 = [
  [1.716651187971268, -0.355670783776392, -0.25336628137366],
  [-0.666684351832489, 1.616481236634939, 0.0157685458139111],
  [0.017639857445311, -0.042770613257809, 0.942103121235474],
];

var REC2020Linear = new RGBColorSpace({
  id: 'rec2020-linear',
  name: 'Linear REC.2020',
  white: 'D65',
  toXYZ_M: toXYZ_M$5,
  fromXYZ_M: fromXYZ_M$5,
});

// import sRGB from "./srgb.js";

const α = 1.09929682680944;
const β = 0.018053968510807;

var REC2020 = new RGBColorSpace({
  id: 'rec2020',
  name: 'REC.2020',
  base: REC2020Linear,
  // Non-linear transfer function from Rec. ITU-R BT.2020-2 table 4
  toBase(RGB) {
    return RGB.map(function (val) {
      if (val < β * 4.5) {
        return val / 4.5;
      }

      return Math.pow((val + α - 1) / α, 1 / 0.45);
    });
  },
  fromBase(RGB) {
    return RGB.map(function (val) {
      if (val >= β) {
        return α * Math.pow(val, 0.45) - (α - 1);
      }

      return 4.5 * val;
    });
  },
  formats: {
    color: {},
  },
});

const toXYZ_M$4 = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0.0, 0.04511338185890264, 1.043944368900976],
];

const fromXYZ_M$4 = [
  [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
  [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
  [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];

var P3Linear = new RGBColorSpace({
  id: 'p3-linear',
  name: 'Linear P3',
  white: 'D65',
  toXYZ_M: toXYZ_M$4,
  fromXYZ_M: fromXYZ_M$4,
});

// This is the linear-light version of sRGB
// as used for example in SVG filters
// or in Canvas

// This matrix was calculated directly from the RGB and white chromaticities
// when rounded to 8 decimal places, it agrees completely with the official matrix
// see https://github.com/w3c/csswg-drafts/issues/5922
const toXYZ_M$3 = [
  [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
  [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
  [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];

// This matrix is the inverse of the above;
// again it agrees with the official definition when rounded to 8 decimal places
const fromXYZ_M$3 = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

var sRGBLinear = new RGBColorSpace({
  id: 'srgb-linear',
  name: 'Linear sRGB',
  white: 'D65',
  toXYZ_M: toXYZ_M$3,
  fromXYZ_M: fromXYZ_M$3,
  formats: {
    color: {},
  },
});

/* List of CSS color keywords
 * Note that this does not include currentColor, transparent,
 * or system colors
 */

// To produce: Visit https://www.w3.org/TR/css-color-4/#named-colors
// and run in the console:
// copy($$("tr", $(".named-color-table tbody")).map(tr => `"${tr.cells[2].textContent.trim()}": [${tr.cells[4].textContent.trim().split(/\s+/).map(c => c === "0"? "0" : c === "255"? "1" : c + " / 255").join(", ")}]`).join(",\n"))
var KEYWORDS = {
  aliceblue: [240 / 255, 248 / 255, 1],
  antiquewhite: [250 / 255, 235 / 255, 215 / 255],
  aqua: [0, 1, 1],
  aquamarine: [127 / 255, 1, 212 / 255],
  azure: [240 / 255, 1, 1],
  beige: [245 / 255, 245 / 255, 220 / 255],
  bisque: [1, 228 / 255, 196 / 255],
  black: [0, 0, 0],
  blanchedalmond: [1, 235 / 255, 205 / 255],
  blue: [0, 0, 1],
  blueviolet: [138 / 255, 43 / 255, 226 / 255],
  brown: [165 / 255, 42 / 255, 42 / 255],
  burlywood: [222 / 255, 184 / 255, 135 / 255],
  cadetblue: [95 / 255, 158 / 255, 160 / 255],
  chartreuse: [127 / 255, 1, 0],
  chocolate: [210 / 255, 105 / 255, 30 / 255],
  coral: [1, 127 / 255, 80 / 255],
  cornflowerblue: [100 / 255, 149 / 255, 237 / 255],
  cornsilk: [1, 248 / 255, 220 / 255],
  crimson: [220 / 255, 20 / 255, 60 / 255],
  cyan: [0, 1, 1],
  darkblue: [0, 0, 139 / 255],
  darkcyan: [0, 139 / 255, 139 / 255],
  darkgoldenrod: [184 / 255, 134 / 255, 11 / 255],
  darkgray: [169 / 255, 169 / 255, 169 / 255],
  darkgreen: [0, 100 / 255, 0],
  darkgrey: [169 / 255, 169 / 255, 169 / 255],
  darkkhaki: [189 / 255, 183 / 255, 107 / 255],
  darkmagenta: [139 / 255, 0, 139 / 255],
  darkolivegreen: [85 / 255, 107 / 255, 47 / 255],
  darkorange: [1, 140 / 255, 0],
  darkorchid: [153 / 255, 50 / 255, 204 / 255],
  darkred: [139 / 255, 0, 0],
  darksalmon: [233 / 255, 150 / 255, 122 / 255],
  darkseagreen: [143 / 255, 188 / 255, 143 / 255],
  darkslateblue: [72 / 255, 61 / 255, 139 / 255],
  darkslategray: [47 / 255, 79 / 255, 79 / 255],
  darkslategrey: [47 / 255, 79 / 255, 79 / 255],
  darkturquoise: [0, 206 / 255, 209 / 255],
  darkviolet: [148 / 255, 0, 211 / 255],
  deeppink: [1, 20 / 255, 147 / 255],
  deepskyblue: [0, 191 / 255, 1],
  dimgray: [105 / 255, 105 / 255, 105 / 255],
  dimgrey: [105 / 255, 105 / 255, 105 / 255],
  dodgerblue: [30 / 255, 144 / 255, 1],
  firebrick: [178 / 255, 34 / 255, 34 / 255],
  floralwhite: [1, 250 / 255, 240 / 255],
  forestgreen: [34 / 255, 139 / 255, 34 / 255],
  fuchsia: [1, 0, 1],
  gainsboro: [220 / 255, 220 / 255, 220 / 255],
  ghostwhite: [248 / 255, 248 / 255, 1],
  gold: [1, 215 / 255, 0],
  goldenrod: [218 / 255, 165 / 255, 32 / 255],
  gray: [128 / 255, 128 / 255, 128 / 255],
  green: [0, 128 / 255, 0],
  greenyellow: [173 / 255, 1, 47 / 255],
  grey: [128 / 255, 128 / 255, 128 / 255],
  honeydew: [240 / 255, 1, 240 / 255],
  hotpink: [1, 105 / 255, 180 / 255],
  indianred: [205 / 255, 92 / 255, 92 / 255],
  indigo: [75 / 255, 0, 130 / 255],
  ivory: [1, 1, 240 / 255],
  khaki: [240 / 255, 230 / 255, 140 / 255],
  lavender: [230 / 255, 230 / 255, 250 / 255],
  lavenderblush: [1, 240 / 255, 245 / 255],
  lawngreen: [124 / 255, 252 / 255, 0],
  lemonchiffon: [1, 250 / 255, 205 / 255],
  lightblue: [173 / 255, 216 / 255, 230 / 255],
  lightcoral: [240 / 255, 128 / 255, 128 / 255],
  lightcyan: [224 / 255, 1, 1],
  lightgoldenrodyellow: [250 / 255, 250 / 255, 210 / 255],
  lightgray: [211 / 255, 211 / 255, 211 / 255],
  lightgreen: [144 / 255, 238 / 255, 144 / 255],
  lightgrey: [211 / 255, 211 / 255, 211 / 255],
  lightpink: [1, 182 / 255, 193 / 255],
  lightsalmon: [1, 160 / 255, 122 / 255],
  lightseagreen: [32 / 255, 178 / 255, 170 / 255],
  lightskyblue: [135 / 255, 206 / 255, 250 / 255],
  lightslategray: [119 / 255, 136 / 255, 153 / 255],
  lightslategrey: [119 / 255, 136 / 255, 153 / 255],
  lightsteelblue: [176 / 255, 196 / 255, 222 / 255],
  lightyellow: [1, 1, 224 / 255],
  lime: [0, 1, 0],
  limegreen: [50 / 255, 205 / 255, 50 / 255],
  linen: [250 / 255, 240 / 255, 230 / 255],
  magenta: [1, 0, 1],
  maroon: [128 / 255, 0, 0],
  mediumaquamarine: [102 / 255, 205 / 255, 170 / 255],
  mediumblue: [0, 0, 205 / 255],
  mediumorchid: [186 / 255, 85 / 255, 211 / 255],
  mediumpurple: [147 / 255, 112 / 255, 219 / 255],
  mediumseagreen: [60 / 255, 179 / 255, 113 / 255],
  mediumslateblue: [123 / 255, 104 / 255, 238 / 255],
  mediumspringgreen: [0, 250 / 255, 154 / 255],
  mediumturquoise: [72 / 255, 209 / 255, 204 / 255],
  mediumvioletred: [199 / 255, 21 / 255, 133 / 255],
  midnightblue: [25 / 255, 25 / 255, 112 / 255],
  mintcream: [245 / 255, 1, 250 / 255],
  mistyrose: [1, 228 / 255, 225 / 255],
  moccasin: [1, 228 / 255, 181 / 255],
  navajowhite: [1, 222 / 255, 173 / 255],
  navy: [0, 0, 128 / 255],
  oldlace: [253 / 255, 245 / 255, 230 / 255],
  olive: [128 / 255, 128 / 255, 0],
  olivedrab: [107 / 255, 142 / 255, 35 / 255],
  orange: [1, 165 / 255, 0],
  orangered: [1, 69 / 255, 0],
  orchid: [218 / 255, 112 / 255, 214 / 255],
  palegoldenrod: [238 / 255, 232 / 255, 170 / 255],
  palegreen: [152 / 255, 251 / 255, 152 / 255],
  paleturquoise: [175 / 255, 238 / 255, 238 / 255],
  palevioletred: [219 / 255, 112 / 255, 147 / 255],
  papayawhip: [1, 239 / 255, 213 / 255],
  peachpuff: [1, 218 / 255, 185 / 255],
  peru: [205 / 255, 133 / 255, 63 / 255],
  pink: [1, 192 / 255, 203 / 255],
  plum: [221 / 255, 160 / 255, 221 / 255],
  powderblue: [176 / 255, 224 / 255, 230 / 255],
  purple: [128 / 255, 0, 128 / 255],
  rebeccapurple: [102 / 255, 51 / 255, 153 / 255],
  red: [1, 0, 0],
  rosybrown: [188 / 255, 143 / 255, 143 / 255],
  royalblue: [65 / 255, 105 / 255, 225 / 255],
  saddlebrown: [139 / 255, 69 / 255, 19 / 255],
  salmon: [250 / 255, 128 / 255, 114 / 255],
  sandybrown: [244 / 255, 164 / 255, 96 / 255],
  seagreen: [46 / 255, 139 / 255, 87 / 255],
  seashell: [1, 245 / 255, 238 / 255],
  sienna: [160 / 255, 82 / 255, 45 / 255],
  silver: [192 / 255, 192 / 255, 192 / 255],
  skyblue: [135 / 255, 206 / 255, 235 / 255],
  slateblue: [106 / 255, 90 / 255, 205 / 255],
  slategray: [112 / 255, 128 / 255, 144 / 255],
  slategrey: [112 / 255, 128 / 255, 144 / 255],
  snow: [1, 250 / 255, 250 / 255],
  springgreen: [0, 1, 127 / 255],
  steelblue: [70 / 255, 130 / 255, 180 / 255],
  tan: [210 / 255, 180 / 255, 140 / 255],
  teal: [0, 128 / 255, 128 / 255],
  thistle: [216 / 255, 191 / 255, 216 / 255],
  tomato: [1, 99 / 255, 71 / 255],
  turquoise: [64 / 255, 224 / 255, 208 / 255],
  violet: [238 / 255, 130 / 255, 238 / 255],
  wheat: [245 / 255, 222 / 255, 179 / 255],
  white: [1, 1, 1],
  whitesmoke: [245 / 255, 245 / 255, 245 / 255],
  yellow: [1, 1, 0],
  yellowgreen: [154 / 255, 205 / 255, 50 / 255],
};

let coordGrammar = Array(3).fill('<percentage> | <number>[0, 255]');

var sRGB = new RGBColorSpace({
  id: 'srgb',
  name: 'sRGB',
  base: sRGBLinear,
  fromBase: (rgb) => {
    // convert an array of linear-light sRGB values in the range 0.0-1.0
    // to gamma corrected form
    // https://en.wikipedia.org/wiki/SRGB
    return rgb.map((val) => {
      let sign = val < 0 ? -1 : 1;
      let abs = val * sign;

      if (abs > 0.0031308) {
        return sign * (1.055 * abs ** (1 / 2.4) - 0.055);
      }

      return 12.92 * val;
    });
  },
  toBase: (rgb) => {
    // convert an array of sRGB values in the range 0.0 - 1.0
    // to linear light (un-companded) form.
    // https://en.wikipedia.org/wiki/SRGB
    return rgb.map((val) => {
      let sign = val < 0 ? -1 : 1;
      let abs = val * sign;

      if (abs < 0.04045) {
        return val / 12.92;
      }

      return sign * ((abs + 0.055) / 1.055) ** 2.4;
    });
  },
  formats: {
    rgb: {
      coords: coordGrammar,
    },
    color: {
      /* use defaults */
    },
    rgba: {
      coords: coordGrammar,
      commas: true,
      lastAlpha: true,
    },
    hex: {
      type: 'custom',
      toGamut: true,
      test: (str) => /^#([a-f0-9]{3,4}){1,2}$/i.test(str),
      parse(str) {
        if (str.length <= 5) {
          // #rgb or #rgba, duplicate digits
          str = str.replace(/[a-f0-9]/gi, '$&$&');
        }

        let rgba = [];
        str.replace(/[a-f0-9]{2}/gi, (component) => {
          rgba.push(parseInt(component, 16) / 255);
        });

        return {
          spaceId: 'srgb',
          coords: rgba.slice(0, 3),
          alpha: rgba.slice(3)[0],
        };
      },
      serialize: (
        coords,
        alpha,
        {
          collapse = true, // collapse to 3-4 digit hex when possible?
        } = {}
      ) => {
        if (alpha < 1) {
          coords.push(alpha);
        }

        coords = coords.map((c) => Math.round(c * 255));

        let collapsible = collapse && coords.every((c) => c % 17 === 0);

        let hex = coords
          .map((c) => {
            if (collapsible) {
              return (c / 17).toString(16);
            }

            return c.toString(16).padStart(2, '0');
          })
          .join('');

        return '#' + hex;
      },
    },
    keyword: {
      type: 'custom',
      test: (str) => /^[a-z]+$/i.test(str),
      parse(str) {
        str = str.toLowerCase();
        let ret = { spaceId: 'srgb', coords: null, alpha: 1 };

        if (str === 'transparent') {
          ret.coords = KEYWORDS.black;
          ret.alpha = 0;
        } else {
          ret.coords = KEYWORDS[str];
        }

        if (ret.coords) {
          return ret;
        }
      },
    },
  },
});

var P3 = new RGBColorSpace({
  id: 'p3',
  name: 'P3',
  base: P3Linear,
  // Gamma encoding/decoding is the same as sRGB
  fromBase: sRGB.fromBase,
  toBase: sRGB.toBase,
  formats: {
    color: {
      id: 'display-p3',
    },
  },
});

// Default space for CSS output. Code in Color.js makes this wider if there's a DOM available
defaults.display_space = sRGB;

if (typeof CSS !== 'undefined' && CSS.supports) {
  // Find widest supported color space for CSS
  for (let space of [lab, REC2020, P3]) {
    let coords = space.getMinCoords();
    let color = { space, coords, alpha: 1 };
    let str = serialize(color);

    if (CSS.supports('color', str)) {
      defaults.display_space = space;
      break;
    }
  }
}

/**
 * Returns a serialization of the color that can actually be displayed in the browser.
 * If the default serialization can be displayed, it is returned.
 * Otherwise, the color is converted to Lab, REC2020, or P3, whichever is the widest supported.
 * In Node.js, this is basically equivalent to `serialize()` but returns a `String` object instead.
 *
 * @export
 * @param {{space, coords} | Color | string} color
 * @param {*} [options={}] Options to be passed to serialize()
 * @param {ColorSpace | string} [options.space = defaults.display_space] Color space to use for serialization if default is not supported
 * @returns {String} String object containing the serialized color with a color property containing the converted color (or the original, if no conversion was necessary)
 */
function display(color, { space = defaults.display_space, ...options } = {}) {
  let ret = serialize(color, options);

  if (typeof CSS === 'undefined' || CSS.supports('color', ret) || !defaults.display_space) {
    ret = new String(ret);
    ret.color = color;
  } else {
    // If we're here, what we were about to output is not supported
    // Fall back to fallback space
    let fallbackColor = to(color, space);
    ret = new String(serialize(fallbackColor, options));
    ret.color = fallbackColor;
  }

  return ret;
}

/**
 * Euclidean distance of colors in an arbitrary color space
 */
function distance(color1, color2, space = 'lab') {
  space = ColorSpace.get(space);

  let coords1 = space.from(color1);
  let coords2 = space.from(color2);

  return Math.sqrt(
    coords1.reduce((acc, c1, i) => {
      let c2 = coords2[i];
      if (isNaN(c1) || isNaN(c2)) {
        return acc;
      }

      return acc + (c2 - c1) ** 2;
    }, 0)
  );
}

function equals(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  return (
    color1.space === color2.space &&
    color1.alpha === color2.alpha &&
    color1.coords.every((c, i) => c === color2.coords[i])
  );
}

/**
 * Relative luminance
 */

function getLuminance(color) {
  return get(color, [XYZ_D65, 'y']);
}

function setLuminance(color) {
  set(color, [XYZ_D65, 'y'], value);
}

function register$2(Color) {
  Object.defineProperty(Color.prototype, 'luminance', {
    get() {
      return getLuminance(this);
    },
    set(value) {
      setLuminance(this);
    },
  });
}

var luminance = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  getLuminance: getLuminance,
  setLuminance: setLuminance,
  register: register$2,
});

// WCAG 2.0 contrast https://www.w3.org/TR/WCAG20-TECHS/G18.html

function contrastWCAG21(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  let Y1 = Math.max(getLuminance(color1), 0);
  let Y2 = Math.max(getLuminance(color2), 0);

  if (Y2 > Y1) {
    [Y1, Y2] = [Y2, Y1];
  }

  return (Y1 + 0.05) / (Y2 + 0.05);
}

// APCA 0.0.98G

// exponents
const normBG = 0.56;
const normTXT = 0.57;
const revTXT = 0.62;
const revBG = 0.65;

// clamps
const blkThrs = 0.022;
const blkClmp = 1.414;
const loClip = 0.1;
const deltaYmin = 0.0005;

// scalers
// see https://github.com/w3c/silver/issues/645
const scaleBoW = 1.14;
const loBoWoffset = 0.027;
const scaleWoB = 1.14;

function fclamp(Y) {
  if (Y >= blkThrs) return Y;
  return Y + (blkThrs - Y) ** blkClmp;
}

function linearize(val) {
  let sign = val < 0 ? -1 : 1;
  let abs = Math.abs(val);
  return sign * Math.pow(abs, 2.4);
}

// Not symmetric, requires a foreground (text) color, and a background color
function contrastAPCA(background, foreground) {
  foreground = getColor(foreground);
  background = getColor(background);

  let S;
  let C;
  let Sapc;

  // Myndex as-published, assumes sRGB inputs
  let R, G, B;

  foreground = to(foreground, 'srgb');
  // Should these be clamped to in-gamut values?

  // Calculates "screen luminance" with non-standard simple gamma EOTF
  // weights should be from CSS Color 4, not the ones here which are via Myndex and copied from Lindbloom
  [R, G, B] = foreground.coords;
  let lumTxt = linearize(R) * 0.2126729 + linearize(G) * 0.7151522 + linearize(B) * 0.072175;

  background = to(background, 'srgb');
  [R, G, B] = background.coords;
  let lumBg = linearize(R) * 0.2126729 + linearize(G) * 0.7151522 + linearize(B) * 0.072175;

  // toe clamping of very dark values to account for flare
  let Ytxt = fclamp(lumTxt);
  let Ybg = fclamp(lumBg);

  // are we "Black on White" (dark on light), or light on dark?
  let BoW = Ybg > Ytxt;

  // why is this a delta, when Y is not perceptually uniform?
  // Answer: it is a noise gate, see
  // https://github.com/LeaVerou/color.js/issues/208
  if (Math.abs(Ybg - Ytxt) < deltaYmin) {
    C = 0;
  } else {
    if (BoW) {
      // dark text on light background
      S = Ybg ** normBG - Ytxt ** normTXT;
      C = S * scaleBoW;
    } else {
      // light text on dark background
      S = Ybg ** revBG - Ytxt ** revTXT;
      C = S * scaleWoB;
    }
  }
  if (Math.abs(C) < loClip) {
    Sapc = 0;
  } else if (C > 0) {
    // not clear whether Woffset is loBoWoffset or loWoBoffset
    // but they have the same value
    Sapc = C - loBoWoffset;
  } else {
    Sapc = C + loBoWoffset;
  }

  return Sapc * 100;
}

// Michelson  luminance contrast

function contrastMichelson(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  let Y1 = Math.max(getLuminance(color1), 0);
  let Y2 = Math.max(getLuminance(color2), 0);

  if (Y2 > Y1) {
    [Y1, Y2] = [Y2, Y1];
  }

  let denom = Y1 + Y2;
  return denom === 0 ? 0 : (Y1 - Y2) / denom;
}

// Weber luminance contrast

// the darkest sRGB color above black is #000001 and this produces
// a plain Weber contrast of ~45647.
// So, setting the divide-by-zero result at 50000 is a reasonable
// max clamp for the plain Weber
const max = 50000;

function contrastWeber(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  let Y1 = Math.max(getLuminance(color1), 0);
  let Y2 = Math.max(getLuminance(color2), 0);

  if (Y2 > Y1) {
    [Y1, Y2] = [Y2, Y1];
  }

  return Y2 === 0 ? max : (Y1 - Y2) / Y2;
}

// CIE Lightness difference, as used by Google Material Design

function contrastLstar(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  let L1 = get(color1, [lab, 'l']);
  let L2 = get(color2, [lab, 'l']);

  return Math.abs(L1 - L2);
}

// κ * ε  = 2^3 = 8
const ε$1 = 216 / 24389; // 6^3/29^3 == (24/116)^3
const ε3 = 24 / 116;
const κ = 24389 / 27; // 29^3/3^3

let white = WHITES.D65;

var lab_d65 = new ColorSpace({
  id: 'lab-d65',
  name: 'Lab D65',
  coords: {
    l: {
      refRange: [0, 100],
      name: 'L',
    },
    a: {
      refRange: [-125, 125],
    },
    b: {
      refRange: [-125, 125],
    },
  },

  // Assuming XYZ is relative to D65, convert to CIE Lab
  // from CIE standard, which now defines these as a rational fraction
  white,

  base: XYZ_D65,
  // Convert D65-adapted XYZ to Lab
  //  CIE 15.3:2004 section 8.2.1.1
  fromBase(XYZ) {
    // compute xyz, which is XYZ scaled relative to reference white
    let xyz = XYZ.map((value, i) => value / white[i]);

    // now compute f
    let f = xyz.map((value) => (value > ε$1 ? Math.cbrt(value) : (κ * value + 16) / 116));

    return [
      116 * f[1] - 16, // L
      500 * (f[0] - f[1]), // a
      200 * (f[1] - f[2]), // b
    ];
  },
  // Convert Lab to D65-adapted XYZ
  // Same result as CIE 15.3:2004 Appendix D although the derivation is different
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  toBase(Lab) {
    // compute f, starting with the luminance-related term
    let f = [];
    f[1] = (Lab[0] + 16) / 116;
    f[0] = Lab[1] / 500 + f[1];
    f[2] = f[1] - Lab[2] / 200;

    // compute xyz
    let xyz = [
      f[0] > ε3 ? Math.pow(f[0], 3) : (116 * f[0] - 16) / κ,
      Lab[0] > 8 ? Math.pow((Lab[0] + 16) / 116, 3) : Lab[0] / κ,
      f[2] > ε3 ? Math.pow(f[2], 3) : (116 * f[2] - 16) / κ,
    ];

    // Compute XYZ by scaling xyz by reference white
    return xyz.map((value, i) => value * white[i]);
  },

  formats: {
    'lab-d65': {
      coords: ['<percentage> | <number>', '<number>', '<number>'],
    },
  },
});

// Delta Phi Star perceptual lightness contrast

const phi = Math.pow(5, 0.5) * 0.5 + 0.5; // Math.phi can be used if Math.js

function contrastDeltaPhi(color1, color2) {
  color1 = getColor(color1);
  color2 = getColor(color2);

  let Lstr1 = get(color1, [lab_d65, 'l']);
  let Lstr2 = get(color2, [lab_d65, 'l']);

  let deltaPhiStar = Math.abs(Math.pow(Lstr1, phi) - Math.pow(Lstr2, phi));

  let contrast = Math.pow(deltaPhiStar, 1 / phi) * Math.SQRT2 - 40;

  return contrast < 7.5 ? 0.0 : contrast;
}

var contrastMethods = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  contrastWCAG21: contrastWCAG21,
  contrastAPCA: contrastAPCA,
  contrastMichelson: contrastMichelson,
  contrastWeber: contrastWeber,
  contrastLstar: contrastLstar,
  contrastDeltaPhi: contrastDeltaPhi,
});

function contrast(background, foreground, o = {}) {
  if (isString(o)) {
    o = { algorithm: o };
  }

  let { algorithm, ...rest } = o;

  if (!algorithm) {
    let algorithms = Object.keys(contrastMethods)
      .map((a) => a.replace(/^contrast/, ''))
      .join(', ');
    throw new TypeError(`contrast() function needs a contrast algorithm. Please specify one of: ${algorithms}`);
  }

  background = getColor(background);
  foreground = getColor(foreground);

  for (let a in contrastMethods) {
    if ('contrast' + algorithm.toLowerCase() === a.toLowerCase()) {
      return contrastMethods[a](background, foreground, rest);
    }
  }

  throw new TypeError(`Unknown contrast algorithm: ${algorithm}`);
}

// Chromaticity coordinates
function uv(color) {
  let [X, Y, Z] = getAll(color, XYZ_D65);
  let denom = X + 15 * Y + 3 * Z;
  return [(4 * X) / denom, (9 * Y) / denom];
}

function xy(color) {
  let [X, Y, Z] = getAll(color, XYZ_D65);
  let sum = X + Y + Z;
  return [X / sum, Y / sum];
}

function register$1(Color) {
  // no setters, as lightness information is lost
  // when converting color to chromaticity
  Object.defineProperty(Color.prototype, 'uv', {
    get() {
      return uv(this);
    },
  });

  Object.defineProperty(Color.prototype, 'xy', {
    get() {
      return xy(this);
    },
  });
}

var chromaticity = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  uv: uv,
  xy: xy,
  register: register$1,
});

function deltaE76(color, sample) {
  return distance(color, sample, 'lab');
}

// More accurate color-difference formulae
// than the simple 1976 Euclidean distance in Lab

// CMC by the Color Measurement Committee of the
// Bradford Society of Dyeists and Colorsts, 1994.
// Uses LCH rather than Lab,
// with different weights for L, C and H differences
// A nice increase in accuracy for modest increase in complexity
const π = Math.PI;
const d2r = π / 180;

function deltaECMC(color, sample, { l = 2, c = 1 } = {}) {
  // Given this color as the reference
  // and a sample,
  // calculate deltaE CMC.

  // This implementation assumes the parametric
  // weighting factors l:c are 2:1
  // which is typical for non-textile uses.

  let [L1, a1, b1] = lab.from(color);
  let [, C1, H1] = lch.from(lab, [L1, a1, b1]);
  let [L2, a2, b2] = lab.from(sample);
  let C2 = lch.from(lab, [L2, a2, b2])[1];

  // let [L1, a1, b1] = color.getAll(lab);
  // let C1 = color.get("lch.c");
  // let H1 = color.get("lch.h");
  // let [L2, a2, b2] = sample.getAll(lab);
  // let C2 = sample.get("lch.c");

  // Check for negative Chroma,
  // which might happen through
  // direct user input of LCH values

  if (C1 < 0) {
    C1 = 0;
  }
  if (C2 < 0) {
    C2 = 0;
  }

  // we don't need H2 as ΔH is calculated from Δa, Δb and ΔC

  // Lightness and Chroma differences
  // These are (color - sample), unlike deltaE2000
  let ΔL = L1 - L2;
  let ΔC = C1 - C2;

  let Δa = a1 - a2;
  let Δb = b1 - b2;

  // weighted Hue difference, less for larger Chroma difference

  let H2 = Δa ** 2 + Δb ** 2 - ΔC ** 2;
  // due to roundoff error it is possible that, for zero a and b,
  // ΔC > Δa + Δb is 0, resulting in attempting
  // to take the square root of a negative number

  // trying instead the equation from Industrial Color Physics
  // By Georg A. Klein

  // let ΔH = ((a1 * b2) - (a2 * b1)) / Math.sqrt(0.5 * ((C2 * C1) + (a2 * a1) + (b2 * b1)));
  // console.log({ΔH});
  // This gives the same result to 12 decimal places
  // except it sometimes NaNs when trying to root a negative number

  // let ΔH = Math.sqrt(H2); we never actually use the root, it gets squared again!!

  // positional corrections to the lack of uniformity of CIELAB
  // These are all trying to make JND ellipsoids more like spheres

  // SL Lightness crispening factor, depends entirely on L1 not L2
  let SL = 0.511; // linear portion of the Y to L transfer function
  if (L1 >= 16) {
    // cubic portion
    SL = (0.040975 * L1) / (1 + 0.01765 * L1);
  }

  // SC Chroma factor
  let SC = (0.0638 * C1) / (1 + 0.0131 * C1) + 0.638;

  // Cross term T for blue non-linearity
  let T;
  if (Number.isNaN(H1)) {
    H1 = 0;
  }

  if (H1 >= 164 && H1 <= 345) {
    T = 0.56 + Math.abs(0.2 * Math.cos((H1 + 168) * d2r));
  } else {
    T = 0.36 + Math.abs(0.4 * Math.cos((H1 + 35) * d2r));
  }
  // console.log({T});

  // SH Hue factor also depends on C1,
  let C4 = Math.pow(C1, 4);
  let F = Math.sqrt(C4 / (C4 + 1900));
  let SH = SC * (F * T + 1 - F);

  // Finally calculate the deltaE, term by term as root sume of squares
  let dE = (ΔL / (l * SL)) ** 2;
  dE += (ΔC / (c * SC)) ** 2;
  dE += H2 / SH ** 2;
  // dE += (ΔH / SH)  ** 2;
  return Math.sqrt(dE);
  // Yay!!!
}

const Yw$1 = 203; // absolute luminance of media white

var XYZ_Abs_D65 = new ColorSpace({
  // Absolute CIE XYZ, with a D65 whitepoint,
  // as used in most HDR colorspaces as a starting point.
  // SDR spaces are converted per BT.2048
  // so that diffuse, media white is 203 cd/m²
  id: 'xyz-abs-d65',
  name: 'Absolute XYZ D65',
  coords: {
    x: {
      refRange: [0, 9504.7],
      name: 'Xa',
    },
    y: {
      refRange: [0, 10000],
      name: 'Ya',
    },
    z: {
      refRange: [0, 10888.3],
      name: 'Za',
    },
  },

  base: XYZ_D65,
  fromBase(XYZ) {
    // Make XYZ absolute, not relative to media white
    // Maximum luminance in PQ is 10,000 cd/m²
    // Relative XYZ has Y=1 for media white
    return XYZ.map((v) => Math.max(v * Yw$1, 0));
  },
  toBase(AbsXYZ) {
    // Convert to media-white relative XYZ
    return AbsXYZ.map((v) => Math.max(v / Yw$1, 0));
  },
});

const b$1 = 1.15;
const g = 0.66;
const n$1 = 2610 / 2 ** 14;
const ninv$1 = 2 ** 14 / 2610;
const c1$2 = 3424 / 2 ** 12;
const c2$2 = 2413 / 2 ** 7;
const c3$2 = 2392 / 2 ** 7;
const p = (1.7 * 2523) / 2 ** 5;
const pinv = 2 ** 5 / (1.7 * 2523);
const d = -0.56;
const d0 = 1.6295499532821566e-11;

const XYZtoCone_M = [
  [0.41478972, 0.579999, 0.014648],
  [-0.20151, 1.120649, 0.0531008],
  [-0.0166008, 0.2648, 0.6684799],
];
// XYZtoCone_M inverted
const ConetoXYZ_M = [
  [1.9242264357876067, -1.0047923125953657, 0.037651404030618],
  [0.35031676209499907, 0.7264811939316552, -0.06538442294808501],
  [-0.09098281098284752, -0.3127282905230739, 1.5227665613052603],
];
const ConetoIab_M = [
  [0.5, 0.5, 0],
  [3.524, -4.066708, 0.542708],
  [0.199076, 1.096799, -1.295875],
];
// ConetoIab_M inverted
const IabtoCone_M = [
  [1, 0.1386050432715393, 0.05804731615611886],
  [0.9999999999999999, -0.1386050432715393, -0.05804731615611886],
  [0.9999999999999998, -0.09601924202631895, -0.8118918960560388],
];

var Jzazbz = new ColorSpace({
  id: 'jzazbz',
  name: 'Jzazbz',
  coords: {
    jz: {
      refRange: [0, 1],
      name: 'Jz',
    },
    az: {
      refRange: [-0.5, 0.5],
    },
    bz: {
      refRange: [-0.5, 0.5],
    },
  },

  base: XYZ_Abs_D65,
  fromBase(XYZ) {
    // First make XYZ absolute, not relative to media white
    // Maximum luminance in PQ is 10,000 cd/m²
    // Relative XYZ has Y=1 for media white
    // BT.2048 says media white Y=203 at PQ 58

    let [Xa, Ya, Za] = XYZ;

    // modify X and Y
    let Xm = b$1 * Xa - (b$1 - 1) * Za;
    let Ym = g * Ya - (g - 1) * Xa;

    // move to LMS cone domain
    let LMS = multiplyMatrices(XYZtoCone_M, [Xm, Ym, Za]);

    // PQ-encode LMS
    let PQLMS = LMS.map(function (val) {
      let num = c1$2 + c2$2 * (val / 10000) ** n$1;
      let denom = 1 + c3$2 * (val / 10000) ** n$1;

      return (num / denom) ** p;
    });

    // almost there, calculate Iz az bz
    let [Iz, az, bz] = multiplyMatrices(ConetoIab_M, PQLMS);
    // console.log({Iz, az, bz});

    let Jz = ((1 + d) * Iz) / (1 + d * Iz) - d0;
    return [Jz, az, bz];
  },
  toBase(Jzazbz) {
    let [Jz, az, bz] = Jzazbz;
    let Iz = (Jz + d0) / (1 + d - d * (Jz + d0));

    // bring into LMS cone domain
    let PQLMS = multiplyMatrices(IabtoCone_M, [Iz, az, bz]);

    // convert from PQ-coded to linear-light
    let LMS = PQLMS.map(function (val) {
      let num = c1$2 - val ** pinv;
      let denom = c3$2 * val ** pinv - c2$2;
      let x = 10000 * (num / denom) ** ninv$1;

      return x; // luminance relative to diffuse white, [0, 70 or so].
    });

    // modified abs XYZ
    let [Xm, Ym, Za] = multiplyMatrices(ConetoXYZ_M, LMS);

    // restore standard D50 relative XYZ, relative to media white
    let Xa = (Xm + (b$1 - 1) * Za) / b$1;
    let Ya = (Ym + (g - 1) * Xa) / g;
    return [Xa, Ya, Za];
  },

  formats: {
    // https://drafts.csswg.org/css-color-hdr/#Jzazbz
    color: {},
  },
});

var jzczhz = new ColorSpace({
  id: 'jzczhz',
  name: 'JzCzHz',
  coords: {
    jz: {
      refRange: [0, 1],
      name: 'Jz',
    },
    cz: {
      refRange: [0, 1],
      name: 'Chroma',
    },
    hz: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
  },

  base: Jzazbz,
  fromBase(jzazbz) {
    // Convert to polar form
    let [Jz, az, bz] = jzazbz;
    let hue;
    const ε = 0.0002; // chromatic components much smaller than a,b

    if (Math.abs(az) < ε && Math.abs(bz) < ε) {
      hue = NaN;
    } else {
      hue = (Math.atan2(bz, az) * 180) / Math.PI;
    }

    return [
      Jz, // Jz is still Jz
      Math.sqrt(az ** 2 + bz ** 2), // Chroma
      constrain(hue), // Hue, in degrees [0 to 360)
    ];
  },
  toBase(jzczhz) {
    // Convert from polar form
    // debugger;
    return [
      jzczhz[0], // Jz is still Jz
      jzczhz[1] * Math.cos((jzczhz[2] * Math.PI) / 180), // az
      jzczhz[1] * Math.sin((jzczhz[2] * Math.PI) / 180), // bz
    ];
  },
  formats: {
    color: {},
  },
});

// More accurate color-difference formulae
// than the simple 1976 Euclidean distance in Lab

// Uses JzCzHz, which has improved perceptual uniformity
// and thus a simple Euclidean root-sum of ΔL² ΔC² ΔH²
// gives good results.

function deltaEJz(color, sample) {
  // Given this color as the reference
  // and a sample,
  // calculate deltaE in JzCzHz.
  let [Jz1, Cz1, Hz1] = jzczhz.from(color);
  let [Jz2, Cz2, Hz2] = jzczhz.from(sample);

  // Lightness and Chroma differences
  // sign does not matter as they are squared.
  let ΔJ = Jz1 - Jz2;
  let ΔC = Cz1 - Cz2;

  // length of chord for ΔH
  if (Number.isNaN(Hz1) && Number.isNaN(Hz2)) {
    // both undefined hues
    Hz1 = 0;
    Hz2 = 0;
  } else if (Number.isNaN(Hz1)) {
    // one undefined, set to the defined hue
    Hz1 = Hz2;
  } else if (Number.isNaN(Hz2)) {
    Hz2 = Hz1;
  }

  let Δh = Hz1 - Hz2;
  let ΔH = 2 * Math.sqrt(Cz1 * Cz2) * Math.sin((Δh / 2) * (Math.PI / 180));

  return Math.sqrt(ΔJ ** 2 + ΔC ** 2 + ΔH ** 2);
}

const c1$1 = 3424 / 4096;
const c2$1 = 2413 / 128;
const c3$1 = 2392 / 128;
const m1 = 2610 / 16384;
const m2 = 2523 / 32;
const im1 = 16384 / 2610;
const im2 = 32 / 2523;

// The matrix below includes the 4% crosstalk components
// and is from the Dolby "What is ICtCp" paper"
const XYZtoLMS_M$1 = [
  [0.3592, 0.6976, -0.0358],
  [-0.1922, 1.1004, 0.0755],
  [0.007, 0.0749, 0.8434],
];
// linear-light Rec.2020 to LMS, again with crosstalk
// rational terms from Jan Fröhlich,
// Encoding High Dynamic Range andWide Color Gamut Imagery, p.97
// and ITU-R BT.2124-0 p.2
/*
const Rec2020toLMS_M = [
	[ 1688 / 4096,  2146 / 4096,   262 / 4096 ],
	[  683 / 4096,  2951 / 4096,   462 / 4096 ],
	[   99 / 4096,   309 / 4096,  3688 / 4096 ]
];
*/
// this includes the Ebner LMS coefficients,
// the rotation, and the scaling to [-0.5,0.5] range
// rational terms from Fröhlich p.97
// and ITU-R BT.2124-0 pp.2-3
const LMStoIPT_M = [
  [2048 / 4096, 2048 / 4096, 0],
  [6610 / 4096, -13613 / 4096, 7003 / 4096],
  [17933 / 4096, -17390 / 4096, -543 / 4096],
];

// inverted matrices, calculated from the above
const IPTtoLMS_M = [
  [0.99998889656284013833, 0.00860505014728705821, 0.1110343715986164786],
  [1.0000111034371598616, -0.00860505014728705821, -0.1110343715986164786],
  [1.000032063391005412, 0.56004913547279000113, -0.32063391005412026469],
];
/*
const LMStoRec2020_M = [
	[ 3.4375568932814012112,   -2.5072112125095058195,   0.069654319228104608382],
	[-0.79142868665644156125,   1.9838372198740089874,  -0.19240853321756742626 ],
	[-0.025646662911506476363, -0.099240248643945566751, 1.1248869115554520431  ]
];
*/
const LMStoXYZ_M$1 = [
  [2.0701800566956135096, -1.3264568761030210255, 0.20661600684785517081],
  [0.36498825003265747974, 0.68046736285223514102, -0.045421753075853231409],
  [-0.049595542238932107896, -0.049421161186757487412, 1.1879959417328034394],
];

// Only the PQ form of ICtCp is implemented here. There is also an HLG form.
// from Dolby, "WHAT IS ICTCP?"
// https://professional.dolby.com/siteassets/pdfs/ictcp_dolbywhitepaper_v071.pdf
// and
// Dolby, "Perceptual Color Volume
// Measuring the Distinguishable Colors of HDR and WCG Displays"
// https://professional.dolby.com/siteassets/pdfs/dolby-vision-measuring-perceptual-color-volume-v7.1.pdf
var ictcp = new ColorSpace({
  id: 'ictcp',
  name: 'ICTCP',
  // From BT.2100-2 page 7:
  // During production, signal values are expected to exceed the
  // range E′ = [0.0 : 1.0]. This provides processing headroom and avoids
  // signal degradation during cascaded processing. Such values of E′,
  // below 0.0 or exceeding 1.0, should not be clipped during production
  // and exchange.
  // Values below 0.0 should not be clipped in reference displays (even
  // though they represent “negative” light) to allow the black level of
  // the signal (LB) to be properly set using test signals known as “PLUGE”
  coords: {
    i: {
      refRange: [0, 1], // Constant luminance,
      name: 'I',
    },
    ct: {
      refRange: [-0.5, 0.5], // Full BT.2020 gamut in range [-0.5, 0.5]
      name: 'CT',
    },
    cp: {
      refRange: [-0.5, 0.5],
      name: 'CP',
    },
  },

  base: XYZ_Abs_D65,
  fromBase(XYZ) {
    // move to LMS cone domain
    let LMS = multiplyMatrices(XYZtoLMS_M$1, XYZ);

    return LMStoICtCp(LMS);
  },
  toBase(ICtCp) {
    let LMS = ICtCptoLMS(ICtCp);

    return multiplyMatrices(LMStoXYZ_M$1, LMS);
  },
  formats: {
    color: {},
  },
});

function LMStoICtCp(LMS) {
  // apply the PQ EOTF
  // we can't ever be dividing by zero because of the "1 +" in the denominator
  let PQLMS = LMS.map(function (val) {
    let num = c1$1 + c2$1 * (val / 10000) ** m1;
    let denom = 1 + c3$1 * (val / 10000) ** m1;

    return (num / denom) ** m2;
  });

  // LMS to IPT, with rotation for Y'C'bC'r compatibility
  return multiplyMatrices(LMStoIPT_M, PQLMS);
}

function ICtCptoLMS(ICtCp) {
  let PQLMS = multiplyMatrices(IPTtoLMS_M, ICtCp);

  // From BT.2124-0 Annex 2 Conversion 3
  let LMS = PQLMS.map(function (val) {
    let num = Math.max(val ** im2 - c1$1, 0);
    let denom = c2$1 - c3$1 * val ** im2;
    return 10000 * (num / denom) ** im1;
  });

  return LMS;
}

// Delta E in ICtCp space,
// which the ITU calls Delta E ITP, which is shorter
// formulae from ITU Rec. ITU-R BT.2124-0

function deltaEITP(color, sample) {
  // Given this color as the reference
  // and a sample,
  // calculate deltaE in ICtCp
  // which is simply the Euclidean distance

  let [I1, T1, P1] = ictcp.from(color);
  let [I2, T2, P2] = ictcp.from(sample);

  // the 0.25 factor is to undo the encoding scaling in Ct
  // the 720 is so that 1 deltaE = 1 JND
  // per  ITU-R BT.2124-0 p.3

  return 720 * Math.sqrt((I1 - I2) ** 2 + 0.25 * (T1 - T2) ** 2 + (P1 - P2) ** 2);
}

// Recalculated for consistent reference white
// see https://github.com/w3c/csswg-drafts/issues/6642#issuecomment-943521484
const XYZtoLMS_M = [
  [0.8190224432164319, 0.3619062562801221, -0.12887378261216414],
  [0.0329836671980271, 0.9292868468965546, 0.03614466816999844],
  [0.048177199566046255, 0.26423952494422764, 0.6335478258136937],
];
// inverse of XYZtoLMS_M
const LMStoXYZ_M = [
  [1.2268798733741557, -0.5578149965554813, 0.28139105017721583],
  [-0.04057576262431372, 1.1122868293970594, -0.07171106666151701],
  [-0.07637294974672142, -0.4214933239627914, 1.5869240244272418],
];
const LMStoLab_M = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
// LMStoIab_M inverted
const LabtoLMS_M = [
  [0.99999999845051981432, 0.39633779217376785678, 0.21580375806075880339],
  [1.0000000088817607767, -0.1055613423236563494, -0.063854174771705903402],
  [1.0000000546724109177, -0.089484182094965759684, -1.2914855378640917399],
];

var OKLab = new ColorSpace({
  id: 'oklab',
  name: 'OKLab',
  coords: {
    l: {
      refRange: [0, 1],
      name: 'L',
    },
    a: {
      refRange: [-0.4, 0.4],
    },
    b: {
      refRange: [-0.4, 0.4],
    },
  },

  // Note that XYZ is relative to D65
  white: 'D65',
  base: XYZ_D65,
  fromBase(XYZ) {
    // move to LMS cone domain
    let LMS = multiplyMatrices(XYZtoLMS_M, XYZ);

    // non-linearity
    let LMSg = LMS.map((val) => Math.cbrt(val));

    return multiplyMatrices(LMStoLab_M, LMSg);
  },
  toBase(OKLab) {
    // move to LMS cone domain
    let LMSg = multiplyMatrices(LabtoLMS_M, OKLab);

    // restore linearity
    let LMS = LMSg.map((val) => val ** 3);

    return multiplyMatrices(LMStoXYZ_M, LMS);
  },

  formats: {
    oklab: {
      coords: ['<percentage>', '<number>', '<number>'],
    },
  },
});

// More accurate color-difference formulae

function deltaEOK(color, sample) {
  // Given this color as the reference
  // and a sample,
  // calculate deltaEOK, term by term as root sum of squares
  let [L1, a1, b1] = OKLab.from(color);
  let [L2, a2, b2] = OKLab.from(sample);
  let ΔL = L1 - L2;
  let Δa = a1 - a2;
  let Δb = b1 - b2;
  return Math.sqrt(ΔL ** 2 + Δa ** 2 + Δb ** 2);
}

var deltaEMethods = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  deltaE76: deltaE76,
  deltaECMC: deltaECMC,
  deltaE2000: deltaE2000,
  deltaEJz: deltaEJz,
  deltaEITP: deltaEITP,
  deltaEOK: deltaEOK,
});

function deltaE(c1, c2, o = {}) {
  if (isString(o)) {
    o = { method: o };
  }

  let { method = defaults.deltaE, ...rest } = o;

  c1 = getColor(c1);
  c2 = getColor(c2);

  for (let m in deltaEMethods) {
    if ('deltae' + method.toLowerCase() === m.toLowerCase()) {
      return deltaEMethods[m](c1, c2, rest);
    }
  }

  throw new TypeError(`Unknown deltaE method: ${method}`);
}

var deltaE$1 = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  default: deltaE,
});

function lighten(color, amount = 0.25) {
  let space = ColorSpace.get('oklch', 'lch');
  let lightness = [space, 'l'];
  return set$1(color, lightness, (l) => l * (1 + amount));
}

function darken(color, amount = 0.25) {
  let space = ColorSpace.get('oklch', 'lch');
  let lightness = [space, 'l'];
  return set$1(color, lightness, (l) => l * (1 - amount));
}

var variations = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  lighten: lighten,
  darken: darken,
});

/**
 * Functions related to color interpolation
 */

/**
 * Return an intermediate color between two colors
 * Signatures: mix(c1, c2, p, options)
 *             mix(c1, c2, options)
 *             mix(color)
 * @param {Color | string} c1 The first color
 * @param {Color | string} [c2] The second color
 * @param {number} [p=.5] A 0-1 percentage where 0 is c1 and 1 is c2
 * @param {Object} [o={}]
 * @return {Color}
 */
function mix(c1, c2, p = 0.5, o = {}) {
  [c1, c2] = [getColor(c1), getColor(c2)];

  if (type(p) === 'object') {
    [p, o] = [0.5, p];
  }

  let { space, outputSpace } = o;

  let r = range(c1, c2, { space, outputSpace });
  return r(p);
}

/**
 *
 * @param {Color | string | Function} c1 The first color or a range
 * @param {Color | string} [c2] The second color if c1 is not a range
 * @param {Object} [options={}]
 * @return {Color[]}
 */
function steps(c1, c2, options = {}) {
  let colorRange;

  if (isRange(c1)) {
    // Tweaking existing range
    [colorRange, options] = [c1, c2];
    [c1, c2] = colorRange.rangeArgs.colors;
  }

  let { maxDeltaE, deltaEMethod, steps = 2, maxSteps = 1000, ...rangeOptions } = options;

  if (!colorRange) {
    [c1, c2] = [getColor(c1), getColor(c2)];
    colorRange = range(c1, c2, rangeOptions);
  }

  let totalDelta = deltaE(c1, c2);
  let actualSteps = maxDeltaE > 0 ? Math.max(steps, Math.ceil(totalDelta / maxDeltaE) + 1) : steps;
  let ret = [];

  if (maxSteps !== undefined) {
    actualSteps = Math.min(actualSteps, maxSteps);
  }

  if (actualSteps === 1) {
    ret = [{ p: 0.5, color: colorRange(0.5) }];
  } else {
    let step = 1 / (actualSteps - 1);
    ret = Array.from({ length: actualSteps }, (_, i) => {
      let p = i * step;
      return { p, color: colorRange(p) };
    });
  }

  if (maxDeltaE > 0) {
    // Iterate over all stops and find max deltaE
    let maxDelta = ret.reduce((acc, cur, i) => {
      if (i === 0) {
        return 0;
      }

      let ΔΕ = deltaE(cur.color, ret[i - 1].color, deltaEMethod);
      return Math.max(acc, ΔΕ);
    }, 0);

    while (maxDelta > maxDeltaE) {
      // Insert intermediate stops and measure maxDelta again
      // We need to do this for all pairs, otherwise the midpoint shifts
      maxDelta = 0;

      for (let i = 1; i < ret.length && ret.length < maxSteps; i++) {
        let prev = ret[i - 1];
        let cur = ret[i];

        let p = (cur.p + prev.p) / 2;
        let color = colorRange(p);
        maxDelta = Math.max(maxDelta, deltaE(color, prev.color), deltaE(color, cur.color));
        ret.splice(i, 0, { p, color: colorRange(p) });
        i++;
      }
    }
  }

  ret = ret.map((a) => a.color);

  return ret;
}
/**
 * Interpolate to color2 and return a function that takes a 0-1 percentage
 * @param {Color | string | Function} color1 The first color or an existing range
 * @param {Color | string} [color2] If color1 is a color, this is the second color
 * @param {Object} [options={}]
 * @returns {Function} A function that takes a 0-1 percentage and returns a color
 */
function range(color1, color2, options = {}) {
  if (isRange(color1)) {
    // Tweaking existing range
    let [r, options] = [color1, color2];

    return range(...r.rangeArgs.colors, { ...r.rangeArgs.options, ...options });
  }

  let { space, outputSpace, progression, premultiplied } = options;

  color1 = getColor(color1);
  color2 = getColor(color2);

  // Make sure we're working on copies of these colors
  color1 = clone(color1);
  color2 = clone(color2);

  let rangeArgs = { colors: [color1, color2], options };

  if (space) {
    space = ColorSpace.get(space);
  } else {
    space = ColorSpace.registry[defaults.interpolationSpace] || color1.space;
  }

  outputSpace = outputSpace ? ColorSpace.get(outputSpace) : space;

  color1 = to(color1, space);
  color2 = to(color2, space);

  // Gamut map to avoid areas of flat color
  color1 = toGamut(color1);
  color2 = toGamut(color2);

  // Handle hue interpolation
  // See https://github.com/w3c/csswg-drafts/issues/4735#issuecomment-635741840
  if (space.coords.h && space.coords.h.type === 'angle') {
    let arc = (options.hue = options.hue || 'shorter');

    let hue = [space, 'h'];
    let [θ1, θ2] = [get(color1, hue), get(color2, hue)];
    [θ1, θ2] = adjust(arc, [θ1, θ2]);
    set$1(color1, hue, θ1);
    set$1(color2, hue, θ2);
  }

  if (premultiplied) {
    // not coping with polar spaces yet
    color1.coords = color1.coords.map((c) => c * color1.alpha);
    color2.coords = color2.coords.map((c) => c * color2.alpha);
  }

  return Object.assign(
    (p) => {
      p = progression ? progression(p) : p;
      let coords = color1.coords.map((start, i) => {
        let end = color2.coords[i];
        return interpolate(start, end, p);
      });

      let alpha = interpolate(color1.alpha, color2.alpha, p);
      let ret = { space, coords, alpha };

      if (premultiplied) {
        // undo premultiplication
        ret.coords = ret.coords.map((c) => c / alpha);
      }

      if (outputSpace !== space) {
        ret = to(ret, outputSpace);
      }

      return ret;
    },
    {
      rangeArgs,
    }
  );
}
function isRange(val) {
  return type(val) === 'function' && !!val.rangeArgs;
}
defaults.interpolationSpace = 'lab';

function register(Color) {
  Color.defineFunction('mix', mix, { returns: 'color' });
  Color.defineFunction('range', range, { returns: 'function<color>' });
  Color.defineFunction('steps', steps, { returns: 'array<color>' });
}

var interpolation = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  mix: mix,
  steps: steps,
  range: range,
  isRange: isRange,
  register: register,
});

var HSL = new ColorSpace({
  id: 'hsl',
  name: 'HSL',
  coords: {
    h: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
    s: {
      range: [0, 100],
      name: 'Saturation',
    },
    l: {
      range: [0, 100],
      name: 'Lightness',
    },
  },

  base: sRGB,

  // Adapted from https://en.wikipedia.org/wiki/HSL_and_HSV#From_RGB
  fromBase: (rgb) => {
    let max = Math.max(...rgb);
    let min = Math.min(...rgb);
    let [r, g, b] = rgb;
    let [h, s, l] = [NaN, 0, (min + max) / 2];
    let d = max - min;

    if (d !== 0) {
      s = l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);

      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
      }

      h = h * 60;
    }

    return [h, s * 100, l * 100];
  },

  // Adapted from https://en.wikipedia.org/wiki/HSL_and_HSV#HSL_to_RGB_alternative
  toBase: (hsl) => {
    let [h, s, l] = hsl;
    h = h % 360;

    if (h < 0) {
      h += 360;
    }

    s /= 100;
    l /= 100;

    function f(n) {
      let k = (n + h / 30) % 12;
      let a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    }

    return [f(0), f(8), f(4)];
  },

  formats: {
    hsl: {
      toGamut: true,
      coords: ['<number> | <angle>', '<percentage>', '<percentage>'],
    },
    hsla: {
      coords: ['<number> | <angle>', '<percentage>', '<percentage>'],
      commas: true,
      lastAlpha: true,
    },
  },
});

// The Hue, Whiteness Blackness (HWB) colorspace
// See https://drafts.csswg.org/css-color-4/#the-hwb-notation
// Note that, like HSL, calculations are done directly on
// gamma-corrected sRGB values rather than linearising them first.

var HSV = new ColorSpace({
  id: 'hsv',
  name: 'HSV',
  coords: {
    h: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
    s: {
      range: [0, 100],
      name: 'Saturation',
    },
    v: {
      range: [0, 100],
      name: 'Value',
    },
  },

  base: HSL,
  // https://en.wikipedia.org/wiki/HSL_and_HSV#Interconversion
  fromBase(hsl) {
    let [h, s, l] = hsl;
    s /= 100;
    l /= 100;

    let v = l + s * Math.min(l, 1 - l);

    return [
      h, // h is the same
      v === 0 ? 0 : 200 * (1 - l / v), // s
      100 * v,
    ];
  },
  // https://en.wikipedia.org/wiki/HSL_and_HSV#Interconversion
  toBase(hsv) {
    let [h, s, v] = hsv;

    s /= 100;
    v /= 100;

    let l = v * (1 - s / 2);

    return [
      h, // h is the same
      l === 0 || l === 1 ? 0 : ((v - l) / Math.min(l, 1 - l)) * 100,
      l * 100,
    ];
  },
  formats: {
    color: {
      toGamut: true,
    },
  },
});

// The Hue, Whiteness Blackness (HWB) colorspace
// See https://drafts.csswg.org/css-color-4/#the-hwb-notation
// Note that, like HSL, calculations are done directly on
// gamma-corrected sRGB values rather than linearising them first.

var hwb = new ColorSpace({
  id: 'hwb',
  name: 'HWB',
  coords: {
    h: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
    w: {
      range: [0, 100],
      name: 'Whiteness',
    },
    b: {
      range: [0, 100],
      name: 'Blackness',
    },
  },

  base: HSV,
  fromBase(hsv) {
    let [h, s, v] = hsv;

    return [h, (v * (100 - s)) / 100, 100 - v];
  },
  toBase(hwb) {
    let [h, w, b] = hwb;

    // Now convert percentages to [0..1]
    w /= 100;
    b /= 100;

    // Achromatic check (white plus black >= 1)
    let sum = w + b;
    if (sum >= 1) {
      let gray = w / sum;
      return [h, 0, gray * 100];
    }

    let v = 1 - b;
    let s = v === 0 ? 0 : 1 - w / v;
    return [h, s * 100, v * 100];
  },

  formats: {
    hwb: {
      toGamut: true,
      coords: ['<number> | <angle>', '<percentage>', '<percentage>'],
    },
  },
});

// convert an array of linear-light a98-rgb values to CIE XYZ
// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
// has greater numerical precision than section 4.3.5.3 of
// https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf
// but the values below were calculated from first principles
// from the chromaticity coordinates of R G B W
const toXYZ_M$2 = [
  [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
  [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
  [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
];

const fromXYZ_M$2 = [
  [2.0415879038107465, -0.5650069742788596, -0.34473135077832956],
  [-0.9692436362808795, 1.8759675015077202, 0.04155505740717557],
  [0.013444280632031142, -0.11836239223101838, 1.0151749943912054],
];

var A98Linear = new RGBColorSpace({
  id: 'a98rgb-linear',
  name: 'Linear Adobe® 98 RGB compatible',
  white: 'D65',
  toXYZ_M: toXYZ_M$2,
  fromXYZ_M: fromXYZ_M$2,
});

var a98rgb = new RGBColorSpace({
  id: 'a98rgb',
  name: 'Adobe® 98 RGB compatible',
  base: A98Linear,
  toBase: (RGB) => RGB.map((val) => Math.pow(Math.abs(val), 563 / 256) * Math.sign(val)),
  fromBase: (RGB) => RGB.map((val) => Math.pow(Math.abs(val), 256 / 563) * Math.sign(val)),
  formats: {
    color: {
      id: 'a98-rgb',
    },
  },
});

// convert an array of  prophoto-rgb values to CIE XYZ
// using  D50 (so no chromatic adaptation needed afterwards)
// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
const toXYZ_M$1 = [
  [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
  [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
  [0.0, 0.0, 0.8251046025104601],
];

const fromXYZ_M$1 = [
  [1.3457989731028281, -0.25558010007997534, -0.05110628506753401],
  [-0.5446224939028347, 1.5082327413132781, 0.02053603239147973],
  [0.0, 0.0, 1.2119675456389454],
];

var ProPhotoLinear = new RGBColorSpace({
  id: 'prophoto-linear',
  name: 'Linear ProPhoto',
  white: 'D50',
  base: XYZ_D50,
  toXYZ_M: toXYZ_M$1,
  fromXYZ_M: fromXYZ_M$1,
});

const Et = 1 / 512;
const Et2 = 16 / 512;

var prophoto = new RGBColorSpace({
  id: 'prophoto',
  name: 'ProPhoto',
  base: ProPhotoLinear,
  toBase(RGB) {
    // Transfer curve is gamma 1.8 with a small linear portion
    return RGB.map((v) => (v < Et2 ? v / 16 : v ** 1.8));
  },
  fromBase(RGB) {
    return RGB.map((v) => (v >= Et ? v ** (1 / 1.8) : 16 * v));
  },
  formats: {
    color: {
      id: 'prophoto-rgb',
    },
  },
});

var oklch = new ColorSpace({
  id: 'oklch',
  name: 'OKLCh',
  coords: {
    l: {
      refRange: [0, 1],
      name: 'Lightness',
    },
    c: {
      refRange: [0, 0.4],
      name: 'Chroma',
    },
    h: {
      refRange: [0, 360],
      type: 'angle',
      name: 'Hue',
    },
  },
  white: 'D65',

  base: OKLab,
  fromBase(oklab) {
    // Convert to polar form
    let [L, a, b] = oklab;
    let h;
    const ε = 0.0002; // chromatic components much smaller than a,b

    if (Math.abs(a) < ε && Math.abs(b) < ε) {
      h = NaN;
    } else {
      h = (Math.atan2(b, a) * 180) / Math.PI;
    }

    return [
      L, // OKLab L is still L
      Math.sqrt(a ** 2 + b ** 2), // Chroma
      constrain(h), // Hue, in degrees [0 to 360)
    ];
  },
  // Convert from polar form
  toBase(oklch) {
    let [L, C, h] = oklch;
    let a, b;

    // check for NaN hue
    if (isNaN(h)) {
      a = 0;
      b = 0;
    } else {
      a = C * Math.cos((h * Math.PI) / 180);
      b = C * Math.sin((h * Math.PI) / 180);
    }

    return [L, a, b];
  },

  formats: {
    oklch: {
      coords: ['<percentage>', '<number>', '<number> | <angle>'],
    },
  },
});

const Yw = 203; // absolute luminance of media white, cd/m²
const n = 2610 / 2 ** 14;
const ninv = 2 ** 14 / 2610;
const m = 2523 / 2 ** 5;
const minv = 2 ** 5 / 2523;
const c1 = 3424 / 2 ** 12;
const c2 = 2413 / 2 ** 7;
const c3 = 2392 / 2 ** 7;

var rec2100Pq = new RGBColorSpace({
  id: 'rec2100pq',
  name: 'REC.2100-PQ',
  base: REC2020Linear,
  toBase(RGB) {
    // given PQ encoded component in range [0, 1]
    // return media-white relative linear-light
    return RGB.map(function (val) {
      let x = (Math.max(val ** minv - c1, 0) / (c2 - c3 * val ** minv)) ** ninv;
      return (x * 10000) / Yw; // luminance relative to diffuse white, [0, 70 or so].
    });
  },
  fromBase(RGB) {
    // given media-white relative linear-light
    // returnPQ encoded component in range [0, 1]
    return RGB.map(function (val) {
      let x = Math.max((val * Yw) / 10000, 0); // absolute luminance of peak white is 10,000 cd/m².
      let num = c1 + c2 * x ** n;
      let denom = 1 + c3 * x ** n;

      return (num / denom) ** m;
    });
  },
  formats: {
    color: {
      id: 'rec2100-pq',
    },
  },
});

// FIXME see https://github.com/LeaVerou/color.js/issues/190

const a = 0.17883277;
const b = 0.28466892; // 1 - (4 * a)
const c = 0.55991073; // 0.5 - a * Math.log(4 *a)

var rec2100Hlg = new RGBColorSpace({
  id: 'rec2100hlg',
  cssid: 'rec2100-hlg',
  name: 'REC.2100-HLG',
  referred: 'scene',

  base: REC2020Linear,
  toBase(RGB) {
    // given HLG encoded component in range [0, 1]
    // return media-white relative linear-light
    return RGB.map(function (val) {
      if (val <= 1 / 12) {
        return Math.sqrt(3 * val);
      }
      return a * Math.log(12 * val - b) + c;
    });
  },
  fromBase(RGB) {
    // given media-white relative linear-light
    // return HLG encoded component in range [0, 1]
    // per ITU Rec BT.2390
    return RGB.map(function (val) {
      if (val <= 0.5) {
        return val ** 2 / 3;
      }
      return Math.exp((val - c) / a + b) / 12;
    });
  },
  formats: {
    color: {
      id: 'rec2100-hlg',
    },
  },
});

const CATs = {};

hooks.add('chromatic-adaptation-start', (env) => {
  if (env.options.method) {
    env.M = adapt(env.W1, env.W2, env.options.method);
  }
});

hooks.add('chromatic-adaptation-end', (env) => {
  if (!env.M) {
    env.M = adapt(env.W1, env.W2, env.options.method);
  }
});

function defineCAT({ id, toCone_M, fromCone_M }) {
  // Use id, toCone_M, fromCone_M like variables
  CATs[id] = arguments[0];
}
function adapt(W1, W2, id = 'Bradford') {
  // adapt from a source whitepoint or illuminant W1
  // to a destination whitepoint or illuminant W2,
  // using the given chromatic adaptation transform (CAT)
  // debugger;
  let method = CATs[id];

  let [ρs, γs, βs] = multiplyMatrices(method.toCone_M, W1);
  let [ρd, γd, βd] = multiplyMatrices(method.toCone_M, W2);

  // all practical illuminants have non-zero XYZ so no division by zero can occur below
  let scale = [
    [ρd / ρs, 0, 0],
    [0, γd / γs, 0],
    [0, 0, βd / βs],
  ];
  // console.log({scale});

  let scaled_cone_M = multiplyMatrices(scale, method.toCone_M);
  let adapt_M = multiplyMatrices(method.fromCone_M, scaled_cone_M);
  // console.log({scaled_cone_M, adapt_M});
  return adapt_M;
}
defineCAT({
  id: 'von Kries',
  toCone_M: [
    [0.40024, 0.7076, -0.08081],
    [-0.2263, 1.16532, 0.0457],
    [0.0, 0.0, 0.91822],
  ],
  fromCone_M: [
    [1.8599364, -1.1293816, 0.2198974],
    [0.3611914, 0.6388125, -0.0000064],
    [0.0, 0.0, 1.0890636],
  ],
});

defineCAT({
  id: 'Bradford',
  // Convert an array of XYZ values in the range 0.0 - 1.0
  // to cone fundamentals
  toCone_M: [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
  ],
  // and back
  fromCone_M: [
    [0.9869929, -0.1470543, 0.1599627],
    [0.4323053, 0.5183603, 0.0492912],
    [-0.0085287, 0.0400428, 0.9684867],
  ],
});

defineCAT({
  id: 'CAT02',
  // with complete chromatic adaptation to W2, so D = 1.0
  toCone_M: [
    [0.7328, 0.4296, -0.1624],
    [-0.7036, 1.6975, 0.0061],
    [0.003, 0.0136, 0.9834],
  ],
  fromCone_M: [
    [1.0961238, -0.278869, 0.1827452],
    [0.454369, 0.4735332, 0.0720978],
    [-0.0096276, -0.005698, 1.0153256],
  ],
});

defineCAT({
  id: 'CAT16',
  toCone_M: [
    [0.401288, 0.650173, -0.051461],
    [-0.250268, 1.204414, 0.045854],
    [-0.002079, 0.048952, 0.953127],
  ],
  // the extra precision is needed to avoid roundtripping errors
  fromCone_M: [
    [1.862067855087233, -1.011254630531685, 1.491867754444518e-1],
    [3.875265432361372e-1, 6.214474419314753e-1, -8.973985167612518e-3],
    [-1.584149884933386e-2, -3.412293802851557e-2, 1.04996443687785],
  ],
});

Object.assign(WHITES, {
  // whitepoint values from ASTM E308-01 with 10nm spacing, 1931 2 degree observer
  // all normalized to Y (luminance) = 1.00000
  // Illuminant A is a tungsten electric light, giving a very warm, orange light.
  A: [1.0985, 1.0, 0.35585],

  // Illuminant C was an early approximation to daylight: illuminant A with a blue filter.
  C: [0.98074, 1.0, 1.18232],

  // The daylight series of illuminants simulate natural daylight.
  // The color temperature (in degrees Kelvin/100) ranges from
  // cool, overcast daylight (D50) to bright, direct sunlight (D65).
  D55: [0.95682, 1.0, 0.92149],
  D75: [0.94972, 1.0, 1.22638],

  // Equal-energy illuminant, used in two-stage CAT16
  E: [1.0, 1.0, 1.0],

  // The F series of illuminants represent fluorescent lights
  F2: [0.99186, 1.0, 0.67393],
  F7: [0.95041, 1.0, 1.08747],
  F11: [1.00962, 1.0, 0.6435],
});

// The ACES whitepoint
// see TB-2018-001 Derivation of the ACES White Point CIE Chromaticity Coordinates
// also https://github.com/ampas/aces-dev/blob/master/documents/python/TB-2018-001/aces_wp.py
// Similar to D60
WHITES.ACES = [0.32168 / 0.33767, 1.0, (1.0 - 0.32168 - 0.33767) / 0.33767];

// convert an array of linear-light ACEScc values to CIE XYZ
const toXYZ_M = [
  [0.6624541811085053, 0.13400420645643313, 0.1561876870049078],
  [0.27222871678091454, 0.6740817658111484, 0.05368951740793705],
  [-0.005574649490394108, 0.004060733528982826, 1.0103391003129971],
];
const fromXYZ_M = [
  [1.6410233796943257, -0.32480329418479, -0.23642469523761225],
  [-0.6636628587229829, 1.6153315916573379, 0.016756347685530137],
  [0.011721894328375376, -0.008284441996237409, 0.9883948585390215],
];

var ACEScg = new RGBColorSpace({
  id: 'acescg',
  name: 'ACEScg',

  // ACEScg – A scene-referred, linear-light encoding of ACES Data
  // https://docs.acescentral.com/specifications/acescg/
  // uses the AP1 primaries, see section 4.3.1 Color primaries
  coords: {
    r: {
      range: [0, 65504],
      name: 'Red',
    },
    g: {
      range: [0, 65504],
      name: 'Green',
    },
    b: {
      range: [0, 65504],
      name: 'Blue',
    },
  },

  referred: 'scene',

  white: WHITES.ACES,

  toXYZ_M,
  fromXYZ_M,

  formats: {
    color: {},
  },
});

// export default Color;

const ε = 2 ** -16;

// the smallest value which, in the 32bit IEEE 754 float encoding,
// decodes as a non-negative value
const ACES_min_nonzero = -0.35828683;

// brightest encoded value, decodes to 65504
const ACES_cc_max = (Math.log2(65504) + 9.72) / 17.52; // 1.468

var acescc = new RGBColorSpace({
  id: 'acescc',
  name: 'ACEScc',
  // see S-2014-003 ACEScc – A Logarithmic Encoding of ACES Data
  // https://docs.acescentral.com/specifications/acescc/
  // uses the AP1 primaries, see section 4.3.1 Color primaries

  // Appendix A: "Very small ACES scene referred values below 7 1/4 stops
  // below 18% middle gray are encoded as negative ACEScc values.
  // These values should be preserved per the encoding in Section 4.4
  // so that all positive ACES values are maintained."
  coords: {
    r: {
      range: [ACES_min_nonzero, ACES_cc_max],
      name: 'Red',
    },
    g: {
      range: [ACES_min_nonzero, ACES_cc_max],
      name: 'Green',
    },
    b: {
      range: [ACES_min_nonzero, ACES_cc_max],
      name: 'Blue',
    },
  },
  referred: 'scene',

  base: ACEScg,
  // from section 4.4.2 Decoding Function
  toBase(RGB) {
    const low = (9.72 - 15) / 17.52; // -0.3014

    return RGB.map(function (val) {
      if (val <= low) {
        return (2 ** (val * 17.52 - 9.72) - ε) * 2; // very low values, below -0.3014
      } else if (val < ACES_cc_max) {
        return 2 ** (val * 17.52 - 9.72);
      } else {
        // val >= ACES_cc_max
        return 65504;
      }
    });
  },

  // Non-linear encoding function from S-2014-003, section 4.4.1 Encoding Function
  fromBase(RGB) {
    return RGB.map(function (val) {
      if (val <= 0) {
        return (Math.log2(ε) + 9.72) / 17.52; // -0.3584
      } else if (val < ε) {
        return (Math.log2(ε + val * 0.5) + 9.72) / 17.52;
      } else {
        // val >= ε
        return (Math.log2(val) + 9.72) / 17.52;
      }
    });
  },
  // encoded media white (rgb 1,1,1) => linear  [ 222.861, 222.861, 222.861 ]
  // encoded media black (rgb 0,0,0) => linear [ 0.0011857, 0.0011857, 0.0011857]
  formats: {
    color: {},
  },
});

var spaces = /*#__PURE__*/ Object.freeze({
  __proto__: null,
  XYZ_D65: XYZ_D65,
  XYZ_D50: XYZ_D50,
  XYZ_ABS_D65: XYZ_Abs_D65,
  Lab_D65: lab_d65,
  Lab: lab,
  LCH: lch,
  sRGB_Linear: sRGBLinear,
  sRGB: sRGB,
  HSL: HSL,
  HWB: hwb,
  HSV: HSV,
  P3_Linear: P3Linear,
  P3: P3,
  A98RGB_Linear: A98Linear,
  A98RGB: a98rgb,
  ProPhoto_Linear: ProPhotoLinear,
  ProPhoto: prophoto,
  REC_2020_Linear: REC2020Linear,
  REC_2020: REC2020,
  OKLab: OKLab,
  OKLCH: oklch,
  Jzazbz: Jzazbz,
  JzCzHz: jzczhz,
  ICTCP: ictcp,
  REC_2100_PQ: rec2100Pq,
  REC_2100_HLG: rec2100Hlg,
  ACEScg: ACEScg,
  ACEScc: acescc,
});

/**
 * Class that represents a color
 */
class Color {
  /**
   * Creates an instance of Color.
   * Signatures:
   * - `new Color(stringToParse)`
   * - `new Color(otherColor)`
   * - `new Color({space, coords, alpha})`
   * - `new Color(space, coords, alpha)`
   * - `new Color(spaceId, coords, alpha)`
   */
  constructor(...args) {
    let color;

    if (args.length === 1) {
      color = getColor(args[0]);
    }

    let space, coords, alpha;

    if (color) {
      space = color.space || color.spaceId;
      coords = color.coords;
      alpha = color.alpha;
    } else {
      // default signature new Color(ColorSpace, array [, alpha])
      [space, coords, alpha] = args;
    }

    this.#space = ColorSpace.get(space);
    this.coords = coords ? coords.slice() : [0, 0, 0];
    this.alpha = alpha < 1 ? alpha : 1; // this also deals with NaN etc

    // Convert "NaN" to NaN
    for (let i = 0; i < this.coords.length; i++) {
      if (this.coords[i] === 'NaN') {
        this.coords[i] = NaN;
      }
    }

    // Define getters and setters for each coordinate
    for (let id in this.#space.coords) {
      Object.defineProperty(this, id, {
        get: () => this.get(id),
        set: (value) => this.set(id, value),
      });
    }
  }

  #space;

  get space() {
    return this.#space;
  }

  get spaceId() {
    return this.#space.id;
  }

  clone() {
    return new Color(this.space, this.coords, this.alpha);
  }

  toJSON() {
    return {
      spaceId: this.spaceId,
      coords: this.coords,
      alpha: this.alpha,
    };
  }

  display(...args) {
    let ret = display(this, ...args);

    // Convert color object to Color instance
    ret.color = new Color(ret.color);

    return ret;
  }

  /**
   * Get a color from the argument passed
   * Basically gets us the same result as new Color(color) but doesn't clone an existing color object
   */
  static get(color, ...args) {
    if (color instanceof Color) {
      return color;
    }

    return new Color(color, ...args);
  }

  static defineFunction(name, code, o = code) {
    if (arguments.length === 1) {
      [name, code, o] = [arguments[0].name, arguments[0], arguments[0]];
    }

    let { instance = true, returns } = o;

    let func = function (...args) {
      let ret = code(...args);

      if (returns === 'color') {
        ret = Color.get(ret);
      } else if (returns === 'function<color>') {
        let f = ret;
        ret = function (...args) {
          let ret = f(...args);
          return Color.get(ret);
        };
        // Copy any function metadata
        Object.assign(ret, f);
      } else if (returns === 'array<color>') {
        ret = ret.map((c) => Color.get(c));
      }

      return ret;
    };

    if (!(name in Color)) {
      Color[name] = func;
    }

    if (instance) {
      Color.prototype[name] = function (...args) {
        return func(this, ...args);
      };
    }
  }

  static defineFunctions(o) {
    for (let name in o) {
      Color.defineFunction(name, o[name], o[name]);
    }
  }

  static extend(exports) {
    if (exports.register) {
      exports.register(Color);
    } else if (exports.default) {
      Color.defineFunction(exports.default.name, exports.default);
    } else if (typeof exports === 'function') {
      Color.defineFunction(exports);
    } else {
      // No register method, just add the module's functions
      for (let name in exports) {
        Color.defineFunction(name, exports[name]);
      }
    }
  }
}
Color.defineFunctions({
  get,
  getAll,
  set: set$1,
  setAll,
  to,
  equals,
  inGamut,
  toGamut,
  distance,
  toString: serialize,
});

Object.assign(Color, {
  util,
  hooks,
  WHITES,
  Space: ColorSpace,
  spaces: ColorSpace.registry,
  parse,

  // Global defaults one may want to configure
  defaults,
});

for (let key of Object.keys(spaces)) {
  ColorSpace.register(spaces[key]);
}

/**
 * This plugin defines getters and setters for color[spaceId]
 * e.g. color.lch on *any* color gives us the lch coords
 */

// Add space accessors to existing color spaces
for (let id in ColorSpace.registry) {
  addSpaceAccessors(id, ColorSpace.registry[id]);
}

// Add space accessors to color spaces not yet created
hooks.add('colorspace-init-end', addSpaceAccessors);

function addSpaceAccessors(id, space) {
  // Coordinates can be looked up by both id and name
  Object.keys(space.coords);
  Object.values(space.coords).map((c) => c.name);

  let propId = id.replace(/-/g, '_');

  Object.defineProperty(Color.prototype, propId, {
    // Convert coords to coords in another colorspace and return them
    // Source colorspace: this.spaceId
    // Target colorspace: id
    get() {
      let ret = this.getAll(id);

      if (typeof Proxy === 'undefined') {
        // If proxies are not supported, just return a static array
        return ret;
      }

      // Enable color.spaceId.coordName syntax
      return new Proxy(ret, {
        has: (obj, property) => {
          try {
            ColorSpace.resolveCoord([space, property]);
            return true;
          } catch (e) {}

          return Reflect.has(obj, property);
        },
        get: (obj, property, receiver) => {
          if (property && typeof property !== 'symbol' && !(property in obj)) {
            let { index } = ColorSpace.resolveCoord([space, property]);

            if (index >= 0) {
              return obj[index];
            }
          }

          return Reflect.get(obj, property, receiver);
        },
        set: (obj, property, value, receiver) => {
          if ((property && typeof property !== 'symbol' && !(property in obj)) || property >= 0) {
            let { index } = ColorSpace.resolveCoord([space, property]);

            if (index >= 0) {
              obj[index] = value;

              // Update color.coords
              this.setAll(id, obj);

              return true;
            }
          }

          return Reflect.set(obj, property, value, receiver);
        },
      });
    },
    // Convert coords in another colorspace to internal coords and set them
    // Target colorspace: this.spaceId
    // Source colorspace: id
    set(coords) {
      this.setAll(id, coords);
    },
    configurable: true,
    enumerable: true,
  });
}

// Import all modules of Color.js

Color.extend(deltaEMethods);
Color.extend(deltaE$1);
Color.extend(variations);
Color.extend(contrast);
Color.extend(chromaticity);
Color.extend(luminance);
Color.extend(interpolation);
Color.extend(contrastMethods);

export { Color as default };
