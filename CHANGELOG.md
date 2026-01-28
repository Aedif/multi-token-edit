# 2.7.8

- Fixed `Revert` header control not rendering on `Scenescape` configuration form
- Fixed `Scenescape: Auto-flip` control not appearing on `Prototype Token` configuration form

# 2.7.7

- Fixed `Monks Active Tile` insert fields `Actions` and `Files` overwriting data

# 2.7.6

**Scenescape**

- Added new setting: `Misc` > `Hide Border`
  - When enabled placeable border will no longer be shown on select/control
- Configuration window has been updated to AppV2

**Misc.**

- Scene Not Found error prompt updated to AppV2

# 2.7.5

- Fixed `inputChangeCallback` not being called on `Generic` forms

# 2.7.4

- Fixed Tab right-click select on Mass Edit forms
- Fixed MATT custom field insertion
- Updated Generic forms to AppV2
- Virtual Presets/Folders can now be removed manually from the index using context menu options

# 2.7.3

**Indexer**

- Fixed a bug preventing merge window rendering when the current/main cache does not exist

# 2.7.2

- Improved migration API to reload Mass Edit index of migrated compendiums
- Improved Token Attacher migration macro to account for control token offset

# 2.7.1

**Preset Browser**

- Fixed folder export
- Fixed Actor folder import

# 2.7.0

**Search**

- Support of logical operators `OR` & `AND` has been added within all preset search contexts
  - e.g. `(statue OR chair) AND (elvish OR orcish #ruined)`

**Indexer**

- Fixed incomplete exports when editing `Virtual Directory` presets from within a `Category Browser` without first opening the `Preset Browser`
- Fixed folder icon and subtext not caching

# 2.6.2

**3D Canvas**

- Fixed Token preview scaling

# 2.6.1

**3D Canvas**

- Fixed Token previews not getting cleaned up and removed
- Fixed `Apply to Selected Placeables` option not loading Virtual Directory presets before applying their data

# 2.6.0

**Indexer**

- Removed `Override Tags` and `Fresh Scan` settings
- Added new button to export and import VIRTUAL DIRECTORY index
- After generating an index a new `Index Merge` form will now be shown
  - The form shows the total folder, file, and tag counts shown for:
    - VIRTUAL DIRECTORY
    - The latest scan that was just performed
    - Pre-built indexes that have been found during the scan
  - An option to `Discard VIRTUAL DIRECTORY`
    - If checked instead of merging the latest scan into the VIRTUAL DIRECTORY, it will replace it
    - Tags of files shared between the VIRTUAL DIRECTORYU and the latest scan will be preserved

**Scenescapes**

- Improved Token box select to take into account artworks with large empty areas

**Preset Browser**

- Replaced `Tag Selector` with `Saved Searches`
  - Allows saving the snapshot of the current search state:
    - Query, Category, Layer Switch, Auto-Scaling, External Compendiums, Virtual Directory
  - The search state can be given a label and a background color to be saved under
  - Clicking a saved search will re-create that state within the browser
  - Saved searches can be dragged around to change their order

# 2.5.3

- Token dimensions updates on Scenescapes will now be blocked by default on Scenescapes, preventing system/third-party module breaking auto-scaling functionality
- If the working pack is removed, the Preset Browser will now automatically switch to and if needed create the default preset compendium
- New API: `MassEdit.updatePresetTags(...)`
  - Allows mass importing of tags using the following format:
    - `{ uuid: ["tag1"], uuid2: ["tag1", "tag2"]}`

# 2.5.2

- New options added to: `MassEdit.exportPresets(...)`
  - `query` - allows to filter exported presets using a search query
- Tagger rules are now fully handled by ME which should fix inaccurate rule application on multi-placeable preset spawning

# 2.5.1

- Fixed `Open Linker Menu` and `Open Multi-Placeable Edit` keybindings resetting selected placeable rotation
- Fixed input fields not being displayed after selecting `Find and Replace` on randomizer forms

# 2.5.0

**Directory Indexer**

- Added scrollbars
- Individual directories can now be toggled on/off allowing to index a subsection of directories
- New setting `Fresh Scan`
  - When enabled the current index will be ignored allowing a fully fresh scan
  - Any directory not selected for indexing will be lost/not included in the resultant index

**Misc**

- Select tools inserted for `Ambient Lights`, `AmbientSounds` and `Measured Templates` will now be active by default when selecting the layer for the first time

# 2.4.3

**Misc**

- Fixed light preview rendering error
- Improved VirtualPreset load time via the Brush

**API**

- New async hook: `MassEdit.loadPreset`
  - Called when preset data is required during a non-spawn context, such as media preview

# 2.4.2

**Preset Browser**

- `Placeables` category will be locked onto by default
- `Scene` category is now hidden behind the dropdown menu by default
- Fixed wall textures not updating and persisting after preview mode is ended
- Fixed a folder related error preventing opening of the browser

**Scenescapes**

- Disable token rings when dragging tokens onto scenescapes

**API**

- New API method: `MassEdit.exportPresets({...})`
  - Accepts the following flags:
    - `workingCompendium` set to true to export current working compendium
    - `externalCompendium` set to true to export external compendiums
    - `virtualDirectory` set to true to export virtual directory
    - `json` set to true to return presets in JSON format without exporting

# 2.4.1

- Fixed an issue causing metadata file index to reset

# 2.4.0

**Directory Indexer**

- Updated to Appv2
- Added **Tokenize** option to directory paths
  - Image files encountered within these paths will have a `token` tag automatically applied to them and be displayed as Tokens within the browser
- `Auto-Save Index` option now prompts for the destination directory

**Misc**

- Fixed Scenescape error thrown due to v2.3.1 AmbientLight error fix

# 2.3.1

- Fixed `AmbientLight` multi-drag errors
- Fixed FileIndexer generating bad links for S3 buckets

# 2.3.0

- New hook: `MassEdit.renderPreset`
  - Called before a preset is rendered within the browser
- New hook: `MassEdit.ready`
  - Called when the module has finished setup and is ready to be interacted with
- New API: `MassEdit.registers.registerSceneControlMacro({ icon, img, label, uuid })`
  - Allows registering of macro buttons to be displayed when clicking the Mass Edit scene control button
- New API: `MassEdit.recoverPresetIndex(_packId_)`
  - Recovers missing preset index entries for the provided compendium

# 2.2.4

- Fixed `Import Scene` and `Spawn Scene` context menu options

# 2.2.3

- Fixed preset type search

# 2.2.2

- Fixed working pack creation/initialization
- Fixed error thrown during setting save

# 2.2.1

- Fixed `Auto-flip` settings not being inserted into Token Configuration forms while on Scenescapes

# 2.2.0

- Preset handling system rework
  - Code refactoring/simplification
  - Improved preset retrieval speed
  - Better synchronization between the Preset Browser and the underlying Preset compendiums
- New setting: `Hide Preset Compendiums`
  - When enabled compendiums managed by Mass Edit will not appear within the sidebar _Compendium Packs_ tab
- New Preset context menu option: `Expand`
  - Opens up a new window allowing selection of each individual placeable contained within the Preset
- New toggle added to Preset Category Browser: `Sort Alphabetically`
- New hook: `MassEdit.spawnPreset`
  - Called before a preset is spawned, providing an opportunity to modify it
  - Registered `async` functions will be awaited
  - Preset spawning will be cancelled upon `false` being returned
- Fixed wildcard search not working in Mass Edit forms
- Fixed Shift-key modifier not being recognised when performing file drag/drop upload
- Fixed Preset Browser not immediately rendering drag/dropped files

# 2.1.2

- Fixed compatibility issues with `Multiple Document Selection` module

# 2.1.1

- Fixed `File Indexer` not generating an index

# 2.1.0

**Drag/Drop Upload**

- Files dragged onto canvas or 'Preset Browser' will be uploaded to a configurable location
- Files dropped on canvas will be spawned as Tiles (images/video), Tokens (images/video + `Shift` key), or AmbientSounds (audio)
- Files dropped onto the 'Preset Browser' will be created as Tile/Token/AmbientSound presets
  - If multiple files are dropped in a prompt will be shown to allow creation of multiple or a singular preset containing all files
- Settings
  - `Enable Drag Upload`
    - Allows toggling the feature on/off
  - `Upload Destination`
    - Location the dragged in files are to be stored within
  - `Template Presets`
    - Presets of Token, Tile, and AmbientSound types can be dragged in here to act as templates
    - Dragged in files will be matched against a template and replace the template's referenced image, video, or audio file
    - If a template does not define width and/or height these will be derived from the original file

