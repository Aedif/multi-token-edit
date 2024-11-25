import { pasteDataUpdate } from '../../applications/formUtils.js';
import { getMassEditForm } from '../../applications/multiConfig.js';
import { BrushMenu } from '../brush.js';
import { MODULE_ID, PIVOTS, SUPPORTED_PLACEABLES } from '../constants.js';
import { Scenescape } from '../scenescape/scenescape.js';
import { applyPresetToScene, isAudio, localize } from '../utils.js';
import { PresetAPI, PresetCollection } from './collection.js';
import { PresetConfig } from './editApp.js';
import { Preset } from './preset.js';
import { Spawner } from './spawner.js';
import { FolderState, isVideo } from './utils.js';

export class PresetContainer extends FormApplication {
  constructor(opts1, opts2) {
    super(opts1, opts2);

    // Drag/Drop tracking
    this.dragType = null;
    this.dragData = null;
    this.draggedElements = null;

    this.presetsSortable = opts2.sortable;
    this.presetsDuplicable = opts2.duplicable;
  }

  async getData(options) {
    const data = super.getData(options);

    // Cache partials
    // TODO: Cache at a more appropriate place, so we only need to do it once
    await getTemplate(`modules/${MODULE_ID}/templates/preset/preset.html`, 'me-preset');
    await getTemplate(`modules/${MODULE_ID}/templates/preset/presetFolder.html`, 'me-preset-folder');
    await getTemplate(`modules/${MODULE_ID}/templates/preset/presetsContent.html`, 'me-presets-content');

    return data;
  }

