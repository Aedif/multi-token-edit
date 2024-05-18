import { FILE_EXTENSIONS } from '../utils.js';
import { PresetTree, VirtualFileFolder } from './collection.js';
import { VirtualFilePreset } from './preset.js';

const CACHE_PATH = '';
// const INDEX_PATHS = ['modules/mass-edit-aedifs-presets', 'modules/token-variants', 'dump'];
const INDEX_PATHS = ['modules'];
const CACHE_NAME = 'MassEditCache.json';

export class FileIndexer {
  static _loadedTree;

  static async getVirtualDirectoryTree(type, { setFormVisibility = false } = {}) {
    if (CONFIG.debug.MassEdit) console.time('Virtual File Directory');

    if (FileIndexer._loadedTree) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      if (setFormVisibility) FileIndexer._loadedTree.setVisibility(type);
      ui.notifications.info(`Index consist of ${FileIndexer._loadedTree.allPresets.length} files.`);
      return FileIndexer._loadedTree;
    }

    const allFolders = new Map();
    const allPresets = [];

    const cache = await this.loadIndexCache(CACHE_PATH + '/' + CACHE_NAME);
    const folders = cache.map((f) => this._indexToVirtualFolder(f, '', allFolders, allPresets));

    ui.notifications.info(`Index consist of ${allPresets.length} files.`);

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

  /**
   * Build the directory index using the user defined paths to be scanned.
   * Index structure: [{ dir: 'modules', files: [{ name: 'box.webp', tags: [] }], dirs: [] }];
   */
  static async buildIndex({ ignorePreCachedTags = true } = {}) {
    ui.notifications.info('Building Mass Edit directory index.');

    const index = [];
    const foundCaches = [];

    for (const path of INDEX_PATHS) {
      let iDir = await this.generateIndex(path, foundCaches);

      if (iDir) {
        const sPath = path.split('/').filter(Boolean);
        for (let i = sPath.length - 2; i >= 0; i--) {
          iDir = { dir: sPath[i], dirs: [iDir] };
        }

        this.mergeIndex(index, [iDir]);
      }
    }

    // If pre-generated caches have been found we want to load and merge them here
    for (const path of foundCaches) {
      const cache = await this.loadIndexCache(path);
      console.log(cache, index);
      if (cache) this.mergeIndex(index, cache);
    }

    // User can specify if he wants the tags associated with images/video to be retained or not.
    // overrideNullTagsOnly - true - will essentially override user changes to pre-cached directories
    // overrideNullTagsOnly - false - pre-cached directory tags will be ignored, favoring user tags
    const currentCache = await this.loadIndexCache(CACHE_PATH + '/' + CACHE_NAME);
    if (currentCache) {
      this.mergeIndex(index, currentCache, { tagsOnly: true, overrideNullTagsOnly: !ignorePreCachedTags });
    }

    if (index.length) await this._writeIndexToCache(index);
    this._loadedTree = null;
  }

