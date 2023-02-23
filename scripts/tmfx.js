export async function applyDDTint(placeable, color) {
  color = PIXI.utils.string2hex(color);
  if (isNaN(color)) {
    await TokenMagic.deleteFilters(placeable, 'DDTint');
  } else {
    await TokenMagic.addUpdateFilters(placeable, [
      {
        filterType: 'ddTint',
        filterId: 'DDTint',
        tint: PIXI.utils.hex2rgb(color),
      },
    ]);
  }
}

export function getDDTint(placeable) {
  let color = 0xff0000;
  if (placeable._TMFXgetSprite) {
    const filter = placeable._TMFXgetSprite()?.filters?.find((f) => f.filterId === 'DDTint');
    if (filter) color = PIXI.utils.rgb2hex(filter.uniforms.tint);
  }
  return PIXI.utils.hex2string(color);
}

export async function applyTMFXPreset(placeable, presetName, remove = false) {
  if (presetName === 'DELETE ALL') {
    await TokenMagic.deleteFilters(placeable);
  } else if (remove) {
    await TokenMagic.deleteFilters(placeable, presetName);
  } else {
    const preset = TokenMagic.getPreset(presetName);
    if (preset) await TokenMagic.addUpdateFilters(placeable, deepClone(preset));
  }
}
