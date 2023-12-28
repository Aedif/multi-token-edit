import { MODULE_ID, localize } from '../../scripts/utils.js';

export function constructNav(allData, documentName, customControls, pins = true) {
  const nav = {
    dataGroup: 'main',
    items: [],
    tabs: [],
  };
  const tabSelectors = [{ navSelector: '.tabs[data-group="main"]', contentSelector: 'form', initial: 'me-pinned' }];

  // Limit the form to just the keys marked as editable
  let editableKeys;
  // if (documentName === 'Actor') {
  //   editableKeys = ['name', 'img', 'system', 'data', 'folder', 'flags'];
  // }

  let object = {};
  if (!editableKeys) object = allData;
  else {
    for (const k of editableKeys) {
      if (k in allData) {
        object[k] = allData[k];
      }
    }
  }

  const pinned = documentName ? game.settings.get(MODULE_ID, 'pinnedFields')[documentName] || {} : {};

  _constructControls(nav, object, tabSelectors, '', pinned, customControls, pins);

  const pinned_groups = [];
  const flatObject = foundry.utils.flattenObject(object);
  for (const [k, v] of Object.entries(pinned)) {
    const value = k in flatObject ? flatObject[k] : v.value;

    let control = genControl(foundry.utils.getType(value), v.label, value, k, {}, true, customControls, pins);
    control.pinned = true;
    pinned_groups.push(control);
  }
  if (pinned_groups.length) {
    // No tabs constructed means this is not a nested object, however since we have pinned fields
    // we need to separate main object fields from the pinned ones
    if (!nav.items.length) {
      nav.items.push({ dataTab: 'main-me-main', label: 'Main' });
      nav.tabs.push({ dataTab: 'main-me-main', groups: nav.groups });
      delete nav.groups;
    }

    nav.items.unshift({
      dataTab: 'me-pinned',
      dataTab: 'me-pinned',
      label: localize('generic-form.pinned'),
    });
    nav.tabs.unshift({ dataTab: 'me-pinned', groups: pinned_groups });
  }

  return [nav, tabSelectors];
}

function _constructControls(nav, data, tabSelectors, name, pinned, customControls, pins) {
  const groups = [];
  let containsNav = false;
  for (const [k, v] of Object.entries(data)) {
    const name2 = name ? name + '.' + k : k;
    if (v !== null) {
      let t = foundry.utils.getType(v);
      let control;
      if (t === 'Object') {
        if (_hasNonNullKeys(v)) {
          nav.items.push({ dataTab: name2, label: _genLabel(k) });
          const newNav = { dataGroup: name2, items: [], tabs: [] };
          nav.tabs.push({ dataTab: name2, nav: newNav });
          tabSelectors.push({
            navSelector: `.tabs[data-group="${name2}"]`,
            contentSelector: `.tab[data-tab="${name2}"]`,
            initial: k + '-me-main',
          });
          _constructControls(newNav, v, tabSelectors, name2, pinned, customControls, pins);
          containsNav = true;
        }
      } else {
        control = genControl(t, _genLabel(k), v, name2, pinned, false, customControls, pins);
      }
      if (control) {
        groups.push(control);
      }
    }
  }

  if (groups.length) {
    if (containsNav) {
      nav.items.unshift({
        dataTab: nav.dataGroup + '-me-main',
        label: 'Main',
      });
      nav.tabs.unshift({
        dataTab: nav.dataGroup + '-me-main',
        groups,
      });
    } else {
      nav.groups = groups;
    }
  }
}

function _hasNonNullKeys(obj) {
  if (foundry.utils.isEmpty(obj)) return false;
  for (const [k, v] of Object.entries(obj)) {
    if (foundry.utils.getType(v) === 'Object') {
      if (_hasNonNullKeys(v)) return true;
    } else if (v != null) return true;
  }
  return false;
}

function _genLabel(key) {
  if (key.length <= 3) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const IMAGE_FIELDS = ['img', 'image', 'src', 'texture'];
const COLOR_FIELDS = ['tint'];

export function isColorField(name) {
  name = name.split('.').pop();
  return COLOR_FIELDS.includes(name) || name.toLowerCase().includes('color');
}

function genControl(type, label, value, name, pinned, editableLabel = false, customControls = {}, pins) {
  const allowedArrayElTypes = ['number', 'string'];

  let control = { label: label, value, name, editableLabel, pins };
  if (getProperty(customControls, name)) {
    control = foundry.utils.mergeObject(control, getProperty(customControls, name));
  } else if (type === 'number') {
    control.number = true;
    const varName = name.split('.').pop();
    if (isColorField(varName)) {
      control.colorPickerNumber = true;
      try {
        control.colorValue = new Color(value).toString();
      } catch (e) {}
    }
  } else if (type === 'string') {
    control.text = true;
    const varName = name.split('.').pop();
    if (
      IMAGE_FIELDS.includes(varName) ||
      varName.toLowerCase().includes('image') ||
      varName.toLowerCase().includes('path')
    )
      control.filePicker = true;
    else if (isColorField(varName)) control.colorPicker = true;
  } else if (type === 'boolean') {
    control.boolean = true;
  } else if (type === 'Array' && value.every((el) => allowedArrayElTypes.includes(foundry.utils.getType(el)))) {
    control.value = value.join(', ');
    control.array = true;
  } else if (type === 'Array') {
    control.jsonArray = true;
    control.value = JSON.stringify(value, null, 2);
  } else {
    control.disabled = true;
    control.text = true;
    control.editableLabel = false;
  }
  if (control && name in pinned) {
    control.pinned = true;
    control.disabled = true;
    control.name = null;
  }
  return control;
}
