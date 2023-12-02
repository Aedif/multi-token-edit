export function getInUseStyle() {
  const styleInUse = game.settings.get('multi-token-edit', 'cssStyle');
  if (styleInUse in STYLES) {
    return [styleInUse, STYLES[styleInUse]];
  } else {
    return ['CUSTOM', game.settings.get('multi-token-edit', 'cssCustom') || ''];
  }
}

export default class CSSEdit extends FormApplication {
  constructor() {
    super({}, {});
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-css',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/cssEdit.html',
      resizable: true,
      minimizable: false,
      title: 'Edit CSS',
      width: 490,
      height: 730,
    });
  }

  async getData(options) {
    const data = super.getData(options);

    const [styleInUse, css] = getInUseStyle();
    data.styleInUse = styleInUse;
    data.css = css;

    data.styles = Object.keys(STYLES);
    data.styles.push('CUSTOM');
    data.disableCSS = styleInUse !== 'CUSTOM';

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    $(html).on('change', '.selectStyle', (event) => {
      let css;
      if (event.target.value === 'CUSTOM') {
        css = game.settings.get('multi-token-edit', 'cssCustom');
      } else {
        css = STYLES[event.target.value];
      }
      $(html)
        .find('.cssTextArea')
        .val(css)
        .prop('disabled', event.target.value !== 'CUSTOM');
      $(html).find('.previewStyle').html(css);
    });
    $(html).on('input', '.cssTextArea', (event) => {
      $(html).find('.previewStyle').html(event.target.value);
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    if (formData.selectedStyle === 'CUSTOM') {
      game.settings.set('multi-token-edit', 'cssCustom', formData.css);
    }
    game.settings.set('multi-token-edit', 'cssStyle', formData.selectedStyle);
  }
}

// Pre-made styles
export const STYLES = {
  Default: `.form-group.meCommon {
  outline: green dotted 2px;
  margin-bottom: 5px;
}

.mass-edit-checkbox.meCommon {
  outline: green solid 2px;
}

.form-group.meDiff {
  outline: rgb(255, 204, 110) dotted 2px;
  margin-bottom: 5px;
}

.mass-edit-checkbox.meDiff {
  outline: rgb(255, 204, 110) solid 2px;
}

.form-group.meFlag {
  outline: rgb(246, 175, 255) dotted 2px;
  margin-bottom: 5px;
}

.mass-edit-checkbox.meFlag {
  outline: rgb(246, 175, 255) solid 2px;
}

.form-group.meInsert {
  outline: rgb(118, 242, 255) dotted 2px;
  margin-bottom: 5px;
}

.mass-edit-checkbox.meInsert {
  outline: rgb(118, 242, 255) solid 2px;
}
`,
  // ==================
  // No Outline
  // ==================
  'No Outline': `.form-group.meCommon {}

.mass-edit-checkbox.meCommon {
  outline: green solid 2px;
}

.form-group.meDiff {}

.mass-edit-checkbox.meDiff {
  outline: rgb(255, 204, 110) solid 2px;
}

.form-group.meFlag {}

.mass-edit-checkbox.meFlag {
  outline: rgb(246, 175, 255) solid 2px;
}

.form-group.meInsert {}

.mass-edit-checkbox.meInsert {
  outline: rgb(118, 242, 255) solid 2px;
}
`,
  // ==================
  // Striped Background
  // ==================
  'Striped Background': `.form-group.meCommon {
  background: repeating-linear-gradient(
  45deg,
  rgba(155, 233, 155, 0.8),
  rgba(155, 233, 155, 0.8) 10px,
  rgba(0, 0, 0, 0) 10px,
  rgba(0, 0, 0, 0) 20px
  );
}

.mass-edit-checkbox.meCommon {
  outline: green solid 2px;
}

.form-group.meDiff {
  background: repeating-linear-gradient(
  135deg,
  rgba(255, 207, 118, 0.5),
  rgba(255, 207, 118, 0.5) 10px,
  rgba(0, 0, 0, 0) 10px,
  rgba(0, 0, 0, 0) 20px
  );
}

.mass-edit-checkbox.meDiff {
  outline: rgb(255, 204, 110) solid 2px;
}

.form-group.meFlag {
  background: repeating-linear-gradient(
  70deg,
  rgba(237, 149, 255, 0.3),
  rgba(237, 149, 255, 0.3) 10px,
  rgba(0, 0, 0, 0) 10px,
  rgba(0, 0, 0, 0) 20px
  );
}

.mass-edit-checkbox.meFlag {
  outline: rgb(246, 175, 255) solid 2px;
}

.form-group.meInsert {
  background: repeating-linear-gradient(
  70deg,
  rgba(118, 242, 255, 0.5),
  rgba(118, 242, 255, 0.5) 10px,
  rgba(0, 0, 0, 0) 10px,
  rgba(0, 0, 0, 0) 20px
  );
}

.mass-edit-checkbox.meInsert {
  outline: rgb(246, 175, 255) solid 2px;
}
`,
  // ==================
  // Solid Background
  // ==================
  'Solid Background': `.form-group.meCommon {
  background: rgba(155, 233, 155, 0.8)
}

.mass-edit-checkbox.meCommon {
outline: green solid 2px;
}

.form-group.meDiff {
  background: rgba(255, 207, 118, 0.5)
}

.mass-edit-checkbox.meDiff {
  outline: rgb(255, 204, 110) solid 2px;
}

.form-group.meFlag {
  background: rgba(237, 149, 255, 0.3)
}

.mass-edit-checkbox.meFlag {
  outline: rgb(246, 175, 255) solid 2px;
}

.form-group.meInsert {
  background: rgba(118, 242, 255, 0.5)
}

.mass-edit-checkbox.meInsert {
  outline: rgb(118, 242, 255) solid 2px;
}`,
};
