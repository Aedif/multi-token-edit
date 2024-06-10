import { Brush } from '../scripts/brush.js';
import { MassEditPresets } from '../scripts/presets/forms.js';
import { Preset } from '../scripts/presets/preset.js';
import { selectRandomizerFields } from '../scripts/randomizer/randomizerUtils.js';
import {
  getData,
  getDocumentName,
  localFormat,
  localize,
  selectAddSubtractFields,
  SUPPORTED_COLLECTIONS,
  SUPPORTED_PLACEABLES,
} from '../scripts/utils.js';
import { GeneralDataAdapter, TokenDataAdapter } from './dataAdapters.js';
import { copyToClipboard, getCommonDocData, performMassSearch, performMassUpdate } from './formUtils.js';
import MacroForm from './macro.js';
import { WithBaseMassEditForm, WithMassEditFormApplication, WithMassEditFormApplicationV2 } from './meApplication.js';
import { showMassActorForm } from './multiConfig.js';

// ==================================
// ========= Applications ===========
// ==================================

export const WithMassEditForm = (cls) => {
  const base = WithBaseMassEditForm(cls);
  if (foundry.applications?.api?.ApplicationV2 && cls.BASE_APPLICATION === foundry.applications.api.ApplicationV2) {
    return WithMassEditFormApplicationV2(base);
  } else {
    return WithMassEditFormApplication(base);
  }
};

