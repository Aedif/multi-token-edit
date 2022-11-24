// Search and apply Token Magic FX preset

let content = '<datalist id="presets">';
TokenMagic.getPresets().forEach((p) => (content += `<option value="${p.name}">`));
content += `</datalist><input class="preset" list="presets" style="width: 100%;">`;

new Dialog({
  title: `Apply TMFX Preset`,
  content: content,
  buttons: {
    save: {
      label: 'Apply on Selected',
      callback: async (html) => {
        const presetName = html.find('.preset').val();
        TokenMagic.addUpdateFiltersOnSelected(presetName);
      },
    },
  },
}).render(true);
