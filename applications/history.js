import { HISTORY } from '../multi-token-edit.mjs';
import { GeneralDataAdapter } from './dataAdapters.js';
import { copyToClipboard } from './forms.js';
import { LAYER_MAPPINGS } from './multiConfig.js';

export default class MassEditHistory extends FormApplication {
  constructor(docName, callback) {
    super({}, {});
    this.callback = callback;
    this.docName = docName;
    this.history = deepClone(HISTORY);
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: 'mass-edit-history',
      classes: ['sheet'],
      template: 'modules/multi-token-edit/templates/history.html',
      resizable: false,
      minimizable: false,
      title: `History`,
      width: 400,
      height: 'auto',
    });
  }

  get title() {
    return `[${this.docName}] ${game.i18n.localize('multi-token-edit.common.history')}`;
  }

  async getData(options) {
    const data = super.getData(options);

    const historyItems = (this.history[this.docName] ?? []).reverse();
    data.updates = [];

    let formHasDiff = false;

    const getTitle = function (fields, rdm, addSubtract) {
      let title = '';
      for (const k of Object.keys(fields)) {
        if (['_id', 'mass-edit-randomize', 'mass-edit-addSubtract'].includes(k)) continue;

        if (k in rdm) {
          title += `${k}: {{randomized}}\n`;
        } else if (k in addSubtract) {
          const val = 'value' in addSubtract[k] ? addSubtract[k].value : fields[k];
          title += `${k}: ${addSubtract[k].method === 'add' ? '+' : '-'}${val}\n`;
        } else {
          title += `${k}: ${fields[k]}\n`;
        }
      }
      return title;
    };

    for (const item of historyItems) {
      const rdm = item.ctrl['mass-edit-randomize'] || {};
      const addSubtract = item.ctrl['mass-edit-addSubtract'] || {};

      const fullTitle = getTitle(deepClone(item.update), rdm, addSubtract);
      const title = getTitle(deepClone(item.diff), rdm, addSubtract);

      const hasDifferences = fullTitle !== title;
      if (hasDifferences) formHasDiff = true;

      data.updates.push({
        label: item['timestamp'],
        title: title,
        fullTitle: fullTitle,
        id: item._id,
        hasDifferences: hasDifferences,
      });
    }

    data.includeDiff = formHasDiff;

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);
    html.on('click', '.doc-id', (event) => {
      const id = $(event.target).closest('div').find('button')[0].dataset.id;
      const layer = LAYER_MAPPINGS[this.docName];
      if (layer) {
        let placeable = canvas[layer].placeables.find((p) => p.id === id) || null;
        if (placeable) {
          canvas.animatePan({ x: placeable.center.x, y: placeable.center.y, duration: 250 });
        }
      }
    });

    const copy = function (event, type, history, docName) {
      const index = $(event.target).closest('li')[0].dataset.index;
      const docHistory = history[docName] ?? [];
      const historyItem = docHistory[index];
      if (historyItem) {
        const update = deepClone(historyItem[type]);
        if ('mass-edit-randomize' in historyItem.ctrl)
          update['mass-edit-randomize'] = historyItem.ctrl['mass-edit-randomize'];
        if ('mass-edit-addSubtract' in historyItem.ctrl)
          update['mass-edit-addSubtract'] = historyItem.ctrl['mass-edit-addSubtract'];
        copyToClipboard(docName, update);
      }
    };

    html.on('click', '.doc-copy-update', (event) => {
      copy(event, 'update', this.history, this.docName);
    });

    html.on('click', '.doc-copy-diff', (event) => {
      copy(event, 'diff', this.history, this.docName);
    });
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    const index = $(event.submitter).closest('li')[0].dataset.index;
    const docHistory = this.history[this.docName] ?? [];
    const historyItem = docHistory[index];
    if (historyItem) {
      const update = deepClone(historyItem[event.submitter.name]);
      GeneralDataAdapter.updateToForm(this.docName, update);
      if ('mass-edit-randomize' in historyItem.ctrl)
        update['mass-edit-randomize'] = historyItem.ctrl['mass-edit-randomize'];
      if ('mass-edit-addSubtract' in historyItem.ctrl)
        update['mass-edit-addSubtract'] = historyItem.ctrl['mass-edit-addSubtract'];

      this.callback(update);
    }
  }
}