export const WithMassConfig = (docName = 'NONE') => {
  let cls;
  const sheets = CONFIG[docName]?.sheetClasses;
  if (!sheets || docName === 'Actor') {
    cls = FormApplication;

    cls = FormApplication;
  } else {
    cls = Object.values(Object.values(sheets).pop() ?? {}).pop()?.cls;
  }

  const MEF = WithMassEditForm(cls);

  class MassConfig extends MEF {
    constructor(target, docs, options) {
      if (options.massSelect) options.randomizerEnabled = false;
      const docName = options.documentName ?? getDocumentName(target);
      if (!options.commonData) options.commonData = getCommonDocData(docs, docName);

      super(target.document ? target.document : target, docs, options);
      this.docName = docName;

      // Add submit buttons
      let buttons = [];
      if (this.options.massSelect) {
        buttons = [
          { title: localize('FILES.Search', false), value: 'search', icon: 'fas fa-search' },
          { title: localize('form.search-and-edit'), value: 'searchAndEdit', icon: 'fas fa-search' },
        ];
      } else if (this.documentName === 'Note' && !this.options.presetEdit) {
        // If we're editing notes and there are some on a different scene
        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id === canvas.scene.id).length) {
          buttons.push({
            title: localize('form.apply-on-current-scene'),
            value: 'currentScene',
            icon: 'far fa-save',
          });
        }
        if (this.meObjects.filter((n) => (n.scene ?? n.parent).id !== canvas.scene.id).length) {
          buttons.push({
            title: localize('form.apply-on-all-scenes'),
            value: 'allScenes',
            icon: 'fas fa-globe',
          });
        }
      } else {
        buttons = [{ title: localize('common.apply'), value: 'apply', icon: 'far fa-save' }];
        // Extra control for Tokens to update their Actors Token prototype
        if (
          this.documentName === 'Token' &&
          !this.options.simplified &&
          !this.meObjects[0].constructor?.name?.startsWith('PrototypeToken') &&
          !this.options.presetEdit
        ) {
          buttons.push({
            title: localize('form.apply-update-proto'),
            value: 'applyToPrototype',
            icon: 'far fa-save',
          });
        }
      }

      this.massFormButtons = buttons;
    }

    async _updateObject(event, formData) {
      await this.massUpdateObject(event, formData);

      // On v11 certain placeable will freeze the canvas layer if parent _updateObject is not called
      if (['Token', 'AmbientLight'].includes(this.docName) && this.preview?.object) {
        this._resetPreview();
      }
    }

    async massUpdateObject(event, formData) {
      if (!event.submitter?.value) return;

      // Gather up all named fields that have mass-edit-checkbox checked
      const selectedFields = this.getSelectedFields(formData);

      // Detection modes may have been selected out of order
      // Fix that here
      if (this.docName === 'Token') {
        TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
      }

      // Preset editing
      if (this.options.presetEdit) {
        this.options.callback?.({
          data: selectedFields,
          addSubtract: this.addSubtractFields,
          randomize: this.randomizeFields,
        });
        return;
      }

      // Search and Select mode
      if (this.options.massSelect) {
        return performMassSearch(event.submitter.value, this.docName, selectedFields, {
          scope: this.modUpdate ? this.modUpdateType : null,
        });
      } else {
        // Edit mode
        return performMassUpdate.call(this, selectedFields, this.meObjects, this.docName, event.submitter.value);
      }
    }

    _performOnInputChangeUpdate() {
      const selectedFields = this.getSelectedFields();
      performMassUpdate.call(this, selectedFields, this.meObjects, this.docName, this.modUpdateType);
    }

    /**
     * Copy currently selected field to the clipboard
     */
    performMassCopy({ command = '', selectedFields = null } = {}) {
      if (!selectedFields) {
        selectedFields = this.getSelectedFields();
        if (this.documentName === 'Token') {
          TokenDataAdapter.correctDetectionModeOrder(selectedFields, this.randomizeFields);
        }
      }

      if (foundry.utils.isEmpty(selectedFields)) return false;

      const preset = new Preset({
        documentName: this.documentName,
        data: selectedFields,
        randomize: this.randomizeFields,
        addSubtract: this.addSubtractFields,
      });
      copyToClipboard(preset, command, this.isPrototype);
      return true;
    }

    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      if (this.options.presetEdit) return buttons;

      // Macro Generator
      if (SUPPORTED_PLACEABLES.includes(this.docName) || SUPPORTED_COLLECTIONS.includes(this.docName)) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-macro',
          icon: 'fas fa-terminal',
          onclick: () => {
            const selectedFields = this.getSelectedFields();
            new MacroForm(
              this.object,
              this.meObjects,
              this.docName,
              selectedFields,
              this.randomizeFields,
              this.addSubtractFields
            ).render(true);
          },
        });
      }

      // Brush Tool
      if (SUPPORTED_PLACEABLES.includes(this.docName)) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-brush',
          icon: 'fas fa-paint-brush',
          onclick: () => {
            Brush.activate({ app: this });
          },
        });
      }

      // Edit Permissions
      if (['Token', 'Note', 'Actor'].includes(this.docName)) {
        let docs = [];
        const ids = new Set();
        for (const p of this.meObjects) {
          let d;
          if (this.docName === 'Actor' || this.docName === 'JournalEntry') d = p;
          else if (this.docName === 'Token' && p.actor) d = p.actor;
          else if (this.docName === 'Note' && p.entry) d = p.entry;

          // Only retain unique docs
          if (d && !ids.has(d.id)) {
            docs.push(d);
            ids.add(d.id);
          }
        }

        if (docs.length)
          buttons.unshift({
            label: '',
            class: 'mass-edit-permissions',
            icon: 'fas fa-lock fa-fw',
            onclick: () => {
              let MP = WithMassPermissions();
              new MP(docs[0], docs).render(true);
            },
          });
      }

      if (!this.options.simplified) {
        // Open Preset form
        buttons.unshift({
          label: '',
          class: 'mass-edit-presets',
          icon: 'fas fa-box',
          onclick: () => {
            this.linkedPresetForm = new MassEditPresets(this, null, this.docName, {
              left: this.position.left - 370,
              top: this.position.top,
              preventPositionOverride: true,
            });
            this.linkedPresetForm.render(true);
          },
        });
      }

      // Apply JSON data onto the form
      buttons.unshift({
        label: '',
        class: 'mass-edit-apply',
        icon: 'far fa-money-check-edit',
        onclick: (ev) => {
          let selFields = expandObject(this.getSelectedFields());
          if (foundry.utils.isEmpty(selFields)) selFields = '';
          else selFields = JSON.stringify(selFields, null, 2);
          let content = `<textarea class="json" style="width:100%; height: 300px;">${selFields}</textarea>`;
          new Dialog({
            title: localize('form.apply-json'),
            content: content,
            buttons: {
              apply: {
                label: localize('common.apply'),
                callback: (html) => {
                  let json = {};
                  try {
                    json = JSON.parse(html.find('.json').val());
                  } catch (e) {}

                  if (!foundry.utils.isEmpty(json)) {
                    const preset = new Preset({
                      documentName: this.docName,
                      data: foundry.utils.flattenObject(json),
                    });
                    this._processPreset(preset);
                  }
                },
              },
            },
          }).render(true);
        },
      });

      // Toggle between Token and Actor forms
      if (this.documentName === 'Token' && this.meObjects.filter((t) => t.actor).length) {
        buttons.unshift({
          label: '',
          class: 'mass-edit-actors',
          icon: 'fas fa-user',
          onclick: () => {
            if (
              showMassActorForm(this.meObjects, {
                massEdit: this.options.massEdit,
              })
            ) {
              this.close();
            }
          },
        });
      }

      return buttons;
    }

    async activateListeners(html) {
      await super.activateListeners(html);
      // We want to update fields used by brush control every time a field changes on the form
      html.on('input', 'textarea, input[type="text"], input[type="number"]', () => Brush.refreshPreset());
      html.on('change', 'textarea, input, select', () => Brush.refreshPreset());
      html.on('paste', 'input', () => Brush.refreshPreset());
      html.on('click', 'button', () => Brush.refreshPreset());
    }

    async close(options = {}) {
      Brush.deactivate();
      options.force = true;

      if (['Token', 'AmbientLight'].includes(this.docName) && this.preview?.object) {
        this._resetPreview();
      }
      if (this.linkedPresetForm) this.linkedPresetForm.close();
      return super.close(options);
    }

    // Some forms will manipulate themselves via modifying internal objects and re-rendering
    // In such cases we want to preserve the selected fields
    render(force, options = {}) {
      // If it's being re-rendered with an action "update" in means it's ClientDocumentMixin response to _onUpdate
      // We can ignore these
      if (options.action === 'update') return;
      // Form hasn't been rendered yet, aka first render pass, ignore it
      if (!this.form) return super.render(force, options);

      // Fetch the currently selected fields before re-rendering
      const selectedFields = this.getSelectedFields();
      const randomize = this.randomizeFields;
      const addSubtract = this.addSubtractFields;

      // Render, the selections will be wiped
      super.render(force, options);

      // Re-select fields, we're reusing preset functions here.
      // Timeout require for this module including others to apply their
      // modifications to the configuration window
      setTimeout(() => {
        if (this.form) {
          this._applyPreset(
            new Preset({
              data: selectedFields,
              randomize,
              addSubtract,
            })
          );
        }
      }, 1000);
    }

    async _processPreset(preset) {
      // This will be called when a preset item is selected or JSON data is being directly applied
      // The code bellow handles it being applied to the current form

      // =====================
      // Module specific logic
      // =====================
      let timeoutRequired = false;

      const data = foundry.utils.flattenObject(preset.data[0]);

      // Monk's Active Tiles
      if ('flags.monks-active-tiles.actions' in data) {
        timeoutRequired = true;
        await this.object.setFlag('monks-active-tiles', 'actions', data['flags.monks-active-tiles.actions']);
      }

      if ('flags.monks-active-tiles.files' in data) {
        timeoutRequired = true;
        await this.object.setFlag('monks-active-tiles', 'files', data['flags.monks-active-tiles.files']);
      }

      // 3D Canvas
      if ('flags.levels-3d-preview.shaders' in data) {
        timeoutRequired = true;
        await this.object.setFlag('levels-3d-preview', 'shaders', data['flags.levels-3d-preview.shaders']);
      }

      // Limits
      if ('flags.limits.light.enabled' in data) {
        timeoutRequired = true;
        await this.object.update({ flags: { limits: expandObject(data).flags.limits } });
      }

      if (this.documentName === 'Token') {
        timeoutRequired = TokenDataAdapter.modifyPresetData(this, data);
      }

      if (timeoutRequired) {
        setTimeout(() => {
          this._applyPreset(preset);
        }, 250);
        return;
      }

      this._applyPreset(preset);
    }

    _applyPreset(preset) {
      const form = $(this.form);

      const customMerge = (obj1, obj2) => {
        if (!obj2) return obj1;
        for (const [k, v] of Object.entries(obj2)) {
          obj1[k] = v;
        }
        return obj1;
      };

      this.randomizeFields = customMerge(this.randomizeFields, preset.randomize);
      this.addSubtractFields = customMerge(this.addSubtractFields, preset.addSubtract);
      selectRandomizerFields(form, this.randomizeFields);
      selectAddSubtractFields(form, this.addSubtractFields);

      const data = foundry.utils.flattenObject(preset.data[0]);
      GeneralDataAdapter.dataToForm(this.documentName, preset.data[0], data);
      for (const key of Object.keys(data)) {
        const el = form.find(`[name="${key}"]`);
        if (el.is(':checkbox')) {
          el.prop('checked', data[key]);
        } else {
          el.val(data[key]);
        }
        el.trigger('change');
      }

      // Make brush aware of randomized field changes
      Brush.refreshPreset();
    }

    get title() {
      if (this.options.massSelect) return localFormat('form.mass-search-title', { document: this.documentName });
      return localFormat('form.mass-edit-title', { document: this.documentName, count: this.meObjects.length });
    }
  }

  const constructorName = `Mass${docName}Config`;
  Object.defineProperty(MassConfig.prototype.constructor, 'name', { value: constructorName });
  return MassConfig;
};

