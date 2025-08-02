import { MODULE_ID } from '../constants.js';
import { VirtualFilePreset } from '../presets/preset.js';
import { isAudio, isImage, isVideo } from '../utils.js';

export function registerDragUploadHooks() {
  Hooks.on('dropCanvasData', async (canvas, point, event) => {
    if (
      !event.dataTransfer.files?.length ||
      !foundry.utils.isEmpty(foundry.applications.ux.TextEditor.implementation.getDragEventData(event))
    )
      return;
    const { imageVideo, audio, text } = await uploadFiles(event.dataTransfer.files, 'canvas');
    if (imageVideo.length) {
      const preset = new VirtualFilePreset({ name: 'DragDrop', src: imageVideo[0] });
      MassEdit.spawnPreset({ preset, x: point.x, y: point.y, pivot: MassEdit.PIVOTS.CENTER });
    }
  });
}

export class DragUploadSettingsApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor() {
    super();
    this._settings = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'dragUpload'));
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-drag-upload-settings`,
    tag: 'form',
    form: {
      handler: DragUploadSettingsApp._onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
    window: {
      contentClasses: ['standard-form'],
      title: `Drag Upload Settings`,
    },
    position: {
      width: 600,
      height: 'auto',
    },
    actions: {
      performUpdate: DragUploadSettingsApp._onPerformUpdate,
      browse: DragUploadSettingsApp._onBrowse,
    },
  };

  /** @override */
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/dragUploadSettings.hbs` },
    footer: { template: 'templates/generic/form-footer.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.buttons = [
      { type: 'button', icon: 'fa-solid fa-floppy-disk', label: 'SETTINGS.Save', action: 'performUpdate' },
    ];

    return Object.assign(context, this._settings);
  }

  /**
   * Process form data
   */
  static async _onSubmit(event, form, formData) {
    const settings = foundry.utils.expandObject(formData.object);
    foundry.utils.mergeObject(this._settings, settings);
  }

  static async _onPerformUpdate(event) {
    game.settings.set(MODULE_ID, 'dragUpload', this._settings);
    this.close();
  }

  static async _onBrowse(event) {
    const { source, bucket, target } = this._settings;

    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: 'folder',
      allowUpload: true,
      callback: (target, fp) => {
        this._settings.source = fp.activeSource;
        this._settings.target = target;
        this._settings.bucket = fp.source.bucket;
        this.render(true);
      },
    });
    fp.source.target = target;
    fp.source.bucket = bucket;
    fp.activeSource = source;
    fp.browse();
  }
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

export async function uploadFiles(files, subDirectory = 'canvas') {
  let { source, bucket, target } = game.settings.get(MODULE_ID, 'dragUpload');
  target += '/' + subDirectory + '/';

  const uploadedFiles = { audio: [], image: [], video: [], text: [] };

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

    if (result.status === 'success') uploadedFiles[type].push(result.path);
    else console.warn('Failed to upload: ' + file.name, result);
  }

  uploadedFiles.imageVideo = uploadedFiles.image.concat(uploadedFiles.video);

  return uploadedFiles;
}
