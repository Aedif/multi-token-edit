import { SUPPORTED_PLACEABLES } from '../constants.js';
import { objToString } from './generator.js';

export function genTargets(options, documentName, selected) {
  const target = options.target;
  if (target.method === 'ids') {
    return genIDTargets(target, documentName, selected);
  } else if (target.method === 'search') {
    return genSearch(target, documentName);
  } else if (target.method === 'tagger') {
    return genTaggerTargets(target, documentName);
  } else if (target.method === 'all') {
    return genAllTargets(target, documentName);
  } else if (target.method === 'currentScene') {
    return `const targets = [canvas.scene]`;
  } else {
    throw new Error('Invalid target method: ' + target.method);
  }
}

function genSearch(target, documentName) {
  let fields = objToString(target.fields);
  if (target.scope === 'selected') {
    let command = genSelected(documentName);
    command += `\ntargets = await MassEdit.api.performMassSearch('meSearch', '${documentName}' , ${fields}, { scope: 'selected', selected: targets, control: false, pan: false });`;
    return command;
  } else if (target.scope === 'scene') {
    return `const targets = await MassEdit.api.performMassSearch('meSearch', '${documentName}' , ${fields}, { scope: 'scene', control: false, pan: false });`;
  } else if (target.scope === 'world') {
    return `const targets = await MassEdit.api.performMassSearch('meSearch', '${documentName}' , ${fields}, { scope: 'world', control: false, pan: false });`;
  }
}

// Construct all selected document retriever
// const selected = [...];
function genSelected(documentName) {
  let command = '';

  if (SUPPORTED_PLACEABLES.includes(documentName)) {
    return `let targets = canvas.getLayerByEmbeddedName('${documentName}').controlled.map(o => o.document);\n\n`;
  } else if (game.modules.get('multiple-document-selection')?.active) {
    const mdsClasses = {
      Actor: 'actor',
      Scene: 'scene',
      JournalEntry: 'journalentry',
      Playlist: 'sound',
      Item: 'item',
      RollTable: 'RollTable',
      Cards: 'cards',
    };

    command += 'let targets = [];\n';

    if (documentName === 'Playlist') {
      command += `
$(\`.directory-list .\${'${mdsClasses[documentName]}'}.selected\`).each(function (_) {
  let d = game.collections.get('Playlist').get(this.dataset.playlistId)?.sounds.get(this.dataset.soundId);
  if (d) targets.push(d);
});
`;
    } else {
      command += `
$(\`.directory-list .\${'${mdsClasses[documentName]}'}.selected\`).each(function (_) {
  let d = game.collections.get('${documentName}').get(this.dataset.documentId);
  if (d) targets.push(d);
});
  `;
    }
    return command;
  } else {
    throw new Error(`'Selected' is not a supported options for ${documentName}s`);
  }
}

function genAllTargets(target, documentName) {
  if (target.scope === 'selected') {
    return genSelected(documentName);
  } else if (SUPPORTED_PLACEABLES.includes(documentName)) {
    if (target.scope === 'scene') {
      return `const targets = canvas.getLayerByEmbeddedName('${documentName}').placeables.map(o => o.document);\n\n`;
    } else if (target.scope === 'world') {
      return `const targets = [];
Array.from(game.scenes).forEach( scene => {
  Array.from( scene.getEmbeddedCollection('${documentName}') ).forEach(embed => targets.push(embed));
});
  `;
    }
  } else {
    return `const targets = Array.from(game.collections.get('${documentName}'));`;
  }
}

function genTaggerTargets(target, documentName) {
  let command = '';
  const opts = {
    matchAny: target.tagger.match === 'any',
    allScenes: target.scope === 'world',
  };

  if (target.scope === 'selected') {
    command += genSelected(documentName);
    command += `targets = Tagger.getByTag('${target.tagger.tags}', { matchAny: ${
      target.tagger.match === 'any'
    }, objects: targets }).filter(t => t.documentName === '${documentName}');\n\n`;
  } else if (target.scope === 'scene') {
    command += `const targets = Tagger.getByTag('${target.tagger.tags}', ${objToString(
      opts
    )}).filter(t => t.documentName === '${documentName}');\n\n`;
  } else if (target.scope === 'world') {
    command += `const targets = [];`;
    command += `Object.values(Tagger.getByTag('${target.tagger.tags}', ${objToString(
      opts
    )})).forEach(item => item.forEach(t => { if(t.documentName === '${documentName}') targets.push(t) }));`;
  }

  return command;
}

function genIDTargets(target, documentName, selected) {
  let command = `const ids = [${selected.map((p) => `"${p.id}"`).join(',')}];\n`;
  command += `const targets = [];`;

  if (SUPPORTED_PLACEABLES.includes(documentName)) {
    command += `
ids.forEach( id => {
  Array.from(game.scenes).forEach( scene => {
    let embed = scene.getEmbeddedDocument('${documentName}', id);
    if(embed) targets.push(embed)
  });
});
`;
  } else {
    command += `
ids.forEach(id => { 
  const doc = ${documentName}.get(id);
  if(doc) targets.push(doc);
});`;
  }

  return command;
}
