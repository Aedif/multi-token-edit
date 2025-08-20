import { MODULE_ID, SUPPORTED_PLACEABLES } from '../../constants.js';
import { META_INDEX_ID, PresetPackFolder, PresetStorage } from '../collection.js';
import { matchPreset } from '../utils.js';

/**
 * Returns tree representation of Preset packs and Virtual Directory
 * @param {*} param0
 * @returns
 */
export async function getPresetPackTrees({ type = 'ALL', externalCompendiums = true, virtualDirectory = true } = {}) {
  const workingTree = await collectionToTree(game.packs.get(PresetStorage.workingPack), type);
  workingTree.folder.name = ''; // Giving a blank name here so that it does not match anything during searches

  const externalTrees = [];
  if (externalCompendiums) {
    for (const pack of game.packs) {
      if (pack.collection !== PresetStorage.workingPack && pack.index?.get(META_INDEX_ID)) {
        const tree = await collectionToTree(pack, type);
        externalTrees.push(tree);
      }
    }
  }

  return { workingTree, externalTrees };
}

/**
 * Return collection as tree of presets
 * @param {*} collection
 * @param {*} type
 * @returns
 */
async function collectionToTree(collection, type) {
  const tree = collection.tree;
  if (tree._meType === type) return tree._meTree;

  tree.folder = new PresetPackFolder(collection, await collection.getDocument(META_INDEX_ID), [type]);
  tree._meTree = collectionTreeToPresetTree(tree, type, await PresetStorage._loadIndex(collection));
  tree._meType = type;

  tree.folder = undefined;

  return tree._meTree;
}

/**
 * Converts standard collection tree, to a preset tree
 * @param {*} tree
 * @param {*} type
 * @param {*} index
 * @returns
 */
function collectionTreeToPresetTree(tree, type, index) {
  if (tree.folder && !tree.folder.flags[MODULE_ID]?.types.includes(type)) return null;

  const presets = tree.entries
    .map((entry) => index.get(entry._id))
    .filter((p) => p && (type === 'ALL' ? SUPPORTED_PLACEABLES.includes(p.documentName) : p.documentName === type));

  const node = {
    folder: tree.folder,
    children: tree.children.map((ch) => collectionTreeToPresetTree(ch, type, index)).filter(Boolean),
  };

  if (!node.folder) node.presets = presets;
  else node.folder.presets = presets;

  return node;
}

// Search related logic
// Assign _meMatch to successfully matches presets and folders to make them visible during Handlebars rendering

export function collapseFolders(node) {
  game.folders._expanded[node.folder.uuid] = false;
  node.children.forEach((ch) => collapseFolders(ch));
}

export function searchNode(node, search, negativeSearch, forceRender = false) {
  const folder = node.folder;
  const folderName = folder.name.toLowerCase();
  let match = false;
  if (search && folderName) match = !search.tags && search.terms?.every((t) => folderName.includes(t));

  let childFolderMatch = false;
  for (const f of node.children) {
    if (searchNode(f, search, negativeSearch, match || forceRender)) childFolderMatch = true;
  }

  let presetMatch = false;
  for (const p of folder.presets) {
    if (_searchPreset(p, search, negativeSearch, match || forceRender)) presetMatch = true;
  }

  const containsMatch = match || childFolderMatch || presetMatch;
  game.folders._expanded[folder.uuid] = childFolderMatch || presetMatch;
  folder._meMatch = containsMatch || forceRender;

  return containsMatch;
}

function _searchPreset(preset, search, negativeSearch, forceRender = false) {
  const matched = matchPreset(preset, search, negativeSearch);

  if (matched) preset._meMatch = true;
  else preset._meMatch = false || forceRender;

  return matched;
}
