# Rear View — Nevernude

A standalone fifty-work sculpture gallery at https://never-nude.github.io/rear-view/.
It reuses Atrium’s collection interface and native Three.js, AR and VR viewers.

- Browse, search, filter, save and preview the selected works.
- Open a full-screen 3D study, orbit, zoom and adjust the existing display controls.
- On supported devices, use Apple Quick Look AR, WebXR AR or immersive WebXR VR.
- Verified dimensions, approximate dimensions and adjustable display sizes retain Atrium’s evidence and labels.

## Develop

Requires Node 24 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4321/rear-view/.

```sh
npm run build
npm run check:gallery
npm run test:viewer
```

GitHub Actions publishes `main` to GitHub Pages. The base path is `/rear-view/`.
The original Nevernude homepage and Atrium site are independent of this project.

## Source and rights

Selection: the fifty works requested in the accompanying Codex chat, in its listed order.
Underlying interface and catalog source: `never-nude/atrium.earth` revision
`c0dacac0da71f5dc994998b635fee3de20f57c3e`.

Atrium software is MIT licensed; its notice is retained in LICENSE. Each work retains
its source records, attribution, scan license and dimensional evidence on its detail
page. Assets are exact serving derivatives from Atrium, copied to this origin for
cross-origin independent viewing. Upstream asset URLs remain in the evidence data;
only the delivery location changes. The source assets have individual licenses.
See docs/assets.json for the serving-asset manifest.

Physical AR placement and immersive headset sessions require compatible hardware
and HTTPS. Desktop checks cannot establish phone/headset tracking quality.
