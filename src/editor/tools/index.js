/**
 * Tool registry of the level editor (docs/contracts/LEVEL_EDITOR.md §7).
 *
 * Tools are view-agnostic singletons. Views translate pointer input into a PointerEv and forward
 * left-button strokes (pointerDown → pointerMove* → pointerUp) to the active tool; hover moves
 * are forwarded to pointerMove too (tools track their own pressed state). Tools wrap strokes in
 * state.begin()/commit() and emit state.emit('preview') when their preview changes.
 *
 * Callers: EditorApp (activate / deactivate on `tool` events and resets, keyDown before the
 * editor shortcuts), Map2DView and Viewport3D (pointer*, preview, cursorFor, cursor).
 */

/**
 * CSS cursor over the map views while the tool is active.
 * @typedef {'default'|'crosshair'|'cell'|'move'|'copy'|'pointer'} ToolCursor
 */

/**
 * @typedef {object} Tool
 * @property {string} id                  registry key (`state.toolId`, `__editor.tools[id]`)
 * @property {string} label               toolbar / menu name
 * @property {string} shortcut            single key shown in tooltips / menus
 * @property {string} icon                inline SVG string
 * @property {string} help                status-bar text ("name — tip")
 * @property {string} [tip]               what the tool does (the help without its name: toolbar
 *                                        tooltip; `help` when absent)
 * @property {ToolCursor} cursor          default cursor (cursorFor may refine it)
 * @property {(state: EditorState) => void} [activate]
 *   the tool became active (also the second half of a reset)
 * @property {(state: EditorState) => void} [deactivate]
 *   another tool takes over (or a reset): end a stroke, drop the preview
 * @property {(ev: PointerEv, state: EditorState) => void} pointerDown
 *   left button pressed: a stroke starts
 * @property {(ev: PointerEv, state: EditorState) => void} pointerMove
 *   stroke move, and hover moves without a stroke
 * @property {(ev: PointerEv, state: EditorState) => void} pointerUp
 *   the stroke ends (`ev.cancelled`: it was interrupted — commit nothing new, see PointerEv)
 * @property {(e: KeyboardEvent, state: EditorState) => boolean} [keyDown]
 *   true = handled (the editor shortcut is skipped)
 * @property {(state: EditorState) => ToolPreview|null} preview
 *   what the views draw for the tool now (null: nothing)
 * @property {(ev: PointerEv, state: EditorState) => string} [cursorFor]
 *   optional contextual cursor (falsy: `cursor`)
 */

/**
 * The Place tool's extension: the rotation it remembers per object type (ToolOptions' rotate
 * buttons read and set it).
 * @typedef RotatableTool
 * @type {Tool & {
 *   getRotation: (state: EditorState) => number,
 *   setRotation: (state: EditorState, radians: number) => void,
 * }}
 */

