import { SUPPORTED_PLACEABLES } from '../utils.js';
import { objToString } from './generator.js';

export function genTargets(options, docName, selected) {
  const target = options.target;
  if (target.method === 'ids') {
    return genIDTargets(target, docName, selected);
  } else if (target.method === 'search') {
    return genSearch(target, docName);
  } else if (target.method === 'tagger') {
    return genTaggerTargets(target, docName);
  } else if (target.method === 'all') {
    return genAllTargets(target, docName);
  } else {
    throw new Error('Invalid target method: ' + target.method);
  }
}

function genSearch(target, docName) {
  let fields = objToString(target.fields);
  if (target.scope === 'selected') {
    let command = genSelected(docName);
    command += `\ntargets = await MassEdit.api.performMassSearch('search', '${docName}' , ${fields}, { scope: 'selected', selected: targets, control: false, pan: false });`;
    return command;
  } else if (target.scope === 'scene') {
    return `const targets = await MassEdit.api.performMassSearch('search', '${docName}' , ${fields}, { scope: 'scene', control: false, pan: false });`;
  } else if (target.scope === 'world') {
    return `const targets = await MassEdit.api.performMassSearch('search', '${docName}' , ${fields}, { scope: 'world', control: false, pan: false });`;
  }
}

// Construct all selected document retriever
// const selected = [...];
function genSelected(docName) {
  let command = '';

  if (SUPPORTED_PLACEABLES.includes(docName)) {
    return `let targets = canvas.getLayerByEmbeddedName('${docName}').controlled.map(o => o.document);\n\n`;
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

    if (docName === 'Playlist') {
      command += `
$(\`.directory-list .\${'${mdsClasses[docName]}'}.selected\`).each(function (_) {
  let d = game.collections.get('Playlist').get(this.dataset.playlistId)?.sounds.get(this.dataset.soundId);
  if (d) targets.push(d);
});
`;
    } else {
      command += `
$(\`.directory-list .\${'${mdsClasses[docName]}'}.selected\`).each(function (_) {
  let d = game.collections.get('${docName}').get(this.dataset.documentId);
  if (d) targets.push(d);
});
  `;
    }
    return command;
  } else {
    throw new Error(`'Selected' is not a supported options for ${docName}s`);
  }
}

function genAllTargets(target, docName) {
  if (target.scope === 'selected') {
    return genSelected(docName);
  } else if (SUPPORTED_PLACEABLES.includes(docName)) {
    if (target.scope === 'scene') {
      return `const targets = canvas.getLayerByEmbeddedName('${docName}').placeables.map(o => o.document);\n\n`;
    } else if (target.scope === 'world') {
      return `const targets = [];
Array.from(game.scenes).forEach( scene => {
  Array.from( scene.getEmbeddedCollection('${docName}') ).forEach(embed => targets.push(embed));
});
  `;
    }
  } else {
    return `const targets = Array.from(game.collections.get('${docName}'));`;
  }
}

function genTaggerTargets(target, docName) {
  let command = '';
  const opts = {
    matchAny: target.tagger.match === 'any',
    allScenes: target.scope === 'world',
  };

  if (target.scope === 'selected') {
    command += genSelected(docName);
    command += `targets = Tagger.getByTag('${target.tagger.tags}', { matchAny: ${
      target.tagger.match === 'any'
    }, objects: targets }).filter(t => t.documentName === '${docName}');\n\n`;
  } else if (target.scope === 'scene') {
    command += `const targets = Tagger.getByTag('${target.tagger.tags}', ${objToString(
      opts
    )}).filter(t => t.documentName === '${docName}');\n\n`;
  } else if (target.scope === 'world') {
    command += `const targets = [];`;
    command += `Object.values(Tagger.getByTag('${target.tagger.tags}', ${objToString(
      opts
    )})).forEach(item => item.forEach(t => { if(t.documentName === '${docName}') targets.push(t) }));`;
  }

  return command;
}

function genIDTargets(target, docName, selected) {
  let command = `const ids = [${selected.map((p) => `"${p.id}"`).join(',')}];\n`;
  command += `const targets = [];`;

  if (SUPPORTED_PLACEABLES.includes(docName)) {
    command += `
ids.forEach( id => {
  Array.from(game.scenes).forEach( scene => {
    let embed = scene.getEmbeddedDocument('${docName}', id);
    if(embed) targets.push(embed)
  });
});
`;
  } else {
    command += `
ids.forEach(id => { 
  const doc = ${docName}.get(id);
  if(doc) targets.push(doc);
});`;
  }

  return command;
}
