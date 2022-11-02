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
