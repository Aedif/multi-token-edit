// Levels `rangeBottom` flag replaced with `elevation` property
function migrateFunc(data, documentName) {
  const oldBottom = data.flags?.levels?.rangeBottom;
  if (Number.isNumeric(oldBottom)) {
    delete data.flags.levels.rangeBottom;
    data.elevation = oldBottom;

    if (documentName === 'Drawing') data.interface = true;
  }

  const elevation = data.flags?.['token-attacher']?.offset?.elevation;
  if (elevation) {
    const oldBottom = elevation.flags?.levels?.rangeBottom;
    if (Number.isNumeric(oldBottom)) {
      delete elevation.flags.levels.rangeBottom;
      elevation.elevation = oldBottom;
    }
  }
}

MassEdit.migrateAllPacks({ coreMigration: true, migrateFunc });
