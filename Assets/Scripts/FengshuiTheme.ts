// FengshuiTheme.ts — the Lens's own visual identity, replacing the stock SnapOS
// UIKit look (flat grey plates + grey buttons) with a lacquered jade-and-gold
// language that matches the feng-shui subject.
//
// WHY A SEPARATE MODULE: every panel and button in FengshuiUI is built by code,
// so without a single source of truth the theme would be smeared across a dozen
// creation sites and drift. Tune the constants here and the whole Lens moves.
//
// HOW IT REACHES THE PIXELS:
//   • Buttons — Element.visual is a RoundedRectangleVisual with per-STATE
//     gradients (default / hovered / triggered) plus per-state border colors.
//   • Panels — BackPlate keeps its RoundedRectangle private and only exposes
//     three canned `style` presets ("default" | "dark" | "simple"), none of
//     which are ours. But BackPlate.onAwake creates that RoundedRectangle on
//     its OWN SceneObject, so we fetch the component off the object and drive
//     it directly. That is the only way to get a custom panel fill + border.
//
// TIMING: apply AFTER UIKit has initialized (Element builds its visual in its
// own OnStart). FengshuiUI calls applyTheme from the frame-3 startup gate,
// which is guaranteed to be past every component's OnStart.

import {RoundedRectangle, GradientParameters} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {RoundedRectangleVisual} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"

// ── Palette ──────────────────────────────────────────────────────────────────
// Deep lacquer green-black rather than SnapOS neutral grey: it reads as
// lacquered wood at 110cm and lets jade/gold text sit on it at full strength.
// ALPHA MUST BE 1 ON EVERY FILL STOP. RoundedRectangle renders with
// BlendMode.PremultipliedAlphaAuto and the stock BackPlate styles are all
// fully-opaque greys (HSV value 0.09→0.26, alpha 1) — the panel's see-through
// quality comes from the blend mode, not from stop alpha. Authoring stops at
// alpha ~0.95 washed the panels out to near-invisible and erased the button
// plates entirely. Tune brightness with RGB, never with alpha.
// Brightness, not darkness, is what makes a plate READ here: these surfaces
// composite additively over the passthrough scene, so a fill darker than the
// room disappears instead of dimming it. The stock greys sit at 0.09→0.26 and
// that is the luminance band to match — go below it and the panel vanishes
// (first attempt at 0.02→0.13 was invisible). Same hue, stock luminance.
// Panels are the QUIET layer: desaturated toward teal-ink so jade/gold text and
// the jade buttons sit on top of them instead of competing with them.
const INK_TOP = new vec4(0.085, 0.185, 0.160, 1)
const INK_BOTTOM = new vec4(0.038, 0.092, 0.082, 1)
const JADE_EDGE = new vec4(0.45, 0.85, 0.62, 0.70)

// Buttons sit ON the panels, so they are a step LIGHTER, not darker — a darker
// button on a dark panel reads as a hole rather than an affordance.
const BTN_TOP = new vec4(0.190, 0.430, 0.310, 1)
const BTN_BOTTOM = new vec4(0.090, 0.230, 0.175, 1)
const BTN_HOVER_TOP = new vec4(0.320, 0.640, 0.450, 1)
const BTN_HOVER_BOTTOM = new vec4(0.170, 0.390, 0.280, 1)
// Press flashes gold — the one warm accent, so a confirmed tap is unmistakable.
const BTN_PRESS_TOP = new vec4(0.520, 0.430, 0.190, 1)
const BTN_PRESS_BOTTOM = new vec4(0.300, 0.240, 0.110, 1)

const BTN_EDGE = new vec4(0.95, 0.80, 0.40, 0.60)
const BTN_EDGE_HOVER = new vec4(0.98, 0.88, 0.55, 0.85)
const BTN_EDGE_PRESS = new vec4(1.0, 0.92, 0.62, 1.0)

