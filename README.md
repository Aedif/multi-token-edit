![GitHub Latest Version](https://img.shields.io/github/v/release/Aedif/multi-token-edit?sort=semver)
![GitHub Latest Release](https://img.shields.io/github/downloads/Aedif/multi-token-edit/latest/multi-token-edit.zip)
![GitHub All Releases](https://img.shields.io/github/downloads/Aedif/multi-token-edit/multi-token-edit.zip)

# Mass Edit

FoundryVTT module for searching and editing multiple placeables at the same time.

Support me on [Patreon](https://www.patreon.com/Aedif) to get access to the the version that supports field [randomization](#randomization).

_Note that all keybinding referenced bellow can be changed via 'Configure Controls'_

Recommended modules:

- Select Tool Everywhere (https://foundryvtt.com/packages/select-tool-everywhere)
  - Will allow to select normally un-selectable placeables such as lights and templates
- Multiple Document Selection (https://foundryvtt.com/packages/multiple-document-selection)
  - Will enable selection of multiple documents in the sidebar
  - Mass Edit will recognise these selection for Actors, Scenes, and Journals

## Editing

Select the placeables you wish to edit and press '**Shift+E**'.

You will be presented with the following modified 'Configuration' window:

![image](https://user-images.githubusercontent.com/7693704/179863478-b651523d-d669-4821-8dc4-cf17ca9c87eb.png)

Common data shared between all placeables will be highlighted as green, differing data as orange, and flags as purple. The newly added checkboxes to the right indicate which fields will be saved on Apply.

In addition to this key-binding Token and Tile HUDs will contain a new button if multiple tokens or tiles are selected which will also open up this modified configuration window.

![simpleEdit](https://user-images.githubusercontent.com/7693704/184878288-e6f9294b-f988-4a3b-9a7b-5e6769f639e4.gif)

## Search

An alternative to selecting placeables manually is to press '**Shift+F**' to open a configuration window which will allow you to perform scene wide searches using the selected fields.

![simpleSearch](https://user-images.githubusercontent.com/7693704/184878790-ac87fb25-477c-4307-9b4d-74244aee6ac2.gif)

## Copy/Paste

Specific data can be copied from placeables using 'Shift+C'. Data copied this way can be pasted on any selected or hovered over placeables using 'Shift+V'. Each placeable type has it's own "clipboard" from which data will be pasted.

![simpleCopyPaste](https://user-images.githubusercontent.com/7693704/184879606-0674dc54-f05e-4866-b623-4b0c1e424698.gif)

## Presets

Any configuration window opened using the module will have a 'Presets' header button. It will open up a window where you can store currently selected fields and re-use them later.

![simplePreset](https://user-images.githubusercontent.com/7693704/184880356-fb816824-9624-4a2c-a673-09d9c57765c7.gif)

## Adding/Subtracting

Numerical fields can be added and subtracted instead of overriding the current value. This can be done by right-clicking the numerical controls in the Mass-Edit form. Green background indicating addition, and red subtraction.

![addSubtract](https://user-images.githubusercontent.com/7693704/191852899-a9447d21-76b3-44c5-b586-dcbe68c7a692.gif)

## Permission Editing

Note and Token/Actor forms will contain a 'Permissions' header button allowing you to change access for any selected note, token, or actor.

![Permissions](https://user-images.githubusercontent.com/7693704/192584817-7ed7b710-ad44-41f3-ab82-93a962084aa4.png)

## View selected fields as JSON

All Mass Edit forms have a header button (**</>**) that will open up a dialog with currently selected fields displayed as JSON

![image](https://user-images.githubusercontent.com/7693704/195932291-59d7e0ae-f279-4b09-9c9a-37d077ab3e35.png)

## History

When enabled in the module settings, updates made to placeables will be tracked and available via Mass Edit forms. These updates can be selected to be applied to the currently open form or copied to the module's clipboard to be pasted on other placeables.

![History](https://user-images.githubusercontent.com/7693704/197341186-503648b5-5703-4b78-b27d-0895b4b5dc76.gif)


## Example Video

The video bellow shows off Mass Search and Edit being used on various placeables:

https://user-images.githubusercontent.com/7693704/179762435-e0f11294-35ed-4cd2-bb88-30d440a3a990.mp4

## Randomization

At the moment a [Patreon](https://www.patreon.com/Aedif) exclusive feature.

Randomize any numerical, color, text, image, drop-down, or coordinate values.

Text
  - Can use either the provided name generators or your own list of strings to choose from
  - Find and Replace text within the selected field

Numerical
  - Randomize value between the minimum and maximum ranges
  - "Step Size" controls the granularity of the generated numbers
    - Min: 0, Max: 10, Step Size: 0.1, RNG => 0.5, 7.2, 9.9 etc.
    - Min: 0, Max: 10, Step Size: 1, RNG => 3, 5, 9 etc.
  - Instead of picking random numbers the module can also be instructed to interpolate values, returning sequentially larger ones

Coordinate
  - Will pick random non-overlapping coordinates within the bounding square
  - Define the bounds either manually or using the 'Select Range' tool
  - Snap to grid tool will adjust the selected range to overlap with the grid

Drop-down
  - Will allow to select all values within the dropdown that you wish to include in the randomization

Image
  - Uses a list of image paths to randomly select images from
  - The list can be populated either manually, using Folder Select tool, or Token Variant Art if installed
  - Images can also be applied sequentially in list order rather than randomly
  - Supports Find and Replace

Color
  - Randomizes using the range defined by two selected colors, space, and hue
  - By default full color spectrum will be selected for you, but you may define your own color ranges
  - Supports interpolation

Boolean
  - Simple On/Off randomization 50/50

https://user-images.githubusercontent.com/7693704/196006020-9d308238-1888-4b98-b452-e7ce88a643ac.mp4



