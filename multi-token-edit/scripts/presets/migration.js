import { MODULE_ID } from '../utils.js';
import { META_INDEX_ID, PresetCollection } from './collection.js';

export class V12Migrator {
  static async migrateAllPacks({ migrateFunc = null, coreMigration = false } = {}) {
    if (!migrateFunc && !coreMigration) {
      ui.notifications.warn('Specify either a `migrateFunc` or enable `coreMigration` flag.');
      return;
    }

    for (const pack of game.packs) {
      if (pack.documentName !== 'JournalEntry') continue;
      if (!pack.index.get(META_INDEX_ID)) continue;
      else if (pack.locked) {
        console.warn(`Mass Edit - Unable to migrate a locked compendium. ${pack.metadata.label}`);
        continue;
      }

      this.migratePack(pack, { migrateFunc, coreMigration });
    }
  }

  static async migratePack(pack = PresetCollection.workingPack, { migrateFunc = null, coreMigration = false } = {}) {
    if (foundry.utils.getType(pack) === 'string') {
      let fPack = game.packs.get(pack) || game.packs.find((p) => p.metadata.label === pack);
      if (!fPack) {
        console.warn('Invalid pack: ' + pack);
        return;
      }
      pack = fPack;
    }

    if (!pack.index.get(META_INDEX_ID)) {
      console.warn(`Mass Edit - This is not a preset compendium. ${pack.metadata.label}`);
      return;
    }

    if (pack.locked) {
      console.warn(`Mass Edit - Unable to migrate a locked compendium. ${pack.metadata.label}`);
      return;
    }

    if (!migrateFunc && !coreMigration) {
      ui.notifications.warn('Specify either a `migrateFunc` or enable `coreMigration` flag.');
      return;
    }

    const updates = [];
    const documents = await pack.getDocuments();

    for (const document of documents) {
      const preset = document.getFlag(MODULE_ID, 'preset');
      if (!preset) continue;

      let update = {};

      // Migrate Preset data
      if (preset.data?.length) {
        this._migrateData(preset.data, preset.documentName, coreMigration, migrateFunc);
        foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.data`, preset.data);
      }

      // Convert attached Preset data
      if (preset.attached?.length) {
        for (const attached of preset.attached) {
          this._migrateData([attached.data], attached.documentName, coreMigration, migrateFunc);
        }
        foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.attached`, preset.attached);
      }

      if (!foundry.utils.isEmpty(update)) {
        update._id = document.id;
        updates.push(update);
      }
    }

    if (updates.length <= 0) {
      ui.notifications.info('Mass Edit - No data to migrate: ' + pack.metadata.label);
    } else {
      await JournalEntry.updateDocuments(updates, { pack: pack.collection });
      ui.notifications.notify('Mass Edit - Migrated ' + updates.length + ' presets within "' + pack.metadata.label);
    }
  }

  static _migrateData(dataArr, documentName, coreMigration = true, migrateFunc = null) {
    const cls = getDocumentClass(documentName);

    for (const data of dataArr) {
      if (coreMigration) cls.migrateData(data); // Core Foundry migration
      if (migrateFunc) migrateFunc(data, documentName); // Custom migration function

      // Token Attacher data traversal
      const prototypeAttached = data.flags?.['token-attacher']?.prototypeAttached;
      if (prototypeAttached) this._migratePrototypeAttached(prototypeAttached, coreMigration, migrateFunc);
    }
  }

  static _migratePrototypeAttached(prototypeAttached, coreMigration = true, migrateFunc = null) {
    for (const [documentName, attached] of Object.entries(prototypeAttached)) {
      this._migrateData(attached, documentName, coreMigration, migrateFunc);
    }
  }
}
