import { FILE_EXTENSIONS, IMAGE_EXTENSIONS, MODEL_EXTENSIONS, MODULE_ID } from '../constants.js';
import { PresetBrowser } from './browser/browserApp.js';
import { META_INDEX_ID, VirtualFileFolder } from './collection.js';
import { VirtualFilePreset } from './preset.js';
import { encodeURIComponentSafely, readJSONFile } from './utils.js';

const CACHE_PATH = '';
const CACHE_NAME = 'mass_edit_cache.json';

/**
 * Faux collection to allow for processing of the file index as a compendium collection
 */
class FileIndexerCollection extends Collection {
  collection = 'VIRTUAL_DIRECTORY';
  editDisabled = true;
  _tree;

  getDocument(id) {
    if (id !== META_INDEX_ID) throw Error('This collection does not handle document retrieval.');
    return {
      flags: {
        [MODULE_ID]: { folder: { name: 'VIRTUAL DIRECTORY', color: '#00739f' } },
      },
    };
  }

  get tree() {
    return this._tree;
  }
}

export class FileIndexer {
  static _collection;
  static _loadedTree;
  static _buildingIndex = false;
  static _registeredCacheFiles = [];

  static async collection() {
    // TODO: Add preset collection to CONFIG, will allow retrieval via fromUuid

    if (CONFIG.debug.MassEdit) console.time('Virtual File Directory');

    if (this._collection) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      return this._collection;
    }

    this._collection = new FileIndexerCollection();
    this._collection._meIndex = new Collection();

    // Load and convert an index cache to a virtual folder
    const topLevelNodes = [];

    const cache = (await this.loadMainIndexCache()) ?? [];

    // Always load cache files registered via other modules
    if (this._registeredCacheFiles.length) {
      for (const cacheFile of this._registeredCacheFiles) {
        const extCache = await this.loadIndexCache(cacheFile);
        if (extCache) this.mergeCaches(cache, extCache);
      }
    }

    if (!cache.length) {
      if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
      this._collection._tree = { folder: undefined, children: [], entries: [] };
      return this._collection;
    }

    for (const source of cache) {
      let prePend = '';
      if (source.source === 'forge-bazaar') {
        prePend = `https://assets.forge-vtt.com/bazaar/`;
      } else if (source.source === 'forgevtt') {
        if (typeof ForgeVTT === 'undefined' || !ForgeVTT.usingTheForge) continue;
        const userId = await ForgeAPI.getUserId();
        if (!userId) continue;
        prePend = `https://assets.forge-vtt.com/${userId}/`;
      } else if (source.source === 's3') {
        const s3 = game.data.files.s3;
        if (!s3 || !s3.buckets.includes(source.bucket)) continue;
        prePend = `https://${source.bucket}.${s3.endpoint.host}/`;
      } else if (source.source === 'sqyre') {
        if (typeof Sqyre === 'undefined' || !Sqyre.CLOUD_STORAGE_PREFIX) continue;
        prePend = `${Sqyre.CLOUD_STORAGE_PREFIX}/`;
      }

      const nodes = source.index.map((f) =>
        this._indexToNode(f, '', {
          prePend,
          source: source.source,
          bucket: source.bucket,
        })
      );

      if (nodes?.length) {
        const types = new Set(['ALL']);
        nodes.forEach((n) => n.folder.flags[MODULE_ID].types.forEach((t) => types.add(t)));

        const sFolder = new VirtualFileFolder({
          path: 'virtual@source@' + source.source,
          name: source.source,
          children: nodes,
          types: Array.from(types),
          bucket: source.bucket,
        });
        sFolder.children.forEach((ch) => (ch.folder.parent = sFolder));

        topLevelNodes.push({ folder: sFolder, children: nodes, entries: [] });
      }
    }

    this._collection._tree = { folder: undefined, children: topLevelNodes, entries: [] };

    if (CONFIG.debug.MassEdit) console.timeEnd('Virtual File Directory');
    return this._collection;
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

    // TODO Temp: to be removed
    settings.indexDirs.forEach((dir) => {
      if (dir.index == null) dir.index = true;
    });

