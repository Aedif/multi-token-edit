import { SUPPORTED_PLACEABLES } from '../utils.js';
import { genTargets } from './targets.js';

// Util to stringify a json object
function objToString(obj) {
  if (!obj) return null;
  return JSON.stringify(obj, null, 2);
}

export async function generateMacro(docName, placeables, options) {
  let command = '';

  // Dependencies get checked first
  command += genMacroDependencies(options);

  // Insert 'update' objects
  command += `// Updates to be applied
const update = ${objToString(options.fields)};
`;
  if (options.method === 'toggle') command += `const update2 = ${objToString(options.toggle.fields)};\n\n`;

  // Insert Mass Edit control objects
  if (hasMassEditUpdateDependency(options)) {
    command += `\n// Mass Edit control objects\n`;
    command += `const randomizeFields = ${objToString(options.randomize)};\n`;
    command += `const addSubtractFields = ${objToString(options.addSubtract)};\n`;
    if (options.method === 'toggle') {
      command += `const randomizeFieldsToggleOff = ${objToString(options.toggle.randomize)};\n`;
      command += `const addSubtractFieldsToggleOff = ${objToString(options.toggle.addSubtract)};\n`;
    }
  }

  command += genTargets(options, docName, placeables);
  if (options.method === 'toggle') command += genToggleUtil(options);

  command += `
// ===============
// === Update ====
// ===============
`;

  if (hasMassEditUpdateDependency(options)) {
    command += genUpdateWithMassEditDep(options, docName);
  } else {
    command += genUpdate(options, docName);
  }

  if (options.macro || options.toggle?.macro) {
    command += genRunMacro(options);
  }

  console.log(command);
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

function genRunMacro(options) {
  let command = `\n
// ===================
// = Macro Execution =
// ===================

const advancedMacro = game.modules.get('advanced-macros')?.active;
`;
  if (options.macro) command += `const selectMacroTargets = ${selectTargets};\n`;
  if (options.toggle?.macro) command += `const selectToggleMacroTargets = ${selectTargetsToggle};\n`;

  // Run macros if applicable
  if (options.macro) {
    command += `
// Apply macro
const applyMacro = game.collections.get('Macro').find(m => m.name === '${runMacro}')
if (applyMacro && toggleOnTargets.length) {
  if(selectMacroTargets) {
    layer.activate();
    layer.releaseAll();
    toggleOnTargets.forEach(t => t.object?.control({ releaseOthers: false }));
  }

  if (advancedMacro) applyMacro.execute(toggleOnTargets);
  else applyMacro.execute({token, actor});
  
  if(selectMacroTargets) {
    layer.releaseAll();
  }
}
`;
  }
  if (options.toggle?.macro) {
    command += `
// Apply macro on toggle off
const offMacro = game.collections.get('Macro').find(m => m.name === '${runMacroToggle}')
if (offMacro && toggleOffTargets.length) {
  if(selectToggleMacroTargets) {
    layer.activate();
    layer.releaseAll();
    toggleOffTargets.forEach(t => t.object?.control({ releaseOthers: false }));
  }
  if (advancedMacro) offMacro.execute(toggleOffTargets);
  else offMacro.execute({token, actor});

  if(selectToggleMacroTargets) {
    layer.releaseAll();
  }
}
`;
  }
}

function genUpdate(options, docName) {
  // Update related code
  let command = '';

  // Are there macros to execute?
  const macroTracking = options.macro?.run || options.toggle?.macro?.run;

  if (macroTracking) {
    command += `
const toggleOnTargets = [];
const toggleOffTargets = [];
`;
  }

  // Setting up updates
  if (SUPPORTED_PLACEABLES.includes(docName)) {
    command += '\nconst updates = {};';
    if (options.method === 'toggle') {
      command += `
targets.forEach((t) => {
  const sceneId = t.parent.id;
  if(!updates[sceneId]) updates[sceneId] = [];

  let u;
  if(toggleOn(t, update)) {
    u = deepClone(update2);${macroTracking ? '\ntoggleOffTargets.push(t);' : ''}
  } else {
    u = deepClone(update);${macroTracking ? '\ntoggleOnTargets.push(t);' : ''}
  }
  u._id = t.id;

  updates[sceneId].push(u);
});
`;
    } else {
      command += `
targets.forEach((t) => {
  const sceneId = t.parent.id;
  if(!updates[sceneId]) updates[sceneId] = [];
  let u = deepClone(update);
  u._id = t.id;
  updates[sceneId].push(u);
});
`;
    }
  } else {
    command += '\nconst updates = [];';
    if (options.method === 'toggle') {
      command += `
targets.forEach((t) => {
  let u;
  if(toggleOn(t, update)) {
    u = deepClone(update2);${macroTracking ? '\ntoggleOffTargets.push(t);' : ''}
  } else {
    u = deepClone(update);${macroTracking ? '\ntoggleOnTargets.push(t);' : ''}
  }
  u._id = t.id;
  updates.push(u);
});
`;
    } else {
      command += `
targets.forEach((t) => {
  let u = deepClone(update);
  u._id = t.id;
  updates.push(u);
});
`;
    }
  }

  // Executing updates
  if (SUPPORTED_PLACEABLES.includes(docName)) {
    command += `
for(const sceneId of Object.keys(updates)) {
  game.scenes.get(sceneId)?.updateEmbeddedDocuments('${docName}', updates[sceneId]);
}
`;
  } else if (docName === 'PlaylistSound') {
    command += `
for (let i = 0; i < targets.length; i++) {
  delete updates[i]._id;
  targets[i].document.update(updates[i]);
}
`;
  } else {
    command += `\n${docName}.updateDocuments(updates);`;
  }

  return command;
}

function hasMassEditDependency(options) {
  return (
    options.randomize ||
    options.addSubtract ||
    options.toggle?.randomize ||
    options.toggle?.addSubtract ||
    options.target.method === 'search' ||
    hasSpecialField(options.fields)
  );
}

function hasMassEditUpdateDependency(options) {
  return (
    options.randomize ||
    options.addSubtract ||
    options.toggle?.randomize ||
    options.toggle?.addSubtract ||
    hasSpecialField(options.fields)
  );
}

function genMacroDependencies(options) {
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

  return dep;
}

function genUpdateWithMassEditDep(options, docName) {
  if (options.method === 'toggle') {
    return `
const toggleOnTargets = [];
const toggleOffTargets = [];

targets.forEach((t) => {
  if(toggleOn(t, update)) toggleOffTargets.push(t);
  else toggleOnTargets.push(t);
});

await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, toggleOnTargets, '${docName}');
await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update2, toggleOffTargets, '${docName}');
`;
  } else {
    return `await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, targets, '${docName}');`;
  }
}

export function hasSpecialField(fields) {
  const specialFields = ['tokenmagic.ddTint', 'tokenmagic.preset', 'massedit.scale', 'massedit.texture.scale'];
  for (const sf of specialFields) {
    if (sf in fields) return true;
  }
  return false;
}

function genToggleUtil(options) {
  let command = `\n\n// Toggle; Helper function`;
  if (options.toggle.method === 'field') {
    command += `
const toggleOn = function (obj, fields) {
  const data = flattenObject(obj.toObject());
  fields = flattenObject(fields);
  return isEmpty(diffObject(data, fields));
};
`;
  } else {
    command += `
const macro = this;
const toggleOn = function (obj) {
  if (obj.getFlag('world', \`macro-\${macro.id}-toggleOn\`)) {
    obj.unsetFlag('world', \`macro-\${macro.id}-toggleOn\`);
    return true;
  } else {
    obj.setFlag('world', \`macro-\${macro.id}-toggleOn\`, true);
    return false;
  }
};
`;
  }

  return command;
}