export const WithMassPermissions = () => {
  let MEF = WithMassEditForm(DocumentOwnershipConfig);

  class MassPermissions extends MEF {
    constructor(target, docs, options = {}) {
      // Generate common permissions
      const data = getData(docs[0]);
      const commonData = foundry.utils.flattenObject(data.ownership);

      const metaLevels = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

      // Permissions are only present if they differ from default, for simplicity simple add them before comparing
      const addMissingPerms = function (perms) {
        game.users.forEach((u) => {
          if (!(u.id in perms)) perms[u.id] = metaLevels.DEFAULT;
        });

        if (!('default' in perms)) perms.default = metaLevels.DEFAULT;
      };
      addMissingPerms(commonData);

      for (let i = 1; i < docs.length; i++) {
        const data = getData(docs[i]);
        const flatData = foundry.utils.flattenObject(data.ownership);
        addMissingPerms(flatData);
        const diff = foundry.utils.flattenObject(foundry.utils.diffObject(commonData, flatData));
        for (const k of Object.keys(diff)) {
          delete commonData[k];
        }
      }

      options.commonData = commonData;
      options.massPermissions = true;

      super(target, docs, options);
    }

    async _updateObject(event, formData) {
      const selectedFields = this.getSelectedFields(formData);

      const metaLevels = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;

      if (foundry.utils.isEmpty(selectedFields)) return;

      const ids = new Set();
      const updates = [];
      for (const d of this.meObjects) {
        if (!ids.has(d.id)) {
          const data = getData(d);
          const ownership = foundry.utils.deepClone(data.ownership);

          for (let [user, level] of Object.entries(selectedFields)) {
            if (level === metaLevels.DEFAULT) delete ownership[user];
            else ownership[user] = level;
          }

          ids.add(d.id);
          updates.push({ _id: d.id, ownership: ownership });
        }
      }

      this.meObjects[0].constructor.updateDocuments(updates, {
        diff: false,
        recursive: false,
        noHook: true,
      });
    }

    get title() {
      return `Mass-${this.documentName} PERMISSIONS EDIT [ ${this.meObjects.length} ]`;
    }
  }

  return MassPermissions;
};
