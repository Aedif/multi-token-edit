import { SUPPORTED_PLACEABLES } from './utils.js';

export async function generateMacro(
  docName,
  placeables,
  {
    name = 'Mass Edit Macro',
    fields = {},
    toggleFields = {},
    target = 'selectedGeneric',
    method = 'update',
    toggleMethod = 'fieldCompare',
    tags = null,
    taggerMatch = null,
    random = null,
    addSubtract = null,
    toggleRandom = null,
    toggleAddSubtract = null,
    selectTargets = false,
    runMacro = null,
    selectTargetsToggle = false,
    runMacroToggle = null,
  } = {}
) {
  let command = '';

  // Dependencies get checked first
  command += genMacroDependencies(
    target,
    random,
    addSubtract,
    toggleRandom,
    toggleAddSubtract,
    fields
  );

  const str = (obj) => {
    if (!obj) return null;
    return JSON.stringify(obj, null, 2);
  };

  // Insert 'update' objects
  command += `// Updates to be applied
const update = ${str(fields)};
`;
  if (method === 'toggle') command += `const update2 = ${str(toggleFields)};\n\n`;

  // Insert Mass Edit control objects
  if (random || addSubtract || toggleRandom || toggleAddSubtract || hasSpecialField(fields)) {
    command += `\n// Mass Edit control objects\n`;
    command += `const randomizeFields = ${str(random)};\n`;
    command += `const addSubtractFields = ${str(addSubtract)};\n`;
    if (method === 'toggle') {
      command += `const randomizeFieldsToggleOff = ${str(toggleRandom)};\n`;
      command += `const addSubtractFieldsToggleOff = ${str(toggleAddSubtract)};\n`;
    }
  }

  // Placeable layer
  if (SUPPORTED_PLACEABLES.includes(docName)) {
    command += `\n// ${docName} layer
const layer = canvas.getLayerByEmbeddedName('${docName}')\n`;
  }

  // Targeting related code
  command += `\n// Targets for the macro\n`;
  if (target === 'currentSelectedIDs') {
    command += `const ids = [${placeables.map((p) => `"${p.id}"`).join(',')}];\n`;
    if (SUPPORTED_PLACEABLES.includes(docName)) {
      command += 'const targets = ids.map(id => layer.get(id)).filter(t => t);\n\n';
    } else if (docName === 'PlaylistSound') {
      command += `const targets = [];
game.collections.get('Playlist').forEach(
  pl => pl.sounds.forEach(s => {
    if(ids.includes(s.id)) {
      targets.push({document: s, id: s.id})
    }
  })
);
`;
    } else {
      command += `const targets = ids.map(id => game.collections.get('${docName}').get(id)).filter(d => d).map(d => {return {document: d, id: d.id}});\n`;
    }
  } else if (target === 'allDocuments') {
    if (docName === 'PlaylistSound') {
      command += `const targets = [];
game.collections.get('Playlist').forEach(
  pl => pl.sounds.forEach(s => 
    targets.push({document: s, id: s.id})
));
`;
    } else {
      command += `const targets = game.collections.get('${docName}').map(d => {return {document: d, id: d.id}});\n`;
    }
  } else if (target === 'selectedGeneric') {
    if (SUPPORTED_PLACEABLES.includes(docName)) {
      command += `const targets = [...layer.controlled];\n\n`;
    } else {
      command += `
// MDS - Helper Function
function getSelectedDocuments() {
  const supportedDocs = [
    { name: 'Actor', class: 'actor' },
    { name: 'Scene', class: 'scene' },
    { name: 'JournalEntry', class: 'journalentry' },
    { name: 'Playlist', class: 'sound' },
    { name: 'Item', class: 'item' },
    { name: 'RollTable', class: 'rolltable' },
    { name: 'Cards', class: 'cards' },
  ];
  for (const doc of supportedDocs) {
    const selected = [];
    $(\`.directory-list .\${doc.class}.selected\`).each(function (_) {
      let d;
      if (doc.name === 'Playlist') {
        d = game.collections
          .get(doc.name)
          .get(this.dataset.playlistId)
          ?.sounds.get(this.dataset.soundId);
      } else {
        d = game.collections.get(doc.name).get(this.dataset.documentId);
      }
      if (d) selected.push(d);
    });
    if(selected.length) return selected;
  }
  return [];
}

const targets = getSelectedDocuments().map(d => {return {document: d, id: d.id}});
if(!targets.length || targets[0].document.documentName !== '${docName}')
  return;
`;
    }
  } else if (target === 'allGeneric') {
    command += `const targets = [...layer.placeables];\n\n`;
  } else if (target === 'tokenGeneric') {
    command += 'if(!token) return;\n\n';
  } else if (target === 'tagger') {
    command += `const targets = Tagger.getByTag('${tags}', {matchAny: ${
      taggerMatch === 'any'
    }}).filter(t => t.documentName === '${docName}').map(t => t.object);\n\n`;
  }

  // Add toggle utility function if needed
  if (method === 'toggle') {
    command += `\n// Toggle; Helper function`;
    if (toggleMethod === 'fieldCompare') {
      command += `
const toggleOn = function (obj, fields) {
  const data = flattenObject(obj.document.toObject());
  fields = flattenObject(fields);
  return isEmpty(diffObject(data, fields));
};
`;
    } else {
      command += `
const macro = this;
const toggleOn = function (obj) {
  if (obj.document.getFlag('world', \`macro-\${macro.id}-toggleOn\`)) {
    obj.document.unsetFlag('world', \`macro-\${macro.id}-toggleOn\`);
    return true;
  } else {
    obj.document.setFlag('world', \`macro-\${macro.id}-toggleOn\`, true);
    return false;
  }
};
`;
    }
  }

  command += `
// ===============
// === Update ====
// ===============
`;

  // Update related code
  if (random || addSubtract || toggleRandom || toggleAddSubtract || hasSpecialField(fields)) {
    command += genUpdateWithMassEditDep(target, method, docName, runMacro || runMacroToggle);
  } else {
    command += genUpdate(target, method, docName, runMacro || runMacroToggle);
  }

  if (runMacro || runMacroToggle) {
    command += `\n
// ===================
// = Macro Execution =
// ===================

const advancedMacro = game.modules.get('advanced-macros')?.active;
`;
    if (runMacro) command += `const selectMacroTargets = ${selectTargets};\n`;
    if (runMacroToggle) command += `const selectToggleMacroTargets = ${selectTargetsToggle};\n`;
  }

  // Run macros if applicable
  if (runMacro) {
    if (target === 'tokenGeneric' && method !== 'toggle') command += `const targets = [token];\n`;

    const targets = method === 'toggle' ? 'toggleOnTargets' : 'targets';
    command += `
// Apply macro
const applyMacro = game.collections.get('Macro').find(m => m.name === '${runMacro}')
if (applyMacro && ${targets}.length) {
  if(selectMacroTargets) {
    layer.activate();
    layer.releaseAll();
    ${targets}.forEach(t => t.control({ releaseOthers: false }));
  }
  if (advancedMacro) {
    applyMacro.execute(${targets});
  } else {
    applyMacro.execute({token, actor});
  }
  if(selectMacroTargets) {
    layer.releaseAll();
  }
}
`;
  }
  if (runMacroToggle) {
    command += `
// Apply macro on toggle off
const offMacro = game.collections.get('Macro').find(m => m.name === '${runMacroToggle}')
if (offMacro && toggleOffTargets.length) {
  if(selectToggleMacroTargets) {
    layer.activate();
    layer.releaseAll();
    toggleOffTargets.forEach(t => t.control({ releaseOthers: false }));
  }
  if (advancedMacro) {
    offMacro.execute(toggleOffTargets);
  } else {
    offMacro.execute({token, actor});
  }
  if(selectToggleMacroTargets) {
    layer.releaseAll();
  }
}
`;
  }

  if (command) {
    // Create Macro
    const macro = await Macro.create({
      name: name,
      type: 'script',
      scope: 'global',
      command: command,
    });
    macro.sheet.render(true);
  }
}