    try {
      const scannedSources = [];
      const foundCaches = [];

      // Traverse directories specified in settings.indexDirs
      for (const dir of settings.indexDirs) {
        if (!dir.index) continue;

        if (dir.source === 'forge-bazaar' || dir.source === 'forgevtt') {
          await this._buildFauxForgeBrowser(dir.source, dir.target);
        }

        let iDir = await this.generateIndex({
          dir: dir.target,
          foundCaches,
          source: dir.source,
          bucket: dir.bucket,
          settings,
          tokenize: dir.tokenize,
        });

        if (iDir) {
          const sPath = dir.target.split('/').filter(Boolean);
          for (let i = sPath.length - 2; i >= 0; i--) {
            iDir = { dir: sPath[i], dirs: [iDir] };
          }

          let index = scannedSources.find((i) => i.source === dir.source && sameBucket(i.bucket, dir.bucket));
          if (index) this.mergeIndex(index.index, [iDir]);
          else {
            index = { source: dir.source, index: [iDir] };
            if (dir.bucket) index.bucket = dir.bucket;
            scannedSources.push(index);
          }
        }
      }

      new IndexMergeConfirmationForm(scannedSources, foundCaches).render(true);
      ui.notifications.info(`MassEdit Index build finished.`);
    } catch (e) {
      console.log(e);
      this._buildingIndex = false;
    }
  }

  /**
   * Called to resolve an index merge being handled by IndexMergeConfirmationForm
   * @param {*} param0
   */
  static async resolveBuildMerge({
    exit = false,
    currentCache = [],
    scannedCache = [],
    foundCaches = [],
    merge = true,
  } = {}) {
    if (!exit) {
      // perform merges
      if (merge) {
        this.mergeCaches(currentCache, scannedCache);
        for (const cache of foundCaches) {
          this.mergeCaches(currentCache, cache);
        }

        await this._writeIndexToCache(currentCache);
      } else {
        // TODO: Ask for confirmation to overwrite current cache?
        for (const cache of foundCaches) {
          this.mergeCaches(scannedCache, cache);
        }

        this.mergeCaches(scannedCache, currentCache, false);

        if (scannedCache.length) await this._writeIndexToCache(scannedCache);
        else await this._writeIndexToCache([]);
      }

      this._collection = null;
      await this.collection();
      foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id)?.render(true);
    }
    this._buildingIndex = false;
  }

  /**
   * Merges two caches together
   * @param {*} cacheTo
   * @param {*} cacheFrom
   * @param {Boolean} insert should missing dirs/files within cacheTo be inserted from cacheFrom
   */
  static mergeCaches(cacheTo, cacheFrom, insert = true) {
    for (const indexSourceFrom of cacheFrom) {
      const indexSourceTo = cacheTo.find(
        (i) => i.source === indexSourceFrom.source && sameBucket(i.bucket, indexSourceFrom.bucket)
      );
      if (indexSourceTo) {
        this.mergeIndex(indexSourceTo.index, indexSourceFrom.index, insert);
      } else if (insert) cacheTo.push(indexSourceFrom);
    }
  }

  /**
   * Merges two indexes together
   * @param {*} indexTo
   * @param {*} indexFrom
   * @param {Boolean} insert should missing dirs/files within indexTo be inserted from indexFrom
   */
  static mergeIndex(indexTo, indexFrom, insert = true) {
    for (const dirFrom of indexFrom) {
      const dirTo = indexTo.find((dir) => dir.dir === dirFrom.dir);
      if (dirTo) {
        // Meta fields
        if (dirFrom.icon) dirTo.icon = dirFrom.icon;
        if (dirFrom.subtext) dirTo.subtext = dirFrom.subtext;

        // Merge directories
        if (dirFrom.dirs) {
          if (dirTo.dirs) this.mergeIndex(dirTo.dirs, dirFrom.dirs, insert);
          else if (insert) dirTo.dirs = dirFrom.dirs;
        }

        // Merge files
        if (dirFrom.files) {
          if (dirTo.files) {
            for (const fileFrom of dirFrom.files) {
              const fileTo = dirTo.files?.find((f) => f.name === fileFrom.name);

              if (fileTo) {
                if (fileTo.tags && fileFrom.tags) {
                  fileFrom.tags.forEach((tag) => {
                    if (!fileTo.tags.includes(tag)) fileTo.tags.push(tag);
                  });
                } else if (fileFrom.tags) fileTo.tags = fileFrom.tags;
              } else if (insert) {
                if (!dirTo.files) dirTo.files = [];
                dirTo.files.push(fileFrom);
              }
            }
          } else if (insert) dirTo.files = dirFrom.files;
        }
      } else if (insert) indexTo.push(dirFrom);
    }
  }

  static async retrieve(uuid) {
    if (!this._collection) {
      await this.collection();
      if (!this._collection) return null;
    }
    let preset = this._collection._meIndex.get(uuid);
    if (preset) return preset;

    // If a preset of such UUID didn't exist lets create it and store it within the collection
    preset = VirtualFilePreset.fromSrc(uuid.substring(8));
    this._collection._meIndex.set(uuid, preset);
    return preset;
  }

  static async delete(preset) {
    if (!this._collection) {
      await this.collection();
      if (!this._collection) return null;
    }

    console.log(this._collection);
    console.log(preset);

    this._findDeletePreset(this._collection.tree.children, preset.uuid);
    this._collection._meIndex.delete(preset.uuid);
  }

  static _findDeletePreset(folders, uuid) {
    for (const folder of folders) {
      const entry = folder.entries.find((entry) => entry._id === uuid);
      if (entry) {
        folder.entries = folder.entries.filter((e) => e._id !== uuid);
        folder.folder.presets = folder.folder.presets.filter((p) => p.uuid !== uuid);
        return true;
      }
      if (this._findDeletePreset(folder.children, uuid)) return true;
    }
    return false;
  }

  static async deleteFolder(folder) {
    if (!this._collection) {
      await this.collection();
      if (!this._collection) return null;
    }

    if (this._findDeleteFolder(this._collection.tree.children, folder.id)) {
      return this.saveIndexToCache({ processAutoSave: true, notify: false });
    }
  }

  static _findDeleteFolder(folders, id) {
    const index = folders.findIndex((f) => f.folder.id === id);
    if (index > -1) {
      this._deleteFolder(folders[index]);
      folders.splice(index, 1);
      return true;
    }

    for (const folder of folders) {
      if (this._findDeleteFolder(folder.children, id)) return true;
    }

    return false;
  }

  static _deleteFolder(folder) {
    folder.entries.forEach((entry) => this._collection._meIndex.delete(entry._id));
    folder.children.forEach((ch) => this._deleteFolder(ch));
  }

  static async saveIndexToCache({
    folders = this._collection?.tree.children.map((ch) => ch.folder),
    path = CACHE_PATH,
    notify = true,
    source = 'data',
    processAutoSave = false,
    fileExport = false,
    name = CACHE_NAME,
  } = {}) {
    if (folders) {
      const cache = [];
      for (const sourceFolder of folders) {
        const sourceCache = {
          source: sourceFolder.name,
          index: sourceFolder.children.map((ch) => this._cacheFolder(ch.folder, ch)),
        };
        if (sourceFolder.bucket) sourceCache.bucket = sourceFolder.bucket;
        cache.push(sourceCache);
      }

      if (fileExport) await this._exportIndexDownload(cache);
      else await this._writeIndexToCache(cache, { path, notify, source, name });
    }

    if (processAutoSave && this._collection) {
      const autoSaveVirtualFolders = game.settings.get(MODULE_ID, 'presetBrowser').autoSaveVirtualFolders;
      if (!autoSaveVirtualFolders) return;

      // Lets group folders by target save location
      const locationsToFolders = [];
      for (const [uuid, location] of Object.entries(autoSaveVirtualFolders)) {
        const folder = fromUuidSync(uuid);
        if (!folder || !folder.indexable || !folder.source) continue;

        const lf = locationsToFolders.find(
          (l) => l.source === location.source && l.target === location.target && sameBucket(l.bucket, location.bucket)
        );
        if (lf) lf.folders.push(folder);
        else
          locationsToFolders.push({
            source: location.source,
            target: location.target,
            bucket: location.bucket,
            folders: [folder],
          });
      }

      // Save folders at each location by individually constructing an index for each folder and merging it into one single index
      for (const location of locationsToFolders) {
        let index = [];

        for (const folder of location.folders) {
          let wFolder = folder;
          while (wFolder.parent) {
            wFolder = {
              name: wFolder.parent.name,
              presets: [],
              children: [{ folder: wFolder }],
              parent: wFolder.parent.parent,
            };
          }

          const sourceCache = {
            source: wFolder.name,
            index: wFolder.children.map((ch) => this._cacheFolder(ch.folder, ch)),
          };

          this.mergeCaches(index, [sourceCache]);
        }

        this._writeIndexToCache(index, { path: location.target, notify: false, source: location.source, name });
      }
    }
  }

  static async _writeIndexToCache(
    index,
    { path = CACHE_PATH, notify = true, source = 'data', name = CACHE_NAME } = {}
  ) {
    const str = JSON.stringify(index);

    const blob = await StringCompress.compress(str);
    const tFile = new File([blob], name);
    await foundry.applications.apps.FilePicker.upload(source, path, tFile, {}, { notify });
  }

  static async _exportIndexDownload(index) {
    const blob = await StringCompress.compress(JSON.stringify(index));

    // Create an element to trigger the download
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = CACHE_NAME;

    // Dispatch a click event to the element
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => window.URL.revokeObjectURL(a.href), 100);
  }

  static async _importCache(cache) {
    new IndexMergeConfirmationForm([], [], cache).render(true);
  }

  static async saveFolderToCache(folder, notify = true) {
    if (!this._collection) {
      ui.notifications.warn('Index was recently refreshed. Reload the browser before attempting to save the index.');
      return;
    }

    if (!(folder.indexable || folder.source)) return;

    let wFolder = folder;
    while (wFolder.parent) {
      wFolder = {
        name: wFolder.parent.name,
        presets: [],
        children: [{ folder: wFolder }],
        parent: wFolder.parent.parent,
      };
    }

    this.saveIndexToCache({
      folders: [wFolder],
      path: folder.path,
      source: folder.source,
      notify,
    });
  }

  static _cacheFolder(folder, ch) {
    const fDic = { dir: encodeURIComponentSafely(folder.name) };
    if (folder.subtext) fDic.subtext = folder.subtext;
    if (folder.icon) fDic.icon = folder.icon;
    if (folder.presets.length) fDic.files = folder.presets.map((p) => this._cachePreset(p));
    if (folder.children.length) fDic.dirs = folder.children.map((ch) => this._cacheFolder(ch.folder, ch));
    return fDic;
  }

  static _cachePreset(preset) {
    const pDic = { name: encodeURIComponentSafely(preset.name) };
    if (preset.tags?.length) pDic.tags = preset.tags;
    if (preset._thumb) pDic.thumb = preset._thumb;
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

  static _indexToNode(cache, parentDirPath, options) {
    const fullPath = parentDirPath + (parentDirPath ? '/' : '') + cache.dir;

    const node = {};
    node.children = cache.dirs?.map((dir) => this._indexToNode(dir, fullPath, options)) ?? [];
    node.children.sort((c1, c2) => c1.folder.name.localeCompare(c2.folder.name));

    const types = new Set(['ALL']);
    node.entries = [];
    const presets = [];
    if (cache.files) {
      for (const file of cache.files) {
        const preset = VirtualFilePreset.fromSrc(
          options.prePend + fullPath + '/' + file.name,
          file.tags?.includes('token') ? 'Token' : undefined
        );
        if (file.tags) preset.tags = file.tags;
        if (file.thumb) {
          preset.img = options.prePend + fullPath + '/' + file.thumb;
          preset._thumb = file.thumb;
        }

        this._collection._meIndex.set(preset.uuid, preset);
        node.entries.push({ _id: preset.uuid });
        presets.push(preset);
        types.add(preset.documentName);
      }
    }

    // Assign folder to categories based on whether it's child folders contain presets of those types
    node.children.forEach((ch) => ch.folder.flags[MODULE_ID].types.forEach((t) => types.add(t)));

    node.folder = new VirtualFileFolder({
      path: options.prePend + fullPath,
      name: cache.dir,
      subtext: cache.subtext,
      icon: cache.icon,
      color: cache.color,
      source: options.source,
      bucket: options.bucket,
      types: Array.from(types),
      children: node.children,
      presets,
    });
    node.children.forEach((ch) => (ch.folder.parent = node.folder));

    return node;
  }

  static async generateIndex({
    dir,
    foundCaches = [],
    source = 'data',
    bucket,
    settings,
    options = {},
    tags = [],
    tokenize = false,
  } = {}) {
    // Get options associated to this specific directory
    let opts = options[dir] ?? {};
    if (opts.noscan) return null;

    // Get directory contents
    // contents.dirs -> array of children directories
    // contents.files -> array of contained files
    let content;
    try {
      content = await this._browse(source, dir, { bucket });
    } catch (e) {
      console.log(e);
      return null;
    }

    const indexerFile = content.files.find((f) => f.endsWith('indexer.json'));
    if (indexerFile) {
      options = (await readJSONFile(indexerFile)) ?? {};
      opts = options[dir] ?? {};
      if (opts.noscan) return null;
    }

    if (opts.tags) {
      tags = opts.tags
        .map((t) => t.slugify({ strict: true }))
        .filter(Boolean)
        .concat(tags);
    }

    const folder = {
      dir: dir.split('/').filter(Boolean).pop(),
      dirs: [],
      files: [],
    };
    if (settings.folderFilters.some((k) => folder.dir.includes(k))) return null;
    if (!foundry.utils.isEmpty(opts)) {
      ['color', 'icon', 'subtext'].forEach((k) => {
        if (opts[k]) folder[k] = opts[k];
      });
    }

    let modelFiles = [];
    let thumbnails = []; // Image files ending in _thumb
    for (let path of content.files) {
      const file = path.split('\\').pop().split('/').pop();

      // Special file processing

      // Cancel indexing if noscan.txt or cache file is present within the directory
      if (file === 'noscan.txt') return null;
      else if (file === CACHE_NAME && !settings.ignoreExternal) {
        const cacheDir = settings.cacheDir;
        if (!(cacheDir.target === dir.target && cacheDir.source === source && sameBucket(cacheDir.bucket, bucket))) {
          foundCaches.push(path);
          return null;
        }
      } else if (file === 'module.json') {
        // Read metadata from module's json file applying subtext to current folder
        // and tags to all files
        const author = await this._getAuthorFromModule(path);
        if (author) {
          folder.subtext = opts.subtext ?? author;
          const tag = (author.split(/[ ,\-_@]+/)[0] ?? '').slugify({ strict: true });
          if (tag && tag.length >= 3) {
            tags = [...tags, tag];
            folder.files.forEach((f) => {
              f.tags = tags;
            });
          }
        }

        continue;
      }

      // Otherwise process the file
      let [fileName, ext] = file.split('.');
      if (!ext) continue;
      ext = ext.toLowerCase();

      // If a file ends with _thumb, we assume it to be a thumbnail image and we will try to associate it to another file later
      if (fileName.endsWith('_thumb') && IMAGE_EXTENSIONS.includes(ext)) {
        thumbnails.push({ thumb: file, match: fileName.replace('_thumb', '') });
        continue;
      }

      // Apply filters
      if (settings.fileFilters.some((k) => file.includes(k))) continue;

      if (FILE_EXTENSIONS.includes(ext)) {
        const f = { name: file, tags: [] };
        if (tags.length) f.tags = f.tags.concat(tags);
        folder.files.push(f);
        if (MODEL_EXTENSIONS.includes(ext)) {
          f.tags.push('3d-model');
          if (tokenize) f.tags.push('token');
          modelFiles.push(f);
        } else if (tokenize && IMAGE_EXTENSIONS.includes(ext)) {
          f.tags.push('token');
        }
      }
    }

    // Lets try to matchup 3D Models with image files in the same directory
    if (modelFiles.length) {
      modelFiles.forEach((mFile) => {
        const modelName = mFile.name.split('.')[0];
        folder.files = folder.files.filter((f) => {
          if (mFile == f) return true;

          let ext = f.name.split('.');
          ext = ext[ext.length - 1]?.toLowerCase();

          if (IMAGE_EXTENSIONS.includes(ext) && f.name.split('.')[0] === modelName) {
            mFile.thumb = f.name;
            return false;
          }
          return true;
        });
      });
    }

    // Lets try to match thumbnails (..._thumb) with image files in the same directory
    if (thumbnails.length) {
      thumbnails.forEach((t) => {
        const matchedFile = folder.files.find((f) => f.name.split('.').shift() === t.match);
        if (matchedFile) matchedFile.thumb = t.thumb;
      });
    }

    for (let dir of content.dirs) {
      dir = await this.generateIndex({ dir, foundCaches, source, bucket, settings, options, tags, tokenize });
      if (dir) folder.dirs.push(dir);
    }

    if (!folder.dirs.length) delete folder.dirs;
    if (!folder.files.length) delete folder.files;

    if (!(folder.dirs || folder.files)) return null;
    return folder;
  }

  static async _browse(source, dir, options) {
    if (source === 'forge-bazaar' || source === 'forgevtt') {
      return this._fauxForgeBrowser?.get(dir) ?? { dirs: [], files: [] };
    } else {
      return await foundry.applications.apps.FilePicker.implementation.browse(source, dir, options);
    }
  }

  /**
   * ForgeVTT forge-bazaar can be browsed recursively returning all the found dirs and files at a given path.
   * To keep the processing consistent between different sources however we will simulate FilePicker.browse results
   * by rebuilding the directory structure using the recursively retrieved results.
   * This faux structure will be used by FileIndexer._browse(...)
   * @param {String} source forge-bazaar or forgevtt
   * @param {String} dir
   */
  static async _buildFauxForgeBrowser(source, dir) {
    this._fauxForgeBrowser = new Map();

    if (typeof ForgeVTT === 'undefined' || !ForgeVTT.usingTheForge) {
      return;
    }

    // Recursion doesn't work for forge-bazaar paths at one level above root. Perform non-recursive browse
    // and then recursive one on all of the retrieved dirs
    let paths;
    if (source === 'forgevtt' || !['modules', 'systems', 'worlds', 'assets'].includes(dir.replaceAll(/[\/\\]/g, ''))) {
      paths = [dir];
    } else {
      const contents = await foundry.applications.apps.FilePicker.implementation.browse(source, dir, {
        recursive: false,
      });
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
      const contents = await foundry.applications.apps.FilePicker.implementation.browse(source, path, {
        recursive: true,
      });
      for (const file of contents.files) {
        const pathname = new URL(file).pathname;
        const components = pathname.split('/');
        insertFile(components.slice(2, components.length - 1), components.slice(2).join('/'));
      }
    }
  }

  static async _getAuthorFromModule(moduleFile) {
    const module = await readJSONFile(moduleFile);
    if (module) {
      const author = module.author ?? module.authors?.[0]?.name;
      if (typeof author === 'string') return author;
    }
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
    return blob;
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

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Form to help configure and execute index build.
 */
export class IndexerForm extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'me-indexer',
    tag: 'form',
    form: {
      handler: IndexerForm.onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      title: 'Directory Indexer',
      resizable: false,
      icon: 'fas fa-file-search',
    },
    position: {
      width: 500,
      height: 'auto',
    },
    actions: {
      add: IndexerForm._onAddDirectory,
      delete: IndexerForm._onDeleteDirectory,
      generate: IndexerForm._onGenerateIndex,
      toggle: IndexerForm._onToggleSetting,
      export: IndexerForm._onExport,
      import: IndexerForm._onImport,
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/indexer.hbs` },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const settings = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'indexer'));
    settings.indexDirs?.forEach((dir) => {
      if (dir.tokenize == null) dir.tokenize = false;
      if (dir.index == null) dir.index = true;
    });

    return Object.assign(context, {
      ...settings,
      fileFilters: settings.fileFilters.join(', '),
      folderFilters: settings.folderFilters.join(', '),
    });
  }

  static async _onAddDirectory() {
    this.selectFolder(async (selection) => {
      if (!selection) return;
      if (!selection.bucket) delete selection.bucket;

      if (!['data', 'public', 'forge-bazaar', 'forgevtt', 's3', 'sqyre'].includes(selection.source)) {
        ui.notifications.warn(`${selection.source} is not a supported source.`);
        return;
      }

      const indexDirs = game.settings.get(MODULE_ID, 'indexer').indexDirs;
      // Make sure the selection is unique
      if (
        indexDirs.find(
          (id) =>
            id.source === selection.source && id.target === selection.target && sameBucket(id.bucket, selection.bucket)
        )
      ) {
        return;
      }

      indexDirs.push(selection);
      this._updateIndexerSettings({ indexDirs });
    });
  }

  static async _onDeleteDirectory(event, element) {
    const directory = $(element.closest('.directory'));
    const source = directory.find('.source').val();
    const target = directory.find('.target').val();
    const bucket = directory.find('.bucket').val() || '';

    const indexDirs = game.settings
      .get(MODULE_ID, 'indexer')
      .indexDirs.filter((id) => !(id.source === source && id.target === target && sameBucket(id.bucket, bucket)));

    this._updateIndexerSettings({ indexDirs });
  }

  static _onGenerateIndex() {
    FileIndexer.buildIndex();
    this.close(true);
  }

  static _onToggleSetting(event, target) {
    const active = target.classList.contains('active');

    if (active) target.classList.remove('active');
    else target.classList.add('active');

    target.closest('.directory').querySelector('.' + target.dataset.setting).checked = !active;
    this.submit();
  }

  async _updateIndexerSettings(update = {}, render = true) {
    const settings = game.settings.get(MODULE_ID, 'indexer');
    foundry.utils.mergeObject(settings, update);
    await game.settings.set(MODULE_ID, 'indexer', settings);
    if (render) await this.render();
  }

  static _onExport() {
    FileIndexer.saveIndexToCache({ fileExport: true });
  }

  static async _onImport() {
    await foundry.applications.api.DialogV2.wait({
      window: { title: `Import` },
      position: { width: 500 },
      content: await foundry.applications.handlebars.renderTemplate('templates/apps/import-data.hbs', {
        hint1: 'Utility for importing a VIRTUAL DIRECTORY index.',
        hint2: `Select exported or automatically created '${CACHE_NAME}'`,
      }),
      buttons: [
        {
          action: 'import',
          label: 'Import',
          icon: 'fa-solid fa-file-import',
          callback: (event, button) => {
            const form = button.form;
            if (!form.data.files.length) {
              return ui.notifications.error('You have not provided a file!');
            }

            try {
              StringCompress.decompress(form.data.files[0].stream()).then((str) => {
                const cache = JSON.parse(str);
                if (Array.isArray(cache) && cache.length && cache[0].source) {
                  FileIndexer._importCache(cache);
                } else {
                  ui.notifications.warn('Unrecognizable index format.');
                }
              });
            } catch (e) {
              ui.notifications.warn('Unrecognizable index format.');
            }

            this.close();
          },
          default: true,
        },
        {
          action: 'no',
          label: 'Cancel',
          icon: 'fa-solid fa-xmark',
        },
      ],
    });
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

  static async onSubmit(event, form, formData) {
    const update = foundry.utils.expandObject(formData.object);

    update.fileFilters = update.fileFilters
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    update.folderFilters = update.folderFilters
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    update.indexDirs = Object.values(update.indexDirs);

    const settings = game.settings.get(MODULE_ID, 'indexer');
    foundry.utils.mergeObject(settings, update);
    await game.settings.set(MODULE_ID, 'indexer', settings);
  }
}

/**
 * Form to prompt the user for index merge behavior.
 */
export class IndexMergeConfirmationForm extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(scannedCache, foundCaches, importedCache) {
    super();
    this._scannedCache = scannedCache;
    this._foundCaches = foundCaches;
    this._importedCache = importedCache;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'me-indexer-merge-confirm',
    tag: 'form',
    form: {
      handler: IndexMergeConfirmationForm._onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
    },
    window: {
      contentClasses: ['standard-form'],
      title: 'Index Merge',
      resizable: false,
      icon: 'fa-solid fa-merge',
    },
    position: {
      width: 500,
      height: 'auto',
    },
    actions: {},
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/preset/indexer-merge.hbs` },
  };

  /** @override */
  async _prepareContext(options) {
    this._currentCache = (await FileIndexer.loadIndexCache(CACHE_PATH + '/' + CACHE_NAME)) ?? [];

    const current = this._prepareCounts(this._currentCache);
    const scan = this._prepareCounts(this._scannedCache);

    this._foundCachesLoaded = [];
    const found = [];
    for (const cacheFile of this._foundCaches) {
      const cache = await FileIndexer.loadIndexCache(cacheFile);
      if (cache) {
        this._foundCachesLoaded.push(cache);
        const count = this._prepareCounts(cache);
        count.name = cacheFile.split('/').slice(0, -1).join('/');
        found.push(count);
      }
    }

    if (this._importedCache) {
      const count = this._prepareCounts(this._importedCache);
      count.name = 'File Import';
      found.push(count);
    }

    const registered = [];
    // for (const cacheFile of FileIndexer._registeredCacheFiles) {
    //   const cache = await FileIndexer.loadIndexCache(cacheFile);
    //   if (cache) {
    //     const count = this._prepareCounts(cache);
    //     count.name = cacheFile.split('/').slice(0, -1).join('/');
    //     registered.push(count);
    //   }
    // }

    // Generate total counts
    const total = { folderCount: 0, fileCount: 0, tagCount: 0 };
    [scan, ...found].forEach((count) => {
      total.folderCount += count.folderCount;
      total.fileCount += count.fileCount;
      total.tagCount += count.tagCount;
    });

    return {
      current,
      scan: scan.folderCount ? scan : null,
      found: found.length ? found : null,
      registered: registered.length ? registered : null,
      total,
    };
  }

  _prepareCounts(cache, count = { folderCount: 0, fileCount: 0, tagCount: 0 }) {
    for (const source of cache) this._countDirs(source.index, count);
    return count;
  }

  _countDirs(dirs, count) {
    if (!dirs) return count;

    for (const dir of dirs) {
      count.folderCount++;
      if (dir.files) {
        for (const file of dir.files) {
          count.fileCount++;
          if (file.tags) count.tagCount += file.tags.length;
        }
      }

      this._countDirs(dir.dirs, count);
    }

    return count;
  }

  static async _onSubmit(event, html, formData) {
    this._resolved = true;
    FileIndexer.resolveBuildMerge({
      currentCache: this._currentCache,
      scannedCache: this._scannedCache,
      foundCaches: this._importedCache ? [this._importedCache] : this._foundCachesLoaded,
      merge: !formData.object.overwrite,
    });
  }

  async close(options = {}) {
    if (!this._resolved)
      FileIndexer.resolveBuildMerge({
        exit: true,
      });

    return super.close(options);
  }
}

export class FileIndexerAPI {
  static async readCacheFile(cacheFile) {
    return FileIndexer.loadIndexCache(cacheFile);
  }

  static registerCacheFile(cacheFile) {
    FileIndexer._registeredCacheFiles.push(cacheFile);
  }

  static async saveCache({ source = 'data', path = '', name = CACHE_NAME } = {}) {
    await FileIndexer.collection();
    FileIndexer.saveIndexToCache({ path, source, name });
  }
}

function sameBucket(bucket1, bucket2) {
  return (!Boolean(bucket1) && !Boolean(bucket2)) || bucket1 == bucket2;
}