/**
 * A pointer position in map coordinates, built by the views (Map2DView `_pev`, Viewport3D
 * `pickAt`). Tools read `i` … `pickRadius` and `cancelled`; the 3D-only members serve the 3D
 * view itself (hover, sky clicks, focus) and the context menu.
 * @typedef {object} PointerEv
 * @property {number} i                   tile column under the pointer (may be outside the map)
 * @property {number} j                   tile row under the pointer (may be outside the map)
 * @property {number} x                   world point on the terrain (2D: rounded to 3 decimals; 3D:
 *                                        clamped to 24 tiles around the map beyond its edge)
 * @property {number} z                   (see x)
 * @property {number} y                   ground height there (2D: from the height grid, 0 off the map)
 * @property {number} button              0 left, 1 middle, 2 right (the context menu); -1 for moves
 *                                        (2D: the DOM `button`, so also -1 for stroke moves; 3D: 0
 *                                        for every stroke event, -1 for hover moves)
 * @property {boolean} shift              Shift held
 * @property {boolean} ctrl               Ctrl or ⌘ held
 * @property {boolean} alt                Alt held
 * @property {'2d'|'3d'} view             the view that built it
 * @property {string|null} hitObjectId    level object under the pointer
 * @property {boolean} hitSpawn           pointer is over the player-start marker
 * @property {number} [pickRadius]        world size of ~7 screen px at the pointer (handles, drag
 *                                        thresholds); both views set it, tools fall back without it
 * @property {boolean} [cancelled]        pointerUp only (both views set it on every pointerUp): the
 *                                        stroke was interrupted, not released — commit nothing new.
 *                                        What pointerDown / pointerMove already applied stays and is
 *                                        committed (an open transaction is always closed); an edit
 *                                        or selection change made on release is skipped (Rectangle,
 *                                        Place's region / dragged line, Select's box and click-
 *                                        narrowing, Player start's selecting the marker it moved).
 *                                        True for a pointercancel, a lost pointer capture,
 *                                        hiding the view, a lost release (a mouse move without the
 *                                        button, or the same pointer pressed again); 2D also a window
 *                                        blur; 3D also a tool switch, disposing the view
 * @property {number} [buttons]           (3D only) the DOM `buttons` bitmask
 * @property {boolean} [onTerrain]        (3D only) the ray hit the map (false: fallback plane / sky)
 * @property {'top'|'side'|'plane'|'none'} [face]   (3D only) what the ray hit (a tile top, a cliff
 *                                        face, the fallback plane beyond the map, nothing / the sky)
 * @property {number} [surfaceY]          (3D only) visible surface height hit (the water surface
 *                                        on water)
 * @property {number} [clientX]           (3D only) the client-space pointer position
 * @property {number} [clientY]           (3D only) see clientX
 */

/**
 * What the views draw for the active tool (Map2DView `_drawPreview`, Viewport3D overlays /
 * ghost / outline); every member is optional.
 * @typedef {object} ToolPreview
 * @property {{i: number, j: number}[]} [cells]
 *   tiles to tint (brush footprint, fill area, hover cell)
 * @property {string} [cellColor]                    CSS colour of those tiles
 * @property {LevelObject} [ghost]
 *   a level object (id '') drawn translucent where the next placement lands
 * @property {{x0: number, z0: number, x1: number, z1: number}} [line]
 *   line placement: start → pointer
 * @property {{minX: number, maxX: number, minZ: number, maxZ: number}} [rect]
 *   box select / rect placement / rectangle tool (world units)
 * @property {string|null} [label]                   tooltip text beside the pointer (null: none)
 * @property {{ids: string[], color: string}|null} [highlight]
 *   extension: outline these objects (CSS colour)
 * @property {{x: number, z: number, facing: LevelSpawn['facing']}} [spawn]
 *   extension: ghost player-start marker
 */
import { SelectTool } from './SelectTool.js';
import { PaintTool } from './PaintTool.js';
import { FillTool } from './FillTool.js';
import { RectTool } from './RectTool.js';
import { HeightTool } from './HeightTool.js';
import { StairsTool } from './StairsTool.js';
import { PlaceTool } from './PlaceTool.js';
import { SpawnTool } from './SpawnTool.js';
import { EyedropperTool } from './EyedropperTool.js';
import { EraseTool } from './EraseTool.js';

/**
 * @import { EditorState } from '../EditorState.js'
 * @import { LevelObject, LevelSpawn } from '../../engine/level/types.js'
 */

/** @type {Tool[]} in toolbar order */
export const TOOLS = [
  SelectTool, PaintTool, FillTool, RectTool, HeightTool, StairsTool, PlaceTool, SpawnTool, EyedropperTool, EraseTool,
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

/** @returns {Tool} (the select tool for unknown ids) */
export function getTool(id) {
  return BY_ID.get(id) ?? SelectTool;
}

/** Tools that paint terrain (show the tile palette). */
export const TERRAIN_TOOL_IDS = ['paint', 'fill', 'rect'];

export { selectionHandles, areaAt } from './SelectTool.js';
export { HEIGHT_MODES } from './HeightTool.js';
export { STAIRS_CHARS, stairsFor } from './StairsTool.js';
export * as ToolOps from './common.js';
