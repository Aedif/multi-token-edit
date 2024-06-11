import { Brush } from '../scripts/brush.js';
import { Preset } from '../scripts/presets/preset.js';
import { getData, getDocumentName, localize } from '../scripts/utils.js';
import { TokenDataAdapter } from './dataAdapters.js';
import { copyToClipboard, getCommonDocData, performMassSearch, performMassUpdate } from './formUtils.js';
import { WithBaseMassEditForm, WithMassEditFormApplication, WithMassEditFormApplicationV2 } from './meApplication.js';

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
      super(target.document ? target.document : target, docs, options);
    }

    async _updateObject(event, formData) {
      await this.massUpdateObject(event, formData);

      // On v11 certain placeable will freeze the canvas layer if parent _updateObject is not called
      if (['Token', 'AmbientLight'].includes(this.docName) && this.preview?.object) {
        this._resetPreview();
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
