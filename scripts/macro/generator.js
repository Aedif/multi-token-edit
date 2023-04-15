import { SUPPORTED_COLLECTIONS } from '../utils.js';
import { genAction } from './action.js';
import { genTargets } from './targets.js';

// Util to stringify a json object
export function objToString(obj) {
  if (!obj) return null;
  return JSON.stringify(obj, null, 2);
}

export async function generateMacro(docName, placeables, options) {
  let command = '';

  // Dependencies get checked first
  command += genMacroDependencies(options, docName);
  command += genTargets(options, docName, placeables);
  command += genAction(options, docName);
  if (options.macro || options.toggle?.macro) {
    command += genRunMacro(options, docName);
  }

  if (command) {
    // Create Macro
    const macro = await Macro.create({
      name: options.name,
      type: 'script',
      scope: 'global',
      command: command,
    });
    macro.sheet.render(true);
  }
}

function genRunMacro(options, docName) {
  let command = `\n
// ===================
// = Macro Execution =
// ===================

const advancedMacro = game.modules.get('advanced-macros')?.active;
const layer = canvas.getLayerByEmbeddedName('${docName}');
`;
  // Run macros if applicable
  if (options.macro) {
    command += `
// Apply macro
const applyMacro = game.collections.get('Macro').find(m => m.name === '${options.macro.name}')
if (applyMacro && ${options.toggle ? 'toggleOnTargets' : 'targets'}.length) {
  ${
    options.macro.select
      ? `layer.activate();\n  layer.releaseAll();\n  ${
          options.toggle ? 'toggleOnTargets' : 'targets'
        }.forEach(t => t.object?.control({ releaseOthers: false }));\n`
      : ''
  }
  if (advancedMacro) applyMacro.execute(${options.toggle ? 'toggleOnTargets' : 'targets'});
  else applyMacro.execute({token, actor});
  ${options.macro.select ? '\n  layer.releaseAll();' : ''}
}
`;
  }
  if (options.toggle?.macro) {
    command += `
// Apply macro on toggle off
const offMacro = game.collections.get('Macro').find(m => m.name === '${options.toggle.macro.name}')
if (offMacro && toggleOffTargets.length) {
  ${
    options.toggle.macro.select
      ? 'layer.activate();\n  layer.releaseAll();\n  toggleOffTargets.forEach(t => t.object?.control({ releaseOthers: false }));\n'
      : ''
  }
  if (advancedMacro) offMacro.execute(toggleOffTargets);
  else offMacro.execute({token, actor});
  ${options.toggle.macro.select ? '\n  layer.releaseAll();' : ''}
}
`;
  }
  return command;
}

export function hasMassEditDependency(options) {
  return (
    options.randomize ||
    options.addSubtract ||
    options.toggle?.randomize ||
    options.toggle?.addSubtract ||
    options.target.method === 'search' ||
    options.method === 'massEdit' ||
    hasSpecialField(options.fields)
  );
}

export function hasMassEditUpdateDependency(options) {
  return (
    options.randomize ||
    options.addSubtract ||
    options.toggle?.randomize ||
    options.toggle?.addSubtract ||
    hasSpecialField(options.fields)
  );
}

function genMacroDependencies(options, docName) {
  let dep = '';

  const depWarning = (module) => {
    return `ui.notifications.warn('${game.i18n.format('multi-token-edit.macro.dependency-warning', {
      module,
    })}');`;
  };

  if (options.target.method === 'tagger')
    dep += `
if (!game.modules.get('tagger')?.active) {
  ${depWarning('Tagger')}
  return;
}

`;

  if (hasMassEditDependency(options))
    dep += `
const MassEdit = game.modules.get('multi-token-edit');
if(!MassEdit?.active){
  ${depWarning('Mass Edit')}
  return;
}

`;

  if (SUPPORTED_COLLECTIONS.includes(docName) && options.target.scope === 'select')
    dep += `
if (!game.modules.get('multiple-document-selection')?.active) {
  ${depWarning('Multiple Document Selection')}
  return;
}

`;

  return dep;
}

export function hasSpecialField(fields) {
  const specialFields = ['tokenmagic.ddTint', 'tokenmagic.preset', 'massedit.scale', 'massedit.texture.scale'];
  for (const sf of specialFields) {
    if (sf in fields) return true;
  }
  return false;
}