function genMacroDependencies(
  target,
  random,
  addSubtract,
  toggleRandom,
  toggleAddSubtract,
  fields
) {
  let dep = '';

  const depWarning = (module) => {
    return `ui.notifications.warn('${game.i18n.format('multi-token-edit.macro.dependency-warning', {
      module,
    })}');`;
  };

  if (target === 'tagger')
    dep += `
if (!game.modules.get('tagger')?.active) {
  ${depWarning('Tagger')}
  return;
}

`;

  if (random || addSubtract || toggleRandom || toggleAddSubtract || hasSpecialField(fields))
    dep += `
const MassEdit = game.modules.get('multi-token-edit');
if(!MassEdit?.active){
  ${depWarning('Mass Edit')}
  return;
}

`;

  return dep;
}

function genUpdate(target, method, docName, macroTracking = false) {
  // Update related code
  let command = '';

  if (method === 'toggle') {
    command += `
const toggleOnTargets = [];
const toggleOffTargets = [];
`;
  }

  if (target === 'tokenGeneric') {
    if (method === 'update') {
      command += 'token.document.update(update);\n';
    } else if (method === 'toggle') {
      command += `
if (toggleOn(token, update)) {
  token.document.update(update2);
  ${macroTracking ? 'toggleOffTargets.push(token);' : ''}
} else {
  token.document.update(update);
  ${macroTracking ? 'toggleOnTargets.push(token);' : ''}
}
`;
    }
  } else {
    command += '\nconst updates = [];';
    if (method === 'toggle') {
      command += `
targets.forEach((t) => {
  let u;
  if(toggleOn(t, update)) {
    u = deepClone(update2);
    ${macroTracking ? 'toggleOffTargets.push(t);' : ''}
  } else {
    u = deepClone(update);
    ${macroTracking ? 'toggleOnTargets.push(t);' : ''}
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
    if (SUPPORTED_PLACEABLES.includes(docName)) {
      command += `\ncanvas.scene.updateEmbeddedDocuments('${docName}', updates);`;
    } else if (docName === 'PlaylistSound') {
      command += `
for (let i = 0; i < targets.length; i++) {
  delete updates[i]._id;
  targets[i].document.update(updates[i]);
}
`;
    } else {
      command += `\ntargets[0]?.document.constructor?.updateDocuments(updates)`;
    }
  }
  return command;
}

function genUpdateWithMassEditDep(target, method, docName, macroTracking = false) {
  let command = '';

  if (target === 'tokenGeneric') {
    if (method === 'update') {
      command += `await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, [token], '${docName}');`;
    } else if (method === 'toggle') {
      command += `
if (toggleOn(token, update)) {
  await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update2, [token], '${docName}');
} else {
  await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, [token], '${docName}');
}
`;
    }
  } else {
    if (method === 'toggle') {
      command += `
const toggleOnTargets = [];
const toggleOffTargets = [];

targets.forEach((t) => {
  if(toggleOn(t, update)) {
    toggleOffTargets.push(t);
  } else {
    toggleOnTargets.push(t);
  }
});
`;
    }

    if (method === 'toggle') {
      command += `
await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, toggleOnTargets, '${docName}');
await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update2, toggleOffTargets, '${docName}');
`;
    } else {
      command += `await MassEdit.api.performMassUpdate.call({randomizeFields, addSubtractFields}, update, targets, '${docName}');`;
    }
  }

  return command;
}

export function hasSpecialField(fields) {
  const specialFields = [
    'tokenmagic.ddTint',
    'tokenmagic.preset',
    'massedit.scale',
    'massedit.texture.scale',
  ];
  for (const sf of specialFields) {
    if (sf in fields) return true;
  }
  return false;
}
