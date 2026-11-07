# Session Summary

## Project Context

- Workspace: `C:\BUILD VIEWER`
- App: React/TypeScript DICOM viewer using Cornerstone3D and vtk.js.
- User prefers Indonesian responses and direct implementation.
- Verification command used repeatedly: `npm run build`.
- Build currently succeeds. Vite warnings about Cornerstone codec modules externalizing `fs`/`path` and large chunks are expected warnings, not build errors.
- `npm run lint` was not re-run in the latest turns because earlier it failed from pre-existing issues:
  - `src/features/studies/StudyList.tsx:193:17` React purity issue around `Date.now`.
  - `src/features/viewer/ViewerShell.tsx:151:7` synchronous setState in effect.

## Major Features Completed Earlier

### Series Thumbnails

- Updated thumbnail generation in `src/features/dicomweb/client.ts`.
- Supports multi-frame image candidates via `createWadoRsImageId(instance, frame)`.
- Uses metadata window candidates and percentile auto-contrast fallback.
- User accepted brighter thumbnail behavior.

### CTR 4 Point

- Added custom `CTR 4 Point` measurement.
- Relevant files:
  - `src/features/viewer/ViewerShell.tsx`
  - `src/features/viewer/components/DicomViewport.tsx`
  - `src/index.css`
- Behavior:
  - Click order: left chest, right chest, left heart, right heart.
  - Renders vertical green guide lines, chest/heart horizontal lines, and Heart/Chest/CTR text.
  - Result text is smaller, centered below measurement lines, movable, and deletable.
  - Auto-switches back to `WindowLevel` after completion.

### Custom Marker Tools

- Added custom overlay marker tools under Measurements:
  - `TextMarker`
  - `ArrowMarker`
  - `CircleMarker`
- Relevant files:
  - `src/features/viewer/ViewerShell.tsx`
  - `src/features/viewer/components/DicomViewport.tsx`
  - `src/index.css`
- Behavior:
  - Text typed directly inside viewport.
  - Arrow has no text.
  - Circle has no ROI info.
  - All custom markers are movable/deletable.

### Spatial Tools

- Added Spatial toolbar group and commands:
  - Horizontal Flip
  - Vertical Flip
  - Rotate Clockwise 90
  - Rotate Counter-clockwise 90
  - Rotate 180
  - Magnifying Glass
  - Zoom to 1x
  - Zoom to Fit
  - Zoom Input
- Shutter options are present but disabled.
- Registered `MagnifyTool`.
- Removed shortcut indicators `O`, `=`, `-`.
- `Zoom to 1x` and `Zoom Input` use absolute `setDisplayArea({ type: 'SCALE', scale })`.
- Added minimalist/transparent scrollbar styling for `.ribbon-dropdown`.

## 3D Bone Viewer Work

### Initial 3D Mode

- Added `src/features/viewer/components/Bone3DViewer.tsx`.
- Added `3D` toolbar button for CT series in `ViewerShell.tsx`.
- Uses Cornerstone3D `Enums.ViewportType.VOLUME_3D`, `volumeLoader.createAndCacheVolume`, and `setVolumesForViewports`.
- Applies CT bone transfer function with vtk `PiecewiseFunction` and `ColorTransferFunction`.
- Default interactions:
  - left drag rotate
  - right drag pan
  - wheel zoom
- Added `3D Rotate` toolbar button visible only while 3D exists.
- Tried vtk `OrientationMarkerWidget`, then added fallback CSS cube, later removed the cube per user request.

### 3D Display Options UI

- Display options are now hidden by default.
- Top-right small icon button opens 3D display menu.
- The icon is CSS-only, not text `3D`.
- UI theme changed from blue to neutral dark/gray after user feedback.
- Menu contains:
  - `Rendering Presets`
  - `Rendering Options`
- `Rendering Options` includes:
  - Quality
  - Shift
  - Shade
  - Ambient
  - Diffuse
  - Specular
  - Reset 3D Camera
