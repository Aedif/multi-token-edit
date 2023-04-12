import { SUPPORTED_PLACEABLES } from '../utils.js';

export function genTargets(options, docName, selected) {
  const target = options.target;
  if (target.method === 'ids') {
    return genIDTargets(target, docName, selected);
  } else if (target.method === 'search') {
  } else if (target.method === 'tagger') {
    return genTaggerTargets(target, docName);
  } else if (target.method === 'all') {
    return genAllTargets(target, docName);
  } else {
    throw new Error('Invalid target method: ' + target.method);
  }
}

// Construct all selected document retriever
// const selected = [...];
function genSelected(docName) {
  let command = '';

  if (SUPPORTED_PLACEABLES.includes(docName)) {
    return `const targets = canvas.getLayerByEmbeddedName('${docName}').controlled.map(o => o.document);\n\n`;
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

    command += 'const selected = [];\n';

    if (docName === 'Playlist') {
      command += `
$(\`.directory-list .\${'${mdsClasses[docName]}'}.selected\`).each(function (_) {
    let d = game.collections.get('Playlist').get(this.dataset.playlistId)?.sounds.get(this.dataset.soundId);
    if (d) selected.push(d);
});
`;
    } else {
      command += `
$(\`.directory-list .\${'${mdsClasses[docName]}'}.selected\`).each(function (_) {
    let d = game.collections.get('${docName}').get(this.dataset.documentId);
    if (d) selected.push(d);
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
  } else if (target.scope === 'scene') {
    return `const targets = canvas.getLayerByEmbeddedName('${docName}').placeables.map(o => o.document);\n\n`;
  } else if (target.scope === 'world') {
    return `const targets = [];
Array.from(game.scenes).forEach( scene => {
    Array.from( scene.getEmbeddedCollection('${docName}') ).forEach(embed => targets.push(embed));
});
`;
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
    command += `const targets = Tagger.hasTags(selected, '${target.tagger.tags}', ${objToString(
      opts
    )}).filter(t => t.documentName === '${docName}');\n\n`;
  } else {
    command += `const targets = Tagger.getByTag('${target.tagger.tags}', ${objToString(
      opts
    )}).filter(t => t.documentName === '${docName}');\n\n`;
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
    command += `ids.forEach(id => { 
    const doc = ${docName}.get(id);
    if(doc) targets.push(doc);
  });`;
  }

  return command;
}
