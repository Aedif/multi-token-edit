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
    // Add preset collection to CONFIG, will allows retrieval via fromUuid

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
        prePend = `https://${source.bucket}.${s3.endpoint.host}`;
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

    try {
      const scannedSources = [];
      const foundCaches = [];

      // Traverse directories specified in settings.indexDirs
      for (const dir of settings.indexDirs) {
        if (dir.source === 'forge-bazaar' || dir.source === 'forgevtt') {
          await this._buildFauxForgeBrowser(dir.source, dir.target);
        }
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
          overrideNullTagsOnly: settings.overrideTags,
        });
      }

      if (scannedSources.length) await this._writeIndexToCache(scannedSources);
      this._collection = null;

      ui.notifications.info(`MassEdit Index build finished.`);

      foundry.applications.instances.get(PresetBrowser.DEFAULT_OPTIONS.id)?.render(true);
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

  static async saveIndexToCache({
    folders = this._collection?.tree.children.map((ch) => ch.folder),
    path = CACHE_PATH,
    notify = true,
    source = 'data',
    processAutoSave = false,
  } = {}) {
    if (folders) {
      const cache = [];
      for (const sourceFolder of folders) {
        const sourceCache = {
          source: sourceFolder.name,
          index: sourceFolder.children.map((ch) => this._cacheFolder(ch.folder)),
        };
        if (sourceFolder.bucket) sourceCache.bucket = sourceFolder.bucket;
        cache.push(sourceCache);
      }

      this._writeIndexToCache(cache, { path, notify, source });
    }

    if (processAutoSave && this._collection) {
      const folderUuids = game.settings.get(MODULE_ID, 'presetBrowser').autoSaveFolders ?? [];
      if (!folderUuids.length) return;

      const folders = folderUuids.map((uuid) => fromUuidSync(uuid)).filter(Boolean);
      if (!folders.length) return;

      for (const folder of folders) {
        this.saveFolderToCache(folder, false);
      }
    }
  }

  static async _writeIndexToCache(index, { path = CACHE_PATH, notify = true, source = 'data' } = {}) {
    const str = JSON.stringify(index);

    const tFile = await StringCompress.compress(str);
    await foundry.applications.apps.FilePicker.upload(source, path, tFile, {}, { notify });
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

  static _cacheFolder(folder) {
    const fDic = { dir: encodeURIComponentSafely(folder.name) };
    if (folder.presets.length) fDic.files = folder.presets.map((p) => this._cachePreset(p));
    if (folder.children.length) fDic.dirs = folder.children.map((ch) => this._cacheFolder(ch.folder));
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
    if (cache.files) {
      for (const file of cache.files) {
        const preset = VirtualFilePreset.fromSrc(options.prePend + fullPath + '/' + file.name);
        if (file.tags) preset.tags = file.tags;
        if (file.thumb) {
          preset.img = options.prePend + fullPath + '/' + file.thumb;
          preset._thumb = file.thumb;
        }

        this._collection._meIndex.set(preset.uuid, preset);
        node.entries.push({ _id: preset.uuid });
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
    });
    node.children.forEach((ch) => (ch.folder.parent = node.folder));

    return node;
  }

  static async generateIndex(dir, foundCaches = [], source = 'data', bucket = null, settings, options = {}, tags = []) {
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
        if (!(cacheDir.target === dir.target && cacheDir.source === source && cacheDir.bucket === bucket)) {
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
        const f = { name: file };
        if (tags.length) f.tags = tags;
        folder.files.push(f);
        if (MODEL_EXTENSIONS.includes(ext)) {
          f.tags = ['3d-model', ...(f.tags ?? [])];
          modelFiles.push(f);
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
      dir = await this.generateIndex(dir, foundCaches, source, bucket, settings, options, tags);
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
      width: 500,
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
    html.find('input[type="checkbox"]').on('change', this._onToggleCheckbox.bind(this));
  }

  _onToggleCheckbox(event) {
    const chkBox = $(event.currentTarget);
    const name = chkBox.attr('name');
    this._updateIndexerSettings({ [name]: chkBox.is(':checked') }, false);
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

      if (!['data', 'public', 'forge-bazaar', 'forgevtt', 's3', 'sqyre'].includes(selection.source)) {
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

export class FileIndexerAPI {
  static async readCacheFile(cacheFile) {
    return FileIndexer.loadIndexCache(cacheFile);
  }

  static registerCacheFile(cacheFile) {
    FileIndexer._registeredCacheFiles.push(cacheFile);
  }
}
