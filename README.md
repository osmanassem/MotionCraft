# MotionCraft

Motion tools and per-unit text animation in one dockable panel for [EffectCraft](https://github.com/storytold/effectcraft). Free and open source.

MotionCraft is a single ScriptUI panel built on the After Effects scripting API that EffectCraft reimplements, so the same file also runs in Adobe After Effects.

Version 0.1.2. Tested against EffectCraft 0.21.0.

## Install

1. In EffectCraft, choose **File > Scripts > Install ScriptUI Panel…** and pick `MotionCraft.jsx`.
   (Or copy it to `Scripts/ScriptUI Panels/` in EffectCraft's settings folder.)
2. Open it from **Window > MotionCraft.jsx**. It docks like any panel and reopens at the next launch.

## Tools

### Motion tab

| Tool | What it does |
|---|---|
| Ease In / Both / Out | Sets Bezier easing on the selected keyframes with the In % and Out % influence values (speed 0). Higher values give a stronger ease; 70 is a good start. In and Out leave the other side of each key untouched. |
| Linear | Returns the selected keyframes to linear interpolation, undoing any easing. |
| Anchor point grid | Moves the anchor of each selected layer to a corner, edge midpoint or centre of its bounds. The layer stays where it is, scale and rotation included, and animated positions are offset on every key. |
| Sequence Layers | Staggers the selected layers' in-points by Offset frames. Step groups layers (Step 2 starts two layers together). Order: selection, top down, bottom up or random. |
| Sequence Keyframes | Staggers the selected keyframes (or all keys of the selected properties) layer by layer, keeping values, interpolation, eases and spatial tangents. |
| Elastic | Adds an overshoot-and-settle expression after each keyframe of the selected properties, with live sliders: MC Elastic Amplitude, Frequency, Decay. |
| Bounce | Adds a bounce-against-the-target expression with live sliders: MC Bounce Elasticity, Gravity, Count. |
| Remove | Removes MotionCraft elastic and bounce expressions from the selected properties (or the whole layer when no property is selected) and deletes their sliders once unused. |

### Text tab

Animates the selected text layers in, out, or both, unit by unit.

- **Based on:** characters, characters excluding spaces, words or lines.
- **Order:** forward, backward, centre out, edges in, random.
- **Ease:** smooth, soft, strong, back (overshoot), linear.
- **Hidden state:** what each unit looks like before it arrives and after it leaves: opacity (any value from 0 to 100; 100 leaves opacity alone), move X/Y, scale, rotation, blur, tracking. *Mirror movement on Out* sends units off the opposite way.

Timing is live. Each phase adds three sliders to the layer (`MC In Delay`, `MC In Duration`, `MC In Start`; `MC Out Delay`, `MC Out Duration`, `MC Out End`, all in frames), so you retime by dragging a slider instead of moving keyframes. The Out phase is pinned to the layer's out-point, so trimming the layer moves it. Applying again replaces the existing MotionCraft animation; **Remove** deletes it and its sliders.

Under the hood each phase is one text animator (`MotionCraft In` / `MotionCraft Out`) with an Expression Selector, so the result keeps working on machines without MotionCraft installed.

### Shapes tab

| Tool | What it does |
|---|---|
| Create shapes from vector layer | Runs EffectCraft's Create Shapes from Vector Layer on the selected SVG, PDF, AI or EPS layers. |
| Explode groups to layers | Splits each selected shape layer into one layer per top-level group, named after the group. The original is switched off. |
| Merge shape layers | Copies the groups of the selected shape layers into the topmost one, keyframes and expressions included, moving each layer's position offset onto its groups. The sources are switched off. |
| Clean empty and hidden groups | Removes empty groups and switched-off items from the selected shape layers. |

## Changes

- 0.1.2: ease influence is typed (In %, Out %) instead of sliders; new Linear button undoes easing; new Remove button undoes Elastic and Bounce.
- 0.1.1: tab contents no longer overlap the tab headers in EffectCraft; Opacity is a value instead of an on/off fade; dropdown rows line up with the number fields.
- 0.1.0: first release.

## Known limits

- Merge carries each layer's position, not its scale or rotation. Merge layers that share those first.
- Anchor point works on layers, not on individual shape groups.
- Text order and ease are fixed when you apply them (EffectCraft's scripting has no `setPropertyParameters` yet, so a dropdown control can't be labelled). Delay, Duration and Start/End stay live.

## Tests

`tests/run.sh` runs 70 checks of every tool against a headless EffectCraft (`effectcraft-cli`):

```sh
EC=/path/to/effectcraft-cli sh tests/run.sh
```

## Clean-room note

MotionCraft is original work. It was written from public feature descriptions of common After Effects workflow tools. No code, assets, interface or names from any commercial script were used, decompiled or referenced.

## License

MIT OR Apache-2.0, matching EffectCraft. Copyright (c) 2026 Osman Assem / PicklesBucket Ltd.