  /**
   * @param {JQuery} html
   */
  activateListeners(html) {
    super.activateListeners(html);

    // =====================
    // Preset multi-select & drag Listeners
    const itemList = html.find('.item-list');

    // Multi-select
    html.on('click', '.item', (event) => {
      itemSelect(event, itemList);
    });

    // Play previews
    html.on('mouseenter', '.item', (event) => {
      this._playPreview(event);
    });
    html.on('mouseleave', '.item', (event) => {
      this._endPreview(event);
    });

    html.on('dragstart', '.item', (event) => {
      this.dragType = 'item';

      const item = $(event.target).closest('.item');

      // Drag has been started on an item that hasn't been selected
      // Assume that this is the only item to be dragged and select it
      if (!item.hasClass('selected')) {
        itemList.find('.item.selected').removeClass('selected').removeClass('last-selected');
        item.addClass('selected').addClass('last-selected');
      }

      const uuids = [];
      itemList.find('.item.selected').each(function () {
        uuids.push($(this).data('uuid'));
      });
      this.dragData = uuids;
      this.draggedElements = itemList.find('.item.selected');

      if (event.originalEvent.dataTransfer) {
        event.originalEvent.dataTransfer.clearData();
        event.originalEvent.dataTransfer.setData('text/plain', JSON.stringify({ uuids }));
      }
    });

    if (this.presetsSortable) {
      html.on('dragleave', '.item.sortable', (event) => {
        $(event.target).closest('.item').removeClass('drag-bot').removeClass('drag-top');
      });

      html.on('dragover', '.item.sortable', (event) => {
        if (this.dragType !== 'item') return;
        if (!this.draggedElements.hasClass('sortable')) return;

        const targetItem = $(event.target).closest('.item');

        // Check that we're not above a selected item  (i.e. item being dragged)
        if (targetItem.hasClass('selected')) return;

        // Determine if mouse is hovered over top, middle, or bottom
        var domRect = event.currentTarget.getBoundingClientRect();
        let prc = event.offsetY / domRect.height;

        if (prc < 0.2) {
          targetItem.removeClass('drag-bot').addClass('drag-top');
        } else if (prc > 0.8) {
          targetItem.removeClass('drag-top').addClass('drag-bot');
        }
      });

      html.on('drop', '.item.sortable', (event) => {
        if (this.lastSearch?.length) return; // Prevent drops while searching
        if (this.dragType !== 'item') return;
        if (!this.draggedElements.hasClass('sortable')) return;

        const targetItem = $(event.target).closest('.item');

        const top = targetItem.hasClass('drag-top');
        targetItem.removeClass('drag-bot').removeClass('drag-top');

        const uuids = this.dragData;
        if (uuids) {
          if (!targetItem.hasClass('selected')) {
            // Move HTML Elements
            (top ? uuids : uuids.reverse()).forEach((uuid) => {
              const item = itemList.find(`.item[data-uuid="${uuid}"]`);
              if (item) {
                if (top) item.insertBefore(targetItem);
                else item.insertAfter(targetItem);
              }
            });

            this._onItemSort(uuids, targetItem.data('uuid'), {
              before: top,
              folderUuid: targetItem.closest('.folder').data('uuid'),
            });
          }
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
      });
    }

    html.on('dragend', '.item', (event) => {
      if (!checkMouseInWindow(event)) {
        this._onPresetDragOut(event);
      }
    });

    // ================
    // Folder Listeners
    html.on('click', '.folder > header', (event) => this._folderToggle($(event.target).closest('.folder')));

    if (this.presetsSortable) {
      html.on('dragstart', '.folder.sortable', (event) => {
        if (this.dragType == 'item') return;
        this.dragType = 'folder';

        const folder = $(event.target).closest('.folder');
        const uuids = [folder.data('uuid')];

        $(event.target)
          .find('.folder')
          .each(function () {
            uuids.push($(this).data('uuid'));
          });

        this.dragData = uuids;
      });

      html.on('dragleave', '.folder.sortable header', (event) => {
        $(event.target).closest('.folder').removeClass('drag-mid').removeClass('drag-top');
      });

      html.on('dragover', '.folder.sortable header', (event) => {
        const targetFolder = $(event.target).closest('.folder');

        if (this.dragType === 'folder') {
          // Check that we're not above folders being dragged
          if (this.dragData.includes(targetFolder.data('uuid'))) return;

          // Determine if mouse is hovered over top, middle, or bottom
          var domRect = event.currentTarget.getBoundingClientRect();
          let prc = event.offsetY / domRect.height;

          if (prc < 0.2) {
            targetFolder.removeClass('drag-mid').addClass('drag-top');
          } else {
            targetFolder.removeClass('drag-top').addClass('drag-mid');
          }
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          targetFolder.addClass('drag-mid');
        }
      });

      html.on('drop', '.folder.sortable header', (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching

        const targetFolder = $(event.target).closest('.folder');

        if (this.dragType === 'folder') {
          const top = targetFolder.hasClass('drag-top');
          targetFolder.removeClass('drag-mid').removeClass('drag-top');

          const uuids = this.dragData;
          if (uuids) {
            if (uuids.includes(targetFolder.data('uuid'))) return;

            const uuid = uuids[0];
            const folder = html.find(`.folder[data-uuid="${uuid}"]`);
            if (folder) {
              // Move HTML Elements
              if (top) folder.insertBefore(targetFolder);
              else targetFolder.find('.folder-items').first().append(folder);

              if (top) {
                this._onFolderSort(uuid, targetFolder.data('uuid'), {
                  inside: false,
                  folderUuid: targetFolder.parent().closest('.folder').data('uuid') ?? null,
                });
              } else {
                this._onFolderSort(uuid, null, {
                  inside: true,
                  folderUuid: targetFolder.data('uuid'),
                });
              }
            }
          }
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          targetFolder.removeClass('drag-mid');
          const uuids = this.dragData;

          // Move HTML Elements
          const presetItems = targetFolder.children('.preset-items');
          uuids?.forEach((uuid) => {
            const item = itemList.find(`.item[data-uuid="${uuid}"]`);
            if (item.length) presetItems.append(item);
          });

          this._onItemSort(uuids, null, {
            folderUuid: targetFolder.data('uuid'),
          });
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
      });

      html.on('drop', '.top-level-preset-items', (event) => {
        if (this._foundryDrop?.(event)) return;
        if (this.lastSearch?.length) return; // Prevent drops while searching
        if (this.dragType === 'folder') {
          // Move HTML Elements
          const target = html.find('.top-level-folder-items');
          const folder = html.find(`.folder[data-uuid="${this.dragData[0]}"]`);
          target.append(folder);

          this._onFolderSort(this.dragData[0], null);
        } else if (this.dragType === 'item' && this.draggedElements.hasClass('sortable')) {
          const uuids = this.dragData;

          // Move HTML Elements
          const target = html.find('.top-level-preset-items');
          uuids?.forEach((uuid) => {
            const item = itemList.find(`.item[data-uuid="${uuid}"]`);
            if (item.length) target.append(item);
          });

          this._onItemSort(uuids, null);
        }

        this.dragType = null;
        this.dragData = null;
        this.draggedElements = null;
      });
    }
    // End of Folder Listeners
    // ================

    html.on('dblclick', '.item', this._onDoubleClickPreset.bind(this));

    // Activate context menu
    this._contextMenu(html.find('.item-list'));
  }

  async _onDoubleClickPreset(event) {
    BrushMenu.close();

    const item = $(event.target).closest('.item');
    const uuid = item.data('uuid');
    if (!uuid) return;

    let preset = await PresetAPI.getPreset({ uuid });

    if (!preset) return;

    if (preset.documentName === 'Scene') {
      ui.notifications.info(`Mass Edit: ${localize('common.apply')} [${preset.name}]`);
      applyPresetToScene(preset);
    }

    if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) return;

    ui.notifications.info(`Mass Edit: ${localize('presets.spawning')} [${preset.name}]`);

    this._setInteractivityState(false);
    await Spawner.spawnPreset({
      preset,
      preview: true,
      layerSwitch: game.settings.get(MODULE_ID, 'presetLayerSwitch'),
      scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling') || Scenescape.active,
      pivot: PIVOTS.CENTER,
    });

    this._setInteractivityState(true);
  }

  async _onRightClickPreset(eventTarget) {
    const item = $(eventTarget).closest('.item');

    // If right-clicked item is not selected, de-select the others and select it
    if (!item.hasClass('selected')) {
      item.closest('.item-list').find('.item.selected').removeClass('selected').removeClass('last-selected');
      item.addClass('selected').addClass('last-selected');
    }
  }

  /**
   * Sets the window app as translucent and inactive to mouse pointer events
   * @param {Boolean} state true = active, false = inactive
   */
  _setInteractivityState(state) {
    if (state) this.element.removeClass('mass-edit-inactive');
    else this.element.addClass('mass-edit-inactive');
  }

  _contextMenu(html) {
    ContextMenu.create(this, html, '.item', this._getItemContextOptions(), {
      hookName: 'MassEditPresetContext',
      onOpen: this._onRightClickPreset.bind(this),
    });
    // ContextMenu.create(this, html, '.folder header', this._getFolderContextOptions(), {
    //   hookName: 'MassEditFolderContext',
    // });
  }

  _getItemContextOptions() {
    return [
      {
        name: localize('CONTROLS.CommonEdit', false),
        icon: '<i class="fas fa-edit"></i>',
        condition: (item) => game.user.isGM && Preset.isEditable(item.data('uuid')),
        callback: (item) => this._onEditSelectedPresets(item),
      },
      {
        name: 'Brush',
        icon: '<i class="fa-solid fa-paintbrush"></i>',
        condition: (item) => game.user.isGM && SUPPORTED_PLACEABLES.includes(item.data('doc-name')),
        callback: (item) => this._onActivateBrush(item),
      },
      {
        name: localize('presets.open-journal'),
        icon: '<i class="fas fa-book-open"></i>',
        condition: (item) => !item.hasClass('virtual'),
        callback: (item) => this._onOpenJournal(item),
      },
      {
        name: localize('presets.apply-to-selected'),
        icon: '<i class="fas fa-arrow-circle-right"></i>',
        condition: (item) =>
          game.user.isGM &&
          SUPPORTED_PLACEABLES.includes(item.data('doc-name')) &&
          canvas.getLayerByEmbeddedName(item.data('doc-name')).controlled.length,
        callback: (item) => this._onApplyToSelected(item),
      },
      {
        name: localize('Duplicate', false),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) =>
          game.user.isGM && this.presetsDuplicable && Preset.isEditable(item.data('uuid')) && !item.hasClass('virtual'),
        callback: (item) =>
          this._onCopySelectedPresets(null, {
            keepFolder: true,
            keepId: false,
          }),
      },
      {
        name: localize('presets.copy-source-to-clipboard'),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => item.data('uuid').startsWith('virtual@'),
        callback: (item) => game.clipboard.copyPlainText(item.data('uuid').substring(8)),
      },
      {
        name: localize('presets.copy-to-clipboard'),
        icon: '<i class="fa-solid fa-copy"></i>',
        condition: (item) => game.user.isGM && $(this.form).find('.item-list').find('.item.selected').length === 1,
        callback: (item) => this._onCopyPresetToClipboard(),
      },
      {
        name: 'Copy UUID',
        icon: '<i class="fa-solid fa-passport"></i>',
        condition: () => game.user.isGM,
        callback: (item) => this._onCopyUUID(item),
      },
      {
        name: localize('presets.export-as-json'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: (item) => this._onExportSelectedPresets(),
      },
      {
        name: localize('presets.export-to-compendium'),
        icon: '<i class="fas fa-file-export fa-fw"></i>',
        condition: () => game.user.isGM && this.presetsDuplicable,
        callback: (item) => this._onExportSelectedPresetsToComp(),
      },
      {
        name: localize('CONTROLS.CommonDelete', false),
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: (item) => game.user.isGM && Preset.isEditable(item.data('uuid')) && !item.hasClass('virtual'),
        callback: (item) => this._onDeleteSelectedPresets(item),
      },
    ];
  }

  _getFolderContextOptions() {
    return [];
  }

  async _onApplyToSelected(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    if (!selected.length) return;

    // Confirm that all presets are of the same document type
    const types = new Set();
    for (const s of selected) {
      types.add(s.documentName);
      if (types.size > 1) {
        ui.notifications.warn(localize('presets.apply-to-selected-warn'));
        return;
      }
    }

    const controlled = canvas.getLayerByEmbeddedName(selected[0].documentName).controlled;
    if (!controlled.length) return;

    for (const s of selected) {
      pasteDataUpdate(controlled, s, false, true);
    }
  }

  async _onCopySelectedPresets(pack, { keepFolder = false, keepId = true } = {}) {
    const [selected, _] = await this._getSelectedPresets();

    const presets = selected.map((s) => {
      const p = s.clone();
      if (!keepFolder) p.folder = null;
      if (!keepId) p.id = foundry.utils.randomID();
      return p;
    });

    await PresetCollection.set(presets, pack);

    if (selected.length) this.render(true);
  }

  async _onActivateBrush(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    BrushMenu.addPresets(selected);
  }

  async _onOpenJournal(item) {
    const [selected, _] = await this._getSelectedPresets({
      editableOnly: false,
    });
    selected.forEach((p) => p.openJournal());
  }

  async _onEditSelectedPresets(item) {
    const [selected, _] = await this._getSelectedPresets({
      virtualOnly: item.hasClass('virtual'),
      editableOnly: true,
    });
    if (selected.length) {
      // Position edit window just bellow the item
      const options = item.offset();
      options.top += item.height();

      this._editPresets(selected, options);
    }
  }

  async _getSelectedPresets({ editableOnly = false, virtualOnly = false, full = true } = {}) {
    const uuids = [];
    let selector = '.item.selected';
    if (virtualOnly) selector += '.virtual';

    let items = this.element.find('.item-list').find(selector);
    if (editableOnly)
      items = items.filter(function () {
        return Preset.isEditable($(this).data('uuid'));
      });

    items.each(function () {
      const uuid = $(this).data('uuid');
      uuids.push(uuid);
    });

    const selected = await PresetCollection.getBatch(uuids, { full });
    return [selected, items];
  }

  _editPresets(presets, options = {}, event) {
    options.callback = () => this.render(true);
    if (!('left' in options) && event) {
      options.left = event.originalEvent.x - PresetConfig.defaultOptions.width / 2;
      options.top = event.originalEvent.y;
    }
    new PresetConfig(presets, options).render(true);
  }

  async _playPreview(event) {
    clearTimeout(this._previewTimeout);
    this._previewTimeout = setTimeout(() => this._renderPlayPreview(event), 200);
  }

  async _endPreview() {
    clearTimeout(this._previewTimeout);
    game.audio.playing.forEach((s) => {
      if (s._mePreview) s.stop();
    });
    if (this._videoPreviewElement) {
      this._videoPreviewElement.remove();
      this._videoPreviewElement = null;
    }
  }

  async _renderPlayPreview(event) {
    await this._endPreview();
    const uuid = $(event.currentTarget).data('uuid');
    if (!uuid) return;

    const preset = await PresetCollection.get(uuid, { full: false });
    if (preset.documentName === 'AmbientSound') {
      const src = isAudio(preset.img) ? preset.img : (await preset.load()).data[0]?.path;
      if (!src) return;
      const sound = await game.audio.play(src);
      sound._mePreview = true;
    } else if (preset.documentName === 'Tile' && preset.thumbnail === 'icons/svg/video.svg') {
      await preset.load();
      const src = preset.data[0].texture?.src;
      if (src && isVideo(src)) {
        if (!this._videoPreviewElement) {
          this._videoPreviewElement = $('<div class="meVideoPreview"></div>');
          $(document.body).append(this._videoPreviewElement);
        } else {
          this._videoPreviewElement.empty();
        }

        const ratio = visualViewport.width / 1024;
        this._videoPreviewElement.append(
          `<video width="${320 * ratio}" height="${240 * ratio}" autoplay loop><source src="${src}" type="video/${src
            .split('.')
            .pop()
            .toLowerCase()}"></video>`
        );
      }
    }
  }

  async _onPresetDragOut(event) {
    const uuid = $(event.originalEvent.target).closest('.item').data('uuid');
    const preset = await PresetCollection.get(uuid);
    if (!preset) return;

    // If released on top of a Mass Edit form, apply the preset to it instead of spawning it
    let form = getMassEditForm();
    if (form && form.documentName === preset.documentName && hoverForm(form, event.pageX, event.pageY)) {
      form._applyPreset(preset);
      return;
    }

    // If release on top of a Preset Bag, pass dragged UUIDs to it
    form = Object.values(ui.windows).find((w) => w.presetBag);
    if (form && hoverForm(form, event.pageX, event.pageY)) {
      form._dropUuids(this.dragData);
      return;
    }

    // If it's a scene preset apply it to the currently active scene
    if (preset.documentName === 'Scene') {
      applyPresetToScene(preset);
      return;
    }

    if (!SUPPORTED_PLACEABLES.includes(preset.documentName)) return;

    // For some reason canvas.mousePosition does not get updated during drag and drop
    // Acquire the cursor position transformed to Canvas coordinates
    let mouseX;
    let mouseY;
    let mouseZ;

    if (game.Levels3DPreview?._active) {
      game.Levels3DPreview.interactionManager._onMouseMove(event, true);
      const { x, y, z } = game.Levels3DPreview.interactionManager.canvas2dMousePosition;
      mouseX = x;
      mouseY = y;
      mouseZ = z;
    } else {
      const [x, y] = [event.clientX, event.clientY];
      const t = canvas.stage.worldTransform;

      mouseX = (x - t.tx) / canvas.stage.scale.x;
      mouseY = (y - t.ty) / canvas.stage.scale.y;

      if (preset.documentName === 'Token' || preset.documentName === 'Tile') {
        mouseX -= canvas.dimensions.size / 2;
        mouseY -= canvas.dimensions.size / 2;
      }
    }

    Spawner.spawnPreset({
      preset,
      x: mouseX,
      y: mouseY,
      z: mouseZ,
      mousePosition: false,
      layerSwitch: game.settings.get(MODULE_ID, 'presetLayerSwitch'),
      scaleToGrid: game.settings.get(MODULE_ID, 'presetScaling'),
    });
  }

  _folderToggle(folderElement) {
    const uuid = folderElement.data('uuid');

    const folder = this.tree.allFolders.get(uuid);
    if (folder.expanded) this._folderCollapse(folderElement, folder);
    else this._folderExpand(folderElement, folder);
  }

  async _folderExpand(folderElement, folder) {
    FolderState.setExpanded(folder.uuid, true);
    folder.expanded = true;

    if (folderElement.find('.folder-items').length) {
      folderElement.removeClass('collapsed');
      folderElement.find('header .folder-icon').first().removeClass('fa-folder-closed').addClass('fa-folder-open');
    } else {
      let content = await renderTemplate(`modules/${MODULE_ID}/templates/preset/presetFolder.html`, {
        folder,
        createEnabled: Boolean(this.configApp),
        callback: Boolean(this.callback),
        sortable:
          !folder.uuid.startsWith('virtual@') && fromUuidSync(folder.uuid)?.pack === PresetCollection.workingPack,
      });
      folderElement.replaceWith(content);
    }
  }

  _folderCollapse(folderElement, folder) {
    folderElement.addClass('collapsed');
    folderElement.find('header .folder-icon').first().removeClass('fa-folder-open').addClass('fa-folder-closed');

    FolderState.setExpanded(folder.uuid, false);
    folder.expanded = false;
  }

  async _onItemSort(sourceUuids, targetUuid, { before = true, folderUuid = null } = {}) {
    throw new Error('A subclass of the PresetContainer must implement the _onItemSort method.');
  }

  async _onFolderDelete(uuid, { render = true, deleteAll = false } = {}) {
    throw new Error('A subclass of the PresetContainer must implement the _onFolderDelete method.');
  }

  async _onExportSelectedPresetsToComp() {
    throw new Error('A subclass of the PresetContainer must implement the _onExportSelectedPresetsToComp method.');
  }

  async _onDeleteSelectedPresets(item) {
    throw new Error('A subclass of the PresetContainer must implement the _onDeleteSelectedPresets method.');
  }
}

/**
 * Controls select/multi-select flow for item lists
 * @param {*} e item click event
 * @param {*} itemList list of items that this item exists within
 */
export function itemSelect(e, itemList) {
  const item = $(e.target).closest('.item');
  const items = itemList.find('.item');
  const lastSelected = items.filter('.last-selected');

  if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
    lastSelected.removeClass('last-selected');
    items.removeClass('selected');
    item.addClass('selected').addClass('last-selected');
  } else if (e.ctrlKey || e.metaKey) {
    item.toggleClass('selected');
    if (item.hasClass('selected')) {
      lastSelected.removeClass('last-selected');
      item.addClass('last-selected');
    } else item.removeClass('last-index');
  } else if (e.shiftKey) {
    if (lastSelected.length) {
      let itemIndex = items.index(item);
      let lastSelectedIndex = items.index(lastSelected);

      if (itemIndex === lastSelectedIndex) {
        item.toggleClass('selected');
        if (item.hasClass('selected')) item.addClass('last-selected');
        else lastSelected.removeClass('last-selected');
      } else {
        let itemArr = items.toArray();
        if (itemIndex > lastSelectedIndex) {
          for (let i = lastSelectedIndex; i <= itemIndex; i++) $(itemArr[i]).addClass('selected');
        } else {
          for (let i = lastSelectedIndex; i >= itemIndex; i--) $(itemArr[i]).addClass('selected');
        }
      }
    } else {
      lastSelected.removeClass('last-selected');
      item.toggleClass('selected');
      if (item.hasClass('selected')) item.addClass('last-selected');
    }
  }
}

