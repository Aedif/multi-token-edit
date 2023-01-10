![GitHub Latest Version](https://img.shields.io/github/v/release/Aedif/multi-token-edit?sort=semver)
![GitHub Latest Release](https://img.shields.io/github/downloads/Aedif/multi-token-edit/latest/multi-token-edit.zip)
![GitHub All Releases](https://img.shields.io/github/downloads/Aedif/multi-token-edit/multi-token-edit.zip)

# Mass Edit

FoundryVTT module for searching and editing multiple placeables at the same time.

Support me on [Patreon](https://www.patreon.com/Aedif) to get access to the the version that supports field [randomization](#randomization) and automatic [Macro Generation](#macro-generator).

_Note that all keybinding referenced bellow can be changed via 'Configure Controls'_

Recommended modules:

- Select Tool Everywhere (https://foundryvtt.com/packages/select-tool-everywhere)
  - Will allow to select normally un-selectable placeables such as lights and templates
- Multiple Document Selection (https://foundryvtt.com/packages/multiple-document-selection)
  - Will enable selection of multiple documents in the sidebar
  - Mass Edit will recognise these selection for Actors, Scenes, and Journals

Checkout v1.9.1 showcase by BaileyWiki [here](https://www.youtube.com/watch?v=_X5NHwiw0Cw).

As well as a v1.13.0 showcase in German by TomVTT [here](https://www.youtube.com/watch?v=j7gUJHveU7s)

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

## Brush Tool

This tool can be activated by clicking the brush icon in the header of Mass Edit forms

Once selected your cursor will be transformed into a brush allowing you click and drag over placeables on the canvas to apply fields selected in the form onto them.

https://user-images.githubusercontent.com/7693704/211565859-0cc6105d-f023-4f84-9b85-5593475e5bc0.mp4


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

https://user-images.githubusercontent.com/7693704/196006020-9d308238-1888-4b98-b452-e7ce88a643ac.mp4

## Macro Generator

Using the selected fields the module will generate simple macros that will update/toggle data on plceables.

**Target**

Define the target for the macro

- IDs of Current Selected (IDs of placeables are stored within the macro and will only affect them)
- All Selected (macro will target selected placeables at run-time)
- All in active Scene (macro will target all placeable on the active scene)
- Tagger (macro will target Tagger module's tags)

**Method**

How the fields should be be applied

- Update (direct update)
- Toggle (2 alternating updates)

Randomization and Add/Subtract operators are supported but will add a dependency and require Mass Edit to be active when they are run.

Example video:

https://user-images.githubusercontent.com/7693704/199100945-1f338240-ace7-41cc-ac74-b59e67681c50.mp4

