import { constructNav } from '../applications/generic/navGenerator.js';
import { getDocumentName } from './utils.js';

export function injectVisibility(app) {
  const docName = getDocumentName(app.meObjects[0]);

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

export async function injectFlagTab(app) {
  if (app.constructor.name === 'MassEditGenericForm') return;
  const doc = app.meObjects[0];
  const flags = (doc.document ?? doc).flags;

  if (!(flags && !isEmpty(flags))) return;

  const [flagNav, flagTabs] = constructNav({ flags: flags });
  delete flagNav.items;
  app.options.tabs = (app.options.tabs ?? []).concat(flagTabs);
  app._tabs = app._createTabHandlers();

  const html = $(app.form);

  await getTemplate('modules/multi-token-edit/templates/generic/form-group.html');
  await getTemplate('modules/multi-token-edit/templates/generic/navHeaderPartial.html');
  let htmlNav = await renderTemplate('modules/multi-token-edit/templates/generic/navHeaderPartial.html', flagNav);

  htmlNav = $(htmlNav);

  // Remove pins and replace them with trash cans
  htmlNav.find('.me-pinned').replaceWith(`<a class="me-delete-flag" title="DELETE"><i class="fas fa-trash"></i></a>`);
  html.on('click', '.me-delete-flag', (event) => {
    const delFlag = $(event.target).closest('a');
    delFlag.toggleClass('active');
    const toDelete = delFlag.hasClass('active');
    const namedElements = delFlag.closest('.form-group').find('[name]');
    namedElements.each(function () {
      const name = this.name;
      if (toDelete && !name.includes('-=')) {
        let nArr = name.split('.');
        nArr[nArr.length - 1] = '-=' + nArr[nArr.length - 1];
        this.name = nArr.join('.');
      } else if (!toDelete) {
        this.name = name.replace('-=', '');
      }
    });
    namedElements.first().trigger('change');
  });

  // Insert Flags tab into
  html
    .find('.sheet-tabs')
    .first()
    .append('<a class="item" data-tab="flags"><i class="fa-solid fa-flag"></i> Flags</a>');
  html.find('footer').before(htmlNav);
  app._activateCoreListeners(html);
}
