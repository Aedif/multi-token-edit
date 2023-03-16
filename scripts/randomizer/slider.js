import Color from '../color/color.js';

export class ColorSlider {
  constructor(slider, colors, { space = null, hue = null } = {}) {
    this.slider = slider;
    this.colors = colors;
    this.space = space;
    this.hue = hue;
    this.min = 0;
    this.max = 100;
    this._init();
  }

  _init() {
    import('../jquery-ui/jquery-ui.js').then((imp) => {
      this._createSlider();
      // // Respond better to DF Architect Color Picker
      // html.on('focusout', '.df-arch-colourpicker', (e) => {
      //   clearTimeout(inputTimer);
      //   inputTimer = setTimeout(() => this.update(), 500);
      // });
    });
  }

  update() {
    clearTimeout(this.inputTimer);
    this.inputTimer = setTimeout(() => this._updateSlider(), 500);
  }

  _updateSlider(event, ui) {
    if (ui) this.colors[ui.handleIndex].offset = ui.value;
    this.slider.find('.slide-back').remove();

    let lVal = this.max + 1;
    let lHandle;
    let lIndex;

    let handles = this.slider.find('span').toArray();

    for (let i = 0; i < handles.length; i++) {
      let sliderVal = this.slider.slider('values', i);
      this.colors[i].offset = sliderVal;

      if (sliderVal < lVal) {
        lHandle = $(this);
        lVal = sliderVal;
        lIndex = i;
      }

      $(handles[i]).css('background', this.colors[i].hex);

      if (sliderVal !== this.max) {
        let [stripColor, stripColorVal] = this._getNextColor(this.colors[i].hex, sliderVal);
        this._appendStrip(
          this._genGradient(stripColor, this.colors[i].hex),
          `${stripColorVal - sliderVal}%`,
          `${sliderVal}%`
        );
      }
    }

    if (lVal !== this.min) {
      this._appendStrip(
        this._genGradient(this.colors[lIndex].hex, this.colors[lIndex].hex),
        `${this.slider.slider('values', lIndex)}%`,
        '0%'
      );
    }
  }

  _genGradient(color1, color2) {
    const space = this.space?.val() || 'lch';

    if (space === 'discrete') {
      return 'rgba(0, 0, 0, 0)';
    }

    const hue = this.hue?.val() || 'shorter';
    let r = Color.range(color2, color1, { space, hue });
    let stops = Color.steps(r, { steps: 5, maxDeltaE: 3 });
    return `linear-gradient(to right, ${stops.map((c) => c.display()).join(', ')})`;
  }

  _appendStrip(color, width, offset) {
    this.slider.append(
      $('<div></div>').addClass('slide-back').width(width).css('background', color).css('left', offset)
    );
  }

  _getNextColor(currColor, val) {
    let nextColor = currColor;
    let nextColorVal = this.max + 1;
    for (let i = 0; i < this.colors.length; i++) {
      let cVal = this.slider.slider('values', i);
      if (cVal > val && cVal < nextColorVal) {
        nextColor = this.colors[i].hex;
        nextColorVal = cVal;
      }
    }
    return [nextColor, Math.min(nextColorVal, this.max)];
  }

  _onCreateSlider() {
    let handles = this.slider.find('span').toArray();
    for (let i = 0; i < handles.length; i++) {
      let cPicker = $(
        `<input type="color" value="${this.colors[i].hex}" style='opacity:0;width:100%;height:100%;position:absolute;pointer-events:none;'>`
      );
      const handle = $(handles[i]);
      handle.attr('handleindex', i);
      handle.append(cPicker);
      handle.on('click', (event) => {
        if (event.detail === 2) {
          event.preventDefault();
          cPicker.trigger('click');
        }
      });
      cPicker.on('input', (event) => {
        this.colors[i].hex = cPicker.val();
        this.update();
      });
      handle.on('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (this.colors.length > 2) {
          let index = event.target.getAttribute('handleindex');
          if (index) {
            this.colors.splice(index, 1);
            this._createSlider();
          }
        }
      });
    }

    this.slider.on('contextmenu', (event) => {
      let offset = this.slider.offset();
      var x = event.clientX - offset.left; //x position within the element.
      let percentOffset = Math.round((x / this.slider.width()) * 100);

      if (!this._percentExists(percentOffset)) {
        let [col, _] = this._getNextColor(null, percentOffset);
        if (!col) col = '#ff0000';
        this.colors.push({ hex: col, offset: percentOffset });
        this._createSlider();
      }
    });

    this.update();
  }

  _percentExists(percent) {
    return this.colors.some((c) => c.offset === percent);
  }

  _createSlider = () => {
    if (this.slider.slider('instance')) this.slider.slider('destroy');
    this.slider.slider({
      change: (event, ui) => this.update(event, ui),
      create: () => this._onCreateSlider(),
      min: this.min,
      max: this.max,
      values: this.colors.map((c) => c.offset),
    });
  };
}
