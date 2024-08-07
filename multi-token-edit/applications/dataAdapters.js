class PlaylistSoundDataAdapter {
  static formToData(obj, formData) {
    if ('lvolume' in formData) {
      formData['volume'] = AudioHelper.inputToVolume(formData['lvolume']);
      delete formData['lvolume'];
    }
  }

  static dataToForm(note, data) {
    data['lvolume'] = (note.document ?? note).volume;
  }

  static updateToForm(update) {
    if ('volume' in update) {
      update['lvolume'] = AudioHelper.volumeToInput(update['volume']);
      delete update.volume;
    }
  }
}

class NoteDataAdapter {
  static formToData(obj, formData) {
    if ('icon.selected' in formData || 'icon.custom' in formData) {
      formData['texture.src'] = formData['icon.selected'] || formData['icon.custom'];
      delete formData['icon.selected'];
      delete formData['icon.custom'];
    }
  }

  static dataToForm(note, data) {
    const doc = note.document ?? note;
    if (doc.texture?.src != null) {
      data['icon.selected'] = doc.texture.src;
      data['icon.custom'] = doc.texture.src;
    }
  }
}

export class TokenDataAdapter {
  static updateToForm(update) {
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
    const doc = token.document ?? token;
    if (doc.texture?.scaleX != null) data.scale = Math.abs(doc.texture.scaleX);
    if (doc.texture?.scaleX != null) data.mirrorX = doc.texture.scaleX < 0;
    if (doc.texture?.scaleY != null) data.mirrorY = doc.texture.scaleY < 0;
  }

  static formToData(token, formData) {
    const doc = token.document ?? token;

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
    const mergedModes = foundry.utils.deepClone(token.detectionModes).filter((d) => d.id);
    for (const dm of detectionModes) {
      if (dm.id == null) continue;

      let found = false;
      for (const tdm of mergedModes) {
        if (tdm.id === dm.id) {
          foundry.utils.mergeObject(tdm, dm);
          found = true;
          break;
        }
      }
      if (!found) mergedModes.push(foundry.utils.mergeObject({ id: '', range: 0, enabled: true }, dm));
    }
    data.detectionModes = mergedModes;
  }

  static modifyPresetData(app, data) {
    const pModes = Object.values(foundry.utils.expandObject(data)?.detectionModes || {});
    if (!pModes.length) return;

    const modes = Object.values(foundry.utils.expandObject(app._getSubmitData())?.detectionModes || {});

    const dataClone = foundry.utils.deepClone(data);
    const randomize = data['mass-edit-randomize'] ?? {};
    const addSubtract = data['mass-edit-addSubtract'] ?? {};

    const modCustomFields = function (fields, key, i, k, data) {
      if (`detectionModes.${i}.${k}` in fields) {
        delete fields[`detectionModes.${i}.${k}`];
        fields[`detectionModes.${j}.${k}`] = data[key][`detectionModes.${i}.${k}`];
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
            delete data[`detectionModes.${i}.${k}`];
            data[`detectionModes.${j}.${k}`] = dataClone[`detectionModes.${i}.${k}`];
            modCustomFields(randomize, 'mass-edit-randomize', i, k, dataClone);
            modCustomFields(addSubtract, 'mass-edit-addSubtract', i, k, dataClone);
          });
        }
      }
      if (!found) {
        modes.push({ id: '', range: 0, enabled: true });
        Object.keys(pModes[i]).forEach((k) => {
          delete data[`detectionModes.${i}.${k}`];
          data[`detectionModes.${modes.length - 1}.${k}`] = dataClone[`detectionModes.${i}.${k}`];

          if (`detectionModes.${i}.${k}` in randomize) {
            delete randomize[`detectionModes.${i}.${k}`];
            randomize[`detectionModes.${modes.length - 1}.${k}`] =
              dataClone['mass-edit-randomize'][`detectionModes.${i}.${k}`];
          }
          if (`detectionModes.${i}.${k}` in addSubtract) {
            delete addSubtract[`detectionModes.${i}.${k}`];
            addSubtract[`detectionModes.${modes.length - 1}.${k}`] =
              dataClone['mass-edit-addSubtract'][`detectionModes.${i}.${k}`];
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
};

export class GeneralDataAdapter {
  static formToData(documentName, obj, formData) {
    const adapter = ADAPTERS[documentName];
    if (adapter && adapter.formToData) {
      adapter.formToData(obj, formData);
    }
  }

  static dataToForm(documentName, obj, formData) {
    const adapter = ADAPTERS[documentName];
    if (adapter && adapter.dataToForm) {
      adapter.dataToForm(obj, formData);
    }
  }

  static updateToForm(documentName, update) {
    const adapter = ADAPTERS[documentName];
    if (adapter && adapter.updateToForm) {
      adapter.updateToForm(update);
    }
  }
}
