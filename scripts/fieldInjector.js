export function injectVisibility(app) {
  const docName = app.meObjects[0].document
    ? app.meObjects[0].document.documentName
    : app.meObjects[0].documentName;

  // Only the following docs necessitate hidden field
  if (!['AmbientLight', 'AmbientSound'].includes(docName)) return;

  const form = $(app.form);

  const isInjected = form.find('input[name="hidden"]');
  if (isInjected.length) return;

  const hidden = app.object.hidden;

  const newHtml = `
  <div class="form-group">
    <label>${game.i18n.localize(`multi-token-edit.common.hidden`)}</label>
    <div class="form-fields">
        <input type="checkbox" name="hidden" ${hidden ? 'checked' : ''}>
    </div>
  </div>
`;

  const tabs = form.find('div.tab');
  if (tabs.length) {
    tabs.first().append(newHtml);
  } else {
    form.find('.form-group').last().after(newHtml);
  }

  app.setPosition({ height: 'auto' });
}
