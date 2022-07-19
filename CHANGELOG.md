# 1.3.0

- Added support for Tiles, Drawings, Walls, AmbientLights, AmbientSounds, MeasuredTemplates and Notes
- New key-binding: **Open Placeable Search and Select**

  - Opens a configuration window allowing the user to choose fields to perform a search with on the current scene and select all the found placeables
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