function checkMouseInWindow(event) {
  let inWindow = false;

  if (ui.sidebar?.element?.length) {
    inWindow = _coordOverElement(event.pageX, event.pageY, ui.sidebar.element);
  }
  if (!inWindow) {
    inWindow = _coordOverElement(event.pageX, event.pageY, $(event.target).closest('.window-app'));
  }

  return inWindow;
}

function _coordOverElement(x, y, element) {
  var offset = element.offset();
  let appX = offset.left;
  let appY = offset.top;
  let appW = element.width();
  let appH = element.height();

  if (x > appX && x < appX + appW && y > appY && y < appY + appH) {
    return true;
  }
  return false;
}

/**
 * Return true if mouse is hovering over the provided form
 * @param {Number} mouseX
 * @param {Number} mouseY
 * @returns {Application|null} MassEdit form
 */
function hoverForm(form, mouseX, mouseY) {
  if (!form) return false;

  const hitTest = function (app) {
    const position = app.position;
    const appX = position.left;
    const appY = position.top;
    const height = Number.isNumeric(position.height) ? position.height : $(app.element).height();
    const width = Number.isNumeric(position.width) ? position.width : $(app.element).width();

    if (mouseX > appX && mouseX < appX + width && mouseY > appY && mouseY < appY + height) return true;
    return false;
  };

  return hitTest(form);
}
