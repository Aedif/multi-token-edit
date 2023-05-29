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
