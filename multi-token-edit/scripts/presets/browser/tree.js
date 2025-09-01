import { MODULE_ID, SUPPORTED_PLACEABLES } from '../../constants.js';
import { META_INDEX_ID, PresetPackFolder, PresetStorage } from '../collection.js';
import { FileIndexer } from '../fileIndexer.js';
import { matchPreset } from '../utils.js';
import { PresetBrowser } from './browserApp.js';

/**
 * Returns tree representation of Preset packs and Virtual Directory
 * @param {*} param0
 * @returns
 */
export async function getPresetPackTrees({ type = 'ALL', externalCompendiums = true, virtualDirectory = true } = {}) {
  const workingPack = game.packs.get(PresetStorage.workingPack);
  if (!workingPack.index?.get(META_INDEX_ID)) {
    await PresetStorage._initCompendium(PresetStorage.workingPack);
  }

  const workingTree = await collectionToTree(workingPack, type);
  workingTree.folder._noSearch = true; // Setting a special flag here to not match it during searches

  let externalTrees = [];
  if (externalCompendiums) {
    for (const pack of game.packs) {
      if (pack.collection !== PresetStorage.workingPack && pack.index?.get(META_INDEX_ID)) {
        const tree = await collectionToTree(pack, type);
        externalTrees.push(tree);
      }
    }
    externalTrees = _groupExternalTrees(externalTrees);
  }

  if (virtualDirectory) {
    const tree = await collectionToTree(await FileIndexer.collection(), type);
    if (tree) externalTrees.push(tree);
  }

  return { workingTree, externalTrees };
}

// Group packs using their 'group' flag
function _groupExternalTrees(trees) {
  trees = trees.sort((t1, t2) => t1.folder.name.localeCompare(t2.folder.name));

  const groups = {};
  const groupless = [];
  trees.forEach((t) => {
    if (t.folder.group) {
      if (!(t.folder.group in groups)) groups[t.folder.group] = [];
      groups[t.folder.group].push(t);
    } else {
      groupless.push(t);
    }
  });

  const newExternalTrees = [];

  for (const [group, trees] of Object.entries(groups)) {
    newExternalTrees.push({
      presets: [],
      children: trees,
      folder: new PresetPackFolder({ collection: group, title: group, editDisabled: true }, { flags: {} }, trees),
    });
  }

  return newExternalTrees.concat(groupless).sort((t1, t2) => t1.folder.name.localeCompare(t2.folder.name));
}

/**
 * Return collection as tree of presets
 * @param {*} collection
 * @param {*} type
 * @returns
 */
async function collectionToTree(collection) {
  const tree = collection.tree;
  if (tree._meTree) return tree._meTree;

  tree.folder = new PresetPackFolder(collection, await collection.getDocument(META_INDEX_ID), tree.children);
  tree._meTree = collectionTreeToPresetTree(tree, await PresetStorage._loadIndex(collection));

  tree.folder = undefined;

  return tree._meTree;
}

/**
 * Converts standard collection tree, to a preset tree
 * @param {*} tree
 * @param {*} index
 * @returns
 */
function collectionTreeToPresetTree(tree, index) {
  tree.folder.presets = tree.entries.map((entry) => index.get(entry._id)).filter(Boolean);
  if (PresetBrowser.CONFIG.sortMode === 'alphabetical')
    tree.folder.presets.sort((p1, p2) => p1.name.localeCompare(p2.name));
  else tree.folder.presets.sort((p1, p2) => p1.sort - p2.sort);

  return {
    folder: tree.folder,
    children: tree.children.map((ch) => collectionTreeToPresetTree(ch, index)).filter(Boolean),
  };
}

// Search related logic
// Assign _meMatch to successfully matches presets and folders to make them visible during Handlebars rendering

export function collapseFolders(node) {
  game.folders._expanded[node.folder.uuid] = false;
  node.children.forEach((ch) => collapseFolders(ch));
}

export function searchNode(node, search, negativeSearch, forceRender = false, type, expandFolders = true) {
  const folder = node.folder;
  const folderName = folder.name.toLowerCase();

  let match = false;
  if (!folder.flags[MODULE_ID].types.some((t) => t === type) && !folder.typeless) {
    folder._meMatch = false;
    return;
  } else if (search && folderName && !folder._noSearch)
    match = !search.tags && search.terms?.every((t) => folderName.includes(t));

  let childFolderMatch = false;
  for (const n of node.children) {
    if (searchNode(n, search, negativeSearch, match || forceRender, type, expandFolders)) childFolderMatch = true;
  }

  let presetMatch = false;
  for (const p of folder.presets) {
    if (_searchPreset(p, search, negativeSearch, match || forceRender, type, expandFolders)) presetMatch = true;
  }

  const containsMatch = match || childFolderMatch || presetMatch;
  if (expandFolders) game.folders._expanded[folder.uuid] = childFolderMatch || presetMatch;
  folder._meMatch = containsMatch || forceRender || !expandFolders;

  return containsMatch;
}

function _searchPreset(preset, search, negativeSearch, forceRender, type, limit) {
  if (limit && PresetBrowser._matches > PresetBrowser.CONFIG.searchLimit) {
    preset._meMatch = false;
    return false;
  }

  if (!(type === 'ALL' ? SUPPORTED_PLACEABLES.includes(preset.documentName) : type === preset.documentName)) {
    preset._meMatch = false;
    return false;
  }

  const matched = matchPreset(preset, search, negativeSearch);

  if (matched) {
    PresetBrowser._matches++;
    preset._meMatch = true;
  } else preset._meMatch = false || forceRender;

  return matched;
}
