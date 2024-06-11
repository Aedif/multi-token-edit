import { getDocumentName, localize } from './utils.js';

export function injectVisibility(app) {
  const documentName = getDocumentName(app.meObjects[0]);

  // Only the following docs necessitate hidden field
  if (!['AmbientLight', 'AmbientSound'].includes(documentName)) return;

  const form = $(app.form);

  const isInjected = form.find('input[name="hidden"]');
  if (isInjected.length) return;

  const hidden = app.meObjects[0].hidden;
  const newHtml = `
  <div class="form-group">
    <label>${localize(`Hidden`, false)}</label>
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

  //app.setPosition({ height: 'auto' });
}
