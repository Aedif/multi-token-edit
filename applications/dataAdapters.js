class PlaylistSoundDataAdapter {
  static formToData(obj, formData) {
    if (isNewerVersion('10', game.version)) return;
    if ('lvolume' in formData) {
      formData['volume'] = AudioHelper.inputToVolume(formData['lvolume']);
      delete formData['lvolume'];
    }
  }

  static dataToForm(note, data) {
    if (isNewerVersion('10', game.version)) return;
    data['lvolume'] = (note.document ?? note).volume;
  }

  static updateToForm(update) {
    if (isNewerVersion('10', game.version)) return;
    if ('volume' in update) {
      update['lvolume'] = AudioHelper.volumeToInput(update['volume']);
      delete update.volume;
    }
  }
}

class TileDataAdapter {
  static formToData(obj, formData) {
    if (isNewerVersion('10', game.version)) return;
    if ('massedit.scale' in formData) {
      formData.width = obj.document.width * formData['massedit.scale'];
      formData.height = obj.document.height * formData['massedit.scale'];
      delete formData['massedit.scale'];
    }
    if ('massedit.texture.scale' in formData) {
      formData['texture.scaleX'] = formData['massedit.texture.scale'];
      formData['texture.scaleY'] = formData['massedit.texture.scale'];
      delete formData['massedit.texture.scale'];
    }
  }
}

class NoteDataAdapter {
  static formToData(obj, formData) {
    if (isNewerVersion('10', game.version)) return;
    if ('icon.selected' in formData || 'icon.custom' in formData) {
      formData['texture.src'] = formData['icon.selected'] || formData['icon.custom'];
      delete formData['icon.selected'];
      delete formData['icon.custom'];
    }
  }

  static dataToForm(note, data) {
    if (isNewerVersion('10', game.version)) return;
    data['icon.selected'] = (note.document ?? note).texture.src;
    data['icon.custom'] = (note.document ?? note).texture.src;
  }
}

export class TokenDataAdapter {
  static updateToForm(update) {
    if (isNewerVersion('10', game.version)) return;
    if ('texture.scaleX' in update) {
      update.mirrorX = update['texture.scaleX'] < 0;
      update.scale = Math.abs(update['texture.scaleX']);
    }
    if ('texture.scaleY' in update) {
      update.mirrorY = update['texture.scaleY'] < 0;
      update.scale = Math.abs(update['texture.scaleY']);
    }
  }

  static dataToForm(token, data) {
    if (isNewerVersion('10', game.version)) return;

    const doc = token.document ? token.document : token;
    data.scale = Math.abs(doc.texture.scaleX);
    data.mirrorX = doc.texture.scaleX < 0;
    data.mirrorY = doc.texture.scaleY < 0;
  }

  static formToData(token, formData) {
    if (isNewerVersion('10', game.version)) return;

    const doc = token.document ? token.document : token;

    // Scale/mirroring
    if ('scale' in formData || 'mirrorX' in formData || 'mirrorY' in formData) {
      if (!('scale' in formData)) formData.scale = Math.abs(doc.texture.scaleX);
      if (!('mirrorX' in formData)) formData.mirrorX = doc.texture.scaleX < 0;
      if (!('mirrorY' in formData)) formData.mirrorY = doc.texture.scaleY < 0;
      formData['texture.scaleX'] = formData.scale * (formData.mirrorX ? -1 : 1);
      formData['texture.scaleY'] = formData.scale * (formData.mirrorY ? -1 : 1);
      ['scale', 'mirrorX', 'mirrorY'].forEach((k) => delete formData[k]);
    }

    // Detection modes
    TokenDataAdapter.correctDetectionModes(doc, formData);
  }

