# 🌿 Verdura — Landscape Studio

A browser-based landscape design app. Design a yard completely from scratch in
3D, or upload a photo of your actual yard — it gets reconstructed as a 3D model
using in-browser AI depth estimation, and you can add or remove elements on top
of it.

## Running

Any static file server works. From this folder:

```
python3 -m http.server 8971
```

then open http://localhost:8971 (an internet connection is needed the first
time, for the Three.js CDN and — in photo mode — a one-time ~45 MB depth-model
download that the browser caches).

## Design mode (from scratch)

- **41 procedural elements** — trees, shrubs, flowers, hardscape, structures
  (pergola, fence, fire pit…), water features, decor, and buildings:
  three single-story homes (ranch, cottage, L-shaped ranch), three two-story
  homes (colonial, modern, farmhouse), outbuildings (detached garage, barn,
  shed), and commercial buildings (storefront, office, warehouse). Every
  placement is seed-randomized so no two oaks look alike.
- **Draw tool (walls & paving)**: rock walls, concrete walls, walkways, and
  driveways (concrete or asphalt) are *drawn*, not placed — click points on
  the ground, double-click or Enter to finish, Esc to cancel. The path is
  smoothed into a spline, swept to the right width, and follows the terrain
  (rock walls are built stone-by-stone along the curve). Curves re-conform
  automatically after sculpting.
- **Custom colors**: buildings and structures have Body and Roof/Accent color
  pickers in the selection panel (walls, fences, pergolas, and benches are
  recolorable too). Reset restores the defaults.
- **Terrain**: Raise/Lower sculpting brushes plus ground paint
  (grass / soil / mulch / stone / sand / beauty bark). Objects re-seat on the new height.
- **Editing**: click to select, drag to move, rotate/scale sliders,
  `R` rotate, `Del` delete, `Esc` deselect, `G` grid,
  Ctrl/Cmd+`Z` undo. Right-drag orbits, scroll zooms, Top button for plan view.
- **Sun slider** simulates time of day (light angle, warmth, sky color).

## From Photo mode

1. Upload a photo of your yard.
2. Depth Anything V2 runs locally in your browser (WebGPU, falls back to WASM)
   and the photo is unprojected into a true 3D relief — orbit to see it.
3. Place any palette element into the scene; it sits on the photographed
   ground and casts shadows onto the photo.
4. **Scene size** slider calibrates real-world scale (the photo view doesn't
   change — only how big a "3 m tree" looks). Adjust until a placed tree looks
   right.
5. **Erase tool** removes real elements from the photo: Alt-click (or first
   click) picks a clean source patch, then drag over the thing to remove —
   a feathered clone stamp paints it out.
6. If the AI model can't load (offline), it falls back to a flat-backdrop mode
   with a horizon slider.

## Photoscanned models

The oak, pine, jacaranda, shrub, and boulder use real photoscanned models from
[Poly Haven](https://polyhaven.com) (CC0), processed in Blender: foliage is
reduced by pruning whole leaf clusters and enlarging the survivors (which keeps
canopies full at ~5% of the source triangles), solids are decimated, textures
capped at 1k, and everything is meshopt-compressed (`assets/models/`, ~9 MB
total, 40–175k triangles each). They load asynchronously at startup and swap in
over the procedural versions; if the files can't load (offline, or the shared
artifact build), the procedural low-poly versions are used automatically.

## Model credits

Photoscanned/3D models are CC0 from [Poly Haven](https://polyhaven.com)
(deciduous tree, bigleaf maple tree, shore pine, Douglas fir, huckleberry
bush, boulder) and CC-BY from Sketchfab — thanks to: Helindu (Japanese
maple), vasil--0 (arborvitae), lolipop_1707 (birch), whitewashstudio
(azalea bush used for hedge & rhododendron), strielecki (craftsman house),
mbuannoart (two-story house), volvor (red barn), Poligonik (garden shed),
shooter24994 (bench), abby (fire pit). All processed and optimized for
this app; remaining items are original procedural models.

## Cost estimator

The 💲 panel keeps a running, itemized estimate of everything in the active
design — grouped with quantities (e.g. "Shrub ×4"), a line total each, and a
grand total. Defaults are 2026 US mid-range *installed* prices (see
`js/costs.js` for sources); **every price is editable** — click a number to
use your own rates, and edits persist with Save/Export. Drawn items (rock
walls, concrete walls, walkways) show their length and pre-fill a suggested
cost from a per-linear-foot rate, which the landscaper can overwrite per item
(marked ✎). Buildings and driveways are context only and are never estimated.
Toggle the panel with the 💲 button.

## Saving

- **Save / Load** — browser localStorage (includes the photo, its depth map,
  and your erase edits, so nothing recomputes on reload).
- **Export / Import** — the same state as a portable `.json` file.
- **📷** — download a rendered PNG snapshot.

## Tech

Plain ES modules, no build step. Three.js 0.169 (CDN import map),
@huggingface/transformers v3 for depth (`onnx-community/depth-anything-v2-small`).

| File | Role |
|---|---|
| `js/app.js` | UI, worlds, tools, undo, save/load |
| `js/assets.js` | 29 procedural asset builders |
| `js/terrain.js` | sculptable/paintable ground |
| `js/photo.js` | depth pipeline, relief mesh, clone stamp |
| `js/storage.js` | localStorage + file download helpers |

Known limits: erasing edits the photo *texture* only (the depth bump of an
erased object remains, visible when orbiting far off-angle); monocular depth is
relative, hence the manual Scene size calibration.