- `Rendering Presets` was originally modal/grid thumbnails, then changed by user request to a small minimal list attached near the top-right menu.
- Preset list now:
  - Is text-only, no thumbnail boxes.
  - Has search input.
  - Has internal scroll/bounded height.
  - Has no Cancel button.
  - Can be closed by clicking outside using `.bone-3d-dismiss-layer`.
- Removed bottom-right cube orientation button.

### 3D Rendering Presets

- Presets live in `Bone3DViewer.tsx` as `renderingPresets`.
- Current preset labels include:
  - CT-AAA
  - CT-AAA2
  - CT-Bone
  - CT-Bones
  - CT-Cardiac
  - CT-Chest-Contrast
  - CT-Fat
  - CT-Lung
  - CT-MIP
  - CT-Muscle
  - CT-Soft-Tissue
  - MR-Default
- Clicking a preset updates:
  - quality
  - shift
  - shade
  - ambient
  - diffuse
  - specular
  - transfer function colors

### 3D Default Orientation And Tool

- User wanted default 3D orientation facing front/AP.
- Initial attempt used `viewPlaneNormal: [0, 1, 0]`, user said it faced backward.
- Current default camera uses:
  - `viewPlaneNormal: [0, -1, 0]`
  - `viewUp: [0, 0, 1]`
- Implemented in `setDefaultApCamera(viewport)` inside `Bone3DViewer.tsx`.
- User wanted `Rotate3D` active by default, but other tools must still work afterward.
- Current behavior:
  - `setActiveTool('Rotate3D')` runs once when `Bone3DViewer` mounts.
  - It does not force back to `Rotate3D` if user selects `WW/WL`, `Zoom`, `Pan`, etc.

## Multi-Viewport 3D Behavior

### User Requirement

- User wants layout formats from existing footer/control to work in 3D context: `1x2`, `2x1`, `2x2`.
- Important clarification: selecting `2x2` must not render 3D in all tiles.
- 3D should only fill the selected viewport when user presses the `3D` button.
- Other viewports should remain empty/normal so user can select them and load other series.

### Current Implementation

- `ViewerShell.tsx` no longer bypasses the grid for 3D.
- `volume3dViewport` state tracks one 3D viewport:
  - `{ key: string; series: SeriesSummary } | null`
- The `3D` toolbar button toggles 3D only for `selectedViewportKey` using the selected viewport's CT series.
- If the selected viewport already has 3D, pressing `3D` turns it off.
- Other viewport tiles render their normal contents (`DicomViewport`, `EcgWaveformViewport`, `StructuredReportViewport`, or empty state).
- Selecting/adding a series to another viewport does not clear existing 3D.
- 3D is cleared when switching study or entering MPR.
- `Bone3DViewer` now accepts `viewportKey` to generate unique ids per tile:
  - `ct-bone-3d-viewport-${viewportKey}`
  - `ct-bone-3d-engine-${viewportKey}`
  - `ct-bone-3d-tools-${viewportKey}`
- This avoids conflicts if future work supports multiple simultaneous 3D tiles.

### Latest Bug Fix

- Problem: after filling another viewport, user could not select the viewport containing 3D.
- Cause: VTK/Cornerstone canvas was swallowing click/pointer events before the tile selection handler.
- Fix:
  - `Bone3DViewer` now accepts `onSelect?: () => void`.
  - Root `.bone-3d-viewer` calls `onPointerDownCapture={onSelect}`.
  - `ViewerShell` passes `onSelect={() => setSelectedViewportKey(key)}` for the 3D tile.
- Build succeeded after this change.

## Important User Feedback And Preferences

- User dislikes delays or long silent waits. Keep progress updates concise and avoid seeming stuck.
- User does not want extra layout controls in toolbar because layout control already exists in footer.
- Do not add UI controls unless requested or clearly needed.
- User wants minimal, neat UI for 3D preset dropdown.
- User disliked blue 3D menu styling; use neutral dark/gray.
- User disliked thumbnail/color-box preset grid; use text list.
- User asked to remove bottom-right cube; it has been removed.

## Files Modified Most Recently

- `src/features/viewer/components/Bone3DViewer.tsx`
  - Per-viewport unique ids.
  - Default AP camera.
  - Default `Rotate3D` active once on mount.
  - 3D display options menu/preset list.
  - `onSelect` capture handler for selecting 3D viewport.
