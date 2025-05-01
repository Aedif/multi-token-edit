import { MODULE_ID } from '../constants.js';
import { META_INDEX_FIELDS, META_INDEX_ID, PresetCollection, PresetTree } from './collection.js';
import { PresetBrowser } from './browser/browserApp.js';
import { PRESET_FIELDS } from './preset.js';

export class V12Migrator {
  static async migrateAllPacks({ migrateFunc = null, transformFunc = null, coreMigration = false } = {}) {
    if (!migrateFunc && !transformFunc && !coreMigration) {
      ui.notifications.warn('Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` flag.');
      return;
    }

    if (transformFunc && (migrateFunc || coreMigration)) {
      ui.notifications.warn('`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` flag.');
      return;
    }

    for (const pack of game.packs) {
      if (pack.documentName !== 'JournalEntry') continue;
      if (!pack.index.get(META_INDEX_ID)) continue;
      else if (pack.locked) {
        console.warn(`Mass Edit - Unable to migrate a locked compendium. ${pack.metadata.label}`);
        continue;
      }

      try {
        this.migratePack({ pack, migrateFunc, transformFunc, coreMigration });
      } catch (e) {
        console.warn(`Mass Edit - Ran into an issue while migrating ${pack.metadata.label}`);
        console.error(e);
      }
    }
  }

  static async migratePack({
    pack = PresetCollection.workingPack,
    migrateFunc = null,
    transformFunc = null,
    coreMigration = false,
  } = {}) {
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

    if (!migrateFunc && !transformFunc && !coreMigration) {
      ui.notifications.warn('Specify either a `migrateFunc`, `transformFunc`, or enable `coreMigration` flag.');
      return;
    }

    if (transformFunc && (migrateFunc || coreMigration)) {
      ui.notifications.warn('`transformFunc` cannot be executed alongside `migrateFunc` or `coreMigration` flag.');
      return;
    }

    const updates = [];
    const documents = await pack.getDocuments();
    const metaIndexUpdate = {};

    if (migrateFunc || coreMigration) {
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
    }

    if (transformFunc) {
      for (const document of documents) {
        let preset = document.getFlag(MODULE_ID, 'preset');
        if (!preset) continue;

        const original = preset;
        preset = foundry.utils.deepClone(original);

        await transformFunc(preset, document);

        const diff = foundry.utils.diffObject(original, preset);
        Object.keys(diff).forEach((field) => {
          if (!PRESET_FIELDS.includes(field)) delete diff[field];
        });

        if (!foundry.utils.isEmpty(diff)) {
          let update = {};
          update._id = document.id;

          foundry.utils.setProperty(update, `flags.${MODULE_ID}.preset`, diff);
          updates.push(update);

          const indexUpdate = {};
          META_INDEX_FIELDS.forEach((field) => {
            if (field in diff) indexUpdate[field] = diff[field];
          });

          if (!foundry.utils.isEmpty(indexUpdate)) metaIndexUpdate[document.id] = indexUpdate;
        }
      }
    }

    if (updates.length <= 0) {
      ui.notifications.info('Mass Edit - No data to migrate: ' + pack.metadata.label);
    } else {
      await JournalEntry.updateDocuments(updates, { pack: pack.collection });
      if (!foundry.utils.isEmpty(metaIndexUpdate)) {
        const index = await pack.getDocument(META_INDEX_ID);
        if (index) index.setFlag(MODULE_ID, 'index', metaIndexUpdate);
      }

      ui.notifications.notify('Mass Edit - Migrated ' + updates.length + ' presets within "' + pack.metadata.label);

      setTimeout(() => {
        delete PresetTree._packTrees[pack.metadata.id];
        Object.values(ui.windows)
          .find((app) => app instanceof PresetBrowser)
          ?.render(true);
      }, 500);
    }

    return pack;
  }

  static _migrateData(dataArr, documentName, coreMigration = true, migrateFunc = null) {
    const cls = getDocumentClass(documentName);

    for (const data of dataArr) {
      if (coreMigration) cls?.migrateData(data); // Core Foundry migration
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
