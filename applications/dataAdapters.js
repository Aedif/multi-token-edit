import { emptyObject } from '../scripts/utils.js';

export class TokenDataAdapter {
  static dataToForm(token, data) {
    if (isNewerVersion('10', game.version)) return;
    data.scale = Math.abs(token.document.texture.scaleX);
    data.mirrorX = token.document.texture.scaleX < 0;
    data.mirrorY = token.document.texture.scaleY < 0;
  }

  static formToData(token, formData) {
    if (isNewerVersion('10', game.version)) return;

    // Scale/mirroring
    if ('scale' in formData || 'mirrorX' in formData || 'mirrorY' in formData) {
      if (!('scale' in formData)) formData.scale = Math.abs(token.texture.scaleX);
      if (!('mirrorX' in formData)) formData.mirrorX = token.texture.scaleX < 0;
      if (!('mirrorY' in formData)) formData.mirrorY = token.texture.scaleY < 0;
      formData['texture.scaleX'] = formData.scale * (formData.mirrorX ? -1 : 1);
      formData['texture.scaleY'] = formData.scale * (formData.mirrorY ? -1 : 1);
      ['scale', 'mirrorX', 'mirrorY'].forEach((k) => delete formData[k]);
    }

    // Detection modes
    TokenDataAdapter.correctDetectionModes(token, formData);
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
            if (`detectionModes.${i}.${k}` in randomize) {
              delete randomize[`detectionModes.${i}.${k}`];
              randomize[`detectionModes.${j}.${k}`] =
                presetClone['mass-edit-randomize'][`detectionModes.${i}.${k}`];
            }
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