- `src/features/viewer/ViewerShell.tsx`
  - `volume3dViewport` state for one selected-tile 3D render.
  - 3D toggle uses selected viewport's CT series.
  - Normal grid remains active while 3D tile exists.
  - Passes `onSelect` to `Bone3DViewer`.
- `src/index.css`
  - 3D options button/menu/panel/preset list styling.
  - Removed cube styling.

## Current Verification Status

- Last command run: `npm run build`
- Result: success.
- Build warnings remain only Vite/Cornerstone codec and chunk-size warnings.

## Latest Reference Line Fix

- Problem: Reference Line did not update/show correctly between two normal stack viewports, e.g. left axial and right sagittal.
- Cause: each `DicomViewport` created its own Cornerstone `RenderingEngine`, while Cornerstone `ReferenceLinesTool` in the installed version only evaluates viewports within the same rendering engine.
- Fix:
  - Added `src/features/viewer/cornerstone/stackRenderingEngine.ts`.
  - Normal stack viewports now share `nexia-stack-rendering-engine`.
  - Added reference-counted cleanup so the shared engine is destroyed only after the last stack viewport unmounts.
- Follow-up fix:
  - Stack scrolling changes the current image via `STACK_NEW_IMAGE`, which does not reliably trigger `ReferenceLinesTool` recalculation.
  - `DicomViewport` now schedules an explicit reference-line refresh after stack scroll and after `setImageIdIndex` commands complete.
- Toggle behavior:
  - Reference Line remains enabled by default.
  - `Tools > Reference Line` now toggles visibility on/off via `referenceLinesEnabled` in `viewerStore`.
  - When disabled, scroll-triggered refresh will not re-enable reference lines.
- Verification:
  - `npm run build` succeeded.
  - Existing Vite/Cornerstone codec and chunk-size warnings remain expected warnings.

## Stack 3D Cursor Work

- User wanted RadiAnt-style `3D Cursor` for normal multi-viewport stack reading, not only MPR.
- Intended use case:
  - Load separate but spatially related axial/sagittal/coronal series into different normal viewports.
  - Works for CT or MRI if the series share DICOM patient/world coordinates.
- Implementation:
  - Added global `stack3dCursor` state in `src/features/viewer/viewerStore.ts`.
  - Added `Tools > 3D Cursor` in `src/features/viewer/ViewerShell.tsx`.
  - Implemented custom stack cursor behavior in `src/features/viewer/components/DicomViewport.tsx`.
  - Clicking with `3D Cursor` active converts canvas point to DICOM world point via `viewport.canvasToWorld`.
  - Other stack viewports find the closest slice by `ImagePositionPatient` + `ImageOrientationPatient`, then jump via `setImageIdIndex`.
  - Each stack viewport renders a lightweight SVG crosshair overlay at `viewport.worldToCanvas(worldPoint)`.
- Follow-up UX change:
  - Overlay changed from crosshair lines to dot only.
  - `3D Cursor` can now be dragged; pointer move updates the DICOM world point and syncs the other stack viewports.
  - Source viewport uses the active pointer canvas position immediately so the dot stays under the selected anatomy while placing/dragging.
- Follow-up cursor semantics:
  - Dot is now only a screen cursor indicator, not an image/world annotation.
  - Dot is not projected from world coordinates and does not persist on target viewports.
  - Slice sync still uses the clicked/dragged DICOM world coordinate internally.
- This is intentionally separate from MPR `CrosshairsTool`; MPR still uses the existing built-in Cornerstone crosshair behavior.
- Verification:
  - `npm run build` succeeded.

## MPR Crosshair Axis Rotation Fix

