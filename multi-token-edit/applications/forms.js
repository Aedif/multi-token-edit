import { getData } from '../scripts/utils.js';
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
  } else {
    cls = Object.values(Object.values(sheets).pop() ?? {}).pop()?.cls;
  }

  const MEF = WithMassEditForm(cls);

  class MassConfig extends MEF {
    constructor(target, docs, options) {
      super(target.document ? target.document : target, docs, options);
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
