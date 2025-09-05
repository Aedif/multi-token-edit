import { FileIndexerAPI } from '../presets/fileIndexer.js';
import { Preset } from '../presets/preset.js';

export function initRegisters() {
  MassEdit.registers = {
    registerVirtualDirectoryCache: FileIndexerAPI.registerCacheFile,
    registerPresetTagIcons: Preset.registerTagIcons,
    registerSceneNotFoundMessage,
    registerSceneControlMacro,
    _sceneNotFoundMessages: [],
    _sceneControlMacros: [],
  };
}

/**
 * Message displayed if FauxScene import fails due to an invalid UUID
 * @param {object} options
 * @param {string} options.title       dialog title
 * @param {string} options.content     dialog content; if {{name}} is included, it will be replaced by the FauxScene name
 * @param {Array[string]} options.tags the message will only be shown if the FauxScene contains these tags
 */
function registerSceneNotFoundMessage({ title = 'Scene Import Warning', content = '', query = '' } = {}) {
  if (!query) throw Error('Scene not found message requires to be matched against some query.');
  if (!content) throw Error('Scene not found message must provide some sort of content information.');

  MassEdit.registers._sceneNotFoundMessages.push({ title, content, query });
}

/**
 * Macros to be displayed as buttons on `Mass Edit: Presets` scene control being clicked
 * @param {object} options
 * @param {string} options.title text displayed on hover
 * @param {uuid}   options.uuid  UUID of the macro to be ran on click
 * @param {icon}   options.icon  FontAwesome icon to be displayed within the button
 * @param {string} options.img   url of the image to be displayed within the button
 */
function registerSceneControlMacro({ icon, img, label, uuid } = {}) {
  if (!uuid || !label) throw Error('Scene control macros require a UUID and Label.');
  if (!(icon || img)) throw Error('Scene control macro requires a FontAwesome icon or img.');

  MassEdit.registers._sceneControlMacros.push({ icon, img, label, uuid });
}
