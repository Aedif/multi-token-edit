import { SUPPORTED_PLACEABLES } from '../constants.js';
import { hasMassEditUpdateDependency, objToString } from './generator.js';

export function genAction(options, documentName) {
  if (options.method === 'update' || options.method === 'toggle') {
    let command = ``;

    if (options.method === 'toggle') command += genToggleUtil(options);

    // Insert 'update' objects

    command += `\n// Updates to be applied
const update = ${objToString(options.fields)};\n`;
    if (options.method === 'toggle') command += `const update2 = ${objToString(options.toggle.fields)};\n\n`;

    // Insert Mass Edit control objects
    if (hasMassEditUpdateDependency(options)) {
      command += `\n// Mass Edit control objects\n`;
      if (options.randomize) command += `const randomizeFields = ${objToString(options.randomize)};\n`;
      if (options.addSubtract) command += `const addSubtractFields = ${objToString(options.addSubtract)};\n`;
      if (options.toggle) {
        if (options.toggle.randomize)
          command += `const randomizeFieldsToggleOff = ${objToString(options.toggle?.randomize)};\n`;
        if (options.toggle.addSubtract)
          command += `const addSubtractFieldsToggleOff = ${objToString(options.toggle?.addSubtract)};\n`;
      }
    }

    if (hasMassEditUpdateDependency(options)) {
      return command + genUpdateWithMassEditDep(options, documentName);
    } else {
      return command + genUpdate(options, documentName);
    }
  } else if (options.method === 'massEdit') {
    return `\n// Open Mass Edit Form
await MassEdit.api.showMassEdit(targets, '${documentName}');`;
  } else if (options.method === 'delete') {
    return genDelete(options, documentName);
  }
}

function genDelete(options, documentName) {
  let command = `\n// Delete ${documentName}s`;
  if (SUPPORTED_PLACEABLES.includes(documentName)) {
    if (options.target.scope === 'selected' || options.target.scope === 'scene') {
      command += `\ncanvas.scene.deleteEmbeddedDocuments('${documentName}', targets.map(t => t.id));`;
    } else {
      command += `\nconst toDelete = {};
targets.forEach( t => {
  const sceneID = t.parent.id;
  if(!toDelete[sceneID]) toDelete[sceneID] = [];
  toDelete[sceneID].push(t.id);
});
Object.keys(toDelete).forEach(sceneID => game.scenes.get(sceneID).deleteEmbeddedDocuments('${documentName}', toDelete[sceneID]));
      `;
    }
  } else {
    command += `\n${documentName}.deleteDocuments(targets.map( t => t.id ));`;
  }
  return command;
}

function genUpdate(options, documentName) {
  // Update related code
  let command = '';

  // Macro only execution, ignore update code
  if (foundry.utils.isEmpty(options.fields) && !options.toggle) {
    return '';
  } else if (options.toggle && foundry.utils.isEmpty(options.toggle.fields) && foundry.utils.isEmpty(options.fields)) {
    return `
const toggleOnTargets = [];
const toggleOffTargets = [];

targets.forEach((t) => {
  if(toggleOn(t, update)) toggleOffTargets.push(t);
  else toggleOnTargets.push(t);
});
    `;
  }

  // We start generating update code here
  // Are there macros to execute?
  const macroTracking = (options.macro || options.toggle?.macro) && options.toggle;

  if (macroTracking) {
    command += `
const toggleOnTargets = [];
const toggleOffTargets = [];
  `;
  }

  // Setting up updates
  if (SUPPORTED_PLACEABLES.includes(documentName)) {
    command += '\nconst updates = {};';
    if (options.method === 'toggle') {
      command += `
targets.forEach((t) => {
  const sceneId = t.parent.id;
  if(!updates[sceneId]) updates[sceneId] = [];

  let u;
  if(toggleOn(t, update)) {
    u = foundry.utils.deepClone(update2);${macroTracking ? '\ntoggleOffTargets.push(t);' : ''}
  } else {
    u = foundry.utils.deepClone(update);${macroTracking ? '\ntoggleOnTargets.push(t);' : ''}
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
  
  let u = foundry.utils.deepClone(update);
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
    u = foundry.utils.deepClone(update2);${macroTracking ? '\ntoggleOffTargets.push(t);' : ''}
  } else {
    u = foundry.utils.deepClone(update);${macroTracking ? '\ntoggleOnTargets.push(t);' : ''}
  }
  u._id = t.id;
  updates.push(u);
});
  `;
    } else {
      command += `
targets.forEach((t) => {
  let u = foundry.utils.deepClone(update);
  u._id = t.id;
  updates.push(u);
});
  `;
    }
  }

  // Executing updates
  if (SUPPORTED_PLACEABLES.includes(documentName)) {
    command += `
for(const sceneId of Object.keys(updates)) {
  game.scenes.get(sceneId)?.updateEmbeddedDocuments('${documentName}', updates[sceneId]);
}
  `;
  } else if (documentName === 'PlaylistSound') {
    command += `
for (let i = 0; i < targets.length; i++) {
  delete updates[i]._id;
  targets[i].document.update(updates[i]);
}
  `;
  } else {
    command += `\n${documentName}.updateDocuments(updates);\n`;
  }

  return command;
}

function genUpdateWithMassEditDep(options, documentName) {
  let context = [];
  if (options.randomize) context.push('randomizeFields');
  if (options.addSubtract) context.push('addSubtractFields');
  context = context.join(', ');

  if (options.method === 'toggle') {
    let context2 = [];
    if (options.toggle?.randomize) context2.push('randomizeFields: randomizeFieldsToggleOff');
    if (options.toggle?.addSubtract) context2.push('addSubtractFields: addSubtractFieldsToggleOff');
    context2 = context2.join(', ');
    return `
const toggleOnTargets = [];
const toggleOffTargets = [];
  
targets.forEach((t) => {
  if(toggleOn(t, update)) toggleOffTargets.push(t);
  else toggleOnTargets.push(t);
});
  
await MassEdit.api.performMassUpdate.call({${context}}, update, toggleOnTargets, '${documentName}');
await MassEdit.api.performMassUpdate.call({${context2}}, update2, toggleOffTargets, '${documentName}');
`;
  } else {
    return `await MassEdit.api.performMassUpdate.call({${context}}, update, targets, '${documentName}');\n`;
  }
}

function genToggleUtil(options) {
  let command = `\n// Toggle; Helper function`;
  if (options.toggle.method === 'field') {
    command += `
const toggleOn = function (obj, fields) {
  const data = foundry.utils.flattenObject(obj.toObject());
  fields = foundry.utils.flattenObject(fields);
  return foundry.utils.isEmpty(foundry.utils.diffObject(data, fields));
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
