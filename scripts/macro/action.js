import { SUPPORTED_PLACEABLES } from '../utils.js';
import { hasMassEditUpdateDependency, objToString } from './generator.js';

export function genAction(options, docName) {
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
      return command + genUpdateWithMassEditDep(options, docName);
    } else {
      return command + genUpdate(options, docName);
    }
  } else if (options.method === 'massEdit') {
    return `\n// Open Mass Edit Form
await MassEdit.api.showMassEdit(targets, '${docName}');`;
  } else if (options.method === 'delete') {
    return genDelete(options, docName);
  }
}

function genDelete(options, docName) {
  let command = `\n// Delete ${docName}s`;
  if (SUPPORTED_PLACEABLES.includes(docName)) {
    if (options.target.scope === 'selected' || options.target.scope === 'scene') {
      command += `\ncanvas.scene.deleteEmbeddedDocuments('${docName}', targets.map(t => t.id));`;
    } else {
      command += `\nconst toDelete = {};
targets.forEach( t => {
  const sceneID = t.parent.id;
  if(!toDelete[sceneID]) toDelete[sceneID] = [];
  toDelete[sceneID].push(t.id);
});
Object.keys(toDelete).forEach(sceneID => game.scenes.get(sceneID).deleteEmbeddedDocuments('${docName}', toDelete[sceneID]));
      `;
    }
  } else {
    command += `\n${docName}.deleteDocuments(targets.map( t => t.id ));`;
  }
  return command;
}

function genUpdate(options, docName) {
  // Update related code
  let command = '';

  // Macro only execution, ignore update code
  if (isEmpty(options.fields) && !options.toggle) {
    return '';
  } else if (options.toggle && isEmpty(options.toggle.fields) && isEmpty(options.fields)) {
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
    command += `\n${docName}.updateDocuments(updates);\n`;
  }

  return command;
}

function genUpdateWithMassEditDep(options, docName) {
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
  
await MassEdit.api.performMassUpdate.call({${context}}, update, toggleOnTargets, '${docName}');
await MassEdit.api.performMassUpdate.call({${context2}}, update2, toggleOffTargets, '${docName}');
`;
  } else {
    return `await MassEdit.api.performMassUpdate.call({${context}}, update, targets, '${docName}');\n`;
  }
}

function genToggleUtil(options) {
  let command = `\n// Toggle; Helper function`;
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
