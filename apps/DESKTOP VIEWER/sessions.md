# Nexia Desktop DICOM Viewer - Agent Handoff

Last updated: 2026-05-30
Workspace: `C:\BUILD DESKTOP VIEWER`
Primary route used during development: `http://localhost:5991/mobile`

## Purpose

This repository started as a mobile-oriented DICOM viewer. It is being converted into a desktop diagnostic viewer with a dense header-based study and series browser, configurable toolbar, right-click tools, multi-viewport reading, MPR, and CT 3D rendering.

This file is the canonical handoff for the next AI agent. A legacy file named `session.md` also exists and contains earlier implementation history. Do not delete it unless explicitly requested.

## User Preferences

- Respond in Indonesian unless the user changes language.
- Implement requested changes directly; avoid stopping at a proposal.
- Keep progress updates short while working.
- Preserve the current neutral dark UI. Do not introduce green as the dominant interface color.
- Keep toolbar controls compact, icon-first, and dense.
- Use tooltips for icons without visible labels.
- Avoid adding explanatory text inside the viewer UI unless clinically useful.
- Verify frontend changes with `npm run build`.
- Do not revert unrelated dirty-worktree changes.

## Run And Verify

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 5991
npm run build
```

Expected build status:

- `npm run build` currently succeeds.
- Vite emits expected Cornerstone codec warnings about browser externalization of `fs` and `path`.
- Vite emits a large chunk warning. This is currently informational.
- Use `git diff --check` after edits.
- Manual testing still matters because DICOM rendering behavior depends on actual modality metadata and server responses.

## Entry Points And Routing

Main application entry: `src/App.tsx`

Supported routes:

- `/login`
- `/service` for protected user and role administration. The viewer intentionally has no shortcut to this route.
- `/`
- `/mobile`
- `/mobile/:studyUID`
- `/mobile/:studyUID/series/:seriesUID`
- `/study/:studyUID` redirects to `/mobile/:studyUID`

Deep links accept query variants:

- `studyUID`
- `StudyInstanceUIDs`
- `StudyInstanceUID`
- `seriesUID`
- `SeriesInstanceUID`
- `mode=stack`
- `mode=mpr`
- optional `accession`
- optional `patientId`

`ViewerDeepLinkLoader` loads the study and series, chooses the requested series or the first renderable image series, updates Zustand state, and normalizes the URL.

The root route can be disabled by `/settings.json`:

```json
{
  "worklistEnabled": false
}
```

When disabled, users are expected to enter through a RIS deep link.

## Authentication And Feature Permissions

Auth modules:

- `src/features/auth/authStore.ts`
- `src/features/auth/permissions.ts`
- `src/features/auth/AuthPages.tsx`
- `server/authApi.mjs`
- `server/index.mjs`

All viewer routes require an authenticated session. `/service` additionally requires the `service.manage` permission. The service console supports:

- create, edit, enable, disable, and delete users
- username, password, and full name
- create, edit, and delete roles
- assign granular feature permissions to roles
- assign multiple roles to each user

Bootstrap account for first access:

```text
username: admin
password: admin123
```

Change this password from `/service` after the first login.

Runtime:

- Development: `npm run dev` serves the viewer and `/api/auth/*` on `http://localhost:5991`.
- Production: run `npm run build`, then `npm start`; `server/index.mjs` serves `dist` and `/api/auth/*` on the same origin.
- The auth database is stored server-side at `server/data/auth-db.json` by default.
- Override the database path with `NEXIA_AUTH_DB`.
- Session cookie expiry defaults to 1000 days and can be changed with `NEXIA_SESSION_TTL_DAYS`.
- RIS can auto-login users without showing the login form through:
  - `POST /api/auth/ris/launch`
  - `GET /api/auth/ris/consume?token=...`
- `POST /api/auth/ris/launch` must include the shared secret header `RIS-Desktop-Sec`.
- Set the shared secret with `NEXIA_RIS_SHARED_SECRET`.
- Launch tokens are one-time use and default to 60 seconds. Change with `NEXIA_RIS_LAUNCH_TTL_SECONDS`.
- The launch token is exchanged for the normal `HttpOnly` session cookie, whose expiry is controlled by `NEXIA_SESSION_TTL_DAYS`.
- The returned launch URL is `http://host/Viewer?launch=...`.
- RIS payload is expected to send user identity plus `accession`/`accessionNumber`; VEXA resolves Accession Number to StudyInstanceUID through QIDO.
- RIS role values are ignored. Existing VEXA user roles are preserved; new RIS-created users default to `Clinician` until changed in `/service`.

Feature permission enforcement currently covers:

- opening the viewer with `study.view`
- related patient history query and display
- viewport layout editing
- series drag and drop
- IntelliLink
- toolbar favorites, appearance, and hotkey settings
- toolbar items
- stack and MPR context menus
- stack and MPR hotkeys
- MPR, 3D Bone, 3D Cursor, Crosshair, reference lines, reformat controls, and DICOM tags

Security model:

- User records, password hashes, roles, permissions, and sessions are stored server-side.
- Passwords are hashed with Node `crypto.scrypt` and per-user salts.
- Browser JavaScript never receives password hashes or session tokens.
- Sessions use an opaque server-side token stored in a `HttpOnly`, `SameSite=Lax` cookie named `nexia_session`.
- Mutating auth requests validate request origin against the current host.
- A hidden `/service` URL is not a security mechanism; the route is protected by `service.manage`.
- For hospital-wide SSO, replace the local auth API with OIDC/Keycloak/IdP integration while keeping the same frontend permission surface.

## Main Architecture

### State

Central store: `src/features/viewer/viewerStore.ts`

The Zustand store owns:

- active study and active series
- selected viewport key
- per-viewport stacks, slice indexes, zooms, and WW/WL
- viewport layout
- viewport command queue
- selected active tool
- Reference Line toggle
- stack 3D cursor world point
- MPR mode, MPR volume id, selected MPR viewport, and MPR slice info
- IntelliLink settings
- loading, error, and annotation count

### DICOMweb Client

Client: `src/features/dicomweb/client.ts`
Configuration: `src/config/dicomweb.ts`

The client handles:

- QIDO-RS study search
- series listing
- instance listing and instance headers
- WADO-RS image ids
- metadata registration for Cornerstone
- renderable-image filtering
- waveform extraction
- Structured Report parsing
- series thumbnail generation

Important functions:

- `searchStudies()`
- `getStudy(studyInstanceUid)`
- `listSeries(studyInstanceUid)`
- `listInstances(series)`
- `listInstanceHeaders(series)`
- `createWadoRsImageId(instance, frame)`
- `createWadoRsImageIds(instances)`
- `registerWadoRsMetadata(instances)`
- `generateSeriesThumbnail(series, size)`
- `getSeriesWaveform(series)`
- `getSeriesStructuredReport(series)`

Multi-frame instances are expanded into frame-specific WADO-RS image ids. Use `isRenderableImageInstance()` before loading image stacks or volumes.

### Cornerstone Initialization

Initialization: `src/features/viewer/cornerstone/initCornerstone.ts`

Cornerstone core, tools, and DICOM image loader are initialized once. The image loader injects the configured authorization header and currently uses one worker.

Registered Cornerstone tools include:

- WW/WL
- Pan
- Zoom
- Stack Scroll
- Length
- Arrow Annotate
- Circle ROI
- Magnify
- Planar Freehand ROI
- Angle
- Cobb Angle
- Bidirectional
- Rectangle ROI
- Elliptical ROI
- Probe
- Crosshairs
- Reference Lines
- Trackball Rotate

## Desktop Header Study And Series Browser

Component: `src/features/studies/StudyList.tsx`
Primary desktop browser: `StudyHeaderBrowser`

The header is split into:

- left: compact study list
- divider: draggable width resizer
- right: horizontally scrollable series thumbnails

The whole header height is also resizable from `src/App.tsx`.

Study list rows intentionally use a simple custom design rather than copying the reference screenshot. Each row combines:

- study description
- study date
- accession number

For deep links, related studies are filtered by the same patient identity. A selected related study is pinned into the series strip rather than replacing previously shown study groups.

### Multi-Study Behavior

When one study is shown:

- no study-color dot is rendered

When two or more studies are pinned:

- series are grouped by study
- each group gets a divider with modality and study date
- each study receives a stable color
- thumbnail dots and viewport dots use the same stable study color

Do not derive a new color when a series is dragged into a viewport. Preserve the decorated series metadata.

### Series Thumbnail Behavior

Thumbnails:

- are portrait-oriented compact cards
- display modality and series description
- show image count in a small white badge with black non-bold text
- support drag-and-drop into a target viewport
- use a minimal horizontal scrollbar

Thumbnail generation uses actual decoded image pixels with metadata-aware grayscale rendering. It tries modality window information and percentile-based fallback contrast so CT/MR thumbnails remain distinguishable rather than uniformly dark or washed out.

## Viewer Shell

Component: `src/features/viewer/ViewerShell.tsx`

`ViewerShell` orchestrates:

- toolbar
- viewport layout selector
- normal stack viewport grid
- drag-and-drop destinations
- waveform and SR fallback rendering
- MPR mode
- selected-tile CT 3D mode
- settings dialog
- tag browser
- ambient light test
- IntelliLink controls

Supported layouts:

- `1x1`
- `1x2`
- `2x1`
- `1x3`
- `3x1`
- `2x2`
- `2x3`
- `3x2`
- `3x3`

Layout semantics were fixed: `2x1` means two columns by one row visually, while `1x2` means one column by two rows.

## Toolbar And Settings

Settings dialog lives inside `src/features/viewer/ViewerShell.tsx`.

The dialog has two tabs:

- `Toolbar`
- `Appearance`

Toolbar favorites, appearance settings, and hotkey overrides are stored per-user on the server through:

```text
GET/POST /api/auth/preferences
```

The frontend must not use `localStorage` or `sessionStorage` for auth or user settings.

### Toolbar Favorites

Users can choose:

- toolbar groups
- individual measurement items
- individual spatial items
- individual utility items

When an individual item is promoted as a favorite, it appears as a standalone toolbar button and is removed from its original dropdown group to avoid duplication.

### Appearance

Users can choose:

- show toolbar
- enable right-click menu

The app prevents both interaction surfaces from being disabled simultaneously. When the main toolbar is hidden, the slim toolbar panel remains visible with:

- layout selector at the far left
- settings at the far right

This is intentional. Do not hide the entire ribbon container.

The same positioning rule applies while the toolbar is visible:

- Viewport Layout is always the first control at the far left.
- Settings is always anchored at the far right.
- Favorite clinical tools render in a separate centered ribbon zone between those two controls.
- Neither control participates in Toolbar Favorites and neither may be moved by user customization.

### Hotkeys

Settings includes a `Hotkeys` tab. Each tool has a read-only shortcut field:

- click the field and press a keyboard key or key combination to assign it
- press `Backspace` while the field is focused to clear it
- press `Escape` to leave the field without changing it
- use the clear icon beside a field to remove its shortcut
- use `Reset Default` to restore all default shortcuts

When a shortcut is assigned to a new tool, it is automatically removed from the previous tool to prevent conflicts. Normal stack viewports, MPR viewports, toolbar dropdowns, and right-click menus all use the same effective shortcut configuration.

## Normal Stack Viewports

Component: `src/features/viewer/components/DicomViewport.tsx`

Normal stack viewports use a shared rendering engine:

```text
nexia-stack-rendering-engine
```

Shared engine helper:

```text
src/features/viewer/cornerstone/stackRenderingEngine.ts
```

The shared engine is required for Reference Lines to work across normal viewports. Cleanup is reference-counted so the engine is destroyed only after the final stack viewport unmounts.

### Loading Flow

When a series is selected or dropped:

1. `ViewerShell` calls `listInstances(series)`.
2. Instances are filtered with `isRenderableImageInstance()`.
3. Renderable instances are expanded to WADO-RS image ids.
4. Metadata is registered.
5. The resulting stack is assigned to the selected viewport.
6. If there are no image ids, waveform parsing is attempted.
7. If there is no waveform, Structured Report parsing is attempted.

### Drag And Drop

Series thumbnails emit:

```text
application/nexia-series
```

Payload:

```ts
{
  study: StudySummary
  series: SeriesSummary
}
```

Viewport drop handlers preserve the target viewport key and load the selected series there.

### Persistent And One-Shot Tools

Persistent tools:

- WW/WL
- Pan
- Zoom
- Scroll
- Magnify
- 3D Cursor
- None

Annotation tools reset to WW/WL after use. This matches the requested one-shot interaction model for measurements and drawing tools.

### Modifier Gestures

Available regardless of the selected tool:

- hold `Ctrl`, left-drag vertically: zoom
- hold `Shift`, left-drag: pan

## Context Menu And Hotkeys

Canonical menu configuration:

```text
src/features/viewer/components/DicomViewport.tsx
```

Exports:

- `viewportMenuSections`
- `hotkeyActions`
- `toHotkey()`
- `hasActiveMenuItem()`
- `isEditableEventTarget()`

Both normal stack viewport and MPR import the same menu configuration. Do not create a shorter MPR-only list again.

Menu groups:

- Image Navigation
- Image Display
- Window Presets
- Measurements
- Annotations
- Orientation
- MPR/Reformat
- DICOM Info

Current hotkeys:

| Tool | Hotkey |
| --- | --- |
| Pan | `T` |
| Window/Level | `W` |
| Series Scroll | `S` |
| Zoom | `Z` |
| Magnify | `A` |
| Length | `M` |
| Probe | `P` |
| Angle | `E` |
| Cobb Angle | `C` |
| CTR 4 Point | `K` |
| Bidirectional | `B` |
| Rectangle ROI | `U` |
| Ellipse ROI | `O` |
| Freehand ROI | `F` |
| Text Marker | `G` |
| Arrow Marker | `Y` |
| Circle Marker | `J` |
| Lung preset | `1` |
| Bone preset | `2` |
| Brain preset | `3` |
| Mediastinum preset | `4` |
| Soft Tissue preset | `5` |
| Zoom In | `+` |
| Zoom Out | `-` |
| Zoom to Fit | `Shift+F` |
| Zoom 1:1 | `X` |
| Rotate CW | `R` |
| Rotate CCW | `Shift+R` |
| Rotate 180 | `Shift+0` |
| Flip Horizontal | `Shift+H` |
| Flip Vertical | `Shift+V` |
| MPR | `Alt+M` |
| 3D Bone | `Alt+3` |
| 3D Cursor | `D` |
| Crosshair | `H` |
| Reference Line | `L` |
| Cycle Orthogonal Planes | `Alt+C` |
| Reset MPR Rotate | `Alt+R` |
| Invert LUT | `I` |
| Image Overlay | `V` |
| DICOM Tag Browser | `Q` |

Context menus:

- open with right-click
- switch submenu on hover without requiring a click
- clamp their position so menus remain visible near the bottom edge
- close when clicking outside
- honor the Appearance toggle

## Measurements And Custom Draw Tools

Normal stack viewer supports Cornerstone measurements plus custom overlays.

Cornerstone-backed tools:

- Length
- Probe
- Angle
- Cobb Angle
- Bidirectional
- Rectangle ROI
- Ellipse ROI
- Freehand ROI

Custom stack tools:

- `CTR4Point`
- `TextMarker`
- `ArrowMarker`
- `CircleMarker`

### CTR 4 Point

Click order:

1. left chest border
2. right chest border
3. left heart border
4. right heart border

The result renders chest width, cardiac width, and CTR. Result text is draggable and deletable.

## Reference Lines

Reference Lines are enabled by default and can be toggled from the toolbar or right-click menu.

For normal stack viewports:

- all stack viewports share a rendering engine
- reference lines refresh after stack scroll and image-id changes

For MPR:

- Reference Lines are configured against volume viewports
- source viewport follows the selected MPR viewport

## IntelliLink

IntelliLink options:

- Scroll
- WW/WL
- Pan
- Zoom

The implementation is metadata-aware rather than only broadcasting viewport indexes. It uses DICOM spatial metadata to find compatible target slices where possible:

- Image Position Patient
- Image Orientation Patient
- Frame of Reference UID

It supports more than two viewports by broadcasting linked commands to compatible target stacks.

## Stack 3D Cursor

Normal stack 3D Cursor is separate from MPR Crosshairs.

Behavior:

1. Select `3D Cursor`.
2. Click or drag in a source stack viewport.
3. The pointer is converted from canvas coordinates to a DICOM world point.
4. Other spatially related stack viewports locate the nearest matching slice.
5. Target viewports jump to that slice.

The source viewport displays a lightweight cursor dot. The dot is intentionally a screen indicator, not a persistent annotation.

## MPR Mode

Component: `src/features/viewer/components/MprViewer.tsx`

MPR is CT-oriented in the current shell. It renders a volume using three orthographic panes:

- axial
- sagittal
- coronal

The layout is `1x3`.

Each tile supports:

- active-tile selection
- double-click maximize and restore
- orientation cycling
- slice thickness menu
- Normal or MIP blend mode
- slice navigation
- WW/WL
- zoom
- pan
- preset application
- standard Cornerstone Crosshairs
- separate custom 3D Cursor

### MPR Crosshairs

Crosshairs are built-in Cornerstone crosshairs. They are not the same as the custom 3D Cursor.

The implementation contains stabilization logic after orientation changes:

- reset clipping range
- restore slab and blend settings
- update slice info
- render across animation frames
- reorder tool-group viewports to keep axial, sagittal, and coronal resolution stable

### MPR 3D Cursor

MPR also has a separate draggable 3D Cursor:

- clicking places a world coordinate
- related MPR viewports jump to the point
- SVG overlays display the cursor position

### MPR Presets And Spatial Commands

MPR supports:

- Lung, Bone, Brain, Mediastinum, and Soft Tissue preset
- Zoom In and Zoom Out
- Zoom 1:1
- Zoom to Fit
- Invert LUT
- Rotate CW, Rotate CCW, Rotate 180
- Flip Horizontal and Flip Vertical

### MPR Context Menu

MPR uses the same `viewportMenuSections` and `hotkeyActions` as the normal stack viewport. The right-click menu is intentionally identical.

Important limitation:

- Some normal-stack-only tools remain visible because the user explicitly requested identical menus.
- Custom stack draw tools such as CTR and custom text/shape markers are not fully reimplemented for volume MPR panes.
- If extending them, preserve the shared menu configuration and add MPR execution support rather than forking the menu.

### Hidden MPR Free Rotate Work

There is retained experimental free-rotate implementation in `MprViewer.tsx`.

It can:

- maximize one MPR pane
- rotate the camera with direct quaternion manipulation
- scroll along the current oblique normal
- reset rotation

The user asked to remove Free Rotate from the visible header. The implementation remains but its toolbar entry is hidden. Do not surface it again without an explicit request.

## CT 3D Bone Viewer

Component: `src/features/viewer/components/Bone3DViewer.tsx`

CT 3D uses:

- Cornerstone `VOLUME_3D`
- cached volume loading
- vtk transfer functions
- Trackball Rotate
- pan and zoom

Behavior:

- 3D opens only in the currently selected viewport tile
- other tiles remain normal
- entering MPR clears 3D mode
- changing study clears 3D mode
- pointer capture selects the 3D tile correctly

Current default AP camera:

```ts
viewPlaneNormal: [0, -1, 0]
viewUp: [0, 0, 1]
```

The 3D options menu includes presets and rendering controls such as quality, shift, shade, ambient, diffuse, specular, and camera reset.

## ECG And Structured Report

Components:

- `src/features/viewer/components/EcgWaveformViewport.tsx`
- `src/features/viewer/components/StructuredReportViewport.tsx`

If a series has no renderable pixel images:

1. attempt waveform extraction
2. otherwise attempt Structured Report parsing

SR content uses smaller viewport typography for readability. ECG renders waveform channels and cursor details.

## Files To Read First

For most viewer tasks, inspect these files in this order:

1. `sessions.md`
2. `src/features/viewer/ViewerShell.tsx`
3. `src/features/viewer/viewerStore.ts`
4. `src/features/studies/StudyList.tsx`
5. `src/features/viewer/components/DicomViewport.tsx`
6. `src/features/viewer/components/MprViewer.tsx`
7. `src/features/dicomweb/client.ts`
8. `src/index.css`

Additional focused files:

- `src/features/viewer/components/Bone3DViewer.tsx`
- `src/features/viewer/components/EcgWaveformViewport.tsx`
- `src/features/viewer/components/StructuredReportViewport.tsx`
- `src/features/viewer/cornerstone/initCornerstone.ts`
- `src/features/viewer/cornerstone/stackRenderingEngine.ts`
- `src/features/viewer/annotationActions.ts`

## Dirty Worktree Warning

At the time this handoff was generated, the workspace contained uncommitted implementation changes. Treat them as intentional user work. Do not reset, checkout, or revert them unless the user explicitly requests it.

## Manual Regression Checklist

After meaningful viewer edits, manually test with real DICOM data:

1. Open a RIS-style deep link.
2. Confirm related patient studies appear in the header.
3. Open a second study and verify grouped series colors remain stable.
4. Drag two different series into a multi-viewport layout.
5. Confirm thumbnail and viewport dots match.
6. Scroll series and verify Reference Lines update.
7. Enable IntelliLink across more than two viewports.
8. Test `Ctrl` + left-drag zoom and `Shift` + left-drag pan.
9. Right-click a normal stack viewport near the bottom edge.
10. Enter MPR and right-click each MPR pane near the bottom edge.
11. Confirm the MPR menu matches the normal viewport menu and shows hotkeys.
12. Test MPR presets, zoom, invert, rotate, flip, Crosshairs, and 3D Cursor.
13. Open CT 3D in one tile while another tile remains usable.
14. Open SR and ECG series if test data is available.
15. Hide the toolbar in Settings and confirm the slim panel still contains layout and Settings.

## Known Follow-Ups

- Manually validate the newest full MPR right-click menu using a loaded CT volume. Build verification passed, but the automated browser session did not have a selected MPR-capable series.
- Decide whether stack-only custom draw tools should be implemented for MPR volume panes. They are currently visible in the shared menu for consistency.
- Consider splitting large Vite bundles if production load performance becomes a concern.
- The repository `README.md` is still the default Vite template and should eventually be replaced with a user-facing project README.

## Latest Verification

Latest verification command:

```powershell
npm run build
```

Result: success.

Latest checked implementation:

- `3D Cursor` and `Crosshair` are separate tools. Do not merge them:
  - `3D Cursor` uses `Stack3DCursor` and hotkey `D`.
  - `Crosshair` uses Cornerstone `CrosshairsTool` through store id `Crosshairs` and hotkey `H`.
- MPR right-click now works.
- MPR uses the same full grouped context menu as normal stack viewport.
- MPR menu displays the same hotkeys.
- MPR utility callbacks are wired through `ViewerShell`.
- MPR zoom, preset, invert, reset, rotate, and flip command handling is implemented.
- Context menu position is clamped to reduce clipping near viewport edges.
- Toolbar groups now use the canonical right-click menu sections:
  - Image Navigation
  - Image Display
  - Window Presets
  - Measurements
  - Annotations
  - Orientation
  - MPR/Reformat
  - DICOM Info
- Toolbar favorites can select complete groups or individual tools from those sections.
- Existing toolbar favorite values are migrated to the new grouped default when old ids are detected.
- Viewport Layout and Settings remain available as fixed operational controls. IntelliLink remains an additional synchronization control.
- Viewport Layout is structurally pinned to the far left and Settings is structurally pinned to the far right in both visible-toolbar and hidden-toolbar modes.
