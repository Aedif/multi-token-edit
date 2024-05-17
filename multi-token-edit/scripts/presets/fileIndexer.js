import { isImage } from '../utils.js';
import { PresetTree, VirtualFileFolder } from './collection.js';
import { VirtualTilePreset } from './preset.js';

const CACHE_PATH = '';
const INDEX_PATH = 'modules/mass-edit-aedifs-presets';

// const CACHE_STRUCTURE = [{ dir: 'modules', files: [{ name: 'box.webp', tags: [] }], dirs: [] }];

export class FileIndexer {
  static _loadedTree;

  static async getVirtualDirectoryTree(type, { setFormVisibility = false } = {}) {
    if (CONFIG.debug.MassEdit) console.time('Virtual File Directory');

    if (FileIndexer._loadedTree) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      if (setFormVisibility) FileIndexer._loadedTree.setVisibility(type);
      return FileIndexer._loadedTree;
    }

    const allFolders = new Map();
    const allPresets = [];
    const folders = await this.loadIndexCache(allFolders, allPresets, CACHE_PATH + '/MassEditCache.json');

    let tree;
    if (folders?.length) {
      tree = new PresetTree({
        folders,
        presets: [],
        allPresets,
        allFolders,
        hasVisible: allPresets.some((p) => p._visible),
        metaDoc: null,
        pack: null,
      });

      if (setFormVisibility) tree.setVisibility(type);
    }

    this._loadedTree = tree;

    if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
    return tree;
  }

  static async buildIndex() {
    ui.notifications.info('Building Mass Edit directory index.');

    // TODO: support multiple index paths
    let index = await FileIndexer.generateIndex(INDEX_PATH);

    if (index) {
      const sDir = INDEX_PATH.split('/').filter(Boolean);
      for (let i = sDir.length - 2; i >= 0; i--) {
        index = { dir: sDir[i], dirs: [index] };
      }
    }

    await FileIndexer._writeIndexToCache([index]);
    FileIndexer._loadedTree = null;
  }

  static async getPreset(uuid) {
    if (!this._loadedTree) await FileIndexer.getVirtualDirectoryTree();
    if (!this._loadedTree) return null;
    return this._loadedTree.allPresets.find((p) => p.uuid === uuid);
  }

  static async saveIndexToCache(notify = true) {
    if (this._loadedTree) {
      const cacheFolders = this._loadedTree.folders.map((f) => this._cacheFolder(f));
      this._writeIndexToCache(cacheFolders, notify);
    }
  }

  static async _writeIndexToCache(index, notify = true) {
    let file = new File([JSON.stringify(index)], 'MassEditCache.json', {
      type: 'text/plain',
    });
    await FilePicker.upload('data', CACHE_PATH, file, {}, { notify });
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

  static async loadIndexCache(allFolders, allPresets, cacheFile) {
    let folders;
    try {
      await jQuery.getJSON(cacheFile, (json) => {
        if (!(Array.isArray(json) && json?.length)) return null;
        console.log(json);

        folders = json.map((f) => this._indexToVirtualFolder(f, '', allFolders, allPresets));
      });
    } catch (error) {
      ui.notifications.warn(`Failed to load file`);
    }
    return folders;
  }

  static _indexToVirtualFolder(cache, parentDirPath, allFolders, allPresets) {
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
        const childFolder = this._indexToVirtualFolder(dir, fullPath, allFolders, allPresets);
        if (childFolder) {
          childFolder.folder = fileFolder.id;
          fileFolder.children.push(childFolder);
        }
      }
    }

    if (cache.files) {
      for (const file of cache.files) {
        const preset = new VirtualTilePreset({
          name: file.name,
          img: fullPath + '/' + file.name,
          tags: file.tags,
          folder: fileFolder.id,
        });
        allPresets.push(preset);
        fileFolder.presets.push(preset);
      }
    }

    allFolders.set(uuid, fileFolder);
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
