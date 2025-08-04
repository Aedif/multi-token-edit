import { MODULE_ID } from '../constants.js';
import { Preset } from '../presets/preset.js';
import { isAudio, isImage, isVideo, loadImageVideoDimensions } from '../utils.js';

export async function uploadFiles(files, subDirectory = 'canvas', singlePreset = false) {
  let { source, bucket, target } = game.settings.get(MODULE_ID, 'dragUpload');
  target += '/' + subDirectory + '/';

  const uploadedFiles = [];

  for (const file of files) {
    const name = file.name;

    let type;
    if (isVideo(name)) type = 'video';
    else if (isAudio(name)) type = 'audio';
    else if (isImage(name)) type = 'image';
    else {
      console.warn(`Invalid file format: ${name}`);
      continue;
    }

    const path = target + type;

    try {
      await checkCreateUploadFolder(path, source, bucket);
    } catch (e) {
      console.error(e);
      continue;
    }

    const result = await foundry.applications.apps.FilePicker.upload(
      source,
      path,
      file,
      {},
      source === 's3' ? { bucket } : {}
    );

    if (result.status === 'success') uploadedFiles.push(result.path);
    else console.warn('Failed to upload: ' + file.name, result);
  }

  return filesToPresets(uploadedFiles, singlePreset);
}

/**
 * Check if a folder exists, if not attempts to create it
 * @param {string} target
 * @param {string} source
 * @param {string} bucket
 * @returns {boolean} true if a folder exists, false if it doesn't
 */
async function checkCreateUploadFolder(target, source, bucket) {
  // Attempt to browse the folder
  // If the operation throws an error it means the folder does not exists and we will attempt to create it
  try {
    await foundry.applications.apps.FilePicker.browse(source, target, source === 's3' ? { bucket } : {});
    return true;
  } catch (e) {
    const folders = target.split('/');
    if (folders.length > 1)
      await checkCreateUploadFolder(folders.slice(0, folders.length - 1).join('/'), source, bucket);
    await FilePicker.createDirectory(source, target, source === 's3' ? { bucket } : {});
  }

  await foundry.applications.apps.FilePicker.browse(source, target, source === 's3' ? { bucket } : {});
}

async function filesToPresets(files, singlePreset = false) {
  const settings = game.settings.get(MODULE_ID, 'dragUpload');
  const presets = [];

  const templatePresets = {};
  const getTemplatePreset = async function (documentName) {
    if (!templatePresets[documentName]) {
      if (settings.presets[documentName])
        templatePresets[documentName] = await MassEdit.getPreset({
          uuid: settings.presets[documentName],
          full: true,
        });
      if (!templatePresets[documentName]) templatePresets[documentName] = new Preset({ documentName, data: [{}] });
    }
    return templatePresets[documentName].clone();
  };

  for (const src of files) {
    if (isImage(src) || isVideo(src)) {
      const template = await getTemplatePreset(
        game.keyboard.isModifierActive(foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.SHIFT)
          ? 'Token'
          : 'Tile'
      );
      const data = template.data[0];

      foundry.utils.setProperty(data, 'texture.src', src);
      if ((!data.width || !data.height) && template.documentName === 'Tile') {
        const { width, height } = await loadImageVideoDimensions(src);
        if (!data.width && !data.height) {
          data.width = width;
          data.height = height;
        } else if (!data.width) {
          data.width = width * (data.height / height);
        } else if (!data.height) {
          data.height = height * (data.width / width);
        }
      }
      template.img = src;
      template.name = src.split('/').pop().split('.')[0];
      presets.push(template);
    } else if (isAudio(src)) {
      const template = await getTemplatePreset('AmbientSound');
      template.data[0].path = src;
      template.name = src.split('/').pop().split('.')[0];
      presets.push(template);
    }
  }

  presets.forEach((p) => {
    p.id = foundry.utils.randomID();
  });

  if (presets.length > 1 && singlePreset) {
    return [packPresets(presets)];
  }

  return presets;
}

function packPresets(presets) {
  const rectangles = presets.map((p) => {
    const data = p.data[0];
    if (p.documentName === 'Tile') {
      return { width: data.width, height: data.height, preset: p };
    } else if (p.documentName === 'Token') {
      return { width: (data.width ?? 0) * canvas.dimensions.size, height: (data.height ?? 0) * canvas.dimensions.size };
    } else {
      //AmbientSound
      const radius = ((data.radius ?? 20) / canvas.dimensions.distance) * canvas.dimensions.size;
      return { width: radius * 2, height: radius * 2, preset: p };
    }
  });

  let containerWidth = Math.ceil(Math.sqrt(rectangles.reduce((sum, r) => sum + r.width * r.height, 0)));
  let shelfY = 0;
  let shelfHeight = 0;
  let shelfX = 0;

  for (let rect of rectangles) {
    const { width, height } = rect;

    // New shelf needed
    if (shelfX + width > containerWidth) {
      shelfY += shelfHeight;
      shelfX = 0;
      shelfHeight = 0;
    }

    // Place rectangle
    rect.preset.data[0].x = shelfX;
    rect.preset.data[0].y = shelfY;
    if (rect.preset.documentName === 'AmbientSound') {
      rect.preset.data[0].x += width / 2;
      rect.preset.data[0].y += height / 2;
    }

    shelfX += width;
    shelfHeight = Math.max(shelfHeight, height);
  }

  const mainPreset =
    presets.find((p) => p.documentName === 'Token') ?? presets.find((p) => p.documentName === 'Tile') ?? presets[0];

  for (const preset of presets) {
    if (!preset.id === mainPreset.id) continue;

    if (preset.documentName === mainPreset.documentName) {
      mainPreset.data = mainPreset.data.concat(preset.data);
    } else {
      mainPreset.attached = mainPreset.attached.concat(
        preset.data.map((d) => {
          return { documentName: preset.documentName, data: d };
        })
      );
    }
  }

  mainPreset.name = 'Multi Preset';

  return mainPreset;
}
