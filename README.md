![GitHub Latest Version](https://img.shields.io/github/v/release/Aedif/multi-token-edit?sort=semver)
![GitHub Latest Release](https://img.shields.io/github/downloads/Aedif/multi-token-edit/latest/multi-token-edit.zip)
![GitHub All Releases](https://img.shields.io/github/downloads/Aedif/multi-token-edit/multi-token-edit.zip)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fmulti-token-edit)](https://forge-vtt.com/bazaar#package=multi-token-edit)

# Mass Edit

FoundryVTT module for searching and editing multiple placeables at the same time.

Support me on [Patreon](https://www.patreon.com/Aedif) to get access to the the version that supports field [Randomization](#randomization).

_Note that all keybinding referenced bellow can be changed via 'Configure Controls'_

#### Recommended modules:

- Select Tool Everywhere (https://foundryvtt.com/packages/select-tool-everywhere)
  - Will allow to select normally un-selectable placeables such as lights and templates
- Multiple Document Selection (https://foundryvtt.com/packages/multiple-document-selection)
  - Will enable selection of multiple documents in the sidebar
  - Mass Edit will recognise these selections for Actors, Scenes, and Journals
- Token Attacher (https://foundryvtt.com/packages/token-attacher/)
  - Allows to store groups of placeables as a single token preset

#### Showcases by Foundry community members

- v1.9.1 covered by BaileyWiki [YouTube](https://www.youtube.com/watch?v=_X5NHwiw0Cw).
- v1.13.0 covered in German by TomVTT [YouTube](https://www.youtube.com/watch?v=j7gUJHveU7s)
- Configure TMFX filters with Mass Edit by BaileyWiki [YouTube](https://www.youtube.com/watch?v=KvNCcFsDVDE)

## Editing

Select the placeables you wish to edit and press '**Shift+E**'.

You will be presented with the following modified 'Configuration' window:

![image](https://user-images.githubusercontent.com/7693704/179863478-b651523d-d669-4821-8dc4-cf17ca9c87eb.png)

Common data shared between all placeables will be highlighted as green, differing data as orange, and flags as purple. The newly added checkboxes to the right indicate which fields will be saved on Apply.

In addition to this key-binding Token and Tile HUDs will contain a new button if multiple tokens or tiles are selected which will also open up this modified configuration window.

![simpleEdit](https://user-images.githubusercontent.com/7693704/184878288-e6f9294b-f988-4a3b-9a7b-5e6769f639e4.gif)

## Search

An alternative to selecting placeables manually is to press '**Shift+F**' to open a configuration window which will allow you to perform scene and world wide searches using the selected fields.

Text fields allow the use of wildcards: `*`

- Goblin\*
- \*Goblin
- \*Go\*n\*

![simpleSearch](https://user-images.githubusercontent.com/7693704/184878790-ac87fb25-477c-4307-9b4d-74244aee6ac2.gif)

## Copy/Paste

Field can be copied from opened Mass Edit forms using 'Ctrl+C'. Data copied this way can be pasted onto any selected or hovered over placeables using 'Ctrl+V'. Each placeable type has it's own "clipboard" from which data will be pasted.
You can also paste this data as plaintext in and out of foundry.

![copytPaste](https://github.com/Aedif/multi-token-edit/assets/7693704/b37fe2c1-593a-4a43-b759-7a6d7b8d9363)

## Presets

Any configuration window opened using the module will have a 'Presets' header button. It will open up a window where you can store currently selected fields and re-use them later. Alternatively you can drag in a placeable from the canvas onto the form to create a preset from it.

![image](https://github.com/Aedif/multi-token-edit/assets/7693704/32d9b4ae-41c1-4072-b156-1d72b299ac45)

The window can also be opened using Scene controls

![image](https://github.com/Aedif/multi-token-edit/assets/7693704/01e4c873-2b45-41b9-91ec-e7e8429a251e)

and a keybind (`Shift+X` by default)

![image](https://github.com/Aedif/multi-token-edit/assets/7693704/beb698d9-9199-4132-bfbe-d80830a1838f)

Short video clip: https://youtu.be/MRjHXc3MJWA

### API

- MassEdit.getPreset
- MassEdit.getPresets
- MassEdit.spawnPreset
- MassEdit.createPreset

<details>
  <summary>Documentation</summary>

```js
/**
 * Retrieve preset
 * @param {object} [options={}]
 * @param {String} [options.uuid]    Preset UUID
 * @param {String} [options.name]    Preset name
 * @param {String} [options.type]    Preset type ("Token", "Tile", etc)
 * @param {String} [options.folder]  Folder name
 * @returns {Preset}
 */
static async getPreset({ uuid, name, type, folder } = {})

/**
 * Retrieve presets
 * @param {object} [options={}]
 * @param {String} [options.uuid]    Preset UUID
 * @param {String} [options.name]    Preset name
 * @param {String} [options.type]    Preset type ("Token", "Tile", etc)
 * @param {String} [options.folder]  Folder name
 * @param {String} [options.format]  The form to return placeables in ('preset', 'name', 'nameAndFolder')
 * @returns {Array[Preset]|Array[String]|Array[Object]}
 */
static async getPresets({ uuid, name, type, folder, format = 'preset' } = {})

/**
 * Spawn a preset on the scene (id, name or preset itself are required).
 * By default the current mouse position is used.
 * @param {object} [options={}]
 * @param {Preset} [options.preset]             Preset
 * @param {String} [options.uuid]               Preset UUID
 * @param {String} [options.name]               Preset name
 * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
 * @param {Number} [options.x]                  Spawn canvas x coordinate (mouse position used if x or y are null)
 * @param {Number} [options.y]                  Spawn canvas y coordinate (mouse position used if x or y are null)
 * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
 * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
 * @param {Boolean} [options.layerSwitch]       If 'true' the layer of the spawned preset will be activated.
 * @param {Boolean} [options.coordPicker]       If 'true' a crosshair and preview will be enabled allowing spawn position to be picked
 * @param {String} [options.pickerLabel]          Label displayed above crosshair when `coordPicker` is enabled
 * @param {String} [options.taPreview]            Designates the preview placeable when spawning a `Token Attacher` prefab. e.g. "Tile", "Tile.1", "MeasuredTemplate.3"
 * @returns {Array[Document]}
 */
static async spawnPreset({ uuid, preset, name, type, folder, x, y, coordPicker = false, pickerLabel, taPreview, snapToGrid = true, hidden = false, layerSwitch = false,
} = {})

/**
 * Create Presets from passed in placeables
 * @param {PlaceableObject|Array[PlaceableObject]} placeables Placeable/s to create the presets from.
 * @param {object} [options={}]                               Optional Preset information
 * @param {String} [options.name]                             Preset name
 * @param {String} [options.img]                              Preset thumbnail image
 * @returns {Preset|Array[Preset]}
 */
static async createPreset(placeables, options = {})
```

</details>

## Adding/Subtracting

Numerical fields can be added and subtracted instead of overriding the current value. This can be done by right-clicking the numerical controls in the Mass-Edit form. Green background indicating addition, and red subtraction.

![addSubtract](https://user-images.githubusercontent.com/7693704/191852899-a9447d21-76b3-44c5-b586-dcbe68c7a692.gif)

Text fields will instead append or remove the entereed text from all selected placeables. By default appending will be done to the end of the string, but this can be changed by adding `>>` to the start of the field.

Appended to the end:
![image](https://github.com/Aedif/multi-token-edit/assets/7693704/b522f6d7-7aab-4612-a0ab-eed0fe7873b0)

Appended to the start:
![image](https://github.com/Aedif/multi-token-edit/assets/7693704/dc205317-4dff-48ae-8713-1d7b62cb2909)

## Brush Tool

This tool can be activated by clicking the brush icon in the header of Mass Edit forms

Once selected your cursor will be transformed into a brush allowing you click and drag over placeables on the canvas to apply fields selected in the form onto them.

https://user-images.githubusercontent.com/7693704/211565859-0cc6105d-f023-4f84-9b85-5593475e5bc0.mp4

The brush can also be accessed via the [Preset](#presets) window

## Permission Editing

Note, Token and Actor forms will contain a 'Permissions' header button allowing you to quickly change access permissions.

![Permissions](https://user-images.githubusercontent.com/7693704/192584817-7ed7b710-ad44-41f3-ab82-93a962084aa4.png)

## History

When enabled in the module settings, updates made to placeables will be tracked and available via Mass Edit forms. These updates can be selected to be applied to the currently open form or copied to the module's clipboard to be pasted on other placeables.

![History](https://user-images.githubusercontent.com/7693704/197341186-503648b5-5703-4b78-b27d-0895b4b5dc76.gif)

## Macro Generator

Using the selected fields the module will generate simple macros that will update, toggle, delete, or open Mass Edit forms.

### **Target**

Define the target for the generated macro

- `ALL` - All documents within the selected [scope](#scope)
- `IDs of Current Selected` - IDs of documents are stored within the macro and will be looked up at run-time
- `Search` - A search will be performed within the selected [scope](#scope) using configured fields
  - `Search Fields` - A sub-menu made available when `Search` is selected. Enter key-value pairs to be used in the search
- `Tagger` - A search will be performed within the selected [scope](#scope) using [Tagger](https://foundryvtt.com/packages/tagger) module's 'tags'.
  - `Tags` - A sub-menu made available when `Tagger` is selected. Define a comma separated list of tags to be used in the search.
  - `Must Match` - A sub-menu made available when `Tagger` is selected. Select whether any one (`Any Tag`) or all (`All Tags`) tags must be contained within the document for a successful match.

### **Scope**

Limit the scope of documents affected by the macro.

- `Selected` - Only selected documents at macro run-time will be considered
- `Active Scene` - All documents in the currently active scene
- `World` - All documents throughout the game world

**Action**

The action you want the macro to perform on all documents that matched based on [Target](#target) and [Scope](#scope)

- `Update` - Updates the documents using the data in the text box
- `Toggle` - Alternates document updates between the data in the two text boxes
  - `Toggle Detection` - A sub-menu made available when `Toggle` is selected. How should the macro determine whether a particular document has been toggle on or off.
    - `Field Compare` - Check if the data within the text box matches the document
    - `Flag` - Apply a unique flag to track whether data has been already applied to the document
- `Open Mass Edit Form` - Opens the Mass Edit form (Shift+E)
- `Delete` - Deletes the documents

In addition to the above, if `Update` or `Toggle` are selected you'll also get an option to select the matched documents and/or run another macro. Useful if you have macros that require placeables to be under control for them to execute. For example filters in the [Token Magic FX](https://foundryvtt.com/packages/tokenmagic) compendium.

[Randomization](#randomization) and [Add/Subtract](#addingsubtracting) operators are supported but will add a dependency on `Mass Edit` to be active when the macro is run.

Example video:

https://user-images.githubusercontent.com/7693704/199100945-1f338240-ace7-41cc-ac74-b59e67681c50.mp4

## Example Video

The video bellow shows off Mass Search and Edit being used on various placeables:

https://user-images.githubusercontent.com/7693704/179762435-e0f11294-35ed-4cd2-bb88-30d440a3a990.mp4

## Randomization

At the moment a [Patreon](https://www.patreon.com/Aedif) exclusive feature.

Randomize any numerical, color, text, image, drop-down, or coordinate values.

https://user-images.githubusercontent.com/7693704/196006020-9d308238-1888-4b98-b452-e7ce88a643ac.mp4