  // options to only merge tags if they didn't have any
  static mergeIndex(indexTo, indexFrom, { tagsOnly = false, overrideNullTagsOnly = false } = {}) {
    for (const dirFrom of indexFrom) {
      const dirTo = indexTo.find((dir) => dir.dir === dirFrom.dir);
      if (dirTo) {
        // TODO: We may want to merge customizable fields here

        // Merge directories
        if (dirFrom.dirs) {
          if (dirTo.dirs) this.mergeIndex(dirTo.dirs, dirFrom.dirs, { tagsOnly, overrideNullTagsOnly });
          else if (!tagsOnly) dirTo.dirs = dirFrom.dirs;
        }

        // Merge files
        if (dirFrom.files) {
          if (dirTo.files) {
            for (const fileFrom of dirFrom.files) {
              const fileTo = dirTo.files?.find((f) => f.name === fileFrom.name);

              if (fileTo) {
                // TODO: We may want to merge customizable fields here
                if (!overrideNullTagsOnly || fileTo.tags == null) fileTo.tags = fileFrom.tags;
              } else if (!tagsOnly) {
                if (!dirTo.files) dirTo.files = [];
                dirTo.files.push(fileFrom);
              }
            }
          } else if (!tagsOnly) dirTo.files = dirFrom.files;
        }
      } else if (!tagsOnly) indexTo.push(dirFrom);
    }
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
    const str = JSON.stringify(index);

    const tFile = await StringCompress.compress(str);
    console.log(tFile);
    await FilePicker.upload('data', CACHE_PATH, tFile, {}, { notify });

    const tCache = await StringCompress.decompressCache(CACHE_PATH + '/' + 'MassEditCacheGZ.json');
    console.log(tCache);

    let file = new File([str], 'MassEditCache.json', {
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

  static async loadIndexCache(cacheFile) {
    let cache;
    try {
      await jQuery.getJSON(cacheFile, (json) => {
        if (!(Array.isArray(json) && json?.length)) return null;
        cache = json;
      });
    } catch (error) {
      ui.notifications.warn(`Failed to load file`);
    }
    return cache;
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

    // For assigning folder category
    let hasAudio = false;
    let hasImgVideo = false;

    if (cache.dirs) {
      for (const dir of cache.dirs) {
        const childFolder = this._indexToVirtualFolder(dir, fullPath, allFolders, allPresets);
        if (childFolder) {
          childFolder.folder = fileFolder.id;
          fileFolder.children.push(childFolder);

          hasAudio = hasAudio || childFolder.types.includes('AmbientSound');
          hasImgVideo = hasImgVideo || childFolder.types.includes('Tile');
        }
      }
    }

    if (cache.files) {
      for (const file of cache.files) {
        const preset = new VirtualFilePreset({
          name: file.name,
          src: fullPath + '/' + file.name,
          tags: file.tags,
          folder: fileFolder.id,
        });
        allPresets.push(preset);
        fileFolder.presets.push(preset);

        hasAudio = hasAudio || preset.documentName === 'AmbientSound';
        hasImgVideo = hasImgVideo || preset.documentName === 'Tile';
      }
    }

    if (hasAudio) fileFolder.types.push('AmbientSound');
    if (hasImgVideo) fileFolder.types.push('Tile');

    allFolders.set(uuid, fileFolder);
    return fileFolder;
  }

  static async generateIndex(dir, foundCaches = []) {
    let content;
    try {
      content = await FilePicker.browse('user', dir);
    } catch (e) {
      return null;
    }

    const folder = {
      dir: dir.split('/').filter(Boolean).pop(),
      dirs: [],
      files: [],
    };

    for (let path of content.files) {
      const fileName = path.split('\\').pop().split('/').pop();

      // Cancel indexing if noscan.txt or cache file is present within the directory
      if (fileName === 'noscan.txt') return null;
      if (fileName === CACHE_NAME && CACHE_PATH !== dir) {
        console.log('FOUND CACHE', path, fileName);
        foundCaches.push(path);
        return null;
      }

      // Otherwise process the file
      let ext = fileName.split('.');
      ext = ext[ext.length - 1].toLowerCase();

      if (FILE_EXTENSIONS.includes(ext)) {
        folder.files.push({ name: fileName });
      }
    }

    for (let dir of content.dirs) {
      dir = await this.generateIndex(dir + '/', foundCaches);
      if (dir) folder.dirs.push(dir);
    }

    if (!folder.dirs.length) delete folder.dirs;
    if (!folder.files.length) delete folder.files;

    if (!(folder.dirs || folder.files)) return null;
    return folder;
  }
}

class StringCompress {
  static async compress(str) {
    // Convert the string to a byte stream.
    const stream = new Blob([str]).stream();

    // Create a compressed stream.
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));

    console.log(compressedStream);

    // Read all the bytes from this stream.
    const chunks = [];
    for await (const chunk of this.streamAsyncIterator(compressedStream)) {
      chunks.push(chunk);
    }

    const blob = new Blob(chunks);
    const file = new File([blob], 'MassEditCacheGZ.json');
    return file;
    //return await this.concatUint8Arrays(chunks);
  }

  static async decompressCache(filePath) {
    const response = await fetch(filePath);
    console.log(response);
    if (response.ok) {
      const str = await this.decompress(response.body);
      const cache = JSON.parse(str);
      return cache;
    }
    return null;
  }

  static async decompress(stream) {
    // Create a decompressed stream.
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));

    // Read all the bytes from this stream.
    const chunks = [];
    for await (const chunk of this.streamAsyncIterator(decompressedStream)) {
      chunks.push(chunk);
    }
    const stringBytes = await this.concatUint8Arrays(chunks);

    // Convert the bytes to a string.
    return new TextDecoder().decode(stringBytes);
  }

  static async concatUint8Arrays(uint8arrays) {
    const blob = new Blob(uint8arrays);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  static async *streamAsyncIterator(stream) {
    // Get a lock on the stream
    const reader = stream.getReader();

    try {
      while (true) {
        // Read from the stream
        const { done, value } = await reader.read();
        // Exit if we're done
        if (done) return;
        // Else yield the chunk
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
