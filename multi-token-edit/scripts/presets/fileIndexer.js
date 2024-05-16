import { isImage } from '../utils.js';
import { VirtualFileFolder } from './collection.js';
import { VirtualTilePreset } from './preset.js';

const CACHE_PATH = '';
const INDEX_PATH = 'modules/mass-edit-aedifs-presets';

// const CACHE_STRUCTURE = [{ dir: 'modules', files: [{ name: 'box.webp', tags: [] }], dirs: [] }];

export class FileIndexer {
  static async getVirtualPresetFolder() {
    // storedCacheResponse = await fetch(jsonPath ?? prefixURL + '/DigDownCache.json');

    if (FileIndexer._loadedVirtualFolder) return FileIndexer._loadedVirtualFolder;

    const folders = [];
    const folder = await this.loadIndexCache(folders, CACHE_PATH + '/MassEditCache.json');
    if (folder) folder.allVirtualFolders = folders;
    FileIndexer._loadedVirtualFolder = folder;

    return folder;
  }

  static async buildIndex() {
    ui.notifications.info('Building Mass Edit directory index.');

    let index = await FileIndexer.generateIndex(INDEX_PATH);

    if (index) {
      const sDir = INDEX_PATH.split('/').filter(Boolean);
      for (let i = sDir.length - 2; i >= 0; i--) {
        index = { dir: sDir[i], dirs: [index] };
      }
    }

    if (index) {
      FileIndexer._writeIndexToCache(index);

      const folders = [];
      const folder = FileIndexer._indexToVirtualFolder(index, '', folders);
      folder.allVirtualFolders = folders;
      FileIndexer._loadedVirtualFolder = folder;
    } else {
      FileIndexer._loadedVirtualFolder = null;
    }
  }

  static getPreset(uuid, folder = this._loadedVirtualFolder) {
    if (!folder) return null;

    const preset = folder.presets.find((p) => p.uuid === uuid);
    if (preset) return preset;

    for (const c of folder.children) {
      const preset = this.getPreset(uuid, c);
      if (preset) return preset;
    }

    return null;
  }

  static async saveIndexToCache() {
    if (this._loadedVirtualFolder) this._writeIndexToCache(this._cacheFolder(this._loadedVirtualFolder));
  }

  static async _writeIndexToCache(index) {
    const cache = [index];
    let file = new File([JSON.stringify(cache)], 'MassEditCache.json', {
      type: 'text/plain',
    });
    FilePicker.upload('data', CACHE_PATH, file);
  }

  static _cacheFolder(folder) {
    const fDic = { dir: folder.name };
    if (folder.presets.length) fDic.files = folder.presets.map((p) => this._cachePreset(p));
    if (folder.children.length) fDic.dirs = folder.children.map((c) => this._cacheFolder(c));
    return fDic;
  }

  static _cachePreset(preset) {
    const pDic = { name: preset.name };
    if (preset.tags?.length) pDic.tags = preset.tags;
    return pDic;
  }

  static async loadIndexCache(folders, cacheFile) {
    let folder;
    try {
      await jQuery.getJSON(cacheFile, (json) => {
        if (!(Array.isArray(json) && json?.length)) return null;
        console.log(json);

        folder = this._indexToVirtualFolder(json[0], '', folders);

        console.log('Parsed CACHE: ', folder);
      });
    } catch (error) {
      ui.notifications.warn(`Failed to load file`);
    }
    return folder;
  }

  static _indexToVirtualFolder(cache, parentDirPath, folders) {
    const fullPath = parentDirPath + '/' + cache.dir;
    const uuid = 'virtual.' + fullPath;
    const fileFolder = new VirtualFileFolder({
      id: randomID(),
      uuid,
      name: cache.dir,
      children: [],
      presets: [],
      draggable: false,
    });

    if (cache.dirs) {
      for (const dir of cache.dirs) {
        const childFolder = this._indexToVirtualFolder(dir, fullPath, folders);
        if (childFolder) fileFolder.children.push(childFolder);
      }
    }

    if (cache.files) {
      for (const file of cache.files) {
        const preset = new VirtualTilePreset({
          name: file.name,
          img: fullPath + '/' + file.name,
          tags: file.tags,
        });
        fileFolder.presets.push(preset);
      }
    }

    folders.push(fileFolder);
    return fileFolder;
  }

  static async generateIndex(dir) {
    let content = await FilePicker.browse('user', dir);

    const folder = {
      dir: dir.split('/').filter(Boolean).pop(),
      dirs: [],
      files: [],
    };

    for (let dir of content.dirs) {
      dir = await this.generateIndex(dir + '/');
      if (dir) folder.dirs.push(dir);
    }

    for (let path of content.files) {
      if (!isImage(path)) continue;
      folder.files.push({ name: getFileNameWithExt(path) });
    }

    if (!folder.dirs.length) delete folder.dirs;
    if (!folder.files.length) delete folder.files;

    if (!(folder.dirs || folder.files)) return null;
    return folder;
  }
}

function getFileNameWithExt(path) {
  if (!path) return '';
  return path.split('\\').pop().split('/').pop();
}

function getFilePath(path) {
  return path.match(/(.*)[\/\\]/)?.[1] || '';
}
