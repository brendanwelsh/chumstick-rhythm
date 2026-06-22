# PlayStation DualSense (DS5) — White Skin

A fork of the **PS5 white** skin from [Istador/gamepadviewer-skins](https://github.com/Istador/gamepadviewer-skins/tree/public/playstation/ps5/white), packaged as a standalone repo for use with https://gamepadviewer.com.

## Preview

![Preview](preview.png?raw=true "Preview")

## How to use

On gamepadviewer.com, paste this into the custom CSS field on the URL-generation dialog:

```
https://brendanwelsh.github.io/Playstation-DS5-White/style.css
```

(Enable GitHub Pages on `main` / root for the link above to serve.)

## What's in here

The skin is a set of SVG asset layers + a single `style.css` that positions and animates them in response to gamepad input:

- `base.svg` / `shell.svg` — controller body
- `abxy.svg` — face buttons (Cross / Circle / Square / Triangle, shown at all times)
- `dpad.svg` — directional pad
- `sticks.svg` — analog sticks
- `triggers.svg` / `bumpers.svg` — L1/L2/R1/R2
- `back_start.svg` — Create / Options
- `touchpad.svg` — center touchpad
- `lightbar.svg` — light bar above touchpad
- `meta.svg` — PlayStation logo button
- `disconnected.svg` — fallback when no controller is connected
- `preview.png` — static preview image

## Credit

- Original skin: [Istador/gamepadviewer-skins](https://github.com/Istador/gamepadviewer-skins) (MPL-2.0)
- Underlying gamepad viewer: https://gamepadviewer.com (mrmcpowned)

## License

Mozilla Public License 2.0 — see [LICENSE.md](LICENSE.md). Modifications to source files must remain MPL-2.0; combined works can be under another license as long as the MPL files keep their notices.