**Misc**

- Improved preset drag/drop handling to align better with foundry drag/drop flows

# 2.0.2

- Fixed randomization not working with the Token `texture.src` field
- Added `Black Bars` setting to Scene Config
  - When enabled black bars will be displayed in the padded area of the scene
- Fixed Scene Mass Edit window header buttons
- Fixed Search Bar not rendering within Category Browser
- Fixed categories not highlighting upon selection within Category Browser

# 2.0.1

- Fixed drag and drop not working on Preset Bags
- Fixed 'Link Token' behavior decoupling Token after a single move

# 2.0.0

- Foundry v13 Support

# 1.87.2

- External modules can register messages to be shown when FauxScene import fails.
  - e.g.

```
MassEdit.sceneNotFoundMessages?.push({
  query: '#important',
  title: 'Attention!',
  content: '<p>This is a very important scene: {{name}}</p>',
});
```

# 1.87.1

- Fixed preset export to JSON not working within Category Browsers
- `#null` can now be included in preset search queries to search for presets containing no tags

# 1.87.0

- New setting: `Preset Browser Right-Click macro`
  - Macro uuid which will be executed when preset browser scene control is right-clicked
- Added indexing support for `Sqyre` (https://www.sqyre.app/) asset paths.

# 1.86.1

- Fixed simultaneous updates to many uniquely linked placeables resulting in partial or badly anchored updates

# 1.86.0

**Preset Browser**

- Added tooltips to header buttons
- Fixed Video and Sound previews not ending under certain scenarios
- Fixed File Indexer failing when processing files without extensions
- Added header button to the category browser to open up File Indexer form
- If working pack is locked, a new header button will appear allowing to unlock it from within Preset Browser

**Misc.**

- New setting: `Disable preset inclusion within Spotlight Omnisearch`
  - Presets will no longer be included when performing `Spotlight Omnisearch` searches.
- Fixed simultaneous updates to many uniquely linked placeables resulting in partial or badly anchored updates

# 1.85.0

- Fixed typo in Category Browser generated macros
- Scenescapes: Added height field support for the PF2e game system
- Added 'Auto-Save Index' context menu option for Virtual Directories
  - When an asset within a virtual directory is tagged and automatic 'Save Index' operation will be performed for the toggled folder
- `MassEdit.importSceneCompendium(...)` will now update FauxScene names if a mismatch has been found

# 1.84.5

- Fixed Virtual Directory index saving not properly encoding thumbnails

# 1.84.4

- Fixed an error when virtual directory cache does not exist

# 1.84.3

- Fixed `Link Token` behaviors under certain circumstances being assigned identical IDs

# 1.84.2

- Fixed Scenescape auto-scaling being off by default
- Fixed Category Browser's globalQuery not being quoted in the generated macro

# 1.84.1

- Fixed TMFX filters getting cleared on Scenescapes

# 1.84.0

**Scenescapes**

- Controlled token border has been changed from rectangle to image outline
- Improved handling of linked placeables
- Token Configuration forms have an option to enable auto-flip
  - You need to be on a scenescape for this option to appear
  - When enabled the Token and all linked objects will be flipped when using WASD/Arrow keys for movement
- `Scenescape: Toggle Auto-scaling` keybind will now keep the auto scaling on/off until it is pressed again, instead of being reset during next drag/move
- Dragging one-way linked placeables will no longer grab the rest of the linked objects

**Brush**

- Fixed tint color getting soft-locked after enabling TMFX tinting and disabling TMFX module
- Fixed video previews not rendering

**Misc**

- Engaging preview mode (`Shift+D`) while hovering over a placeable will now designate it as the pivot; the mouse will be cantered on it and all transformations will happen relative to it
- `MassEdit.spawnPreset` hook will now be called just before Mass Edit performs any kind of spawn operation
  - `preset` is available as an argument allowing modification before the module proceeds with spawning
- Fixed Scene context menu failing to open when a scene is not currently loaded

**Category Browser**

- Initial `width` & `height` can now be passed in
- If `globalQuery` is provided, it will be appended to any other query run within the category browser
  - e.g. `globalQuery: "#orcs"
    - All categories and search bar searches will have #orcs implicitly appended to them

# 1.83.1

- Fixed an elevation in spawn previews not resetting when moving out of a Scenescape scene

# 1.83.0

- New button added to Linker menu (Shift+Q) to toggle LinkToken behavior interactions on selected tokens
  - When toggled on Tokens will not be automatically linked to regions they enter
- Improved processing of Tokens jumping between two regions with LinkTokens behaviors

# 1.81.0

- `Pixel Perfect` scene control toggles are now accessible by players
- Horizontal and Vertical mirroring keybinding are now accessbile by players
- Flag fields inserted into Bag configuration windows will now be applied to all spawned placeables
- Preset search queries now support negative terms
  - Add a `-` next to a name, tag, or preset type to exclude it from the search
  - e.g. `house -red`
  - e.g. `house #player -#colorable`
  - e.g. `ship -@Tile`
- Fixed bad interaction between multiple preset container forms causing some presets not to be rendered

# 1.80.1

- Fixed `Save Index` virtual folder context menu option being unresponsive

# 1.80.0

- While in preview mode:
  - `Shift+D` keybind will no longer trigger default foundry rotate behavior
  - `Alt` will no longer trigger placeable highlighting or web browser tab swap when scrolling
- Fixed Mass Edit form's `Apply JSON Data` dialog not correctly applying passed in JSON data
- Fixed Preset browser's folder context menu error
- Category browser API now supports a `searchBar` and `globalSearch` fields which will add a search function to the form and set it to either search current results or all presets globally
  - e.g. `MassEdit.openCategoryBrowser(menu, {  name: "My Test Browser", retainState: true, alignment: 'left', searchBar: true, globalSearch: true})`
  - `globalSearch` simply controls the initial global/local search state, a UI toggle next to the search-bar can be clicked to change it

# 1.79.2

- Category Browser CSS changes
- Fixed `MassEdit.getPreset` API error

# 1.79.1

- `Move That For You` module support
  - If players have both Tile move and rotate permissions enabled they can use the `Placeable Preview Editing` keybind to edit the selected tile/s and all linked placeables
- When in preview mode placeables can now be scaled up and down using `Mousewheel` + `Alt` or `Spacebar` keys

# 1.79.0

**Bags**

- Bags have been converted to a preset based system
  - All your bags can now be found in the `Preset Browser` under the `Bag` category
  - Previously created bag macros should continue to work
- Header button added to allow search results to be refreshed manually
- Header button added to generate a quick access macro for the opened bag
- Additional configuration options
  - **Search**
    - Supply `Inclusive` and `Exclusive` searches
    - `Inclusive` search results will be included within bags
    - `Exclusive` search results will be removed from bags
      - Each search mimics results seen within the `Preset Browser` allowing for expressions such as `dead #elf` to find any preset with term `dead` and tag `elf`
      - `All` option controls whether all or any of the tags within the search must match
    - `Virtual Directory` toggle lets you to filter virtual directory results
  - **Appearance**
    - Customize color and opacity of the bag window's header and background
    - `Display Search Bar` includes a search bar at the top of the window

**Preset Browser**

- Added `Scene` category
- Added new header button for browser window configuration
  - `Persistent Search`
    - When enables the search field content will be retained after window closure and category changes
  - `Dropdown Categories`
    - Select categories you wish to be hidden behind a dropdown menu
- A preview image will now be shown when sound preview is being played
- Search Bar now supports preset type searches via the `@` prefix
  - e.g. `@AmbientLight`
  - e.g. `red #castle @AmbientLight`

**API**

- `MassEdit.getPreset(...)` and `MassEdit.getPresets(...)`
  - New option: `query`
    - A search query sharing the same format as searches carried out via the **Preset Browser** search bar
    - e.g. `MassEdit.getPresets({ query: 'yard #wilderness' });`
  - New option: `presets`
    - An array of presets can now be passed in
    - When provided search will be carried out on the array instead of all presets present in your world
    - e.g. `MassEdit.getPresets({ query: "tree", presets: [...] })`
- `MassEdit.PresetContainer`
  - A `FormApplication` class that can be extended to allow preset rendering within your custom application
  - Include the following snippet within your application template and provide a presets array as a return within the `getData(...)` method
    - Presets can be retrieved using `MassEdit.getPresets` or `MassEdit.getPreset`

```html
<div class="preset-browser">{{>me-preset-list presets=presets}}</div>
```

- New method added: `MassEdit.openCategoryBrowser(...)`
  - Constructs and opens an application for browsing presets
  - Accepts an array of categories
  - Each category either runs a query that display found results or opens a submenu consisting of other categories
  - Check Mass Edit macro compendium for an example macro
  - Category format:

```js
// Category
{
  title: 'Trees',               // Text displayed on hover,
  fa: 'fa-duotone fa-tree',     // FontAwesome icon ('fa' or 'img' are required)
  img: 'icons/svg/anchor.svg',  // Image            ('fa' or 'img' are required)
  query: '#tree',               // Search query to be ran when the category is selected,                 ('query' or 'submenu' are required)
  submenu: [],                  // An array of categories to be displayed when this category is selected ('query' or 'submenu' are required)
}
```

**Macros**

- New macro: `Open Category Browser`
  - Sample use of `MassEdit.openCategoryBrowser(...)`
- New macro: `Import Scenes as Presets to Working Pack`
  - Imports scenes from the selected compendium into the current working pack as `FauxScene`s
  - Details on how these scenes can be accessed can be found within the macro

**Misc**

- Improved preview snapping
- Context menu option added to scenes to enable spawning entire scenes as presets

# 1.78.1

- Fixed selection not working in preset `Delete Fields` and `Modify` forms
- Fixed players being unable to drag their own tokens on Scenescapes

# 1.78.0

**Preset Bags**

- Preset storage windows which can be opened via macros
- Presets can be drag and dropped from the 'Preset Browser' or other bags
- A macro can be generated by opening the 'Preset Browser' and clicking a bag icon in the header
  - Choose a name or existing bag and a macro will be generated to open it
- These macros can be shared with players to allow them to spawn presets
  - Spawning of presets requires a GM to be logged in
- **Configure**
  - Assign a descriptive name to the bag
  - Assign tags which will force a search and display all the matched presets within the bag

**Misc**

- Scenescape `Step Size` can now be specified separately for vertical and horizontal movement
- Fixed Tokens shrinking and bloating on Scenescapes when performing movement operations
- `FAVORITES` category has been removed from Preset Browser, it has been replaced by the new `Preset Bag` feature
- Fixed `TMFX - Editor` macro duplicating forms

# 1.77.1

- Fixed linker incorrectly processing simultaneous position and rotation updates
- Added `Current Scene` target option to macro generator when opened via a Scene Mass Edit form
- Removed unnecessary layer selection code from macros generated for non-placeables

# 1.77.0

**Scenescapes**

- New button added to scene configuration form which allows to setup scenes as "Scenescapes"
  - Scenescapes perform dynamic scaling of placeables to achieve a pseudo 3D effect on landscape backgrounds
  - **Configuration window**
    - **Scale**
      - Select, re-size and spawn reference tiles on the scene
      - These tiles will be used to automatically estimate scale for other placeables put on the scene
    - **Distance**
      - At what distance will an object appear half as small?
      - This value in combination with the reference tiles will be used to workout the relative and total "depth" of the scene
    - **Step Size**
      - How many feet a selected Tile or Token will move on a single press of WASD/Arrow keys
    - **Limits**
      - Define upper and lower bounds for movement using WASD/Arrow keys
    - **Black Bars**
      - Display black bars in the padded area of the scene
    - **Pixel Perfect Hover**
      - When enabled `Pixel Perfect Hover` will be force enabled regardless of the button toggle state in the scene controls
  - Presets given tags in the form of `#ft` will automatically adjust to that size when dropped on a scenescape
    - Tokens will attempt to retrieve height information from their Actors, if not found will default to `6ft x token_height`

**Misc**

- New setting: `Pixel Perfect Hover: Remove Button`
  - When enabled `Pixel Perfect Hover` toggle will be removed from Token and Tile layer tools

# 1.76.1

- Scenescape range pickers changed to allow manual input

# 1.76.0

- New setting: `Pixel PErfect Hover: Alpha Threshold`
  - Controls the alpha value cut-off point at which pixels are recognised as hovered over.

# 1.75.2

- Fixed ForgeVTT bug preventing opening of Virtual Directory folders

# 1.75.1

- `Shift+Delete` keybind is no longer required to delete entire linked entities
  - Deleting a linked entity through any means will delete all linked placeables
  - Keybind's role has been changed to deleting only the selected placeables
- Fixed undo (Ctrl+Z) not recovering more than one deleted linked entity
- Pixel Perfect Hover now has separate toggles for Tiles and Tokens
- Mass Edit AmbientLight configuration forms have lost `Hidden` field during v11->v12 migration which now has been reintroduced
- Improved preset folder delete warning

# 1.75.0

**Fixes**

- Fixed Virtual Preset export not preserving tile width & height
- Fixed Addition/Subtraction features not changing field colours on new v12 forms
- Fixed wall brush errors
- Fixed spawned placeable elevation being incorrectly flattened
- Fixed MeasuredTemplate rotations not propagating to other linked placeables
- Fixed Region behaviour `Link Token` poorly interacting with tokens already manually linked to the region
- Fixed inability to open Preset Browser when a non-default working compendium has been removed

**Misc**

- Added `Pixel Perfect Hover` toggle to Tile controls
  - When enabled hover on tiles will only be recognised if over a non-alpha pixel
- Preset tags will now show in the tooltip instead of beneath the preset name
- Improved batch loading, creation, and updating speed of presets

**API**

- `spawnPreset(...)` changes
  - **coordPicker** has been renamed to **preview**
  - **pickerLabel** has been renamed to **previewLabel**
  - **taPreview** has been removed, Token Attacher previews will now always be displayed if **preview** is set to true

# 1.74.1

**Linker**

- Smart Linker menu will now highlight linked placeables when hovering over the menu
- Smart Linker menu will now automatically close if the representative placeable has been unlinked via `Smart Un-Link` keybind
- Fixed `Smart Link` keybind not working under certain scenarios

# 1.74.0

**Linker**

- Bug fixes
- New keybinding: `Smart Link`
  - When pressed will either automatically link selected placeables or initiate a multi-layer select to link box selected placeables across all layers
- New keybinding: `Smart Un-Link`
  - When pressed will either remove links from selected placeables or initiate a multi-layer select to un-link box selected placeables across all layers

**Misc**

- Fixed `Modify` field breaking Preset spawning
- Changed default click behavior for Mass Edit Preset compendiums to open the Preset Browser instead of Journal compendium
  - Journal compendiums can still be accessed via right-click context menu

# 1.73.1

- Copy/Paste keybindings will now allow to copy both selected and placeables they're linked to and paste them as a group

# 1.73.0

- Fixed unresponsive Brush color controls
- `attached` element data is now accessible in the Preset Pre-Spawn Script
- `Delete Selected & Linked` control will now only delete placeables linked using **TWO_WAY** and **SEND** link types
- Linked walls will no longer affect other linked placeables when only a single wall segment has been moved
- 3D spawn preview improvements

# 1.72.3

- Workaround for prefab spawn failing due to Foundry null flag override bug

# 1.72.2

- Fixed `Presets` field within `Spawn Preset` and `De-Spawn Preset` behaviors not allowing insertion of Preset UUIDs on Foundry versions `12.329` and `12.330`

# 1.72.1

- Copy UUID option added to Preset context menu options

# 1.72.0

- Fixed file-picker image fields not being recognized as such by the randomizer on right-click
- Fixed PlaylistSound Mass Editing not working on v12
- New behaviors:
  - Spawn Preset
  - De-Spawn Preset

# 1.71.4

- Fixed Tile sort order not being preserved when creating presets
- Tile sort order will now be set to scene maximum + 1 (and incremented from there for multi-tile presets) when being spawned via API, Brush, or Preset Browser

# 1.71.3

- New keybindings
  - **Delete Selected & Linked**
    - Default: `Shift+Delete`
    - Deletes currently selected placeable and all placeables linked to it via the `Linker Menu`
  - **Mirror Preview Horizontally**
  - **Mirror Preview Vertically**
    - Default: `H` and `V`
    - Mirrors previews activated via `Preset Browser`, `Placeable Preview Editing` keybinding, or `MassEdit.spawnPreset(...)` API

# 1.71.1

- Slight `Linker Menu` UI improvements

# 1.71.0

**Linker**

- Links can now be established between placeables to allow movement and rotation of entire linked groups
- New Keybinding: `Open Linker Menu`
  - Opens a menu from which you can add and remove links on selected placeables
- If `Alt` is held during linked placeable drag or rotation, the links will be momentarily ignored

**Region Behaviors**

- New behavior added: `Link Token`
  - Tokens upon moving into and out of the region will be linked and un-linked from the region

**Preset Browser**

- Preset Edit form is now separated into tabs
- New options on Preset Edit forms: `Preserve Links`
  - By default the module will generate unique links for all placeables contained within the preset to allow independent movement of the presets on the scene.
  - If enabled links will be preserved meaning if preset is spawned multiple times all placeables will be part of the same link group
- Preset browser will now detect links on dropped in placeables and prompt for linked placeable inclusion in the created preset
- `Assign` on preset edit forms will now detect links on selected placeables and prompt for their inclusion and override of existing `Attached` elements
- `AmbientSound` presets can now be dropped on Playlists to create new sounds
- Improved the processing speed of working pack export to JSON

**Misc**

- New setting: `Pre-Select Auto-apply`
  - When enabled `Auto-apply` checkboxes will be pre-selected on Mass Edit forms
- `Select Edit Placeable` keybinding will now detect links on selected placeables and include them within preview edit mode
- Added ability to rotate Rectangle & Polygon Regions in the same manner as Tokens, Tiles, etc.

# 1.70.0

**v12 Region Support**

- Drag & Drop
- Mass Editing
- Transform
- Presets

# 1.69.5

- Workaround for `Levels` on v11 defining elevation properties as `getters` only

# 1.69.4

- Fixed error thrown when activating a brush via a `Virtual Preset`
- Manual iteration of the presets within the `Brush Menu` will now ignore `Lock`

# 1.69.3

- Fixed Mass Edit forms not opening for AmbientLights and AmbientSounds on v11

# 1.69.2

**Brush Menu** / **Preset Browser**

- Preset previews should now more consistently render on top of other elements on the screen

**Brush Menu**

- Manually adjusted scale and rotation will now be preserved and applied to the next preset in the sequence

# 1.69.1

- Fixed errors thrown related to `Regions` on v11 clients

# 1.69.0

- Foundry v12 support
  - Added migration API for presets. See Mass Edit macro compendium for examples.

**Preset Browser**

- Improved Token snapping in preset preview mode
- Fixed Token Attacher prefab preview positions not correctly reflecting final ones in certain situations
- AmbientSounds and Tiles with video sources can now be previewed by hovering over them
- **Search Bar** now includes a **Tag Selector** pop-up which displays and allows you to select tags to search by

# 1.68.0

**Preset Browser**

- **Directory Indexer** can now be accessed via the header
- Presets belonging to unlocked compendiums can now be edited even if they're not part of the current working compendium
- Tags can be explicitly searched for using **#**
  - e.g. rock #terrain
  - This would bring up all presets that have been tagged with **terrain** and that contain **rock** in their name
- Switching placeable types will now reset the search textbox
- Search mode toggle can now be used to turn-off display of folders during searches
- Due to allowing scanning and inclusion of tens of thousands of files within the form, searches have been limited to the first 1000 presets
- Fixed folders showing up as visible during searches even if they do not contain matched presets
- Fixed **FAVORITES** tab rendering sluggishly compared to other tabs
- Fixed AmbientLight and AmbientSound previews only rendering their controls
- Fixed images floating up when in thumbnail view mode

**Directory Indexer**

- The module now supports indexing of directories and displaying them within the **Preset Browser** as Tile and AmbientSound presets.
- Indexer menu is accessed via a new **Preset Browsers** header button
  - Select directories you want to be indexed, filters, and override settings
  - The index will be created as a file within your user data folder and will be re-used on all subsequent openings of the **Preset Browser**
  - Any module directories found as part of indexing will result in assets found within being tagged with the author's name (e.g. baileywiki, caeora, etc)
  - Supported sources: data, public, s3, forgevtt, forge-bazaar
- `noscan.txt` file can be added to directories you do not wish to be indexed
- `indexer.json` file can be added to directories to modify folder appearance, tags, and indexing exclusions.
  - Format:

```
{
  "modules/baileywiki-3d": {
    "tags": ["3d_canvas"],
    "color": "#7e1212",
    "icon": "icons/vtt-512.png",
    "subtext": "3D Canvas"
  },
  "modules/baileywiki-3d/icons": {
    "noscan": true
  }
}

```

**Misc.**

- Preset pasting onto existing placeables will no longer include position data
- Tiles spawned through the **Brush Menu** will have their Z-Index be automatically set to the current highest on the scene.
- **History** recording feature has been removed

# 1.67.1

- Fixed errors thrown when using Brush update tool with empty presets

# 1.67.0

**Brush Menu**

- New Control: **Density**
  - While the brush is held, placeables will be spawned within the grid space increments defined by the selected density
  - e.g. density of 1 spaces out presets within 1 grid space increments
  - e.g. density of 0.1 spaces out presets within 1/10th grid space increments
- New Control: **Tagger**
  - Available when `Tagger` module is installed and active
  - Applies tags to the spanwed placeables
- Control: **TokenMagicFX**
  - Multiple TMFX filters can now be selected at the same time
  - Two special TMFX filter presets are now available:
    - **DELETE ALL**: removes all TMFX from spawned/updated placeables
    - **DELETE**: when included with other filter presets will remove them instead of applying them to placeables
- Colorization controls are now hidden behind a toggle
- Fixed errors thrown while using Brush delete tool

**Presets**

- Improved handing of presets with empty data
- Improved re-indexing of presets with missing metadata

# 1.66.0

- Brush Menu
  - Added 'Token Magic FX' filter presets control
  - Added 'Scale To Grid' control
  - Brush macros can now be generated using either Preset UUIDs or Names
- Presets
  - Preset browser optimization
  - Spawn preview now automatically disables on scene change

# 1.65.0

**Presets**

- New **Favorite** category has been added to the placeable Preset browser
- If the preset browser is expanded enough display will switch to thumbnail grid view
- Preset browser will now retain scroll position when re-rendered
- Fixed rangeTop/rangeBottom flags being manipulated while 3D canvas is not active

**Brush**

- Fixed active brush interacting with placeables while dragging application windows
- Brushes activated via the Preset browser will now open up a new menu:
  - The menu contains controls to manage how selected presets will be applied on the canvas
  - **Rotation**: Applies a random rotation within the selected range
  - **Scale**: Applies a random scale within the selected range
  - **Spawner**: Toggles between spawning new placeables and updating already existing placeables on the canvas
  - **Random**: Toggles preset iteration between sequential and random order
  - **Eraser**: When enabled the brush will turn into an eraser deleting clicked placeables
  - **Lock**: When enabled presets will no longer be iterated through
  - **Group**: When disabled presets containing multiple placeables will spawn them individually instead of a whole group
  - **Snap**: When enabled preview/spawned placeables will be snapped to the grid
  - **Macro**: When clicked control settings and all selected presets will be made into a macro to allow re-opening of the menu in the current state
  - **Colorize**: Select a color to apply to Tiles, Tokens, and AmbientLights
    - **FX**: When enabled the selected color will be applied as a DDTint filter

**API**

- MassEdit.openBrushMenu(options, settings = {})
  - Opens a brush menu using the provided preset search options (see `MassEdit.getPresets`)

# 1.64.1

- Fixed Token Attacher prefabs dropped from the preset window being scaled twice
- Fixed 'Preset Edit' form fields resetting after certain actions have been performed on it

# 1.64.0

**Presets**

- Previews (preset double-click) can now be rotated and scaled before being placed on the canvas
  - Hold SHIFT or CTRL and use the mouse wheel to rotate the preview
  - Hold ALT and use the mouse wheel to scale the preview
- Search will now split the search term into separate keywords to allow for out of order word searches
  - e.g. "table orc", will match "Table Orcish", and "Orcish Yellow Table"
- Brush can now be toggled between update/spawn modes
  - Update (yellow) will apply preset data to hovered over placeable
  - Spawn (green) will spawn preset on the position of the brush
- Fixed Post-Spawn script error

**API**

- MassEdit.spawnPreset(...)
  - New options: **center**
    - Chosen spawn position will be treated as the overall center point of all the placeables contained within the preset

**Misc.**

- Selected placeables can now be manipulate in groups using `Shift+D` keybinding allowing you to move, scale, and rotate all of them at once
  - If none are selected a select tool will be activated allowing you to initiate editing of placeables across all layers within the selected range
- Improved load speed

# 1.63.0

- Multiple presets tags can now be entered at the same time by separating them by commas
- TMFX filter DDTint can now be randomized on Preset Edit forms

# 1.62.3

- MassEdit API
  - **getPreset** and **spawnPreset** can now be provided a 'random' flag
    - if true a random preset will be chosen from the matched list if a unique one could not be found
    - otherwise the first found preset will be returned

# 1.62.2

- Fixed bad meta document initialization preventing Preset form from opening
  - Added an additional fail-safe to revert back to the default compendium
- Spotlight Omnisearch should now populate with "PRESET" type

# 1.62.1

- Mass Edit is now **Baileywiki Mass Edit**
- API's now support tags

# 1.62.0

- Preset tagging
  - Select `Edit` within the preset context menu to add tags
  - With multiple presets selected you'll have the option to `Add Tags` and `Remove Tags` from all selected presets
  - Tagged presets will be included in the matching searches
  - Hover over a preset to see its tags

- External compendium folder editing
  - Assign color, name, and group
  - Folders with the same group name will be displayed together under one folder

- Compatibility fixes for `Spotlight Omnisearch` module

# 1.61.2

- Sort static preset folders by name

# 1.61.1

- `Spotlight Omnisearch`
  - Mass Edit presets are now available via this module's search feature
- Preset window will now hide itself when spawning a preset with preview via double-click
- Misc. bug fixes

# 1.61.0

- Select Tool is enabled for AmbientLight, AmbientSound, MeasuredTemplate, and Note layers
- Added JournalEntry ID button to `Preset Config` form title bar.
- When exporting preset folders a progress tracker will now be displayed

Fixes

- MetaIndex entries will now be re-generated for missing presets
- Fixed MetaIndex not clearing out indexes when presets are batch deleted as part of folder delete
- Fixed context menu's not opening under certain conditions
- Fixed edit related context menu options being shown for external compendiums

# 1.60.1

- Actors and Actor folders dragged into the form will now merge/update based on Actor ID instead of always generating new copies
- Fixed Preset right-click not auto-selecting the preset

# 1.60.0

**Presets**

- Performance improvements when handling extremely large compendiums
- Added the 'Delete ALL' option for folders
- Actors and Actor folders can now be dragged into the window to generate Token folders and presets from them

# 1.59.2

- Fixed Scale to Grid skewing positions of spawned placeables when as part of a group or as an attached element within a preset

# 1.59.1

- Fixed Mass Edit interfering with normal copy/paste flow

# 1.59.0

**Presets**

- New contextmenu option: `Apply to selected Placeables`
  - Applies selected presets to selected placeables
- New option added to the Preset Edit form: `Spawn` > `Random`
  - If a preset consists of a group of placeables a random one will be chosen instead of spawning the entire group
- Fixed `Single Placeable: Default Config` setting interfering with the opening of the Mass Edit form via `Preset Edit` form
- Presets retrieved via `MassEdit.getPreset(...)` now have a method `attach` which allows attachment of passed in placeables to the preset

# 1.58.2

**Presets**

- Folder open/close state now persists on game reload
- Warnings will now be shown when attempting to delete a folder or more than 2 presets
- Deleting a folder will no longer delete its presets and sub-folders

# 1.58.1

- Fixes for `DnD5e v3.0.0`

**Presets**

- Preset previews should display even if coordinate data has been manually removed from the preset
- 3D Canvas compatibility
  - Fixed multiple submit buttons being shown on Mass Edit forms
  - Fixed multiple checkboxes being inserted on Mass Edit forms
  - If on a 3D scene preset window will contain an additional control to create presets from selected placeables
  - `Preset Config` window now has a button to attach all selected placeables
  - `MassEdit.spawnPresets(...)` now accepts x, y, AND z coordinates

# 1.58.0

**Presets**

- Additional placeables can now be attached to presets by dragging them onto 'Preset Edit' forms
- Holding `Shift` during preset drag out or with coord picker active (preset double-click) will prevent position snapping
- ControlIcon previews (Notes, Templates, Lights) should now appear more consistently
- Preset spawner should now be a bit more resilient to users manually deleting coordinate data within the preset

# 1.57.0

**Presets**

- New preset editing options
  - Pre-Spawn Script
    - Executed before the preset is spawned
    - Variables in-scope:
      - `data` - data which will be used to spawn the placeable
      - - Usual macro variables; 'speaker', 'actor', 'token', 'character', 'scope'
  - Post-Spawn Script
    - Executed after the preset has been spawned
    - In-scope:
      - `documents` - spawned documents
      - `objects` - spawned placeables
      - - Usual macro variables; 'speaker', 'actor', 'token', 'character', 'scope'
- Fixed Drawing `strokeColor` not applying to `Mass Edit` forms when `strokeWidth` and `strokeAlpha` are not part of the preset data

# 1.56.4

**Presets**

- Brush
  - Will no longer affect all stacked placeables under the brush when clicked
  - Hover will be triggered when above a placeable to improve clarity as to what will be affected

# 1.56.3

**Presets**

- Improved spacing of preset names when they overflow to a new line

**Forms**

- Reduced likelihood of multiple `Apply` or `Search` buttons being inserted into forms

# 1.56.2

**Presets**

- `Drawing`s and `MeasuredTemplate`s will now be owned by the users that spawned them
- Folders can now be created for non-placeables (e.g. `Scenes`)

# 1.56.1

**Presets**

- Window will now open in the position it was closed when re-opened via Keybind or Scene control
- Fixed assignment of new placeables to presets not updating the internally tracked grid size used in automatic scaling
- Pressing middle-mouse button while spawning a preset will now cancel the operation
- Tooltip updates
- Localizing more user facing strings

# 1.56.0

- Header now sticks to the top of the window instead of scrolling with the presets
- Search mode can now be toggled between `Presets` and `Presets & Folders`
  - `Presets` - Displays only presets with matching names
  - `Presets & Folders` - Displays presets and folders with matching names
- Search bar will now be highlighted if text has been entered

# 1.55.0

**Presets**

- Made the Preset window a little more compact
- Fixed a visual bug causing context menu to get hidden before reaching the bottom of the form
- Removed `Copy` context option in external compendiums as same result can be produced by using the `Export to Compendium` option and choosing the current working compendium
- `Export to Compendium` dialog now has a `Keep Preset IDs` option
  - When enabled exported presets will keep their IDs and will override any previously exported presets with the same IDs
- On preset create instead of `New Preset`, the first `Tagger` module's tag will be used as the preset's name instead if one has been assigned

# 1.54.0

- Brush once activated will now swap to the new preset if another is selected
- Fixed a bug causing the brush to lose track of mouse up/down positions
- New context menu option: `Copy to CLipboard`
  - Copies selected preset's data to the clipboard which can then be pasted as plain text or onto selected placeables via `Ctrl+V`

# 1.53.0

- Presets can now be dragged onto Mass Edit form to apply them to it
- Scene presets can be double-clicked or dragged out to apply them to the current scene

# 1.52.0

**Presets**

- New control added under Preset edit form: `Spawning > Modify`
  - Allows to specify fields to be prompted for editing when spawning a preset
- Certain conflicting operations will now disable controls until the Preset edit form is saved/closed

API

- `MassEdit.spawnPreset(...)`
  - New option: `modifyPrompt`
  - When enabled will display a pop-up prompt allowing preset data to be modified for fields selected using `Spawning > Modify` control on the Preset edit form
  - Enabled by default

# 1.51.1

- Fixed Scene preset editing errors

# 1.51.0

- New keybinding: `Open Scene Presets`
  - Toggles a scene preset form on and off, allowing to apply presets to the active scene
- New scene context option: `Mass Edit`
  - Opens Mass Edit form for the selected scene

Misc.

- Preset forms opened from within Mass Edit forms will now:
  - Will be opened next to parent form
  - Automatically close with the parent form

# 1.50.0

**Presets**

- Working directory will now be automatically switched back to default if the previous working directory has been removed
- Added new window control: `Scale To Grid`
  - When toggled on, Tiles, Drawings, and Walls dragged out onto the scene will be scaled according to pixel density (Grid Size)
- Added `Delete Fields` option to preset edit form
  - Allows to delete individual fields from the stored placeable data

**API**

- `MassEdit.spawnPreset(...)`
  - New option: `scaleToGrid`
    - When set to true Tiles, Drawings, and Walls will be scaled according to the scene's pixel density (Grid Size)

**Misc.**

- Housekeeping: The majority of user facing text should now be contained in `lang/en.json`

# 1.49.0

**Presets**

- Grouped Placeables
  - When dragging in multiple placeables onto the preset form a single preset will be created containing all of the placeables with their relative positions
  - When these presets are spawned using `MassEdit.spawnPreset(...)` API with `coordPicker` option enabled previews will be created for each placeable within the group
- When editing a preset there is now an option to `Assign` new placeables to it.
- Presets can now be double clicked to spawn them on the canvas with a preview

**API**

- `MassEdit.spawnPreset(...)`
  - Can now be called by players if an active GM is present
  - Option: `taPreview`
  - Accepted values and their behaviour has been changed
    - **"ALL\*"** - displays previews for all attached elements
    - **"{documentName}"** - displays preview for all elements of this type
      - e.g "Tile", "Wall", "MeasuredTemplate", etc.
    - **"{documentName}.{index}"** - displays a preview of a specific element matching document type and index
      - e.g. "Tile.0", "AmbientLight.3", "AmbientSound.2"
    - Values can be chained using a comma
      - e.g. "Tile, Wall, MeasuredTemplate.1"

**Misc.**

- The module's code has been bundled to reduce number of http requests
- Fixed some preset fields not applying to forms
- As of **Token Attacher** version **4.5.14**, tokens and their attached elements will be saved when creating a token preset

# 1.48.0

**API**

- `MassEdit.getPreset(..)`
  - New option added: `folder`
    - Returns a random preset within the provided folder name
  - `EXTERNAL COMPENDIUMS` will now also be searched
- New function: `MassEdit.getPresets(...)`
  - Has same options as `getPreset` but instead of returning one preset will return all matched
  - Unique option: `format` (accepted values 'preset', 'name', 'nameAndFolder')
  - Configures the format in which the placeables are turned in
- `MassEdit.spawnPreset(...)`
  - If the module finds multiple presets given the provided options a random preset will now be chosen from those found
  - New option: `taPreview`
    - If spawning a `Token Attacher` prefab with `coordPicker` options set to true, allows to specify the element to be displayed as the preview.
    - Valid values include placeable names and optionally index number
    - e.g. `Tile`, `Tile.1`, `MeasuredTemplate.2`
    - e.g. `MassEdit.spawnPreset({name: "TA Prefab", coordPicker: "true", taPreview: "Tile"})`

**Misc.**

- Fixed placeable `Drag & Drop` onto preset form reporting errors for non-controllable placeables

# 1.47.2

- Added support for `Token Attacher` prefabs. Tokens with attached elements can be dragged into the preset window to copy both the token and attached elements both.
  - Requires forked version of Token Attacher:
  - https://github.com/Aedif/token-attacher/releases/download/4.5.13.1/module.json

# 1.47.1

- Slightly improved handling of placeable drop on preset window
- Fixed selected fields being forgotten after the Mass Edit for is re-rendered
- Fixed Generic Forms not rendering

# 1.47.0

- `MassEdit.spawnPreset(...)`
  - **coordPicker** option will now display the preview of the placeable
  - New option: **pickerLabel**
    - A string that will be displayed above the crosshair when **coordPicker** is set to true
    - e.g. `MassEdit.spawnPreset({ name: "Torch", coordPicker: true, pickerLabel: "Placing Torch" });`

# 1.46.2

- New option added to `MassEdit.spawnPreset(...)`
  - `coordPicker` - If 'true' a crosshair will be activated allowing spawn location to be picked by clicking on the canvas
  - e.g. `MassEdit.spawnPreset({ name: "Torch", coordPicker: true});`
  - e.g. spawning 3 torches in a sequence:

```js
for (let i = 0; i < 3; i++) {
  await MassEdit.spawnPreset({ name: 'Torch', coordPicker: true });
}
```

# 1.46.1

- Mass Edit API can now be accessed via `MassEdit` as well as `game.modules.get("multi-token-edit").api`
- Added 3 new functions to the API: `createPreset(...)`, `spawnPreset(...)`, `getPreset(...)`
  - Some very simple examples:
  - `MassEdit.createPreset(_token)`
    - Creates a Preset using the currently controlled token
  - `MassEdit.spawnPreset({ name: "Blue Light" })`
    - Spawns a preset named "Blue Light" on the current mouse position
  - `MassEdit.getPreset({ name: "Spike Trap" })`
    - Retrieves a preset by the name "Spike Trap"

```js
/**
  * Retrieve saved preset via uuid or name
  * @param {object} [options={}]
  * @param {String} [options.uuid]   Preset UUID
  * @param {String} [options.name]   Preset name
  * @param {String} [options.type]   Preset type ("Token", "Tile", etc)
  * @returns {Preset}
  */
static async getPreset({ uuid = null, name = null, type = null } = {})

/**
 * Create Presets from provided placeables
 * @param {PlaceableObject|Array[PlaceableObject]} placeables Placeable/s to create the presets from.
 * @param {object} [options={}]                               Optional Preset information
 * @param {String} [options.name]                             Preset name
 * @param {String} [options.img]                              Preset thumbnail image
 * @returns {Preset|Array[Preset]}
 */
static async createPreset(placeables, options = {})

/**
 * Spawn a preset on the scene (id, name or preset are required).
 * @param {object} [options={}]
 * @param {Preset} [options.preset]             Preset
 * @param {String} [options.id]                 Preset ID
 * @param {String} [options.name]               Preset name
 * @param {String} [options.type]               Preset type ("Token", "Tile", etc)
 * @param {Number} [options.x]                  Spawn canvas x coordinate (required if spawnOnMouse is false)
 * @param {Number} [options.y]                  Spawn canvas y coordinate (required if spawnOnMouse is false)
 * @param {Boolean} [options.spawnOnMouse]      If 'true' current mouse position will be used as the spawn position
 * @param {Boolean} [options.snapToGrid]        If 'true' snaps spawn position to the grid.
 * @param {Boolean} [options.hidden]            If 'true' preset will be spawned hidden.
 * @param {Boolean} [options.layerSwitch]       If 'true' the layer of the spawned preset will be activated.
 * @returns {Array[Document]}
 */
static async spawnPreset({ uuid = null, preset = null, name = null, type = null, x = null, y = null, spawnOnMouse = true, snapToGrid = true, hidden = false, layerSwitch = false } = {})
```

# 1.46.0

Presets

- Placeable data can now be edited after selected `Edit` under preset context options
- Added `Duplicate` context menu options

# 1.45.1

Presets

- UI has been completely reworked
  - Search
  - Manual and alphanumeric sorting
  - Manage presets within folders
  - Convenient category and layer switching
  - Create presets by dragging placeables onto the preset window
  - Drag presets out onto the canvas to create placeables
  - Each preset is now a Journal that exists within a hidden compendium and is only loaded when needed
  - Export presets to JSON files or unlocked Journal compendiums
    - Mass Edit preset compendiums are collated and displayed within the preset window
  - Multi-select and multi-editing

Misc.

- Fixed Brush tool triggering drag-select or placement of new placeables upon click

# 1.44.4

- Fixed `DungeonDraft (TMFX)` field not properly applying the filter
- `Limits` module support

# 1.44.3

- Flags tab has been removed until the duplicate value issue is resolved
- Fixed wall searches panning to the canvas corner instead of the found walls

# 1.44.2

- Fixed `array` and `jsonArray` inputs not being properly processed in `Flag` tabs

# 1.44.1

- Fixed `Search form` not selecting placeables after the search has been completed

# 1.44.0

- `Apply JSON Data` form will now contain all currently selected fields in it
  - Fixed an issue with nested data not being properly applied
- New setting: `Flags Tab`
  - When enabled flags found on the document will be included in the `Mass Edit` form under the `Flags` tab
  - Flags can be removed by toggling the trash can icon next to them
- `Generic Forms` will no longer display empty tabs if the object they represent contains only null fields

# 1.43.8

- Warning fixes
- `Delete` button will now always be displayed

# 1.43.7

- Fixed Mass Edit forms not closing after performing updates on AmbientLights
- Fixed errors thrown when switching scenes with Mass Edit form still open and attempting to perform an update after

# 1.43.6

- Fixed the closing of Token and AmbientLight Mass Edit forms without performing update resulting in their respective layers freezing on v11

# 1.43.5

- Fixed Token and AmbientLight mass updates causing their respective layers to freeze on v11

# 1.43.4

- Fixed TMFX fields in Mass Edit forms not applying filters

# 1.43.2

- v11 support

# 1.43.1

- Fix Token Prototype edit using `Multiple Document Selection` module

# 1.43.0

- Active Effect preset support
  - New options available when selecting `[ME]` next to `Attribute Key` in Active Effect configuration form
  - Allows saving, applying, importing and exporting of `Effects` tab

# 1.42.0

- Removed JSON header button from Mass Edit forms
  - Same information can be be found by accessing the Macro Generator
- Removed `Shift-C` and `Shift-V` keybindings
  - `Ctrl-C` will copy data within opened Mass Edit forms, both to the module's and browser's clipboards
  - `Ctrl-V` will paste copied data into selected placeables or text boxes
- Added a new header button: `Apply JSON Data`
  - Opens up a dialog to allow data to pasted in and applied to the form

Patreon

- Improved positioning placement of spawned placeables
- `Ctrl-V` will spawn a default placeable using the clipboard fields if no placeable is selected

# 1.41.1

- Clickable text added to `Active Effect Configuration` > `Effect` > `Attribute Key`
  - Will open up and allow to apply presets in the same manner as `Shift-X` keybinding

# 1.41.0

- Preset Forms can now populate Active Effect `Effects` tab
  - Presets need to be accessed using the `Shift+X` keybinding while an Active Effect configuration form is open
  - `Token` presets will populate the `Effects` tab with ATL prefixed keys (ATE module required)

# 1.40.0

- Turned off field validation for Generic forms
- Presets can now be dragged around with a mouse to change their order
- You can change preset background color by right-clicking them

PATREON

- Dragging presets outside the form will spawn a placeable containing preset data
  - If done while holding the ALT key the placeable will be set as hidden

# 1.39.2

- Adjusted button layout in TMFX Editor macro

# 1.39.1

Macros

- `TMFX - Editor`
  - Can now save TMFX filters under `MAIN` and `TEMPLATE` libraries
  - `MAIN`: Default library used by modules such as ATE
  - `TEMPLATE`: Primarily used by TMFX itself. Auto Template Effects will source presets from here
- `TMFX - Apply Preset`
  - Can now apply presets from both `MAIN` and `TEMPLATE` libraries

# 1.39.0

Macro Generator

- Targeting options now supports 3 scopes: `Selected`, `Scene`, and `World`
  - e.g while targeting `ALL`, with scope `Scene`, the generated macro will retrieve all placeables on the active scene
- New targeting option: `Search`
  - Will perform field searches to determine targets for the macro
    - e.g. targeting Tokens that match a specific name or disposition
  - Wildcards (`*`) can be used here the same way as with Mass Search forms
- `Application Method` option has been renamed to `Action`
  - In addition to `Update` and `Toggle` the generator now also provides `Open Mass Edit Form` and `Delete` options
- Macros can now be created for non-placeables
  - Items, Cards, RollTables, Actors, JournalEntries, and Scenes
  - These documents will have certain options restricted like `Scene` and `Selected` scope
    - `Selected` scope can be accessed by installing `Multiple Document Selection` module

Mass Edit form

- Updates now work across scenes, meaning the form can be opened on one scene and still successfully applied if kept open after switching to another scene
- Mass Search now supports non-placeable documents (Items, Cards, RollTables, Actors, JournalEntries, and Scenes)

# 1.38.0

- `Mass Search` forms (Shift+F) now support cross-scene searches
  - Enabled via a new checkbox added to the bottom of the form
  - Will look for placeables across all scenes
  - Found placeables can be deleted via a new trash button

# 1.37.2

- Added some inbuilt custom control for GeenricForms
- Update macros in compendium
- Variables with 'path' in their names will now have FilePickers present in GenericForms

# 1.37.1

- Exposing showMassEdit(...) through module's api
  - accepts an object or a list of objects and opens up a MassEdit form for them
  - e.g.
    - `game.modules.get("multi-token-edit").api.showMassEdit(canvas.tokens.placeables)`

# 1.37.0

- Fields inserted by mass edit will now be assigned their own colours
  - New CSS class: `meInsert`
- Tile Mass Edit forms will now contain a `Scale` field that can be used to adjust Tile width and height simultaneously and proportionally
- Fixed Mass Edit forms becoming frozen in some cases and unable to be closed

Patreon

- Randomizer options can now be re-opened and edited after being set
  - Allows for easier testing and micro-adjustment of the randomizer
  - Allows for presets containing randomization to be applied to the form and have their options changed
- 'Tile Scale (Horizontal|Vertical)' field added to Tile forms to allow for randomizing vertical and horizontal scale simultaneously

# 1.36.2

- 'TMFX Preset' and 'DDTint' fields are now supported in Macro Generator
  - A Mass Edit dependency warning will be shown when these fields are selected
- Implemented a workaround for TMFX bug related to re-applying the same preset multiple times on the same placeable
- Shortened/simplified macros generated with the ME dependency

# 1.36.1

- Fixed `Shift+C` not triggering a field copy on opened Mass Update forms

Patreon

- Extended wildcard support to `Find and Replace`

# 1.36.0

- Mass Search now supports wildcards: `*`
  - Goblin\*
  - \*Goblin
  - *G*n\*

# 1.35.0

- Previously a PATREON only feature, Macro Generator can now be accessed via the the header button: `>_`

# 1.34.1

- Right-click tab click support for `Monk's Active Tiles` module
- Fixing layout issue for automatic apply checkboxes inside Templates, Walls, AmbientSounds, and Notes

# 1.34.0

- Right-clicking the navigation tabs on Mass Edit forms will now toggle all Mass Edit checkboxes within it

# 1.33.1

- Preset bug fix

# 1.33.0

- Auto apply update toggle on the side of Mass Edit forms has been replaced with checkboxes next to 'Apply' buttons

# 1.32.0

- New control added to the side of Mass Edit forms
  - When toggled changes on the Mass Edit forms will immediately trigger updates of the objects it is linked to

# 1.31.0

- New Setting: `Insert TMFX Fields`
  - When enabled **Token** and **Tile** Mass Edit forms will be inserted with fields to apply/remove TokenMagicFX filters
    - DungeonDraft Tint (TMFX)
    - Preset (TMFX)

# 1.30.1

- Fixing broken release link

# 1.30.0

Brush Tool added

- Available in Mass Edit forms and standalone preset form (Shift+X)
- When selected the cursor is transformed to a brush allowing you click and drag over placeables to apply the fields selected in the Mass Edit form or the relevant preset
- To deactivate the tool you can:
  - Press the middle mouse button
  - Close the form
  - Click on the brush tool again
- 3D Canvas is supported

Misc.

- Shift+X will now open the preset form for the currently active layer even if no placeable is selected or hovered over
- 3D Canvas shaders are now supported in Mass Edit forms for Tiles and Tokens

# 1.29.2

- Macro Compendium added
  - Currently includes:
    - TMFX Editor
    - TMFX Apply Preset
    - Configure color replace Vision Mode

# 1.29.1

- Compatibility fix for 'Health Estimate'

# 1.29.0

- Presets can now be registered as controls
  - This is done by clicking the new gamepad icon added to the preset menu
  - Requires game reload for the control to be registered
  - Registered controls can be found under **Configure Controls** > **Mass Edit**

# 1.28.1

- Small Time module compatibility fix

# 1.28.0

- New Setting: **Pan to Search**
  - Automatically centers the screen on found placeables

# 1.27.10

Generic Forms

- Labels of numeric and text inputs can now be right-clicked and converted to sliders and dropdown boxes
- Input containing arrays will no longer be disabled. Instead they can be edited as text input
  - Double click the text boxes to display a resizable popups

# 1.27.9

- Small bug fix

# 1.27.8

Generic Form

- Now provides pickers for numerical color fields
- A function can be passed as 'inputChangeCallback' to return selected fields every time form input changes
- Added horizontal scrollbar for particularly long navigation bars

# 1.27.5

Generic Forms

- Implemented a Generic Mass Edit form that can be opened for any list of objects
  - Behaves as any other Mass Edit form with one notable exception; fields can be pinned and renamed for easier access
- Through this form partial support is now provided for Actors, Items, RollTables, JournalEntries, and Cards
- A new header button has been added to Actor/Token forms to switch between them
- Shift+E will now open generic forms for documents that do not have their own sheets
- New keybinding: Shift+R
  - Will open Actor form for selected tokens without needing to switch to it through the Token form
- New method added to the API: `showGenericForm`
  - e.g. `game.modules.get("multi-token-edit").api.showGenericForm({abc : 1, def: "foo"})`
  - Returns a promise that will be resolved once the Mass Edit form has been submitted
  - The form will directly update the object/s passed to it
  - A custom name can given to the function which will be used to determine presets and pinned fields available in the form
    - e.g. `showGenericForm({color1: '#ffffff', color2: '#000000'}, 'ColorMixer')`

# 1.26.0

- AmbientLight and AmbientSound forms will now include a 'Hidden' field allowing them to be turned on/off en masse

# 1.25.1

- Began localization process
- History Randomizer and Add/Subtract bug fixes
- Add/Subtract bug fixes
- Fixed Tagger field parsing bug

Patreon: Macro Generation

- Generated Macros will now check and throw dependency warnings
- Removed non-empty selection restriction
- Added visibility control
- Support added for Randomizer and Add/subtract
- Added 'All in active Scene' targeting option
- Added 'Tagger' targeting option in macro generator

# 1.25.0

- Adding/Subtracting support for text fields
  - Text marked for removal will be removed from anywhere within the field
  - Text marked to be added will be inserted at the end of the field
  - Text to be added can be prefixed with **>>** to insert it at the beginning of the field

Patreon

- First iteration of Macro Generator
  - Accessed via a new header button
  - Allows to generate update/toggle macros for the currently selected or selected at macro run-time placeables using the fields in the Mass Edit form

# 1.24.0

- Added PlaylistSound support when selected using MDS module

# 1.23.1

- Fixed Note history update errors
- Fixed PrototypeToken updates not appearing in history
- Fixed PrototypeToken updates via MDS module not applying in some cases
- Changed the look of tabs containing checked Mass Edit checkboxes

# 1.23.0

- New setting: Update History
  - Requires game re-load to take effect
  - When enabled updates made to placeables will be tracked and accessible via Mass Edit forms
  - Past updates can be selected to be applied on the currently open Mass Edit form or copied to the modules "clipboard"
    - Updates applied to forms are limited to the fields available on the form itself, while updates copied to the clipboard are not
  - The doc affected by the update can be panned to
  - Mass Edit's randomization is supported and will be tracked in history
- New Setting: History Max Length
  - Controls how many updates will be stored by the module
- Mass Edit's checkboxes will now auto-select as soon as the user begins to type in text boxes
- Tabs will now be highlighted if they contain checked Mass Edit checkboxes

# 1.22.2

- Fixed Mass Search not selecting all matched placeables on v10
- Select check-boxes should now auto-select immediately when pasting text

# 1.22.1

- New controls to order presets and update/refresh them using currently selected fields
- Mass Edit forms have a new header button (**</>**) to display selected fields as JSON

# 1.21.0

- Added an option to export presets for ALL placeable at once
- New key-binding: Shift+X
  - Opens preset dialog for currently selected/hovered placeables to immediately apply them

# 1.20.0

- New setting: Allow manual input for range sliders
  - Converts slider value labels to text boxes

# 1.19.0

- Hovered over placeable will now always be attempted to be used as the "base" for the displayed form
  - With placeables selected hover over the placeable you wish to open the form for and press one of the key-bindings to open a Mass Edit form
  - Should be useful when wishing to apply data from a particular placeable to the others

Tagger module support

- Tagger fields now support adding/removing
- Improved searching using Tagger fields
  - Instead of attempting an exact match the module will treat entered strings as comma separated tags and will return a match as true if all tags being searched are present in a placeable
  - Order of tags does not matter

Patreon

- Improved color randomization
  - Exposed Color.js settings to control color space and hue
  - Randomizer will now default to HSL/Longer with a full color palette
- Find and Replace
  - Randomizer menus now allow to search string fields and replace text within them

# 1.16.0

- Mass permission editing support for Notes and Actors
  - New header button is available in the Mass Edit forms
- Fixed note search using icons not working as intended on v10
- Fixed common data highlighting for token scale/mirroring and note icons on v10

# 1.14.0

- Numerical values can now be added or subtracted using Right-click
- Import/Export of Presets
- Scenes will no longer appear as an option in placeable search (Shift+F)

# 1.13.0

- Shift+C will now copy data from an already open Mass Config form
  - If no form is open it will default to the original behaviour

# 1.12.2

- Fix for flags removed using -= notation not being picked up during Mass Updates

# 1.12.1

- Fixing flags not being read/applied properly due to un-flattened form data

# 1.12.0

- Added support for JournalEntry selections performed using 'Multiple Document Selection' module
  - Mass Edit key-bindings will open up configuration windows for Notes corresponding to selected Journals
  - Updates can be performed just on the current scene or across all scenes
- Fixed Note icon updates failing on Foundry v10

# 1.11.0

- Config Forms that re-render themselves should no longer wipe currently selected fields
- Fixed v10 token scale related bugs
- v10 Token Detection Modes are now fully supported
  - Works with Edit, Search, Copy, and Paste
  - Instead of overriding all detection modes the module will attempt to merge the update with the existing modes

Patreon

- To make it more comfortable to manually select checkboxes randomizer will no longer use clickable dice icons. Instead the checkboxes added by the module can now be right-clicked and will show spinning backgrounds when randomization is enabled for that field

# 1.10.2

- Fixed checkboxes not being selected in some cases when using presets
- Fixed Token scale/mirror updates not registering in v10
  - note: there are still issues with updating scale and mirroring independently using the module in v10

# 1.10.1

- v10 support
- SmallTime module support
- Presets will now display the fields they will modify when hovered over

# 1.9.1

- 'Tagger' module fields should now again work in modified config windows

# 1.9.0

- Changed default 'Shift+E' shortcut behaviour when only a single placeable is selected or hovered over
  - Instead of opening the default configuration window the modified window will always be shown regardless of the number of placeables selected
  - Previous behaviour can still be achieved via a new setting: **Single Placeable: Default Config**

# 1.8.1

- Fixed Presets not saving

# 1.8.0

New features:

- Copy/Paste
  - Placeable data can now be copied using 'Shift+C' and pasted on currently selected or hovered over placeable using 'Shift+V'. (kebindings can be re-configured)
  - Each placeable type has their own "clipboard"

- Presets
  - Modified configuration windows now have a new header button: 'Presets'
  - Allows to save currently selected fields and apply them later
  - Each placeable type has their own preset list

Misc.

- Added support for Monk's Active Tiles

# 1.7.1

- Fixed 'Apply and Update Prototypes' button not updating the prototype token

# 1.7.0

- Now works together with Actors and Scenes selected using 'Multiple Document Selection' module
- For convenience 'Shift+E' will now open up the default configuration window for hovered over placeables or single documents selected using 'Multiple Document Selection' module

# 1.6.0

- Shift+F keybinding will now check for hovered over placeables to be used as the base of the search
  - Should make it easier to find similar non-selectable placeables such as AmbientLights

# 1.5.0

- Formerly 'Multi-Token Edit'
  - Name changed to better reflect capabilities of the module
- New setting added: **Configure CSS**
  - Lets to change the look of the modified configuration window
  - Comes with some pre-made styles but can also be configured further using the CUSTOM style

# 1.4.0

- Added a new '**Apply and Update Prototypes**' button to Multi-**Token** EDIT window.
  - When pressed will apply changes to both the token on the scene as well as the prototype

# 1.3.0

- Added support for Tiles, Drawings, Walls, AmbientLights, AmbientSounds, MeasuredTemplates and Notes
- New key-binding: **Open Placeable Search and Select**
  - Opens a configuration window allowing the user to choose fields to perform a search with on the current scene and either select or select and edit all the found placeables
  - If no placeable is currently selected a Dialog will be opened to choose which type of placeable is to be searched.

- Improved handling of _null_, _undefined_ and _empty string_ data
- Added new buttons to Token and Tile HUDs to open Multi-Edit if multiple tokens or tiles are selected.

# 1.2.0

- As flags in the Token Configuration cannot be easily diff'd to determine what is actually common between the Tokens, they will now be highlighted with their own unique colour.

# 1.1.0

- Added custom title to the multi-token edit window
- Clicking form-group buttons will now also trigger the selection of the apply field checkbox.

# 1.0.0

- Initial implementation of Multi-Token Edit