  static correctDetectionModeOrder(data, randomizeFields) {
    if (isNewerVersion('10', game.version)) return;

    const indexMap = {};
    let i = 0;
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('detectionModes')) {
        const comps = k.split('.');
        if (!(comps[1] in indexMap)) {
          indexMap[comps[1]] = i;
          i++;
        }
        const newKey = `detectionModes.${indexMap[comps[1]]}.${comps[2]}`;
        delete data[k];
        data[newKey] = v;
        if (randomizeFields && k in randomizeFields) {
          const rVal = randomizeFields[k];
          delete randomizeFields[k];
          randomizeFields[newKey] = rVal;
        }
      }
    }
  }

  static detectionModeMatch(searchModes, tokenModes) {
    if (isNewerVersion('10', game.version)) return true;
    for (const m1 of searchModes) {
      if (!('id' in m1)) continue; // Ignore mode search attempts without ids as they can't be matched up
      for (const m2 of tokenModes) {
        if (m1.id === m2.id) {
          if ('enabled' in m1 && m1.enabled !== m2.enabled) return false;
          if ('range' in m1 && m1.range !== m2.range) return false;
          break;
        }
      }
    }
    return true;
  }

  static correctDetectionModes(token, data) {
    if (isNewerVersion('10', game.version)) return;

    const detectionModes = [];
    const indexMap = {};
    let i = 0;
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('detectionModes')) {
        const comps = k.split('.');
        if (!(comps[1] in indexMap)) {
          indexMap[comps[1]] = i;
          detectionModes.push({});
          i++;
        }
        const dm = detectionModes[indexMap[comps[1]]];
        dm[comps[2]] = v;
        // data[`${comps[0]}.${indexMap[comps[1]]}.${comps[2]}`] = v;
        delete data[k];
      }
    }

    if (!detectionModes.length) return;

    // Merge current detectionModes assigned to the token and the new ones being added
    const mergedModes = deepClone(token.detectionModes).filter((d) => d.id);
    for (const dm of detectionModes) {
      if (dm.id == null) continue;

      let found = false;
      for (const tdm of mergedModes) {
        if (tdm.id === dm.id) {
          mergeObject(tdm, dm);
          found = true;
          break;
        }
      }
      if (!found) mergedModes.push(mergeObject({ id: '', range: 0, enabled: true }, dm));
    }
    data.detectionModes = mergedModes;
  }

  static presetModify(app, preset) {
    if (isNewerVersion('10', game.version)) return false;
    const pModes = Object.values(foundry.utils.expandObject(preset)?.detectionModes || {});
    if (!pModes.length) return;

    const modes = Object.values(
      foundry.utils.expandObject(app._getSubmitData())?.detectionModes || {}
    );

    const presetClone = deepClone(preset);
    const randomize = preset['mass-edit-randomize'] ?? {};
    const addSubtract = preset['mass-edit-randomize'] ?? {};

    const modCustomFields = function (fields, key, i, k, preset) {
      if (`detectionModes.${i}.${k}` in fields) {
        delete fields[`detectionModes.${i}.${k}`];
        fields[`detectionModes.${j}.${k}`] = preset[key][`detectionModes.${i}.${k}`];
      }
    };

    const startingModeLength = modes.length;
    for (let i = 0; i < pModes.length; i++) {
      if (!('id' in pModes[i])) continue;
      let found = false;
      for (let j = 0; j < startingModeLength; j++) {
        if (pModes[i].id === modes[j].id) {
          found = true;
          Object.keys(pModes[i]).forEach((k) => {
            delete preset[`detectionModes.${i}.${k}`];
            preset[`detectionModes.${j}.${k}`] = presetClone[`detectionModes.${i}.${k}`];
            modCustomFields(randomize, 'mass-edit-randomize', i, k, presetClone);
            modCustomFields(addSubtract, 'mass-edit-addSubtract', i, k, presetClone);
          });
        }
      }
      if (!found) {
        modes.push({ id: '', range: 0, enabled: true });
        Object.keys(pModes[i]).forEach((k) => {
          delete preset[`detectionModes.${i}.${k}`];
          preset[`detectionModes.${modes.length - 1}.${k}`] =
            presetClone[`detectionModes.${i}.${k}`];

          if (`detectionModes.${i}.${k}` in randomize) {
            delete randomize[`detectionModes.${i}.${k}`];
            randomize[`detectionModes.${modes.length - 1}.${k}`] =
              presetClone['mass-edit-randomize'][`detectionModes.${i}.${k}`];
          }
          if (`detectionModes.${i}.${k}` in addSubtract) {
            delete addSubtract[`detectionModes.${i}.${k}`];
            addSubtract[`detectionModes.${modes.length - 1}.${k}`] =
              presetClone['mass-edit-addSubtract'][`detectionModes.${i}.${k}`];
          }
        });
      }
    }

    if (startingModeLength !== modes.length) {
      app._previewChanges({ detectionModes: modes });
      app.render();
      return true;
    }
  }
}

const ADAPTERS = {
  Token: TokenDataAdapter,
  PlaylistSound: PlaylistSoundDataAdapter,
  Note: NoteDataAdapter,
  Tile: TileDataAdapter,
};

export class GeneralDataAdapter {
  static formToData(docName, obj, formData) {
    if (isNewerVersion('10', game.version)) return;
    const adapter = ADAPTERS[docName];
    if (adapter && adapter.formToData) {
      adapter.formToData(obj, formData);
    }
  }

  static dataToForm(docName, obj, formData) {
    if (isNewerVersion('10', game.version)) return;
    const adapter = ADAPTERS[docName];
    if (adapter && adapter.dataToForm) {
      adapter.dataToForm(obj, formData);
    }
  }

  static updateToForm(docName, update) {
    if (isNewerVersion('10', game.version)) return;
    const adapter = ADAPTERS[docName];
    if (adapter && adapter.updateToForm) {
      adapter.updateToForm(update);
    }
  }
}