const PANEL_RADIUS = 1.6
const PANEL_BORDER_SIZE = 0.035
const BTN_RADIUS = 1.1
const BTN_BORDER_SIZE = 0.05

function linear(top: vec4, bottom: vec4): GradientParameters {
  return {
    enabled: true, type: "Linear", start: new vec2(0, 1), end: new vec2(0, -1),
    stop0: {enabled: true, percent: 0, color: top},
    stop1: {enabled: true, percent: 1, color: bottom},
  } as GradientParameters
}

const PANEL_FILL = linear(INK_TOP, INK_BOTTOM)
const BTN_FILL = linear(BTN_TOP, BTN_BOTTOM)
const BTN_FILL_HOVER = linear(BTN_HOVER_TOP, BTN_HOVER_BOTTOM)
const BTN_FILL_PRESS = linear(BTN_PRESS_TOP, BTN_PRESS_BOTTOM)

/**
 * Theme a BackPlate's panel surface. `so` is the SceneObject carrying the
 * BackPlate — its RoundedRectangle sibling is what we actually paint.
 * Each property group is guarded independently so one unsupported setter on a
 * future UIKit version degrades that detail instead of dropping the whole theme.
 */
export function themePlate(so: SceneObject, radius: number = PANEL_RADIUS): void {
  if (!so || isNull(so)) return
  const rr = so.getComponent(RoundedRectangle.getTypeName()) as RoundedRectangle | null
  if (!rr || isNull(rr)) return
  try {
    rr.gradient = true
    rr.setBackgroundGradient(PANEL_FILL)
  } catch (e) {
    print("[FengshuiTheme] panel fill skipped: " + e)
  }
  try {
    rr.cornerRadius = radius
  } catch (e) {
    print("[FengshuiTheme] panel radius skipped: " + e)
  }
  try {
    rr.border = true
    rr.borderSize = PANEL_BORDER_SIZE
    ;(rr as any).borderColor = JADE_EDGE
  } catch (e) {
    print("[FengshuiTheme] panel border skipped: " + e)
  }
}

/** Theme a UIKit Button: jade fill, gold edge, gold flash on press. */
export function themeButton(btn: Button): void {
  if (!btn || isNull(btn)) return
  let v: RoundedRectangleVisual | null = null
  try {
    v = btn.visual as RoundedRectangleVisual
  } catch (e) {
    return
  }
  if (!v) return
  try {
    v.defaultBaseType = "Gradient"
    v.hoveredBaseType = "Gradient"
    v.defaultGradient = BTN_FILL
    v.hoveredGradient = BTN_FILL_HOVER
    v.triggeredGradient = BTN_FILL_PRESS
  } catch (e) {
    print("[FengshuiTheme] button fill skipped: " + e)
  }
  try {
    v.cornerRadius = BTN_RADIUS
  } catch (e) {
    print("[FengshuiTheme] button radius skipped: " + e)
  }
  // Border is PER-STATE on RoundedRectangleVisual — `borderSize`/`hasBorder`
  // are getter-only aggregates, so writing them throws ("Cannot assign to
  // property 'borderSize' which has only a getter") and takes the whole block
  // with it. The real setters are defaultHasBorder / defaultBorderSize / … .
  try {
    const anyV = v as any
    anyV.isBorderGradient = false
    anyV.defaultHasBorder = true
    anyV.hoveredHasBorder = true
    anyV.triggeredHasBorder = true
    anyV.defaultBorderSize = BTN_BORDER_SIZE
    anyV.hoveredBorderSize = BTN_BORDER_SIZE
    anyV.triggeredBorderSize = BTN_BORDER_SIZE
    anyV.borderDefaultColor = BTN_EDGE
    anyV.borderHoveredColor = BTN_EDGE_HOVER
    anyV.borderTriggeredColor = BTN_EDGE_PRESS
  } catch (e) {
    print("[FengshuiTheme] button border skipped: " + e)
  }
}
