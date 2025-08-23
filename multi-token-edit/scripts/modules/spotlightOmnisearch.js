/**
 * TODO: remove dependency to getTree(...)
 * Build preset index for 'Spotlight Omnisearch' module
 * @param {Array[CONFIG.SpotlightOmnisearch.SearchTerm]} soIndex
 */
export async function buildSpotlightOmnisearchIndex(soIndex) {
  const tree = await PresetCollection.getTree(null, { externalCompendiums: true });

  const SearchTerm = CONFIG.SpotlightOmnisearch.SearchTerm;

  const onClick = async function () {
    if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
      ui.spotlightOmnisearch?.setDraggingState(true);
      await Spawner.spawnPreset({
        preset: this.data,
        preview: true,
        scaleToGrid: PresetBrowser.CONFIG.autoScale,
      });
      ui.spotlightOmnisearch?.setDraggingState(false);
    }
  };

  const onDragEnd = function (event) {
    if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
      const { x, y } = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      Spawner.spawnPreset({
        preset: this.data,
        x,
        y,
        scaleToGrid: PresetBrowser.CONFIG.autoScale,
      });
    } else if (this.data.documentName === 'Scene') {
      applyPresetToScene(this.data);
    }
  };

  const deactivateCallback = function () {
    ui.spotlightOmnisearch?.setDraggingState(false);
  };

  const getActions = function () {
    const actions = [
      {
        name: 'MassEdit.presets.open-journal',
        icon: '<i class="fas fa-book-open fa-fw"></i>',
        callback: () => {
          this.data.openJournal();
        },
      },
    ];
    if (SUPPORTED_PLACEABLES.includes(this.data.documentName)) {
      actions.push({
        name: `MassEdit.presets.controls.activate-brush`,
        icon: '<i class="fas fa-paint-brush"></i>',
        callback: async () => {
          canvas.getLayerByEmbeddedName(this.data.documentName)?.activate();
          if (Brush.activate({ preset: await this.data.load(), deactivateCallback })) {
            ui.spotlightOmnisearch.setDraggingState(true);
          }
        },
      });
    }
    return actions;
  };

  const buildTerm = function (preset) {
    soIndex.push(
      new SearchTerm({
        name: preset.name,
        description: 'Mass Edit: Preset',
        type: preset.documentName + ' preset',
        img: preset.img,
        icon: ['fa-solid fa-books', preset.icon],
        keywords: preset.tags,
        onClick,
        onDragEnd,
        data: preset,
        actions: getActions,
      })
    );
  };

  tree.presets.forEach(buildTerm);
  tree.allFolders.forEach((f) => f.presets.forEach(buildTerm));
}
