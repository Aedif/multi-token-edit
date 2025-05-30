export async function applyDDTint(placeable, color) {
  placeable = placeable.object ?? placeable;
  color = _string2hex(color);
  if (placeable instanceof foundry.canvas.placeables.PlaceableObject) {
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
  } else {
    let filters = placeable['flags.tokenmagic.filters'];
    if (isNaN(color)) {
      if (filters) {
        placeable['flags.tokenmagic.filters'] = filters.filter((f) => f.tmFilters.filterId !== 'DDTint');
      }
    } else {
      filters = (filters ?? []).filter((f) => f.tmFilters.filterId !== 'DDTint');
      filters.push({
        tmFilters: {
          tmFilterId: 'DDTint',
          tmFilterInternalId: foundry.utils.randomID(),
          tmFilterType: 'ddTint',
          filterOwner: game.data.userId,
          tmParams: {
            tmFilterType: 'ddTint',
            filterId: 'DDTint',
            tint: PIXI.utils.hex2rgb(color),
            updateId: foundry.utils.randomID(),
            rank: 10000,
            enabled: true,
            filterOwner: game.data.userId,
          },
        },
      });
      placeable['flags.tokenmagic.filters'] = filters;
    }
  }
}

export function getDDTint(placeable) {
  let color = 0xff0000;
  let obj = placeable.object ?? placeable;
  if (obj._TMFXgetSprite) {
    const filter = obj._TMFXgetSprite()?.filters?.find((f) => f.filterId === 'DDTint');
    if (filter) color = PIXI.utils.rgb2hex(filter.uniforms.tint);
  }
  return _hex2string(color);
}

export async function applyTMFXPreset(placeable, presetName, remove = false) {
  placeable = placeable.object ?? placeable;
  if (!(placeable instanceof foundry.canvas.placeables.PlaceableObject)) return;
  if (presetName === 'DELETE ALL') {
    await TokenMagic.deleteFilters(placeable);
  } else if (remove) {
    await TokenMagic.deleteFilters(placeable, presetName);
  } else {
    const preset = TokenMagic.getPreset(presetName);
    if (preset) await TokenMagic.addUpdateFilters(placeable, foundry.utils.deepClone(preset));
  }
}

function _hex2string(color) {
  if (PIXI.Color) {
    return new PIXI.Color(color).toHex();
  } else {
    return PIXI.utils.hex2string(color);
  }
}

function _string2hex(color) {
  if (PIXI.Color) {
    return new PIXI.Color(color).toNumber();
  } else {
    return PIXI.utils.string2hex(color);
  }
}
