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
  } = {}
) {
  let command = '';

  // Dependencies get checked first
  command += genMacroDependencies(target, random, addSubtract, toggleRandom, toggleAddSubtract);

  const str = (obj) => {
    if (!obj) return null;
    return JSON.stringify(obj, null, 2);
  };

  // Insert 'update' objects
  command += `const update = ${str(fields)};\n\n`;
  if (method === 'toggle') command += `const update2 = ${str(toggleFields)};\n\n`;

  // Insert Mass Edit control objects
  if (random || addSubtract || toggleRandom || toggleAddSubtract) {
    command += `const randomizeFields = ${str(random)};\n\n`;
    command += `const addSubtractFields = ${str(addSubtract)};\n\n`;
    if (method === 'toggle') {
      command += `const randomizeFieldsToggleOff = ${str(toggleRandom)};\n\n`;
      command += `const addSubtractFieldsToggleOff = ${str(toggleAddSubtract)};\n\n`;
    }
  }

  // Targeting related code
  if (target === 'currentSelectedIDs') {
    command += `const ids = [${placeables.map((p) => `"${p.id}"`).join(',')}];\n`;
    command += `const layer = canvas.getLayerByEmbeddedName('${docName}')\n`;
    command += 'const targets = ids.map(id => layer.get(id)).filter(t => t);\n\n';
  } else if (target === 'selectedGeneric') {
    command += `const targets = [...canvas.getLayerByEmbeddedName('${docName}').controlled];\n\n`;
  } else if (target === 'allGeneric') {
    command += `const targets = [...canvas.getLayerByEmbeddedName('${docName}').placeables];\n\n`;
  } else if (target === 'tokenGeneric') {
    command += 'if(!token) return;\n\n';
  } else if (target === 'tagger') {
    command += `const targets = Tagger.getByTag('${tags}', {matchAny: ${
      taggerMatch === 'any'
    }}).filter(t => t.documentName === '${docName}').map(t => t.object);\n\n`;
  }

  // Add toggle utility function if needed
  if (method === 'toggle') {
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

  // Update related code
  if (random || addSubtract || toggleRandom || toggleAddSubtract) {
    command += genUpdateWithMassEditDep(target, method, docName);
  } else {
    command += genUpdate(target, method, docName);
  }

  // Create Macro
  if (command) {
    const macro = await Macro.create({
      name: name,
      type: 'script',
      scope: 'global',
      command: command,
    });
    macro.sheet.render(true);
  }
}

function genMacroDependencies(target, random, addSubtract, toggleRandom, toggleAddSubtract) {
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

  if (random || addSubtract || toggleRandom || toggleAddSubtract)
    dep += `
const MassEdit = game.modules.get('multi-token-edit');
const GeneralDataAdapter = MassEdit?.api?.GeneralDataAdapter;
if(!MassEdit?.active){
  ${depWarning('Mass Edit')}
  return;
}

`;

  return dep;
}

function genUpdate(target, method, docName) {
  // Update related code
  let command = '';
  if (target === 'tokenGeneric') {
    if (method === 'update') {
      command += 'token.document.update(update);';
    } else if (method === 'toggle') {
      command += `
if (toggleOn(token, update)) {
  token.document.update(update2);
} else {
  token.document.update(update);
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
  } else {
    u = deepClone(update);
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
    command += `\ncanvas.scene.updateEmbeddedDocuments('${docName}', updates);`;
  }
  return command;
}

function genUpdateWithMassEditDep(target, method, docName) {
  let command = '';

  if (target === 'tokenGeneric') {
    if (method === 'update') {
      command += `
if (randomizeFields) MassEdit.api.applyRandomization([update], [token], randomizeFields);
if (addSubtractFields) MassEdit.api.applyAddSubtract([update], [token], '${docName}', addSubtractFields);
MassEdit.api.GeneralDataAdapter.formToData('${docName}', token, update);

token.document.update(update);
`;
    } else if (method === 'toggle') {
      command += `
if (toggleOn(token, update)) {
  if (randomizeFieldsToggleOff) MassEdit.api.applyRandomization([update2], [token], randomizeFieldsToggleOff);
  if (addSubtractFieldsToggleOff) MassEdit.api.applyAddSubtract([update2], [token], '${docName}', addSubtractFieldsToggleOff);
  MassEdit.api.GeneralDataAdapter.formToData('${docName}', token, update2);

  token.document.update(update2);
} else {
  if (randomizeFields) MassEdit.api.applyRandomization([update], [token], randomizeFields);
  if (addSubtractFields) MassEdit.api.applyAddSubtract([update], [token], '${docName}', addSubtractFields);
  MassEdit.api.GeneralDataAdapter.formToData('${docName}', token, update);

  token.document.update(update);
}
`;
    }
  } else {
    command += '\nconst updates = [];';

    if (method === 'toggle') {
      command += `
const toggleOnTargets = [];
const toggleOffUpdates = [];
const toggleOffTargets = [];

targets.forEach((t) => {
  let u;
  if(toggleOn(t, update)) {u = deepClone(update2);
    toggleOffUpdates.push(u);
    toggleOffTargets.push(t);
  } else {
    u = deepClone(update);
    toggleOnTargets.push(t);
    updates.push(u)
  }
  u._id = t.id;
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

    const toggleOn = method === 'toggle' ? 'toggleOnTargets' : 'targets';

    command += `
if (updates.length) {
  if (randomizeFields) MassEdit.api.applyRandomization(updates, ${toggleOn}, randomizeFields);
  if (addSubtractFields) MassEdit.api.applyAddSubtract(updates, ${toggleOn}, '${docName}', addSubtractFields);
}
`;

    if (method === 'toggle') {
      command += `
if (toggleOffUpdates.length) {
  if (randomizeFieldsToggleOff) MassEdit.api.applyRandomization(toggleOffUpdates, toggleOffTargets, randomizeFieldsToggleOff);
  if (addSubtractFieldsToggleOff) massEdit.api.applyAddSubtract(toggleOffUpdates, toggleOffTargets, '${docName}', addSubtractFieldsToggleOff);
}
`;
    }

    if (method === 'toggle') {
      command += `
for (let i = 0; i < updates.length; i++) {
  GeneralDataAdapter.formToData('${docName}', toggleOnTargets[i], updates[i]);
  GeneralDataAdapter.formToData('${docName}', toggleOffTargets[i], toggleOffUpdates[i]);
}

canvas.scene.updateEmbeddedDocuments('${docName}', updates.concat(toggleOffUpdates));
`;
    } else {
      command += `
for (let i = 0; i < updates.length; i++) {
  GeneralDataAdapter.formToData('${docName}', targets[i], updates[i]);
}

canvas.scene.updateEmbeddedDocuments('${docName}', updates);
`;
    }
  }

  return command;
}
