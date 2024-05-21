import { FILE_EXTENSIONS, MODULE_ID } from '../utils.js';
import { PresetTree, VirtualFileFolder } from './collection.js';
import { VirtualFilePreset } from './preset.js';
import { encodeURIComponentSafely } from './utils.js';

const CACHE_PATH = '';
const CACHE_NAME = 'MassEditCache.json';

export class FileIndexer {
  static _loadedTree;
  static _buildingIndex = false;

  static async getVirtualDirectoryTree(type, { setFormVisibility = false } = {}) {
    if (CONFIG.debug.MassEdit) console.time('Virtual File Directory');

    // If we already have a loaded index, re-use it
    if (this._loadedTree) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      if (setFormVisibility) this._loadedTree.setVisibility(type);
      return this._loadedTree;
    }

    // Load and convert an index cache to a virtual folder
    const allFolders = new Map();
    const allPresets = [];
    const topLevelFolders = [];

    const cache = await this.loadMainIndexCache();
    if (!cache) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      return null;
    }

    for (const source of cache) {
      let prepend = '';
      if (source.source === 'forge-bazaar') {
        prepend = `https://assets.forge-vtt.com/bazaar/`;
      }
      const folders = source.index.map((f) => this._indexToVirtualFolder(f, '', allFolders, allPresets, prepend));

      if (folders?.length) {
        const sFolder = new VirtualFileFolder({
          uuid: 'virtual.source.' + source.source,
          name: source.source,
          children: folders,
          types: ['ALL', 'Tile', 'AmbientSound'],
          bucket: source.bucket,
        });
        allFolders.set(sFolder.uuid, sFolder);
        topLevelFolders.push(sFolder);
      }
    }

    let tree;
    if (topLevelFolders.length) {
      tree = new PresetTree({
        folders: topLevelFolders,
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
  static async buildIndex() {
    if (this._buildingIndex) {
      ui.notifications.warn('Index Build In-Progress. Wait for it to finish before attempting it again.');
      return;
    }

    this._buildingIndex = true;

    ui.notifications.info('Building Mass Edit directory index.');

    const settings = game.settings.get(MODULE_ID, 'indexer');

    try {
      const scannedSources = [];
      const foundCaches = [];

      // Traverse directories specified in settings.indexDirs
      for (const dir of settings.indexDirs) {
        if (dir.source === 'forge-bazaar') await this._buildFauxForgeBrowser(dir.source, dir.target);
        let iDir = await this.generateIndex(dir.target, foundCaches, dir.source, dir.bucket, settings);

        if (iDir) {
          const sPath = dir.target.split('/').filter(Boolean);
          for (let i = sPath.length - 2; i >= 0; i--) {
            iDir = { dir: sPath[i], dirs: [iDir] };
          }

          let index = scannedSources.find((i) => i.source === dir.source && i.bucket == dir.bucket);
          if (index) this.mergeIndex(index.index, [iDir]);
          else {
            index = { source: dir.source, index: [iDir] };
            if (dir.bucket) index.bucket = dir.bucket;
            scannedSources.push(index);
          }
        }
      }

      // If pre-generated caches have been found we want to load and merge them here
      for (const cacheFile of foundCaches) {
        const cache = await this.loadIndexCache(cacheFile);
        if (cache) this.mergeCaches(scannedSources, cache);
      }

      // User can specify if he wants the tags associated with images/video to be retained or not.
      // overrideNullTagsOnly - true - will essentially override user changes to pre-cached directories
      // overrideNullTagsOnly - false - pre-cached directory tags will be ignored, favoring user tags
      const currentCache = await this.loadIndexCache(CACHE_PATH + '/' + CACHE_NAME);
      if (currentCache) {
        this.mergeCaches(scannedSources, currentCache, {
          tagsOnly: true,
          overrideNullTagsOnly: !settings.overrideTags,
        });
      }

      if (scannedSources.length) await this._writeIndexToCache(scannedSources);
      this._loadedTree = null;

      ui.notifications.info(`MassEdit Index build finished.`);
    } catch (e) {
      console.log(e);
    }

    this._buildingIndex = false;
  }

  static mergeCaches(cacheTo, cacheFrom, { tagsOnly = false, overrideNullTagsOnly = false } = {}) {
    for (const indexSourceFrom of cacheFrom) {
      const indexSourceTo = cacheTo.find(
        (i) => i.source === indexSourceFrom.source && i.bucket == indexSourceFrom.bucket
      );
      if (indexSourceTo) {
        this.mergeIndex(indexSourceTo.index, indexSourceFrom.index, {
          tagsOnly,
          overrideNullTagsOnly,
        });
      } else if (!tagsOnly) cacheTo.push(indexSourceFrom);
    }
  }

  // options to only merge tags if they didn't have any
  static mergeIndex(indexTo, indexFrom, { tagsOnly = false, overrideNullTagsOnly = false } = {}) {
    for (const dirFrom of indexFrom) {
      const dirTo = indexTo.find((dir) => dir.dir === dirFrom.dir);
      if (dirTo) {
        // TODO: We may want to merge customizable fields here
        if (!tagsOnly) {
          dirTo.icon = dirFrom.icon;
          dirTo.subtext = dirFrom.subtext;
        }

        // Merge directories
        if (dirFrom.dirs) {
          if (dirTo.dirs) {
            this.mergeIndex(dirTo.dirs, dirFrom.dirs, { tagsOnly, overrideNullTagsOnly });
          } else if (!tagsOnly) {
            dirTo.dirs = dirFrom.dirs;
          }
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
      const cache = [];
      for (const sourceFolder of this._loadedTree.folders) {
        const sourceCache = {
          source: sourceFolder.name,
          index: sourceFolder.children.map((f) => this._cacheFolder(f)),
        };
        if (sourceFolder.bucket) sourceCache.bucket = sourceFolder.bucket;
        cache.push(sourceCache);
      }

      this._writeIndexToCache(cache, notify);
    }
  }

  static async _writeIndexToCache(index, notify = true) {
    const str = JSON.stringify(index);

    const tFile = await StringCompress.compress(str);
    await FilePicker.upload('data', CACHE_PATH, tFile, {}, { notify });
  }

  static _cacheFolder(folder) {
    const fDic = { dir: encodeURIComponentSafely(folder.name) };
    if (folder.presets.length) fDic.files = folder.presets.map((p) => this._cachePreset(p));
    if (folder.children.length) fDic.dirs = folder.children.map((c) => this._cacheFolder(c));
    return fDic;
  }

  static _cachePreset(preset) {
    const pDic = { name: encodeURIComponentSafely(preset.name) };
    if (preset.tags?.length) pDic.tags = preset.tags;
    return pDic;
  }

  static async loadIndexCache(cacheFile) {
    let cache;
    try {
      cache = await StringCompress.decompressCache(cacheFile);
    } catch (error) {
      ui.notifications.warn(`Failed to load cache: ` + cacheFile);
    }
    return cache;
  }

  static async loadMainIndexCache() {
    let path;
    if (typeof ForgeVTT !== 'undefined' && ForgeVTT.usingTheForge) {
      const userId = await ForgeAPI.getUserId();
      path = `https://assets.forge-vtt.com/${userId}/${CACHE_NAME}`;
    } else {
      path = CACHE_PATH + '/' + CACHE_NAME;
    }
    return await this.loadIndexCache(path);
  }

  static _indexToVirtualFolder(cache, parentDirPath, allFolders, allPresets, prePend = '') {
    const fullPath = parentDirPath + '/' + cache.dir;
    const uuid = 'virtual.' + prePend + fullPath;
    const fileFolder = new VirtualFileFolder({
      uuid,
      name: cache.dir,
      subtext: cache.subtext,
      icon: cache.icon,
    });

    // For assigning folder category
    let hasAudio = false;
    let hasImgVideo = false;

    if (cache.dirs) {
      for (const dir of cache.dirs) {
        const childFolder = this._indexToVirtualFolder(dir, fullPath, allFolders, allPresets, prePend);
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
          src: prePend + fullPath + '/' + file.name,
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

  static async generateIndex(dir, foundCaches = [], source = 'data', bucket = null, settings) {
    let content;
    try {
      content = await this._browse(source, dir, { bucket });
    } catch (e) {
      return null;
    }

    const folder = {
      dir: dir.split('/').filter(Boolean).pop(),
      dirs: [],
      files: [],
    };
    if (settings.folderFilters.some((k) => folder.dir.includes(k))) return null;

    for (let path of content.files) {
      const fileName = path.split('\\').pop().split('/').pop();
      if (settings.fileFilters.some((k) => fileName.includes(k))) continue;

      // Cancel indexing if noscan.txt or cache file is present within the directory
      if (fileName === 'noscan.txt') return null;
      else if (fileName === CACHE_NAME) {
        const cacheDir = settings.cacheDir;
        if (!(cacheDir.target === dir.target && cacheDir.source === source && cacheDir.bucket === bucket)) {
          foundCaches.push(path);
          return null;
        }
      } else if (fileName === 'module.json') {
        folder.subtext = await this._getAuthorFromModule(path);
        console.log(folder.subtext);
        if (folder.subtext === 'Baileywiki') folder.icon = 'bw_icon.png'; // TODO REMOVE
      }

      // Otherwise process the file
      let ext = fileName.split('.');
      ext = ext[ext.length - 1].toLowerCase();

      if (FILE_EXTENSIONS.includes(ext)) {
        folder.files.push({ name: fileName });
      }
    }

    for (let dir of content.dirs) {
      dir = await this.generateIndex(dir, foundCaches, source, bucket, settings);
      if (dir) folder.dirs.push(dir);
    }

    if (!folder.dirs.length) delete folder.dirs;
    if (!folder.files.length) delete folder.files;

    if (!(folder.dirs || folder.files)) return null;
    return folder;
  }

  static async _browse(source, dir, options) {
    if (source === 'forge-bazaar') {
      return this._fauxForgeBrowser?.get(dir) ?? { dirs: [], files: [] };
    } else {
      return await FilePicker.browse(source, dir, options);
    }
  }

  /**
   * ForgeVTT forge-bazaar can be browsed recursively returning all the found dirs and files at a given path.
   * To keep the processing consistent between different sources however we will simulate FilePicker.browse results
   * by rebuilding the directory structure using the recursively retrieved results.
   * This faux structure will be used by FileIndexer._browse(...)
   * @param {String} source forge-bazaar
   * @param {String} dir
   */
  static async _buildFauxForgeBrowser(source, dir) {
    this._fauxForgeBrowser = new Map();

    // Recursion doesn't work for bazaar paths at one level above root. Perform non-recursive browse
    // and then recursive one on all of the retrieved dirs
    let paths;
    if (!['modules', 'systems', 'worlds', 'assets'].includes(dir.replaceAll(/[\/\\]/g, ''))) {
      paths = [dir];
    } else {
      const contents = await FilePicker.browse(source, dir, { recursive: false });
      paths = contents.dirs;
    }

    const insertFile = (dirs, file) => {
      for (let i = 1; i < dirs.length + 1; i++) {
        const pDirPath = dirs.slice(0, i).join('/');
        const chDirPath = dirs.slice(0, i + 1).join('/');

        let pDir = this._fauxForgeBrowser.get(pDirPath);
        if (!pDir) {
          pDir = { dirs: [], files: [] };
          this._fauxForgeBrowser.set(pDirPath, pDir);
        }
        if (pDirPath === chDirPath) pDir.files.push(file);
        else if (!pDir.dirs.includes(chDirPath)) pDir.dirs.push(chDirPath);
      }
    };

    for (const path of paths) {
      const contents = await FilePicker.browse(source, path, { recursive: true });
      for (const file of contents.files) {
        const pathname = new URL(file).pathname;
        const components = pathname.split('/');
        insertFile(components.slice(2, components.length - 1), components.slice(2).join('/'));
      }
    }
  }

  static async _getAuthorFromModule(moduleFile) {
    try {
      const module = await jQuery.getJSON(moduleFile);
      return module.author ?? module.authors?.[0]?.name;
    } catch (e) {}
    return null;
  }
}

class StringCompress {
  /**
   * Compresses the provided string using native gzip implementation and return it as a File ready to be uploaded.
   * @param {String} str string to be compressed
   * @returns {File} compressed string file
   */
  static async compress(str) {
    const stream = new Blob([str]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const chunks = [];
    for await (const chunk of this.streamAsyncIterator(compressedStream)) {
      chunks.push(chunk);
    }
    const blob = new Blob(chunks);
    const file = new File([blob], CACHE_NAME);
    return file;
  }

  /**
   * Decompressed provided compressed json file
   * @param {String} filePath path to the compressed json file
   * @returns {Object} decompressed and parsed json object
   */
  static async decompressCache(filePath) {
    let cache;
    try {
      const response = await fetch(filePath);
      if (response.ok) {
        const str = await this.decompress(response.body);
        cache = JSON.parse(str);
      }
    } catch (e) {}
    return cache;
  }

  static async decompress(stream) {
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const chunks = [];
    for await (const chunk of this.streamAsyncIterator(decompressedStream)) {
      chunks.push(chunk);
    }
    const stringBytes = await this.concatUint8Arrays(chunks);
    return new TextDecoder().decode(stringBytes);
  }

  static async concatUint8Arrays(uint8arrays) {
    const blob = new Blob(uint8arrays);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  static async *streamAsyncIterator(stream) {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Form to help configure and execute index build.
 */
export class IndexerForm extends FormApplication {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['sheet', 'mass-edit-dark-window'],
      template: `modules/${MODULE_ID}/templates/preset/indexer.html`,
      width: 360,
      height: 'auto',
    });
  }

  get title() {
    return 'Directory Indexer';
  }

  async getData(options = {}) {
    const data = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'indexer'));
    data.fileFilters = data.fileFilters.join(', ');
    data.folderFilters = data.folderFilters.join(', ');
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.addDirectory', this._onAddDirectory.bind(this));
    html.on('click', '.deleteDirectory', this._onDeleteDirectory.bind(this));
    html.on('input', '[name="fileFilters"]', this._onFileFiltersChange.bind(this));
    html.on('input', '[name="folderFilters"]', this._onFolderFiltersChange.bind(this));
  }

  _onFileFiltersChange(event) {
    clearTimeout(this._onInputTimeOut);
    this._onInputTimeOut = setTimeout(() => {
      const fileFilters = $(event.currentTarget)
        .val()
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      this._updateIndexerSettings({ fileFilters }, false);
    }, 500);
  }

  _onFolderFiltersChange(event) {
    clearTimeout(this._onInputTimeOut);
    this._onInputTimeOut = setTimeout(() => {
      const folderFilters = $(event.currentTarget)
        .val()
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      this._updateIndexerSettings({ folderFilters }, false);
    }, 500);
  }

  async _onAddDirectory() {
    this.selectFolder(async (selection) => {
      if (!selection) return;
      if (!selection.bucket) delete selection.bucket;

      // TODO add support for forgevtt, bazaar, and s3
      if (!['data', 'public', 'forge-bazaar'].includes(selection.source)) {
        ui.notifications.warn(`${selection.source} is not a supported source.`);
        return;
      }

      const indexDirs = game.settings.get(MODULE_ID, 'indexer').indexDirs;
      // Make sure the selection is unique
      if (
        indexDirs.find(
          (id) => id.source === selection.source && id.target === selection.target && id.bucket == selection.bucket
        )
      ) {
        return;
      }

      indexDirs.push(selection);
      this._updateIndexerSettings({ indexDirs });
    });
  }

  async _onDeleteDirectory(event) {
    const directory = $(event.target).closest('.directory');
    const source = directory.find('.source').val();
    const target = directory.find('.target').val();
    const bucket = directory.find('.bucket').val() || null;

    const indexDirs = game.settings
      .get(MODULE_ID, 'indexer')
      .indexDirs.filter((id) => !(id.source === source && id.target === target && id.bucket == bucket));

    this._updateIndexerSettings({ indexDirs });
  }

  async _updateIndexerSettings(update = {}, render = true) {
    const settings = game.settings.get(MODULE_ID, 'indexer');
    foundry.utils.mergeObject(settings, update);
    await game.settings.set(MODULE_ID, 'indexer', settings);
    if (render) await this.render();
  }

  async selectFolder(callback) {
    new FilePicker({
      type: 'folder',
      activeSource: 'data',
      current: '',
      callback: (path, fp) => {
        const selection = { target: fp.result.target, source: fp.activeSource, bucket: fp.result.bucket };
        if (!selection.bucket) delete selection.bucket;
        callback(selection);
      },
    }).render(true);
  }

  /**
   * @param {Event} event
   * @param {Object} formData
   */
  async _updateObject(event, formData) {
    FileIndexer.buildIndex();
  }
}
