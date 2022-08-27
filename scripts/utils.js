// To get rid of v10 warnings
export function emptyObject(obj) {
  if (isNewerVersion('10', game.version)) {
    return foundry.utils.isObjectEmpty(obj);
  } else {
    return foundry.utils.isEmpty(obj);
  }
}

// To get rid of v10 warnings
export function getData(obj) {
  if (isNewerVersion('10', game.version)) {
    return obj.data;
  } else {
    return obj.document ? obj.document : obj;
  }
}
