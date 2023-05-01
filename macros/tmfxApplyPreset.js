// Search and apply Token Magic FX preset

let libraries = {};
let pst = game.settings.get('tokenmagic', 'presets') || [];
pst.forEach((preset) => {
  if (!(preset.library in libraries)) libraries[preset.library] = [];
  else libraries[preset.library].push(preset);
});

let lists = '';
Object.entries(libraries).forEach((entry) => {
  const [library, presets] = entry;
  let libList = '<datalist id="' + library + '">';
  presets.forEach((preset) => (libList += `<option value="${preset.name}">`));
  lists += libList + '</datalist>';
});

let content = '<label>Library</label> <select id="library" style="width: 100%;">';
Object.keys(libraries).forEach(
  (library) =>
    (content += `<option value="${library}" ${
      library === 'tmfx-main' ? 'selected=""' : ''
    }>${library}</option>`)
);
content += '</select>';
content += '<hr><label>Preset</label> <input class="preset" list="tmfx-main" style="width: 100%;">';
content = lists + content;

new Dialog({
  title: `Apply TMFX Preset`,
  content: content,
  buttons: {
    save: {
      label: 'Apply on Selected',
      callback: async (html) => {
        const name = html.find('.preset').val();
        const library = html.find('.preset').attr('list');
        let preset = TokenMagic.getPreset({ name, library });
        TokenMagic.addUpdateFiltersOnSelected(preset);
      },
    },
  },
  render: (html) => {
    html
      .find('#library')
      .on('change', (event) => html.find('.preset').attr('list', event.target.value));
  },
}).render(true);
