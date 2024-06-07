import { MODULE_ID } from '../utils.js';
import { META_INDEX_ID } from './collection.js';

export class V12Migrator {
  static async migrateAllPacks() {
    for (const pack of game.packs) {
      if (pack.documentName !== 'JournalEntry') continue;

      this.migrateCompendium(pack);
    }
  }

  static async migratePack(pack) {
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

    const updates = [];
    const documents = await pack.getDocuments();

    for (const document of documents) {
      const preset = document.getFlag(MODULE_ID, 'preset');
      if (!preset) continue;

      let update = {};

      // Migrate Preset data
      if (preset.data?.length) {
        this.migrateData(preset.data, preset.documentName);
        foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset.data`, preset.data);
      }

      // Convert attached Preset data
      if (preset.attached?.length) {
        for (const attached of preset.attached) {
          this.migrateData([attached.data], attached.documentName);
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

  static migrateData(dataArr, documentName) {
    const cls = getDocumentClass(documentName);

    for (const data of dataArr) {
      // Core Foundry migration
      cls.migrateData(data);

      // Levels 'rangeBottom' flag migration
      const oldBottom = data.flags?.levels?.rangeBottom;
      if (Number.isNumeric(oldBottom)) {
        delete data.flags.levels.rangeBottom;
        data.elevation = oldBottom;

        if (documentName === 'Drawing') data.interface = true;
      }

      // Token Attacher migration
      const prototypeAttached = data.flags?.['token-attacher']?.prototypeAttached;
      if (prototypeAttached) this.migratePrototypeAttached(prototypeAttached);
      const elevation = data.flags?.['token-attacher']?.offset?.elevation;
      if (elevation) {
        const oldBottom = elevation.flags?.levels?.rangeBottom;
        if (Number.isNumeric(oldBottom)) {
          delete elevation.flags.levels.rangeBottom;
          elevation.elevation = oldBottom;
        }
      }
    }
  }

  static migratePrototypeAttached(prototypeAttached) {
    for (const [documentName, attached] of Object.entries(prototypeAttached)) {
      this.migrateData(attached, documentName);
    }
  }
}
