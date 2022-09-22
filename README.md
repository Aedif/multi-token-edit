![GitHub Latest Version](https://img.shields.io/github/v/release/Aedif/multi-token-edit?sort=semver)
![GitHub Latest Release](https://img.shields.io/github/downloads/Aedif/multi-token-edit/latest/multi-token-edit.zip)
![GitHub All Releases](https://img.shields.io/github/downloads/Aedif/multi-token-edit/multi-token-edit.zip)

# Mass Edit

FoundryVTT module for searching and editing multiple placeables at the same time.

Support me on [Patreon](https://www.patreon.com/Aedif) to get access to the the version that supports field [randomization](#randomization).

_Note that all keybinding referenced bellow can be changed via 'Configure Controls'_

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


## Example Video

The video bellow shows off Mass Search and Edit being used on various placeables:

https://user-images.githubusercontent.com/7693704/179762435-e0f11294-35ed-4cd2-bb88-30d440a3a990.mp4

## Randomization

At the moment a [Patreon](https://www.patreon.com/Aedif) exclusive feature:

https://user-images.githubusercontent.com/7693704/182151974-a5994aea-1975-4342-a0b5-1a2d5e5574c4.mp4