- User reported that when `Crosshair` is active in MPR, cycling/rotating an axis can make another MPR viewport render as a thin clipped strip until the viewport is moved.
- Implementation:
  - `src/features/viewer/components/MprViewer.tsx` now stabilizes MPR viewports after an orientation change by resizing, resetting VTK clipping ranges, restoring slab/blend settings, updating slice info, and rendering all MPR viewports across two animation frames.
  - The MPR Crosshairs tool state is recomputed after orientation changes so old crosshair plane state does not survive the new axis.
  - Crosshair reference lines remain controllable, draggable/rotatable, and slab-thickness controls remain enabled because doctors need those MPR controls.
  - For 4-up MPR layouts with duplicate orientations, the Crosshairs tool group viewport order is now stabilized before recompute so the first three Crosshairs planes resolve to one axial, one sagittal, and one coronal viewport when available. This mirrors the stable 3-plane behavior seen in OHIF-style MPR and avoids degenerate/parallel plane combinations causing clipped-strip rendering.
  - Crosshair-driven camera changes now schedule an extra clipping-plane update and render over the next two animation frames.
  - Clipping reset now prefers Cornerstone core `updateCameraClippingPlanesAndRange()` so actor clipping planes follow oblique/rotated Crosshair camera changes, not just the VTK renderer range.
- Verification:
  - `npm run build` succeeded.

## MPR Basic Tool Bindings

- User requested MPR mode support for Scroll, WW/WL, Zoom, and Pan.
- Implementation:
  - `src/features/viewer/components/MprViewer.tsx` now maps `activeTool === 'Scroll'` to Cornerstone `StackScrollTool` in MPR.
  - `StackScrollTool` is no longer included in the managed primary-tool passive loop, so wheel scrolling is not accidentally unbound when switching tools.
  - Added helper binding logic:
    - Scroll tool active: primary mouse + wheel scroll.
    - WW/WL, Zoom, Pan, Crosshair, Reference Line, and measurements: their primary binding stays active while wheel scroll remains available.
- Verification:
  - `npm run build` succeeded.

## MPR Free Rotate Tool

- User clarified the desired feature is single-viewport free rotate MPR, not CrosshairsTool and not linked multi-viewport oblique.
- Implementation:
  - MPR-only toolbar toggle in `src/features/viewer/ViewerShell.tsx` is now labeled `Free Rotate`.
  - When active, `src/features/viewer/components/MprViewer.tsx` maximizes the currently selected MPR viewport to 1-up.
  - Crosshair, ReferenceLines, and StackScroll tools are disabled while Free Rotate is active so the direct camera handlers own mouse/wheel input.
  - Left mouse drag directly rotates the active orthographic volume viewport camera:
    - horizontal drag yaws around current `viewUp`
    - vertical drag pitches around current view-right
  - Uses `gl-matrix` `quat` and `vec3`; camera basis is re-orthogonalized on every drag to prevent drift.
  - `TrackballRotateTool` exists in this Cornerstone package, but it is already used for 3D rendering; MPR Free Rotate uses manual direct camera manipulation on the ORTHOGRAPHIC volume viewport.
  - Free Rotate drag now stops propagation on mouse down, ignores sub-pixel jitter, uses sensitivity `0.007`, and follows the yaw/pitch signs from the latest reference.
  - Rotation preserves `focalPoint`; wheel scroll moves `focalPoint` along the current `viewPlaneNormal`.
  - Wheel listener uses `{ passive: false }`; all mouse/wheel/window listeners are removed on cleanup.
  - Overlay label now updates to `A`, `C`, `S`, or `oblique` from the current `viewPlaneNormal`.
  - Added `Reset Rotate` toolbar action while Free Rotate is active; it restores the active viewport to sagittal orientation and keeps `focalPoint`.
- Follow-up:
  - User said the intended behavior is still not matching the desired workflow.
  - The `Free Rotate` toolbar item is now hidden in `src/features/viewer/ViewerShell.tsx` using the `hidden` attribute.
  - The implementation remains in the codebase for now, but users will not see or activate the toolbar button.
- Verification:
  - `npm run build` succeeded.

## Potential Follow-Ups

- Manually test 3D tile selection after loading a second series into another tile.
- If user wants multiple independent 3D tiles later, current unique ids make that feasible, but `volume3dViewport` currently tracks only one 3D tile by design.
- If AP/front is still visually wrong on some datasets, orientation may need to consider DICOM orientation metadata instead of hardcoded `[0, -1, 0]`.
