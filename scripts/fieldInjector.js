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
  if (!game.settings.get('multi-token-edit', 'enableFlagsTab')) return;
  if (app.constructor.name === 'MassEditGenericForm') return;
  const doc = app.meObjects[0];
  const flags = (doc.document ?? doc).flags;

  if (!(flags && !isEmpty(flags))) return;

  // Need to wait for other modules to perform their processing first
  // Mainly MATT Active Tiles
  if (getDocumentName(doc) === 'Wall') await new Promise((resolve) => setTimeout(resolve, 150));

  const [flagNav, flagTabs] = constructNav({ flags: flags });
  delete flagNav.items;
  app.options.tabs = (app.options.tabs ?? []).concat(flagTabs);
  if (app.tabs) app.tabs = app._createTabHandlers();
  else app._tabs = app._createTabHandlers();

  if (!flagNav.tabs.length) return;
  flagNav.tabs[0].nav?.items?.forEach((item) => {
    const mod = game.modules.get(item.dataTab.replace('flags.', ''));
    if (mod) item.label = mod.title;
  });

  const html = $(app.form);

  await getTemplate('modules/multi-token-edit/templates/generic/form-group.html');
  await getTemplate('modules/multi-token-edit/templates/generic/navHeaderPartial.html');
  let htmlNav = await renderTemplate('modules/multi-token-edit/templates/generic/navHeaderPartial.html', flagNav);

  htmlNav = $(htmlNav);

  // Remove pins or replace them with trash cans depending on whether this is a Mass Edit or Search form
  if (app.options.massSelect) {
    htmlNav.find('.me-pinned').remove();
  } else {
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
  }

  // Insert Flags tab into
  const sheetMainNav = html.find('.sheet-tabs').first();
  if (!sheetMainNav.length) return;
  sheetMainNav.append('<a class="item" data-tab="flags"><i class="fa-solid fa-flag"></i> Flags</a>');

  if (!sheetMainNav.attr('data-group')) {
    htmlNav.removeAttr('data-group');
  }
  html.find('footer').last().before(htmlNav);
  app._activateCoreListeners(html);
}
