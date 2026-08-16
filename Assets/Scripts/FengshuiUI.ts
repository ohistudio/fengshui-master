// FengshuiUI.ts — all UI surfaces for the Fengshui Lens (UIKit primitives only).
// Panels: control (always visible), score gauge, problems/plan panel, compare panel
// (crossfade slider + spatialize), plus world-space problem markers.
// Root SceneObject is positioned at (0, 0, -110) by the bootstrap.

import {FlexLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import {FlexItem} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {
  FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import {BackPlate} from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {RoundedRectangleVisual} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual"
import {GradientParameters} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {themePlate, themeButton} from "./FengshuiTheme"
import {S, getLang, setLang, onLangChange, directionName} from "./FengshuiStrings"

// ── Assets (baked references — no @input) ────────────────────────────────────
const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const TEX_BOKEH: Texture = requireAsset("../Textures/bokeh.png") as Texture
const TEX_PILL: Texture = requireAsset("../Textures/pill.png") as Texture

// Fengshui slider theme: jade -> gold flow fill over a deep-forest track
const SLIDER_TRACK_GRAD: GradientParameters = {
  enabled: true, type: "Linear", start: new vec2(0, 1), end: new vec2(0, -1),
  stop0: {enabled: true, percent: 0, color: new vec4(0.07, 0.14, 0.1, 0.95)},
  stop1: {enabled: true, percent: 1.0, color: new vec4(0.04, 0.09, 0.07, 0.95)},
}
const SLIDER_FILL_GRAD: GradientParameters = {
  enabled: true, type: "Linear", start: new vec2(-1, 0), end: new vec2(1, 0),
  stop0: {enabled: true, percent: 0, color: new vec4(0.35, 0.75, 0.5, 0.95)},
  stop1: {enabled: true, percent: 0.6, color: new vec4(0.55, 0.88, 0.55, 0.95)},
  stop2: {enabled: true, percent: 1.0, color: new vec4(0.95, 0.8, 0.45, 0.95)},
}
const SLIDER_KNOB_GRAD: GradientParameters = {
  enabled: true, type: "Radial", start: new vec2(0, 0), end: new vec2(1, 0),
  stop0: {enabled: true, percent: 0, color: new vec4(0.9, 1.0, 0.92, 1.0)},
  stop1: {enabled: true, percent: 1.0, color: new vec4(0.45, 0.85, 0.6, 1.0)},
}
const ICON_SPA: Texture = requireAsset("../Icons/spa.png") as Texture
const ICON_CAMERA: Texture = requireAsset("../Icons/photo_camera.png") as Texture
const ICON_WAND: Texture = requireAsset("../Icons/wand_stars.png") as Texture // "magic at work" icon beside the loading bar
const ICON_CHECK: Texture = requireAsset("../Icons/check_circle.png") as Texture
const ICON_REPLAY: Texture = requireAsset("../Icons/replay.png") as Texture
const ICON_AR: Texture = requireAsset("../Icons/view_in_ar.png") as Texture
const ICON_VOL_ON: Texture = requireAsset("../Icons/volume_up.png") as Texture
const ICON_VOL_OFF: Texture = requireAsset("../Icons/volume_off.png") as Texture
const ICON_CB_ON: Texture = requireAsset("../Icons/check_box.png") as Texture
const ICON_CB_OFF: Texture = requireAsset("../Icons/check_box_outline_blank.png") as Texture
const ICON_DRAG: Texture = requireAsset("../Icons/drag_handle.png") as Texture
const ICON_MIC: Texture = requireAsset("../Icons/mic.png") as Texture
const ICON_360: Texture = requireAsset("../Icons/360.png") as Texture
const ICON_PREV: Texture = requireAsset("../Icons/chevron_left.png") as Texture
const ICON_NEXT: Texture = requireAsset("../Icons/chevron_right.png") as Texture

// Every lazily-shown panel root. Three loops (startup scale-down, the startup
// gate, and setImmersive) must agree on this list or a panel is left un-gated.
const PANEL_KEYS = ["score", "problems", "images", "master"]

// ── Typography: the single source of truth for text size + weight ────────────
const FONT_SIZE_SCALE = 1.0

type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"

const TYPE_SCALE: Record<TextRole, {size: number; weight: number}> = {
  Title1:      {size: 105, weight: 700},
  Title2:      {size: 93,  weight: 700},
  HeadlineXL:  {size: 62,  weight: 700},
  Headline1:   {size: 54,  weight: 700},
  Headline2:   {size: 48,  weight: 700},
  Subheadline: {size: 41,  weight: 700},
  Button:      {size: 39,  weight: 500},
  Callout:     {size: 39,  weight: 700},
  Body:        {size: 39,  weight: 500},
  Caption:     {size: 38,  weight: 500},
}

function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}

// ── Font: the typeface FOLLOWS THE LANGUAGE ──────────────────────────────────
// Barlow is a Latin/Greek/Cyrillic family — its cmap stops at U+FB02 and it
// contains ZERO CJK glyphs (verified against the actual .ttf: 风水大师 all miss).
// Applying it unconditionally would render the entire 中文 mode as tofu boxes,
// so the font is chosen per language, never globally:
//   en → Barlow (Medium 500 / Bold 700, matching the two weights in TYPE_SCALE)
//   zh → the engine's built-in default, which is what this project shipped with
//        and which does cover CJK.
// fontForRole() below is the ONE place that decision is made.
// requireAsset takes a STRING LITERAL (it is resolved statically), so the paths
// stay inline rather than moving behind a loadFont(path) helper.
let FONT_BARLOW_MEDIUM: Font | null = null
let FONT_BARLOW_BOLD: Font | null = null
try {
  FONT_BARLOW_MEDIUM = requireAsset("../Fonts/Barlow-Medium.ttf") as Font
  FONT_BARLOW_BOLD = requireAsset("../Fonts/Barlow-Bold.ttf") as Font
} catch (e) {
  print("[FengshuiUI] Barlow unavailable — keeping the built-in font: " + e)
}

// HOW zh GETS ITS GLYPHS. Nothing in this project ships CJK: every packaged
// face (SpecsSans x8, ObjektivMk3 x3) stops at U+FB02/U+FEFF, exactly like
// Barlow — verified by parsing their cmaps. The Chinese the Lens renders today
// comes from the ENGINE's implicit default, which is not an asset at all (a
// pristine Text reads fontSource=null, font=null).
//
// So the way back for zh is to assign null, and that was probe-verified safe on
// 2026-08-16: font=Barlow-Bold -> font=null returned fontSource to null with no
// crash. Do NOT "improve" this by hunting for an asset to restore — there isn't
// one.
let fontSwapArmed = false
let fontAnnounced = false

/** A Text whose font must be re-decided when the language changes. */
type FontBinding = {t: Text; role: TextRole; pinBuiltin: boolean}
const fontBindings: FontBinding[] = []

/** Which font does this role get, in the language we're currently in? */
function fontForRole(role: TextRole): Font | null {
  if (getLang() !== "en") return null   // null → restore the built-in source
  return TYPE_SCALE[role].weight >= 700 ? FONT_BARLOW_BOLD : FONT_BARLOW_MEDIUM
}

function applyFont(b: FontBinding): void {
  if (!fontSwapArmed) return
  // pinBuiltin marks text that can hold CJK REGARDLESS of the UI language.
  // The language chip is the case that matters: it reads "中" while the UI is
  // in English (it shows the language you'd switch TO), so handing it Barlow
  // would tofu the one affordance you need to get back out of a language you
  // can't read.
  const f = b.pinBuiltin ? null : fontForRole(b.role)
  try {
    // null is deliberate and verified — see the block comment above.
    ;(b.t as {font: Font | null}).font = f
  } catch (e) {
    print("[FengshuiUI] font apply skipped: " + e)
  }
}

/** Re-decide every live Text's font. Called from refreshLang. */
function refreshFonts(): void {
  let live = 0
  for (let i = 0; i < fontBindings.length; i++) {
    const b = fontBindings[i]
    if (!b.t || isNull(b.t)) continue   // marker tags are destroyed + rebuilt
    applyFont(b)
    fontBindings[live++] = b            // compact in place so the list can't grow
  }                                     // unbounded across assess cycles
  fontBindings.length = live
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110,
                       pinBuiltin: boolean = false): void {
  if (!fontAnnounced) {
    fontAnnounced = true
    fontSwapArmed = !!FONT_BARLOW_MEDIUM && !!FONT_BARLOW_BOLD
    print("[FengshuiUI] font swap " + (fontSwapArmed ? "ARMED" : "STOOD DOWN — Barlow missing") +
      " (en=Barlow, zh=engine default)")
  }
  t.size = roleSize(role, distanceCm)
  ;(t as Text & {weight?: number}).weight = TYPE_SCALE[role].weight
  const b: FontBinding = {t: t, role: role, pinBuiltin: pinBuiltin}
  fontBindings.push(b)
  applyFont(b)
}

// ── Layout constants + palette ───────────────────────────────────────────────
const LAYOUT_Z_LIFT = 0.02

// ── Insight-rail scroll clipping mode ────────────────────────────────────────
// true  — REAL MASKING. A Canvas + ScreenTransform + MaskingComponent stencil
//         clips the content band, so a row scrolled halfway out is drawn
//         half-height instead of vanishing. Rows are only disabled once they
//         are FULLY outside the band (that kills phantom Button colliders
//         floating above/below the panel; it never causes visible popping,
//         because a fully-outside row is already 100% clipped by the stencil).
// false — the previous, verified ROW-CULLING behaviour: a row is disabled the
//         moment ANY part of it leaves the band, and no mask objects are built
//         at all. This is the known-good fallback: flipping this single flag to
//         false restores it wholesale — nothing else needs to change.
//
// Why the earlier masking attempt failed (do not repeat it): it used UIKit's
// ScrollWindow, whose setWindowSize() writes ABSOLUTE cm into
// `screenTransform.anchors`. LS anchors are NORMALIZED parent-relative units
// (−1..1), so a 17cm window produced a mask ~17× the panel and clipped nothing.
// The fix is to size the mask through a world-unit Canvas + `offsets`, not
// through anchors.
const USE_SCROLL_MASK = true

// ── Insight-rail scroll band (host-local cm; host sits at panel-local y −2.4) ──
// Panel is 24cm tall: tabs occupy the top 2.6cm, the arrow footer the bottom
// 2.4cm, leaving this band for content.
// Guard: how far inside the panel the band sits. In culling mode it absorbs the
// wrappedHeight estimate's error so a row can never render a sliver past the
// panel edge; in masking mode it is simply the band inset (the stencil, not the
// estimate, decides where pixels stop). Inset the BAND rather than inflating
// each row — inflating is symmetric, so it pushes the topmost row's top edge out
// of its own anchor and culls it forever.
const SCROLL_CULL_GUARD = 0.3
// The drag bar replaced an arrow footer, which reclaimed that strip for content —
// hence a bottom bound at the panel edge rather than above a footer.
const SCROLL_VIEW_TOP = 11.4 - SCROLL_CULL_GUARD
const SCROLL_VIEW_BOTTOM = -9.0 + SCROLL_CULL_GUARD
const SCROLL_VIEW_H = SCROLL_VIEW_TOP - SCROLL_VIEW_BOTTOM
const SCROLL_EPS = 0.01
// Band midpoint in host-local cm, and the same point in panel-local cm.
const SCROLL_BAND_MID = (SCROLL_VIEW_TOP + SCROLL_VIEW_BOTTOM) / 2
const SCROLL_BAND_CENTER_Y = SCROLL_BAND_MID - 2.4
// The stencil is a hair TALLER than the band, per side. At max scroll the last
// row's bottom lands exactly on the band edge, and a row's Button plate sits
// ~0.1cm proud of its FlexItem — a mask flush with the band shaves that plate's
// rounded bottom corners flat. The slack must stay inside the plate: the band
// bottom is at panel-local −11.1 against a −12 plate edge, and the band top at
// 8.7 against tab chips starting ~9.4, so 0.4 is comfortably clear of both.
const SCROLL_MASK_SLACK = 0.4
// Strip reserved for the vertical scroll bar along the panel's OUTER (left)
// edge. The content column is narrowed by this much so no row ever sits under
// the bar's collider.
//
// Why the LEFT edge and not the conventional right: every BackPlate spawns an
// InteractionPlane whose collider box is 2*(nearFieldDepth + hysteresis) =
// 42cm DEEP, i.e. it juts 21cm out of the panel toward the camera. The hero
// image panel is centred (x −11..+11 at z −110), so its plane box swallows the
// camera→target ray for anything sitting near the insight panel's INNER edge —
// SIK/the preview validator resolve that ray to the hero panel and the insight
// panel's own widget is unreachable ("Blocked by InteractionPlaneColliderRoot").
// On the outer edge the ray only ever crosses the insight panel's own plane,
// which is whitelisted because it shares the target's Interactable ancestor.
const SCROLL_RAIL_W = 1.6

// Wu xing. Colours stay inside the jade/gold/ember language while keeping the five
// bars separable at a glance: wood jade, fire ember, earth gold, metal pale, water blue.
// Names come from the string table (木火土金水 in Chinese).
// Saturated on purpose: at 110cm these bars have to be comparable at a glance, so
// they carry full-strength colour rather than the panel's usual muted fills.
const ELEMENT_COLORS = [
  new vec4(0.35, 0.92, 0.50, 1), // wood  — jade
  new vec4(1.00, 0.38, 0.22, 1), // fire  — ember
  new vec4(1.00, 0.75, 0.28, 1), // earth — gold
  new vec4(0.92, 0.95, 1.00, 1), // metal — pale steel
  new vec4(0.32, 0.62, 1.00, 1), // water — blue
]
const BAR_H = 1.05 // cm — nearly 2x the first pass, which read as hairlines

// ── World marker sizing ──────────────────────────────────────────────────────
// The type scale is calibrated for panels at 110cm (see roleSize). Chi markers
// are NOT at 110cm — they land at MARKER_DEPTH_CM (180) on the plane fallback
// and anywhere out to ~500cm on a world-query surface hit. A 110cm-sized label
// at 180cm subtends only 61% of its intended angular size, which is exactly why
// they read as too small. So scale each tag by its own distance to restore
// constant APPARENT size, then apply a deliberate boost on top.
const MARKER_DESIGN_DIST = 110
// 1.45 was over-tuned: at the 180cm fallback it drew a ~27cm plate, wider in
// angular terms than the 22cm hero panel. 1.15 keeps the label comfortably
// readable at 2m (~size-44 equivalent text) without competing with the UI.
const MARKER_SIZE_BOOST = 1.15
// Clamp the distance compensation: a literal 500/110 would build a ~78cm-wide
// plate that punches through furniture. Past this the label is allowed to
// shrink visually rather than dominate the room.
const MARKER_MAX_DIST_SCALE = 2.0

// Markers must NEVER draw over the UI cluster. They can't be ordered by depth:
// the panels are translucent and don't write depth, and both marker plates and
// panels ship at renderOrder 0 — so the tie falls through to hierarchy order,
// where the runtime-created ChiMarkers root is appended LAST among scene roots
// and therefore paints last, on top of everything. That is structural, not bad
// luck: a 180cm marker beat a 110cm panel every single time.
//
// Fix is an explicit negative renderOrder, which outranks hierarchy position.
// The tag's own text must still sit above its own plate, hence two values.
const MARKER_RENDER_ORDER = -20
const MARKER_TEXT_RENDER_ORDER = -19

const WHITE = new vec4(1, 1, 1, 1)
const SOFT = new vec4(1, 1, 1, 0.6)
const JADE = new vec4(0.45, 0.85, 0.6, 1)
const GOLD = new vec4(0.95, 0.8, 0.4, 1)

// Character budget for the Master's answer. The master panel has no
// ScrollWindow, so this is what keeps a long answer (or an appended bullet)
// from growing off the bottom of the plate. ~420 chars at Caption across a
// 17.4cm row is ~11 lines, which is what the 26.5cm panel can hold alongside
// the title, question row, hint and archive navigator.
const MASTER_BODY_MAX = 420
// One line of glyphs at Caption across that row — charged against the budget
// when appending, to pay for the rendered line the "\n" forces.
const MASTER_APPEND_SLACK = 40
const EMBER = new vec4(0.9, 0.5, 0.45, 1)

export type ProblemInfo = {title: string; detail: string}
// Structural mirror of FengshuiGemini's FengshuiElements — kept local so the UI
// layer stays free of a dependency on the Gemini module.
export type ElementsInfo = {
  wood: number; fire: number; earth: number; metal: number; water: number; note?: string
}
type TextRow = {t: Text; item: FlexItem; w: number; role: TextRole}
export type MarkerInfo = {index: number; title: string; pos: vec3}

@component
export class FengshuiUI extends BaseScriptComponent {
  // ── Events (UI → Main) ─────────────────────────────────────────────────────
  private _onAssess = new Event<void>()
  private _onReset = new Event<void>()
  private _onSpatialize = new Event<void>()
  private _onMuteToggle = new Event<boolean>()
  private _onLangToggle = new Event<void>()
  private _onPlanToggle = new Event<{index: number; done: boolean}>()
  private _onShopTap = new Event<number>()
  private _onHover = new Event<void>()
  // Hold-to-talk: DOWN opens the mic, UP closes it and submits. Deliberately
  // two events, never a toggle — the user should never be able to walk away
  // with a hot mic.
  private _onAskStart = new Event<void>()
  private _onAskEnd = new Event<void>()
  private _onScan = new Event<void>()
  private _onScanStep = new Event<number>()
  private _onAskNav = new Event<number>()
  get onScanStep(): PublicApi<number> { return this._onScanStep.publicApi() }
  get onAskNav(): PublicApi<number> { return this._onAskNav.publicApi() }
  get onAskStart(): PublicApi<void> { return this._onAskStart.publicApi() }
  get onAskEnd(): PublicApi<void> { return this._onAskEnd.publicApi() }
  get onScan(): PublicApi<void> { return this._onScan.publicApi() }
  get onAssess(): PublicApi<void> { return this._onAssess.publicApi() }
  get onReset(): PublicApi<void> { return this._onReset.publicApi() }
  get onSpatialize(): PublicApi<void> { return this._onSpatialize.publicApi() }
  get onMuteToggle(): PublicApi<boolean> { return this._onMuteToggle.publicApi() }
  get onLangToggle(): PublicApi<void> { return this._onLangToggle.publicApi() }
  get onPlanToggle(): PublicApi<{index: number; done: boolean}> { return this._onPlanToggle.publicApi() }
  get onShopTap(): PublicApi<number> { return this._onShopTap.publicApi() }
  get onHover(): PublicApi<void> { return this._onHover.publicApi() }

  // ── Dynamic handles ────────────────────────────────────────────────────────
  private statusText!: Text
  private scoreNumText!: Text
  private scoreVerdictText!: Text
  private gaugeMetaText!: Text
  private elementFills: SceneObject[] = []
  private elementNoteText!: Text
  private elementTrackW = 0
  private elementBarLeft = 0
  private problemTitleTexts: Text[] = []
  private problemDetailTexts: Text[] = []
  private planTexts: Text[] = []
  private planIconMats: Material[] = []
  private planDone: boolean[] = [false, false, false]
  private blockersContent!: SceneObject
  private planContent!: SceneObject
  private tabMode = "blockers"
  private blockersTabLabel!: Text
  private planTabLabel!: Text
  private shopTabLabel!: Text
  private shopContent!: SceneObject
  private shopItemTexts: Text[] = []
  private shopReasonTexts: Text[] = []
  private shopQueries: (string | null)[] = [null, null, null]
  private shopThumbSOs: SceneObject[] = []
  private shopThumbMats: Material[] = []

  // Scroll plumbing, per tab mode
  private tabHosts: Record<string, SceneObject> = {}
  private tabFlex: Record<string, FlexLayout> = {}
  private tabRows: Record<string, TextRow[]> = {}
  private problemRows: TextRow[] = []
  private planRows: TextRow[] = []
  private shopTitleRows: TextRow[] = []
  private shopDescRows: TextRow[] = []
  private shopRowItems: FlexItem[] = []
  private shopRowHeights: number[] = []
  private shopTitleFlex: FlexLayout[] = []
  private planRowItems: FlexItem[] = []
  private planButtons: Button[] = []
  private shopButtons: Button[] = []

  // Row-culling scroller: one content stack per tab, translated by scrollOffset.
  private tabContents: Record<string, SceneObject> = {}
  private tabScrollRows: Record<string, {so: SceneObject; item: FlexItem; btn: Button | null}[]> = {}
  private tabScrollOffset: Record<string, number> = {blockers: 0, plan: 0, shop: 0}
  private tabMaxScroll: Record<string, number> = {blockers: 0, plan: 0, shop: 0}
  // Stencil-mask rig (USE_SCROLL_MASK only): Canvas host → ScreenTransform+mask
  // → unscale shim → the three tab hosts. See buildScrollMask.
  private scrollMaskSO: SceneObject | null = null
  private scrollMaskST: ScreenTransform | null = null
  private scrollUnscale: SceneObject | null = null
  private scrollBar: Slider | null = null
  private scrollBarRoot: SceneObject | null = null
  private scrollBarTrackLen = 1
  // Guards the two-way bind: applyScroll writes the knob, the knob drives scroll.
  private syncingScrollBar = false
  // Wall-clock deadline during which knob callbacks are ignored. resetToValue
  // kills the spring, but a Slider drag can still deliver its terminal
  // onValueChange/onKnobMoved a frame or more after the pointer is gone
  // (Slider.ts:916 fires it from the drag-end path). If that lands just after a
  // tab switch it is applied to the INCOMING tab — which is exactly how a
  // freshly-selected tab came up scrolled to the bottom instead of the top.
  private scrollBarMuteUntil = -1
  private facingText!: Text
  private qaText!: Text
  private qaRow!: SceneObject
  private beforeMat!: Material
  private afterMat!: Material
  private afterImageSO!: SceneObject
  // Repaint spinner — shown over the captured room photo while the painted
  // version is still generating, so the hero image never looks like a dead end.
  private spinnerSO: SceneObject | null = null        // root — toggled on/off
  private spinnerGlyphSO: SceneObject | null = null   // glyph — the bit that spins
  private spinnerMat: Material | null = null
  private spinnerActive = false
  private spinnerAngle = 0
  private crossfadeSlider: Slider | null = null
  private muteIconMat!: Material
  private muted = false
  private markersRoot: SceneObject | null = null
  private primaryBtnLabel!: Text
  private primaryBtnIconMat!: Material

  // ── Ask-the-master (mic + answer panel) ────────────────────────────────────
  private micIconMat!: Material
  private micIconSO!: SceneObject
  private micIconSize = 1.86
  private micActive = false
  private scanBtnLabel!: Text
  private scanBtnIconMat!: Material
  private scanActive = false
  private langLabel: Text | null = null
  // View navigator ⇄ crossfade slider — mutually exclusive, same slot in the
  // hero panel. A DISABLED FlexItem still occupies its track (FlexLayout walks
  // its registered items regardless of SceneObject.enabled), so switching modes
  // must collapse overrideHeight, not just toggle `enabled`.
  private compareFlex!: FlexLayout
  private crossfadeRowSO!: SceneObject
  private crossfadeRowItem!: FlexItem
  private navRowSO!: SceneObject
  private navRowItem!: FlexItem
  private navLabel!: Text
  private readonly SLOT_H = 2.0
  private masterQuestionRow!: TextRow
  private masterAnswerRow!: TextRow
  private masterHintText!: Text
  // The answer currently on the plate, so appendMasterNote can add to it
  // instead of clobbering it. Reset by every showMasterSays.
  private masterBodyText = ""
  private masterFlex!: FlexLayout
  private askNavSO!: SceneObject
  private askNavItem!: FlexItem
  private askNavLabel!: Text

  // ── Loading bar state ──────────────────────────────────────────────────────
  private loadingBarRoot!: SceneObject
  private loadingFillSO!: SceneObject
  private loadingActive = false
  private loadingP = 0
  private loadingTarget = 0
  private loadingHideAt = -1
  private readonly LOADING_W = 16
  private _dragging = false
  get dragging(): boolean { return this._dragging }

  // ── Hidden-panel gate (see /specs-build-ui gotchas → lazy-built panels) ────
  private panelRoots: Record<string, SceneObject> = {}
  private wantVisible: Record<string, boolean> =
    {score: false, problems: false, images: false, master: false}
  private deferredHide: SceneObject[] = []
  private startupGateDone = false
  private immersive = false

  // ── Theme targets ──────────────────────────────────────────────────────────
  // Collected at build time, painted once at the startup gate (UIKit Elements
  // build their visuals in their own OnStart, so theming any earlier is a race).
  private themedPlates: SceneObject[] = []
  private themedButtons: Button[] = []

  // ── Score count-up animation state ─────────────────────────────────────────
  private scoreAnimActive = false
  private scoreAnimT = 0
  private scoreTarget = 0

  onAwake(): void {
    // One Canvas at the UI root — Hierarchy Sort paints the whole subtree DFS.
    this.sceneObject.createComponent("Component.Canvas")

    this.buildControlPanel()
    this.buildScoreGauge()
    this.buildProblemsPanel()
    this.buildComparePanel()
    this.buildMasterPanel()

    // Re-render every bound label whenever the language changes. Registered after
    // the panels are built so the binding list is already complete.
    onLangChange(() => this.refreshLang())

    // Hidden panels stay ENABLED through OnStart (so UIKit components initialize)
    // but scaled to ~0 so they don't flash. After init frames, apply real visibility.
    for (const key of PANEL_KEYS) {
      this.panelRoots[key].getTransform().setLocalScale(new vec3(0.001, 0.001, 0.001))
    }
    let frames = 0
    const gate = this.createEvent("UpdateEvent")
    gate.bind(() => {
      frames++
      if (frames >= 3 && !this.startupGateDone) {
        this.startupGateDone = true
        this.applyTheme()
        for (const key of PANEL_KEYS) {
          this.panelRoots[key].getTransform().setLocalScale(vec3.one())
          this.panelRoots[key].enabled = this.wantVisible[key]
        }
        for (const so of this.deferredHide) so.enabled = false
        // First cull now that every Button/Slider has had its OnStart.
        if (USE_SCROLL_MASK) {
          this.syncMaskScale()
          this.warnIfMaskDead()
        }
        this.applyScroll(this.tabMode)
        gate.enabled = false
      }
    })


    // Score count-up + loading-bar driver
    const anim = this.createEvent("UpdateEvent")
    anim.bind(() => {
      const dt = getDeltaTime()
      if (this.scoreAnimActive) {
        this.scoreAnimT += dt / 1.4
        const t = Math.min(this.scoreAnimT, 1)
        const eased = 1 - Math.pow(1 - t, 3)
        this.scoreNumText.text = Math.round(this.scoreTarget * eased).toString()
        if (t >= 1) this.scoreAnimActive = false
      }
      // Repaint spinner — ~0.6 rev/s, negative Z so it turns clockwise. Runtime
      // rotation is RADIANS (the Editor API is the one that uses degrees).
      if (this.spinnerActive && this.spinnerGlyphSO && !isNull(this.spinnerGlyphSO)) {
        this.spinnerAngle += dt * 3.8
        this.spinnerGlyphSO.getTransform()
          .setLocalRotation(quat.fromEulerAngles(0, 0, -this.spinnerAngle))
      }
      if (this.loadingActive) {
        // Ease toward the stage target; gentle creep so it always feels alive
        // (no creep once endLoading has pinned the target at 1)
        if (this.loadingHideAt < 0) this.loadingTarget = Math.min(this.loadingTarget + dt * 0.012, 0.96)
        this.loadingP += (this.loadingTarget - this.loadingP) * Math.min(1, dt * 3)
        const w = Math.max(0.001, this.LOADING_W * this.loadingP)
        this.loadingFillSO.getTransform().setLocalScale(new vec3(w, 0.6, 1))
        this.loadingFillSO.getTransform().setLocalPosition(
          new vec3(-this.LOADING_W / 2 + w / 2, 0, 0.03))
        if (this.loadingHideAt > 0 && getTime() >= this.loadingHideAt) {
          this.loadingActive = false
          this.loadingBarRoot.enabled = false
          this.loadingHideAt = -1
        }
      }
    })
  }

  // ═══ Theme ═════════════════════════════════════════════════════════════════

  /** Paint every registered plate and button in the Fengshui theme. */
  private applyTheme(): void {
    for (const so of this.themedPlates) themePlate(so)
    for (const b of this.themedButtons) themeButton(b)
    print("[FengshuiUI] theme applied to " + this.themedPlates.length + " plates, " +
      this.themedButtons.length + " buttons")
  }

  /** Create a themed BackPlate — the single place panels come from. */
  private makePlate(root: SceneObject, w: number, h: number): BackPlate {
    const plate = root.createComponent(BackPlate.getTypeName()) as BackPlate
    plate.size = new vec2(w, h)
    this.themedPlates.push(root)
    return plate
  }

  /** Register a Button for theming (call at every Button creation site). */
  private themed(btn: Button): Button {
    this.themedButtons.push(btn)
    return btn
  }

  // ═══ Loading bar (Main → UI) ═══════════════════════════════════════════════

  startLoading(): void {
    this.loadingActive = true
    this.loadingP = 0
    this.loadingTarget = 0.08
    this.loadingHideAt = -1
    this.loadingBarRoot.enabled = true
  }

  // Named stage: updates the status line and jumps the bar target
  setStage(label: string, frac: number): void {
    this.setStatus(label)
    if (this.loadingActive) this.loadingTarget = Math.max(this.loadingTarget, Math.min(frac, 0.96))
  }

  endLoading(success: boolean): void {
    // BEFORE the loadingActive guard: on a failure path loading may already be
    // off, and an early return there would strand the spinner turning forever.
    this.setRepaintPending(false)
    if (!this.loadingActive) return
    if (success) {
      this.loadingTarget = 1
      this.loadingP = Math.max(this.loadingP, 0.85)
      this.loadingHideAt = getTime() + 0.45
    } else {
      this.loadingActive = false
      this.loadingBarRoot.enabled = false
    }
  }

  // ═══ Localisation ══════════════════════════════════════════════════════════
  // Static labels are BOUND rather than assigned, so a language switch can
  // re-render every one of them without rebuilding the UI. A label assigned
  // directly would silently keep its original language — the failure mode that
  // is hardest to spot, because the screen still looks full of words.
  //
  // Deliberately NOT bound: anything holding model output (blockers, plan rows,
  // the master's answers, per-view notes). Those were generated in the language
  // that was active at the time; re-rendering them from the table is impossible
  // and re-translating them is not this layer's job. Switching language mid-run
  // therefore leaves existing findings as they were — the next assess or scan
  // comes back in the new language.

  private i18nBindings: {t: Text; get: () => string}[] = []

  /** Set a label from the table now, and again whenever the language changes. */
  private bindText(t: Text, get: () => string): Text {
    if (!t) return t
    t.text = get()
    this.i18nBindings.push({t: t, get: get})
    return t
  }

  private refreshLang(): void {
    // Font first, then strings: the typeface follows the language (Barlow for
    // en, built-in for zh) so both must move in the same pass — otherwise a
    // switch to zh would repaint Chinese strings into a Latin-only face.
    refreshFonts()
    for (let i = 0; i < this.i18nBindings.length; i++) {
      const b = this.i18nBindings[i]
      try {
        if (b.t) b.t.text = b.get()
      } catch (e) {
        print("[FengshuiUI] label refresh skipped: " + e)
      }
    }
    // Labels that depend on state rather than a constant string.
    if (this.primaryBtnLabel) {
      this.primaryBtnLabel.text = this.immersive ? S().exit3dBtn : S().assessBtn
    }
    if (this.scanBtnLabel && !this.scanActive) this.scanBtnLabel.text = S().scanBtn
    if (this.langLabel) this.langLabel.text = getLang() === "zh" ? "EN" : "中"
  }

  // ═══ Public API (Main → UI) ════════════════════════════════════════════════

  setStatus(msg: string): void {
    if (this.statusText) this.statusText.text = msg
  }

  showScore(score: number, verdict: string): void {
    this.showPanel("score")
    const v = verdict.length > 26 ? verdict.substring(0, 25) + "…" : verdict
    this.scoreVerdictText.text = v
    const color = score >= 70 ? JADE : score >= 40 ? GOLD : EMBER
    this.scoreNumText.textFill.color = color
    this.scoreNumText.text = "0"
    this.scoreTarget = score
    this.scoreAnimT = 0
    this.scoreAnimActive = true
  }

  // One compact meta line under the verdict, e.g. "Target 84 · Best 71"
  setGaugeMeta(line: string): void {
    if (this.gaugeMetaText) this.gaugeMetaText.text = line.length > 30 ? line.substring(0, 29) + "…" : line
  }

  /**
   * Wu xing balance. Accepts either 0-100 or 0-1 weights (the model drifts between
   * them); bars are normalised against the LARGEST element so the shape always
   * fills the rail and an imbalance stays legible even when every weight is low.
   */
  setElements(e: ElementsInfo | null): void {
    if (!this.elementFills || this.elementFills.length === 0) return
    const raw = e
      ? [e.wood, e.fire, e.earth, e.metal, e.water].map((v) =>
          typeof v === "number" && isFinite(v) ? Math.max(0, v) : 0)
      : [0, 0, 0, 0, 0]
    let peak = 0
    for (const v of raw) if (v > peak) peak = v
    if (peak <= 0) peak = 1
    for (let i = 0; i < this.elementFills.length && i < raw.length; i++) {
      const frac = Math.max(0.02, Math.min(1, raw[i] / peak))
      const w = Math.max(0.001, this.elementTrackW * frac)
      const so = this.elementFills[i]
      if (isNull(so)) continue
      so.getTransform().setLocalScale(new vec3(w, BAR_H, 1))
      const pos = so.getTransform().getLocalPosition()
      // Left-anchored growth (same trick as the loading bar)
      so.getTransform().setLocalPosition(new vec3(this.elementBarLeft + w / 2, pos.y, pos.z))
    }
    if (this.elementNoteText) {
      // The rail is one line wide (overflow, no wrap), and the model treats its
      // character budget as a suggestion — so clip, but on a word boundary.
      const n = e && e.note ? e.note : ""
      const LIMIT = 46
      let out = n
      if (n.length > LIMIT) {
        const cut = n.substring(0, LIMIT)
        const sp = cut.lastIndexOf(" ")
        out = (sp > LIMIT * 0.6 ? cut.substring(0, sp) : cut).replace(/[,;:]$/, "") + "…"
      }
      this.elementNoteText.text = out
    }
  }

  showProblems(problems: ProblemInfo[]): void {
    this.showPanel("problems")
    this.setTab("blockers")
    for (let i = 0; i < 3; i++) {
      const p = problems[i]
      // Caps are now only a SANITY CEILING, not an overflow guard — the rail
      // scrolls, so the stack may run past the panel. The one thing they must
      // still guarantee: no SINGLE row taller than SCROLL_VIEW_H, or whole-row
      // culling could never show it. 300 chars ≈ 9.8cm vs a 19.8cm view.
      this.setRowText(this.problemRows[i * 2], p ? (i + 1) + ". " + this.clip(p.title, 48) : "")
      this.setRowText(this.problemRows[i * 2 + 1], p ? this.clip(p.detail, 300) : "")
    }
    this.refreshTab("blockers")
  }

  // Word-boundary clip — never cuts mid-word, only used as an overflow safety net.
  private clip(s: string, max: number): string {
    if (!s || s.length <= max) return s ?? ""
    const cut = s.substring(0, max - 1)
    const sp = cut.lastIndexOf(" ")
    return (sp > max * 0.6 ? cut.substring(0, sp) : cut) + "…"
  }

  // Fill + switch to the Chi Plan tab (Blockers stay one tab-tap away)
  showPlan(steps: string[]): void {
    this.showPanel("problems")
    this.setTab("plan")
    for (let i = 0; i < this.planRows.length; i++) {
      // Sanity ceiling only (see showProblems): 180 chars ≈ 7.6cm row, view 19.8.
      this.setRowText(this.planRows[i], this.clip(steps[i] ?? "", 180))
      this.planDone[i] = false
      this.planIconMats[i].mainPass.baseTex = ICON_CB_OFF
    }
    // Plan rows are buttons sized around their text — grow the row to match
    for (let i = 0; i < this.planRowItems.length; i++) {
      const item = this.planRowItems[i]
      const btn = this.planButtons[i]
      if (!item || !this.planRows[i]) continue
      const h = Math.max(3.6, this.planRows[i].item.overrideHeight + 1.0)
      item.overrideHeight = h
      if (btn) btn.size = new vec3(btn.size.x, h - 0.2, 1)
    }
    this.refreshTab("plan")
  }

  planAllDone(): boolean {
    return this.planDone[0] && this.planDone[1] && this.planDone[2]
  }

  showBefore(tex: Texture): void {
    this.showPanel("images")
    this.beforeMat.mainPass.baseTex = tex
    this.beforeMat.mainPass.baseColor = new vec4(1, 1, 1, 1)
    this.setRepaintPending(true)
  }

  /**
   * Spinner over the room photo while the painted version is still coming.
   * Stopped from THREE places — showAfter (the happy path) and endLoading
   * (which every failure path already funnels through, plus the scan flow that
   * never repaints at all) — so it can never be left spinning forever.
   */
  setRepaintPending(on: boolean): void {
    this.spinnerActive = on
    if (this.spinnerSO && !isNull(this.spinnerSO)) this.spinnerSO.enabled = on
    if (!on) {
      this.spinnerAngle = 0
      if (this.spinnerGlyphSO && !isNull(this.spinnerGlyphSO)) {
        this.spinnerGlyphSO.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, 0))
      }
    }
  }

  showAfter(tex: Texture, qaMessage: string): void {
    this.showPanel("images")
    this.setRepaintPending(false)
    this.setCompareMode(false)   // an improved image exists — crossfade is the useful control
    this.afterMat.mainPass.baseTex = tex
    this.afterImageSO.enabled = true
    this.setCrossfade(1)
    if (this.crossfadeSlider) this.crossfadeSlider.currentValue = 1
    this.qaText.text = qaMessage
    if (this.qaRow) this.qaRow.enabled = true
  }

  // World-space problem markers (world positions computed by the main script)
  showMarkers(markers: MarkerInfo[]): void {
    this.hideMarkers()
    if (markers.length === 0) return
    this.markersRoot = global.scene.createSceneObject("ChiMarkers")
    this.markersRoot.createComponent("Component.Canvas")
    // Where the reader actually is. Falls back to the origin (the user's start
    // pose), which is what the previous fixed-size version implicitly assumed.
    let viewer = vec3.zero()
    try {
      viewer = WorldCameraFinderProvider.getInstance().getTransform().getWorldPosition()
    } catch (e) {
      // no camera provider (early init) — origin is a fine approximation
    }
    for (const m of markers) {
      const tag = global.scene.createSceneObject("ChiMarker" + m.index)
      tag.setParent(this.markersRoot)
      tag.getTransform().setWorldPosition(m.pos)
      // Face the reader. With the viewer at the origin this is identical to the
      // previous origin-facing yaw, so near-field behaviour is unchanged.
      const yaw = Math.atan2(viewer.x - m.pos.x, viewer.z - m.pos.z)
      tag.getTransform().setLocalRotation(quat.fromEulerAngles(0, yaw, 0))
      // Constant apparent size + boost (see MARKER_DESIGN_DIST).
      const dist = m.pos.distance(viewer)
      const s = Math.min(Math.max(dist / MARKER_DESIGN_DIST, 1), MARKER_MAX_DIST_SCALE) *
        MARKER_SIZE_BOOST
      tag.getTransform().setLocalScale(new vec3(s, s, s))

      const plate = tag.createComponent(BackPlate.getTypeName()) as BackPlate
      plate.size = new vec2(11.5, 3.6)
      // Sort behind every panel (see MARKER_RENDER_ORDER). Safe immediately —
      // BackPlate stores this and applies it through its own init.
      try {
        plate.renderOrder = MARKER_RENDER_ORDER
      } catch (e) {
        print("[FengshuiUI] marker renderOrder skipped: " + e)
      }
      // Theming, however, writes straight to the RoundedRectangle's material and
      // must wait until BackPlate has actually built its mesh visual. Calling it
      // inline threw "Cannot read property 'mainPass' of undefined" once per
      // marker and left every tag in the stock grey BackPlate style. Tighter
      // radius than a panel — a small tag with a panel radius reads as a lozenge.
      const paintTag = () => themePlate(tag, 0.9)
      if (plate.initialized) {
        paintTag()
      } else {
        plate.onInitialized.add(paintTag)
      }
      const inner = this.obj(tag, "Inner", new vec3(0, 0, 0.4))
      const t = inner.createComponent("Component.Text") as Text
      t.text = m.index + " · " + this.clip(m.title, 44) // full titles, wraps to 2 lines
      t.depthTest = true
      // Above its own plate, still below every UI panel.
      try {
        ;(t as any).renderOrder = MARKER_TEXT_RENDER_ORDER
      } catch (e) {
        print("[FengshuiUI] marker text renderOrder skipped: " + e)
      }
      applyTextRole(t, "Caption")
      t.textFill.color = GOLD
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Wrap
      t.verticalOverflow = VerticalOverflow.Overflow
      t.layoutRect = Rect.create(-5.2, 5.2, -1.6, 1.6)
    }
  }

  hideMarkers(): void {
    if (this.markersRoot && !isNull(this.markersRoot)) this.markersRoot.destroy()
    this.markersRoot = null
  }

  // Immersive mode: hide the result panels so the spatialized room has a clear
  // view (control panel stays visible for toggle-back). wantVisible is preserved,
  // so toggling off restores exactly the panels that were showing. While ON, the
  // primary button is rethemed as the "Exit 3D" affordance (the compare panel's
  // own toggle is hidden with its panel).
  setImmersive(on: boolean): void {
    this.immersive = on
    if (this.primaryBtnLabel) {
      this.primaryBtnLabel.text = on ? S().exit3dBtn : S().assessBtn
      this.primaryBtnIconMat.mainPass.baseTex = on ? ICON_AR : ICON_CAMERA
    }
    if (!this.startupGateDone) return
    for (const key of PANEL_KEYS) {
      this.panelRoots[key].enabled = on ? false : this.wantVisible[key]
    }
  }

  get isImmersive(): boolean {
    return this.immersive
  }

  resetAll(): void {
    this.immersive = false
    this.hidePanel("score")
    this.hidePanel("problems")
    this.hidePanel("images")
    this.hidePanel("master")
    this.setMicActive(false)
    this.setScanActive(false)
    this.setCompareMode(false)
    this.setAskNav(false, "")
    this.hideMarkers()
    this.afterImageSO.enabled = false
    this.qaText.text = ""
    if (this.qaRow) this.qaRow.enabled = false
    this.gaugeMetaText.text = ""
    this.scoreAnimActive = false
    this.tabScrollOffset = {blockers: 0, plan: 0, shop: 0}
    this.setTab("blockers")
    this.setFacing(null)
    this.setShop([])
    this.setElements(null)
    this.planDone = [false, false, false]
  }

  // ═══ Panel visibility ══════════════════════════════════════════════════════

  private showPanel(key: string): void {
    this.wantVisible[key] = true
    if (this.startupGateDone && !this.immersive) {
      this.panelRoots[key].enabled = true
      this.panelRoots[key].getTransform().setLocalScale(vec3.one())
    }
  }

  private hidePanel(key: string): void {
    this.wantVisible[key] = false
    if (this.startupGateDone) this.panelRoots[key].enabled = false
  }

  // ═══ Panel builders ════════════════════════════════════════════════════════

  // Control panel — bottom center: title row (with mute), status line, button row.
  private buildControlPanel(): void {
    const root = this.obj(this.sceneObject, "ControlPanel", new vec3(0, -25.5, 0))
    const W = 26
    // 12.5 → 16.5 to pay for the second button row (Scan Room). The panel grows
    // symmetrically to y −33.75..−17.25, which stays clear of the insight rail
    // (−15.5..8.5, and anyway at x −21.5) and the hero panel (−5.75..18.75).
    const H = 16.5
    this.makePlate(root, W, H)

    const content = this.obj(root, "Content", new vec3(0, 0, 0.6))
    const col = this.flexColumn(content, W, H, {
      gap: 0.5, padY: 1.0, padX: 1.2,
      justify: FlexJustify.Center, align: FlexAlign.Stretch,
    })

    // Grab handle — pinch it to move the whole UI cluster wherever you want.
    // SIK manipulation affordance (Interactable + InteractableManipulation on a
    // dedicated collider), targeting the UI root so every panel moves together.
    this.flexChild(col, {w: 10, h: 1.2}, (cell) => {
      const collider = cell.createComponent("Physics.ColliderComponent") as ColliderComponent
      const shape = Shape.createBoxShape()
      shape.size = new vec3(10, 1.6, 2.5)
      collider.shape = shape
      cell.createComponent(Interactable.getTypeName())
      const manip = cell.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
      ;(manip as any).manipulateRootSceneObject = this.sceneObject // pre-lifecycle input
      manip.setCanRotate(false)
      manip.setCanScale(false)
      manip.onManipulationStart.add(() => { this._dragging = true })
      manip.onManipulationEnd.add(() => { this._dragging = false })
      this.createEvent("OnStartEvent").bind(() => {
        try { manip.setManipulateRoot(this.sceneObject.getTransform()) } catch (e) {}
      })
      const iconObj = this.obj(cell, "DragIcon", new vec3(0, 0, 0.05))
      this.addIconGetMat(iconObj, ICON_DRAG, 2.2)
      const item = cell.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Center
    })

    // Title — icon + raw text + mute toggle, each in fixed cells (Option A).
    // NOTE: cells hosting a nested container MUST declare BOTH w and h — a
    // height-only override makes LayoutItem2D's no-handler fallback scale
    // scale.x = allocatedWidth / 1 (declared width defaults to 1cm).
    this.flexChild(col, {w: W - 2.4, h: 2.4}, (rowObj) => {
      const row = this.flexRow(rowObj, W - 2.4, 2.4, {
        gap: 0.6, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 1.8, h: 1.8}, (cell) => {
        this.addIcon(cell, ICON_SPA, 1.8)
      })
      // 7.0 → 10.5cm for "Fengshui Master". addRowText sets horizontalOverflow
      // to Overflow, so an undersized cell does NOT clip or wrap — the glyphs
      // simply spill symmetrically and collide with the mute button, which is a
      // silent overlap rather than an obvious truncation. Measured at Headline2
      // the title needs ~9.6cm; the row has 8.2cm of slack, so widening the cell
      // costs nothing (1.8+0.6+10.5+0.6+2.4+0.6+2.4 = 18.9 in a 23.6cm row).
      // The Chinese 风水大师 is only ~5.2cm and simply centres with more air.
      this.flexChild(row, {w: 10.5, h: 2.2}, (cell) => {
        const t = this.addRowText(cell, S().appTitle, "Headline2", 10.5)
        t.textFill.color = WHITE
        this.bindText(t, () => S().appTitle)
      })
      this.flexChild(row, {w: 2.4, h: 2.4}, (cell) => {
        this.muteIconMat = this.addIconButtonGetMat(cell, ICON_VOL_ON, 2.4, () => {
          this.muted = !this.muted
          this.muteIconMat.mainPass.baseTex = this.muted ? ICON_VOL_OFF : ICON_VOL_ON
          this._onMuteToggle.invoke(this.muted)
        })
      })
      // Language toggle. The label shows the language you'd switch TO, not the
      // one you're in — the standard convention for a two-language switch, and
      // the only one that reads correctly when you can't understand the current
      // language well enough to know what you're leaving.
      this.flexChild(row, {w: 2.4, h: 2.4}, (cell) => {
        this.langLabel = this.addTextButtonGetLabel(
          cell, getLang() === "zh" ? "EN" : "中", 2.4,
          () => this._onLangToggle.invoke())
      })
    })

    // Status line — dynamic. Bound, so it returns to the localised intro on a
    // language switch rather than freezing whatever transient message was last
    // shown in the old language.
    this.statusText = this.addCenteredText(col, S().intro, "Caption", 1.3, SOFT)
    this.bindText(this.statusText, () => S().intro)

    // Loading bar — soft glow fill (stretched bokeh), hidden until a flow starts
    this.flexChild(col, {w: this.LOADING_W, h: 0.8}, (cell) => {
      const bar = this.obj(cell, "LoadingBar", new vec3(0, 0, 0.05))
      const track = this.obj(bar, "Track")
      const timg = track.createComponent("Component.Image") as Image
      const tmat = imageMaterial.clone()
      tmat.mainPass.baseTex = TEX_PILL // capsule texture at natural width — no stretch smear
      tmat.mainPass.baseColor = new vec4(1, 1, 1, 0.12)
      tmat.mainPass.depthTest = true
      tmat.mainPass.depthWrite = false
      timg.clearMaterials()
      timg.addMaterial(tmat)
      track.getTransform().setLocalScale(new vec3(this.LOADING_W, 0.55, 1))

      const fill = this.obj(bar, "Fill", new vec3(0, 0, 0.03))
      const fimg = fill.createComponent("Component.Image") as Image
      const fmat = imageMaterial.clone()
      fmat.mainPass.baseTex = TEX_PILL // fill only ever COMPRESSES from natural width
      fmat.mainPass.baseColor = new vec4(0.45, 0.85, 0.6, 0.9)
      fmat.mainPass.depthTest = true
      fmat.mainPass.depthWrite = false
      fimg.clearMaterials()
      fimg.addMaterial(fmat)
      fill.getTransform().setLocalScale(new vec3(0.001, 0.6, 1))
      // Little wand at the bar's left — "the master is working" (shares bar visibility)
      const wand = this.obj(bar, "WandIcon", new vec3(-this.LOADING_W / 2 - 1.3, 0, 0.05))
      this.addIcon(wand, ICON_WAND, 1.3)
      this.loadingFillSO = fill
      this.loadingBarRoot = bar
      bar.enabled = false
      const item = cell.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Center
    })

    // Button row — ONE primary action (assess auto-chains into improve, so a
    // separate Improve button is redundant) + reset. While immersive, the
    // primary button rethemes to "Exit 3D".
    this.flexChild(col, {w: W - 2.4, h: 3.2}, (rowObj) => {
      const row = this.flexRow(rowObj, W - 2.4, 3.2, {
        gap: 0.8, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      // 15 + 0.8 + 3 + 0.8 + 3 = 22.6 in a 23.6cm row — the primary lost 1cm so
      // the mic fits with slack rather than butting against the row edge.
      this.flexChild(row, {w: 15, h: 3.0}, (cell) => {
        const handles = this.addIconTextButton(cell, ICON_CAMERA, S().assessBtn, 15, 3.0, () => this._onAssess.invoke())
        this.primaryBtnLabel = handles.label
        this.primaryBtnIconMat = handles.iconMat
      })
      // Hold-to-talk mic. onTriggerDown/onTriggerUp are Element's (Element.ts:161/169)
      // and therefore Button's — NOT onTriggerStart/onTriggerEnd, which exist only
      // on RoundButton and would compile happily while never firing.
      this.flexChild(row, {w: 3.0, h: 3.0}, (cell) => {
        const btn = this.themed(cell.createComponent(Button.getTypeName()) as Button)
        btn.size = new vec3(3.0, 3.0, 1)   // BEFORE init
        const iconObj = this.obj(cell, "MicIcon", new vec3(0, 0, 0.08))
        this.micIconMat = this.addIconGetMat(iconObj, ICON_MIC, this.micIconSize)
        this.micIconSO = iconObj
        btn.onTriggerDown.add(() => this._onAskStart.invoke())
        btn.onTriggerUp.add(() => this._onAskEnd.invoke())
        // Own hover feedback rather than addHoverFeedback: the shared one resets
        // the icon to WHITE on hover-exit, which would silently wipe the ember
        // "recording" tint if the hand drifted off the button mid-hold.
        btn.onHoverEnter.add(() => {
          if (!this.micActive) this.micIconMat.mainPass.baseColor = JADE
          this._onHover.invoke()
        })
        btn.onHoverExit.add(() => {
          if (!this.micActive) this.micIconMat.mainPass.baseColor = WHITE
        })
      })
      this.flexChild(row, {w: 3.0, h: 3.0}, (cell) => {
        this.addIconButton(cell, ICON_REPLAY, 3.0, () => this._onReset.invoke())
      })
    })

    // Second action row — the whole-room pan scan. Its own button and its own
    // handler; the single-shot Assess flow above is untouched.
    this.flexChild(col, {w: W - 2.4, h: 3.2}, (rowObj) => {
      const row = this.flexRow(rowObj, W - 2.4, 3.2, {
        gap: 0.8, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 13.5, h: 3.0}, (cell) => {
        const handles = this.addIconTextButton(cell, ICON_360, S().scanBtn, 13.5, 3.0,
          () => this._onScan.invoke())
        this.scanBtnLabel = handles.label
        this.scanBtnIconMat = handles.iconMat
      })
    })
  }

  /** Scanning: the button reads back the live frame count and tints jade. */
  setScanActive(on: boolean, label?: string): void {
    this.scanActive = on
    if (this.scanBtnLabel) this.scanBtnLabel.text = on ? (label ?? S().scanningBtn) : S().scanBtn
    if (this.scanBtnIconMat) this.scanBtnIconMat.mainPass.baseColor = on ? JADE : WHITE
  }

  /** Mic held: ember tint + a size bump, so "we are listening" is unmissable. */
  setMicActive(on: boolean): void {
    this.micActive = on
    if (this.micIconMat) this.micIconMat.mainPass.baseColor = on ? EMBER : WHITE
    if (this.micIconSO && !isNull(this.micIconSO)) {
      const s = this.micIconSize * (on ? 1.22 : 1)
      this.micIconSO.getTransform().setLocalScale(new vec3(s, s, 1))
    }
  }

  // Score gauge — top center. Hidden until first analysis.
  private buildScoreGauge(): void {
    const root = this.obj(this.sceneObject, "ScoreGauge", new vec3(0, 24, 0))
    this.panelRoots["score"] = root
    const W = 12.5
    const H = 8.5
    this.makePlate(root, W, H)

    const content = this.obj(root, "Content", new vec3(0, 0, 0.6))
    const col = this.flexColumn(content, W, H, {
      gap: 0.25, padY: 0.7, padX: 0.8,
      justify: FlexJustify.Center, align: FlexAlign.Stretch,
    })

    this.bindText(this.addCenteredText(col, S().chiScore, "Caption", 1.1, SOFT), () => S().chiScore)
    this.scoreNumText = this.addCenteredText(col, "—", "Title1", 3.2, JADE)
    this.scoreVerdictText = this.addCenteredText(col, "", "Caption", 1.3, WHITE)
    this.gaugeMetaText = this.addCenteredText(col, "", "Caption", 1.1, SOFT)
  }

  // Five element bars + a one-line verdict, bounded by rules so the block reads as
  // its own unit rather than the top of the blockers list.
  //
  // Built on the nested-flex idiom (same as the tab chips): each row owns a FlexRow
  // whose cells are a fixed label gutter and a fixed-width bar. The first version
  // positioned label/track/fill by hand-computed local offsets against the panel's
  // TEXT_W, which is NOT the width the layout actually stretches a row to — the
  // labels ended up outside the readable area. Letting flex place the cells removes
  // that whole class of error, and the bar's left edge is then simply -trackW/2.
  private buildElementBars(col: SceneObject, innerW: number): void {
    this.addElementRule(col, innerW)
    this.bindText(this.addCenteredText(col, S().fiveElements, "Caption", 1.25, WHITE), () => S().fiveElements)
    const LABEL_W = 4.2
    const GAP = 0.5
    const trackW = Math.max(3, innerW - LABEL_W - GAP)
    this.elementTrackW = trackW
    this.elementBarLeft = -trackW / 2 // fill is anchored inside its own cell now

    for (let i = 0; i < 5; i++) {
      const tint = ELEMENT_COLORS[i]
      // Explicit width, NOT alignSelf Stretch. UIKit implements stretch by SCALING
      // the row transform (here by innerW = 16), and that scale propagates to every
      // child — off-centre children like the label ended up at world x -115, far
      // outside the panel. Centred text survived it because local x is 0, which is
      // why the bars appeared but the labels silently vanished.
      this.flexChild(col, {w: innerW, h: 1.75}, (row) => {
        const r = this.flexRow(row, innerW, 1.75, {
          gap: GAP, justify: FlexJustify.Start, align: FlexAlign.Center,
        })

        // Label gutter
        this.flexChild(r, {w: LABEL_W, h: 1.5}, (cell) => {
          const t = cell.createComponent("Component.Text") as Text
          this.bindText(t, () => S().elementNames[i])
          t.depthTest = true
          applyTextRole(t, "Caption")
          t.textFill.color = tint
          t.horizontalAlignment = HorizontalAlignment.Left
          t.verticalAlignment = VerticalAlignment.Center
          t.horizontalOverflow = HorizontalOverflow.Overflow
          t.verticalOverflow = VerticalOverflow.Overflow
          t.layoutRect = Rect.create(-LABEL_W / 2, LABEL_W / 2, -0.75, 0.75)
        })

        // Bar cell: recessed track + saturated fill
        this.flexChild(r, {w: trackW, h: BAR_H}, (cell) => {
          const track = this.obj(cell, "Track", new vec3(0, 0, 0.05))
          const timg = track.createComponent("Component.Image") as Image
          const tmat = imageMaterial.clone()
          tmat.mainPass.baseTex = TEX_PILL
          tmat.mainPass.baseColor = new vec4(1, 1, 1, 0.16)
          tmat.mainPass.depthTest = true
          tmat.mainPass.depthWrite = false
          timg.clearMaterials()
          timg.addMaterial(tmat)
          track.getTransform().setLocalScale(new vec3(trackW, BAR_H, 1))

          const fill = this.obj(cell, "Fill", new vec3(-trackW / 2, 0, 0.12))
          const fimg = fill.createComponent("Component.Image") as Image
          const fmat = imageMaterial.clone()
          fmat.mainPass.baseTex = TEX_PILL
          fmat.mainPass.baseColor = new vec4(tint.x, tint.y, tint.z, 1)
          fmat.mainPass.depthTest = true
          fmat.mainPass.depthWrite = false
          fimg.clearMaterials()
          fimg.addMaterial(fmat)
          fill.getTransform().setLocalScale(new vec3(0.001, BAR_H, 1))
          this.elementFills.push(fill)
        })
      })
    }

    this.elementNoteText = this.addCenteredText(col, "", "Caption", 1.35, GOLD)
    this.addElementRule(col, innerW)
    // Breathing room so the note never collides with the first blocker title
    this.flexChild(col, {h: 1.1}, () => {})
  }

  /** Hairline rule spanning the rail — bounds the elements block. */
  private addElementRule(col: SceneObject, innerW: number): void {
    this.flexChild(col, {w: innerW, h: 0.5}, (cell) => {
      const line = this.obj(cell, "Rule", new vec3(0, 0, 0.05))
      const img = line.createComponent("Component.Image") as Image
      const mat = imageMaterial.clone()
      mat.mainPass.baseTex = TEX_PILL
      mat.mainPass.baseColor = new vec4(1, 1, 1, 0.22)
      mat.mainPass.depthTest = true
      mat.mainPass.depthWrite = false
      img.clearMaterials()
      img.addMaterial(mat)
      line.getTransform().setLocalScale(new vec3(innerW, 0.09, 1))
    })
  }

  // Insight panel — left column with TAB CHIPS: [Blockers | Chi Plan | Shop].
  // Everything stays reachable after improve (nothing overwrites the feedback).
  private buildProblemsPanel(): void {
    // Widened from 15 to 20cm and re-centred so the RIGHT edge stays at x −11.5
    // (just clear of the hero image) while the panel grows left into empty space.
    // At W=15 the usable text column was ~6cm on the Chi Plan tab — about 13
    // characters a line, so a one-sentence todo wrapped to nine lines.
    const root = this.obj(this.sceneObject, "ProblemsPanel", new vec3(-21.5, -3.5, 0))
    this.panelRoots["problems"] = root
    const W = 20
    const H = 24
    this.makePlate(root, W, H)
    const TEXT_W = W - 2.6 - SCROLL_RAIL_W

    // Tab chips at the panel top (overlay row above the content roots).
    //
    // Raised (1.6 → 1.2 from the top edge) and pushed FORWARD to z 2.0. Both
    // matter: the chips sit above the content band, but a Button's collider is
    // its own `size` (Element.ts:650) and row buttons grow to fit their text, so
    // a Chi Plan / Shop row scrolled halfway out of the band top still had a
    // ~7cm-tall collider reaching up over the chips. The preview validator (and
    // SIK) take the FIRST collider along the camera ray, so the row swallowed
    // the tap and the chips became unpressable. z 2.0 puts the chip colliders
    // (depth 1 → z 1.5..2.5) strictly in front of any row collider (z 0.15..1.15).
    // The y raise alone could never be sufficient — a tall row half-out of the
    // band reaches past the panel's own top edge — so the real guard is the
    // collider gating in applyScroll; this is defence in depth.
    const tabs = this.obj(root, "Tabs", new vec3(0, H / 2 - 1.2, 2.0))
    const trow = this.flexRow(tabs, W - 0.4, 2.0, {
      gap: 0.4, justify: FlexJustify.Center, align: FlexAlign.Center,
    })
    const addTab = (label: string, mode: string): Text => {
      let handle!: Text
      this.flexChild(trow, {w: 5.6, h: 1.8}, (cell) => {
        const btn = this.themed(cell.createComponent(Button.getTypeName()) as Button)
        btn.size = new vec3(5.6, 1.8, 1)
        const face = this.obj(cell, "TabFace", new vec3(0, 0, 0.08))
        handle = this.addRowText(face, label, "Caption", 5.2)
        btn.onTriggerUp.add(() => this.setTab(mode))
        this.addHoverFeedback(btn, handle, null)
      })
      return handle
    }
    this.blockersTabLabel = this.bindText(addTab(S().tabBlockers, "blockers"), () => S().tabBlockers)
    this.planTabLabel = this.bindText(addTab(S().tabPlan, "plan"), () => S().tabPlan)
    this.shopTabLabel = this.bindText(addTab(S().tabShop, "shop"), () => S().tabShop)

    // NOTE (scrolling): the Content stack of each tab is translated by a
    // scrollOffset, and clipped to the band by ONE OF two mechanisms, chosen by
    // USE_SCROLL_MASK (see the flag's comment for the fallback contract):
    //   true  — a stencil MaskingComponent over the band (buildScrollMask), so
    //           partially-scrolled rows are drawn half-height. Rows are only
    //           disabled once fully outside.
    //   false — whole-row culling: any row not FULLY inside the band is
    //           `enabled = false`, so nothing can ever render past the edge.
    // Either way FlexLayout.performLayout iterates its registered `_items`
    // regardless of SceneObject enabled state (auto-discovery is off), so
    // disabling rows does NOT collapse or reflow the stack.
    // Content column is inset by the rail strip and shifted RIGHT by half of it
    // (the rail lives on the left edge — see SCROLL_RAIL_W), so the stack stays
    // centred in the space that's left and never underlaps the bar.
    const WIN_W = W - 1.2 - SCROLL_RAIL_W
    const scrollParent = USE_SCROLL_MASK ? this.buildScrollMask(root, WIN_W) : root
    // Under the mask rig the parent already sits at the band centre; without it
    // the host carries the full panel-local offset (the original geometry).
    const hostPos = USE_SCROLL_MASK
      ? new vec3(0, -SCROLL_BAND_MID, 0.05)
      : new vec3(SCROLL_RAIL_W / 2, -2.4, 0.6)
    const makeScroll = (mode: string, name: string): SceneObject => {
      const host = this.obj(scrollParent, name,
        new vec3(hostPos.x, hostPos.y, hostPos.z))
      this.tabHosts[mode] = host
      const content = this.obj(host, "Content")
      this.tabContents[mode] = content
      return content
    }

    // Tab 1: Energy Blockers
    const blockersHost = makeScroll("blockers", "BlockersScroll")
    this.blockersContent = blockersHost
    const col = this.flexColumn(blockersHost, WIN_W, -1, {
      gap: 0.4, padY: 0.6, padX: 0.6,
      justify: FlexJustify.Start, align: FlexAlign.Stretch,
    })
    this.tabFlex["blockers"] = col.getComponent(FlexLayout.getTypeName()) as FlexLayout
    this.facingText = this.addCenteredText(col, "", "Caption", 1.2, GOLD)
    // Wu xing balance — five bars, read as a SHAPE. A judge should see a short bar
    // in a row of long ones without reading a single number. Built before
    // bindScroll so these rows register with the scroller like any other.
    // Column inner width (WIN_W minus its 0.6 padding each side) — the width the
    // layout actually stretches a row to, NOT TEXT_W.
    this.buildElementBars(col, WIN_W - 1.2)
    for (let i = 0; i < 3; i++) {
      const title = this.addDynamicRow(col, "Callout", TEXT_W, WHITE)
      const detail = this.addDynamicRow(col, "Caption", TEXT_W, SOFT)
      this.problemRows.push(title, detail)
      this.problemTitleTexts.push(title.t)
      this.problemDetailTexts.push(detail.t)
    }
    this.tabRows["blockers"] = this.problemRows
    this.bindScroll("blockers", col)

    // Tab 2: Chi Plan checklist
    const planHost = makeScroll("plan", "PlanScroll")
    this.planContent = planHost
    const pcol = this.flexColumn(planHost, WIN_W, -1, {
      gap: 0.5, padY: 0.6, padX: 0.6,
      justify: FlexJustify.Start, align: FlexAlign.Stretch,
    })
    this.tabFlex["plan"] = pcol.getComponent(FlexLayout.getTypeName()) as FlexLayout
    this.bindText(this.addCenteredText(pcol, S().doTheseInRoom, "Caption", 1.1, SOFT), () => S().doTheseInRoom)
    for (let i = 0; i < 3; i++) {
      this.addPlanRow(pcol, i, WIN_W)
    }
    this.bindText(this.addCenteredText(pcol, S().thenAssessAgain, "Caption", 1.4, SOFT), () => S().thenAssessAgain)
    this.tabRows["plan"] = this.planRows
    this.bindScroll("plan", pcol)
    this.deferredHide.push(this.tabHosts["plan"])

    // Tab 3: Shop — items the master suggests buying
    const shopHost = makeScroll("shop", "ShopScroll")
    this.shopContent = shopHost
    const scol = this.flexColumn(shopHost, WIN_W, -1, {
      gap: 0.5, padY: 0.6, padX: 0.6,
      justify: FlexJustify.Start, align: FlexAlign.Stretch,
    })
    this.tabFlex["shop"] = scol.getComponent(FlexLayout.getTypeName()) as FlexLayout
    this.bindText(this.addCenteredText(scol, S().masterSuggests, "Caption", 1.1, SOFT), () => S().masterSuggests)
    const ROW_W = WIN_W - 1.2
    for (let i = 0; i < 3; i++) {
      this.flexChild(scol, {w: ROW_W, h: 6.2}, (rowObj) => {
        const btn = this.themed(rowObj.createComponent(Button.getTypeName()) as Button)
        btn.size = new vec3(ROW_W, 6.0, 1)
        this.shopButtons[i] = btn
        this.shopRowItems[i] = rowObj.getComponent(FlexItem.getTypeName()) as FlexItem
        const inner = this.obj(rowObj, "ShopFace", new vec3(0, 0, 0.08))
        // Row = [thumbnail | name over description]. Thumb starts hidden and
        // only shows once its image downloads (graceful text-only fallback).
        const irow = this.flexRow(inner, ROW_W, 6.0, {
          gap: 0.4, padX: 0.3, justify: FlexJustify.Start, align: FlexAlign.Center,
        })
        this.flexChild(irow, {w: 3.4, h: 3.4}, (cell) => {
          const thumbObj = this.obj(cell, "Thumb", new vec3(0, 0, 0.04))
          const img = thumbObj.createComponent("Component.Image") as Image
          const mat = imageMaterial.clone()
          mat.mainPass.depthTest = true
          mat.mainPass.depthWrite = false
          img.clearMaterials()
          img.addMaterial(mat)
          thumbObj.getTransform().setLocalScale(new vec3(3.4, 3.4, 1))
          thumbObj.enabled = false
          this.shopThumbSOs[i] = thumbObj
          this.shopThumbMats[i] = mat
        })
        const TXT_W = ROW_W - 4.2
        this.flexChild(irow, {w: TXT_W, h: 5.6}, (cell) => {
          const tcol = this.flexColumn(cell, TXT_W, -1, {
            gap: 0.25, justify: FlexJustify.Center, align: FlexAlign.Stretch,
          })
          this.shopTitleFlex[i] = tcol.getComponent(FlexLayout.getTypeName()) as FlexLayout
          const title = this.addDynamicRow(tcol, "Callout", TXT_W - 0.4, JADE)
          const desc = this.addDynamicRow(tcol, "Caption", TXT_W - 0.4, SOFT)
          this.shopTitleRows[i] = title
          this.shopDescRows[i] = desc
          this.shopItemTexts[i] = title.t
          this.shopReasonTexts[i] = desc.t
        })
        btn.onTriggerUp.add(() => this._onShopTap.invoke(i))
        this.addHoverFeedback(btn, this.shopItemTexts[i], null)
      })
    }
    this.tabRows["shop"] = []
    this.bindScroll("shop", scol)
    this.deferredHide.push(this.tabHosts["shop"])

    this.buildScrollBar(root, W)
    this.setTab("blockers")
  }

  // ═══ Stencil mask rig (USE_SCROLL_MASK) ═══════════════════════════════════
  //
  // LS masking is stencil-based ("Masking depends on stencil buffer usage"), so
  // it clips EVERY descendant renderable — including our plain-Transform Text
  // rows — PROVIDED the mask is a ScreenTransform whose rect is really the size
  // we think it is. That proviso is what sank the earlier ScrollWindow attempt:
  // its setWindowSize() writes absolute cm into `anchors`, and anchors are
  // NORMALIZED (−1..1 of the parent rect), so the mask came out ~17× too big.
  //
  // Here the rect comes from a world-unit Canvas sized in cm; the mask's anchors
  // simply fill it and its offsets are zero. Returns the SceneObject that the
  // tab hosts should parent to.
  private buildScrollMask(root: SceneObject, winW: number): SceneObject {
    const host = this.obj(root, "ScrollCanvas",
      new vec3(SCROLL_RAIL_W / 2, SCROLL_BAND_CENTER_Y, 0.55))
    const canvas = host.createComponent("Component.Canvas") as Canvas
    canvas.unitType = Canvas.UnitType.World
    // Horizontal slack: the mask only has to clip vertically, and the widest row
    // (15.8cm) must keep its edges. Still clear of the ScrollBar at x −9.1.
    canvas.setSize(new vec2(winW + 0.8, SCROLL_VIEW_H + SCROLL_MASK_SLACK * 2))

    const maskSO = this.obj(host, "ScrollMask")
    const st = maskSO.createComponent("Component.ScreenTransform") as ScreenTransform
    st.anchors = Rect.create(-1, 1, -1, 1)
    st.offsets = Rect.create(0, 0, 0, 0)
    const mask = maskSO.createComponent("Component.MaskingComponent") as MaskingComponent
    mask.cornerRadius = 0
    this.scrollMaskSO = maskSO
    this.scrollMaskST = st

    // A ScreenTransform drives its own SceneObject's Transform and may hand it a
    // rect-sized localScale; plain-Transform children would inherit that. So
    // everything below the mask hangs off a shim that cancels it (identity when
    // the ScreenTransform leaves the scale at 1). Kept true by syncMaskScale.
    const shim = this.obj(maskSO, "ScrollUnscale")
    this.scrollUnscale = shim
    return shim
  }

  // Stays silent when the rig is healthy. If it ever speaks, the stencil is not
  // clipping anything and rows WILL render over the control panel — set
  // USE_SCROLL_MASK = false to fall back to the verified row-culling scroller.
  private warnIfMaskDead(): void {
    const st = this.scrollMaskST
    const mso = this.scrollMaskSO
    const parent = mso && !isNull(mso) ? mso.getParent() : null
    const ok = !!st && !!mso && st.isInScreenHierarchy() &&
      !!mso.getComponent("Component.MaskingComponent") &&
      !!parent && !!parent.getComponent("Component.Canvas")
    if (!ok) {
      print("[FengshuiUI] WARN scroll mask rig is not live — insight rail will " +
        "not clip. Set USE_SCROLL_MASK = false to restore row culling.")
    }
  }

  /** Cancel any rect-sized scale the mask's ScreenTransform imposes. */
  private syncMaskScale(): void {
    const maskSO = this.scrollMaskSO
    const shim = this.scrollUnscale
    if (!maskSO || !shim || isNull(maskSO) || isNull(shim)) return
    const s = maskSO.getTransform().getLocalScale()
    const inv = new vec3(
      Math.abs(s.x) > 1e-4 ? 1 / s.x : 1,
      Math.abs(s.y) > 1e-4 ? 1 / s.y : 1,
      Math.abs(s.z) > 1e-4 ? 1 / s.z : 1)
    const cur = shim.getTransform().getLocalScale()
    if (Math.abs(cur.x - inv.x) > 1e-4 || Math.abs(cur.y - inv.y) > 1e-4 ||
        Math.abs(cur.z - inv.z) > 1e-4) {
      shim.getTransform().setLocalScale(inv)
    }
  }

  // Vertical drag bar on the panel's OUTER (left) edge — see SCROLL_RAIL_W.
  //
  // Why a rotated Slider and not UIKit's ScrollBar: ScrollBar hard-depends on a live
  // ScrollWindow — `isScrollable` dereferences `scrollWindow.vertical` with no null
  // guard and `setupScrollWindowEventHandlers()` subscribes to three of its signals
  // unconditionally. Using it would drag back ScrollWindow, whose setWindowSize()
  // sizes its mask through `anchors` (absolute cm into a normalized field) and so
  // clips nothing — the exact failure buildScrollMask exists to avoid. ScrollBar
  // wraps a Slider internally anyway, so this is that minus the coupling.
  //
  // Slider has no orientation property, so the SceneObject is rolled 90° about Z.
  // That is safe because every drag path resolves through
  // `transform.getInvertedWorldTransform().multiplyPoint(...).x` (Element.ts:839,
  // Slider.ts:876/897) — pure LOCAL space, so local +X simply becomes world +Y.
  private buildScrollBar(root: SceneObject, W: number): void {
    const trackLen = SCROLL_VIEW_H - 0.8
    this.scrollBarTrackLen = trackLen
    // Centre of the content band, in panel-local space (host sits at y −2.4).
    const bandCenterY = SCROLL_BAND_CENTER_Y
    // OUTER (left) edge — see SCROLL_RAIL_W for why the inner edge is unreachable.
    const barRoot = this.obj(root, "ScrollBar",
      new vec3(-(W / 2 - SCROLL_RAIL_W / 2 - 0.1), bandCenterY, 0.7))
    barRoot.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, Math.PI / 2))
    this.scrollBarRoot = barRoot

    const slider = barRoot.createComponent(Slider.getTypeName()) as Slider
    ;(slider as any)._size = new vec3(trackLen, 0.9, 1)   // BEFORE initialize
    slider.initialize()
    slider.currentValue = 1            // 1 = top of content
    slider.knobSize = new vec2(3.0, 0.9)
    slider.onKnobMoved.add((v: number) => this.onScrollBarMoved(v))
    slider.onValueChange.add((v: number) => this.onScrollBarMoved(v))
    this.scrollBar = slider

    // Same jade/gold theming as the crossfade slider, applied post-initialize.
    this.createEvent("OnStartEvent").bind(() => {
      try {
        const track = slider.visual as RoundedRectangleVisual
        if (track) {
          track.defaultBaseType = "Gradient"
          track.defaultGradient = SLIDER_TRACK_GRAD
          track.hoveredBaseType = "Gradient"
          track.hoveredGradient = SLIDER_TRACK_GRAD
        }
        const knob = slider.knobVisual as RoundedRectangleVisual
        if (knob) {
          knob.defaultBaseType = "Gradient"
          knob.defaultGradient = SLIDER_KNOB_GRAD
          knob.hoveredBaseType = "Gradient"
          knob.hoveredGradient = SLIDER_KNOB_GRAD
        }
      } catch (e) {
        print("[FengshuiUI] scroll bar theming skipped: " + e)
      }
    })
    this.deferredHide.push(barRoot)
  }

  // Knob drag -> scrollOffset. Value 1 is the TOP of the content (offset 0).
  private onScrollBarMoved(v: number): void {
    if (this.syncingScrollBar) return          // echo from applyScroll's own write
    if (getTime() < this.scrollBarMuteUntil) return   // late echo across a tab switch
    const mode = this.tabMode
    const max = this.tabMaxScroll[mode] ?? 0
    if (max <= 0) return
    this.tabScrollOffset[mode] = (1 - Math.max(0, Math.min(1, v))) * max
    this.applyScroll(mode)
  }

  // ═══ Row-culling scroller ══════════════════════════════════════════════════

  /** Register a tab column's rows and re-cull whenever its layout settles. */
  private bindScroll(mode: string, flexContainer: SceneObject): void {
    const rows: {so: SceneObject; item: FlexItem; btn: Button | null}[] = []
    const n = flexContainer.getChildrenCount()
    for (let i = 0; i < n; i++) {
      const child = flexContainer.getChild(i)
      const item = child.getComponent(FlexItem.getTypeName()) as FlexItem | null
      // Chi Plan / Shop rows carry a Button on the row object itself; Blockers
      // rows are plain text and have none. applyScroll gates the Button's
      // collider so an off-band row can't intercept taps meant for the chips.
      const btn = child.getComponent(Button.getTypeName()) as Button | null
      if (item) rows.push({so: child, item: item, btn: btn})
    }
    this.tabScrollRows[mode] = rows
    const flex = this.tabFlex[mode]
    // Rows self-size (setRowText) so content height is only known post-layout.
    // Safe to re-cull from here: toggling SceneObject.enabled never re-dirties
    // the layout, so this cannot recurse.
    if (flex && !isNull(flex)) flex.onLayoutComplete.add(() => this.applyScroll(mode))
  }

  /** Position a tab's content stack for its scrollOffset and cull outside rows. */
  private applyScroll(mode: string): void {
    const rows = this.tabScrollRows[mode]
    const content = this.tabContents[mode]
    if (!rows || rows.length === 0 || !content || isNull(content)) return

    // Content extent from the layout-assigned row positions + their own heights.
    let top = -Infinity
    let bottom = Infinity
    for (const r of rows) {
      const y = r.so.getTransform().getLocalPosition().y
      const h = Math.max(0.01, r.item.overrideHeight)
      top = Math.max(top, y + h / 2)
      bottom = Math.min(bottom, y - h / 2)
    }
    if (top === -Infinity) return

    const contentH = top - bottom
    const maxScroll = Math.max(0, contentH - SCROLL_VIEW_H)
    const off = Math.min(Math.max(this.tabScrollOffset[mode] ?? 0, 0), maxScroll)
    this.tabScrollOffset[mode] = off
    this.tabMaxScroll[mode] = maxScroll

    // Park the stack's top edge at the view top, then slide up by the offset.
    const contentY = SCROLL_VIEW_TOP - top + off
    content.getTransform().setLocalPosition(new vec3(0, contentY, 0))

    // Row visibility. Held off until the startup gate so every Button/Slider
    // gets its OnStart.
    //   masked  — keep a row alive while ANY part of it overlaps the band; the
    //             stencil draws the visible fraction and hides the rest, so the
    //             row slides smoothly under the edge. Fully-outside rows are
    //             still disabled: they are 100% clipped anyway, and leaving them
    //             enabled would strand their Button colliders off-panel.
    //   culled  — a row must be FULLY inside the band or it is hidden outright,
    //             so nothing can leak past the panel edge (pops, but is safe).
    if (this.startupGateDone) {
      if (USE_SCROLL_MASK) this.syncMaskScale()
      for (const r of rows) {
        const c = contentY + r.so.getTransform().getLocalPosition().y
        const h = Math.max(0.01, r.item.overrideHeight)
        const fullyInside = c + h / 2 <= SCROLL_VIEW_TOP + SCROLL_EPS &&
          c - h / 2 >= SCROLL_VIEW_BOTTOM - SCROLL_EPS
        const overlaps = c - h / 2 <= SCROLL_VIEW_TOP + SCROLL_EPS &&
          c + h / 2 >= SCROLL_VIEW_BOTTOM - SCROLL_EPS
        const visible = USE_SCROLL_MASK ? overlaps : fullyInside
        if (r.so.enabled !== visible) r.so.enabled = visible
        // A stencil clips PIXELS, not COLLIDERS. A Chi Plan / Shop row that is
        // half-scrolled out of the band is still enabled (so the mask can draw
        // its visible half), and its Button collider is its full untrimmed
        // height — which reaches out over the tab chips and over neighbouring
        // rows, stealing their taps. So hit-testing is gated on FULLY inside
        // while rendering is gated on overlap: you can only tap a row you can
        // completely see. (In culling mode the two predicates coincide, so this
        // is a no-op there.)
        this.setRowInteractive(r.btn, fullyInside)
      }
    }
    if (mode === this.tabMode) this.updateScrollBar(contentH, maxScroll, off)
  }

  /**
   * Enable/disable a row Button's hit test without touching its visuals.
   * Deliberately NOT `btn.inactive = true` — that also drives the Element into
   * its inactive visual state (greyed plate), which would make a half-scrolled
   * row look disabled rather than simply clipped. Element only ever writes
   * `_collider.enabled` in initialize() and the `inactive` setter
   * (Element.ts:584/657), so owning this flag here is safe.
   */
  private setRowInteractive(btn: Button | null, on: boolean): void {
    if (!btn || isNull(btn)) return
    try {
      const col = btn.collider
      if (col && !isNull(col) && col.enabled !== on) col.enabled = on
    } catch (e) {
      // Element not initialized yet (pre-OnStart) — it has no collider to gate.
    }
  }

  // Thumb reflects BOTH position (where you are) and proportion (how much is
  // visible). Bar hides entirely when everything already fits.
  private updateScrollBar(contentH: number, maxScroll: number, off: number): void {
    const bar = this.scrollBar
    const barRoot = this.scrollBarRoot
    if (!bar || !barRoot || isNull(barRoot)) return
    const scrollable = maxScroll > 0.05
    if (this.startupGateDone) barRoot.enabled = scrollable
    if (!scrollable) return
    // Knob length = visible fraction of the content, floored so it stays grabbable.
    const frac = Math.max(0.12, Math.min(1, SCROLL_VIEW_H / Math.max(contentH, 0.01)))
    const knobLen = Math.max(2.0, frac * this.scrollBarTrackLen)
    const desired = new vec2(knobLen, 0.9)
    if (Math.abs(bar.knobSize.x - desired.x) > 0.01) bar.knobSize = desired
    // Write position back without re-entering onScrollBarMoved.
    //
    // resetToValue, NOT `currentValue =`. Assigning currentValue only sets the
    // spring TARGET: Slider.update() then walks `_knobValue` toward it over the
    // next N frames, and every one of those steps calls updateKnobPosition() →
    // onKnobMovedEvent.invoke(knobValue) (Slider.ts:925-990). Those fire long
    // after the syncingScrollBar guard below has been cleared, so each one lands
    // in onScrollBarMoved carrying a STALE intermediate value and drags the
    // content back to wherever the knob happened to be — which is why a tab
    // switch appeared not to reset to top: setTab did reset it, and the spring
    // immediately scrolled it back. resetToValue snaps value + knob + spring in
    // one pass and fires nothing asynchronous, so the reset sticks.
    this.syncingScrollBar = true
    try {
      bar.resetToValue(1 - off / maxScroll)
    } finally {
      this.syncingScrollBar = false
    }
  }


  /** A wrapped text row that can resize itself later (see setRowText). */
  private addDynamicRow(parent: SceneObject, role: TextRole, widthCM: number, color: vec4): TextRow {
    let rec!: TextRow
    const h0 = this.wrappedHeight("", role, widthCM)
    this.flexChild(parent, {h: h0}, (so) => {
      const t = so.createComponent("Component.Text") as Text
      t.text = ""
      t.depthTest = true
      applyTextRole(t, role)
      t.textFill.color = color
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Wrap
      t.verticalOverflow = VerticalOverflow.Overflow
      t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -h0 / 2, h0 / 2)
      const item = so.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Center
      rec = {t: t, item: item, w: widthCM, role: role}
    })
    return rec
  }

  // Tab switch: exactly one scroll window live, scrolled to top + chip tinted
  private setTab(mode: string): void {
    this.tabMode = mode
    const canToggle = this.startupGateDone
    for (const key of ["blockers", "plan", "shop"]) {
      const host = this.tabHosts[key]
      if (!host || isNull(host)) continue
      // Pre-gate every window stays enabled so its ScrollWindow can initialize
      // (same OnStart trap as Frame) — deferredHide switches them off after.
      host.enabled = canToggle ? key === mode : true
    }
    if (this.blockersTabLabel) this.blockersTabLabel.textFill.color = mode === "blockers" ? JADE : SOFT
    if (this.planTabLabel) this.planTabLabel.textFill.color = mode === "plan" ? JADE : SOFT
    if (this.shopTabLabel) this.shopTabLabel.textFill.color = mode === "shop" ? JADE : SOFT
    // Every tab switch starts at the top. If the incoming tab was hidden while its
    // rows resized, its layout is still dirty — onLayoutComplete re-runs this.
    // The mute window swallows any knob callback still in flight from a drag on
    // the tab we just left, so the reset below is the last word.
    this.scrollBarMuteUntil = getTime() + 0.3
    this.tabScrollOffset[mode] = 0
    this.applyScroll(mode)
  }

  // Shop suggestions from the analysis (item + reason; taps emit onShopTap)
  setShop(items: {item: string; reason: string; search: string}[]): void {
    for (let i = 0; i < 3; i++) {
      const it = items[i]
      this.setRowText(this.shopTitleRows[i], it ? this.clip(it.item, 34) : "")
      this.setRowText(this.shopDescRows[i], it ? this.clip(it.reason, 160) : "")
      this.shopQueries[i] = it ? it.search : null
      // Row grows to fit BOTH stacked texts (+ thumb minimum) — titles that wrap
      // to two lines can no longer collide with the description beneath them.
      const stack = this.shopTitleRows[i].item.overrideHeight +
        this.shopDescRows[i].item.overrideHeight + 0.9
      const h = Math.max(4.6, stack)
      const rowItem = this.shopRowItems[i]
      if (rowItem) rowItem.overrideHeight = h + 0.4
      // Grow the button plate with the row so a long reason still sits ON its
      // tappable face (mirrors showPlan's row-button resize).
      const btn = this.shopButtons[i]
      if (btn) btn.size = new vec3(btn.size.x, h + 0.2, 1)
      const flex = this.shopTitleFlex[i]
      if (flex && !isNull(flex)) flex.markDirty()
      this.shopRowHeights[i] = h + 0.4
    }
    this.tabScrollOffset["shop"] = 0
    this.clearShopThumbs()
    this.refreshShopScroll()
  }

  private refreshShopScroll(): void {
    const flex = this.tabFlex["shop"]
    if (flex && !isNull(flex)) flex.markDirty()
  }

  // Query string for a shop row (main uses it for the non-partner fallback hint)
  shopQuery(index: number): string | null {
    return this.shopQueries[index] ?? null
  }

  // Product thumbnail for a shop row (main downloads it; row stays text-only
  // until this lands, and stays text-only forever if the download failed).
  setShopThumb(index: number, tex: Texture): void {
    const mat = this.shopThumbMats[index]
    const so = this.shopThumbSOs[index]
    if (!mat || !so || isNull(so)) return
    mat.mainPass.baseTex = tex
    so.enabled = true
  }

  clearShopThumbs(): void {
    for (const so of this.shopThumbSOs) {
      if (so && !isNull(so)) so.enabled = false
    }
  }

  // Mark a shop row purchased (✓ prefix on the title)
  markShopOwned(index: number): void {
    const t = this.shopItemTexts[index]
    if (t && t.text && t.text.indexOf("✓") !== 0) t.text = "✓ " + t.text
  }

  // Cardinal direction the reading was taken facing (from the device compass)
  setFacing(dir: string | null): void {
    if (this.facingText) {
      this.facingText.text = dir ? S().facingLine(directionName(dir)) : ""
    }
  }

  // HERO compare panel — big, DEAD-CENTER: the room image is the star.
  private buildComparePanel(): void {
    const root = this.obj(this.sceneObject, "BeforeAfterPanel", new vec3(0, 6.5, 0))
    this.panelRoots["images"] = root
    const W = 22
    const H = 24.5
    this.makePlate(root, W, H)

    const content = this.obj(root, "Content", new vec3(0, 0, 0.6))
    const col = this.flexColumn(content, W, H, {
      gap: 0.3, padY: 0.8, padX: 1.2,
      justify: FlexJustify.Start, align: FlexAlign.Stretch,
    })
    this.compareFlex = col.getComponent(FlexLayout.getTypeName()) as FlexLayout

    // Image stack: before (base) + after (alpha-crossfaded on top) — 19x14.25 hero
    this.beforeMat = imageMaterial.clone()
    this.afterMat = imageMaterial.clone()
    this.flexChild(col, {w: 19, h: 14.25}, (cell) => {
      const beforeObj = this.obj(cell, "BeforePhoto", new vec3(0, 0, 0.03))
      const bimg = beforeObj.createComponent("Component.Image") as Image
      this.beforeMat.mainPass.depthTest = true
      this.beforeMat.mainPass.depthWrite = false
      bimg.clearMaterials()
      bimg.addMaterial(this.beforeMat)
      beforeObj.getTransform().setLocalScale(new vec3(19, 14.25, 1))

      const afterObj = this.obj(cell, "AfterPhoto", new vec3(0, 0, 0.06))
      const aimg = afterObj.createComponent("Component.Image") as Image
      this.afterMat.mainPass.depthTest = true
      this.afterMat.mainPass.depthWrite = false
      aimg.clearMaterials()
      aimg.addMaterial(this.afterMat)
      afterObj.getTransform().setLocalScale(new vec3(19, 14.25, 1))
      afterObj.enabled = false
      this.afterImageSO = afterObj

      // Repaint spinner, above BOTH images (z 0.09 > after's 0.06). A soft dark
      // halo sits under the glyph so it stays readable over a bright or busy
      // photo — a bare gold icon on a white wall is invisible. The halo uses the
      // 128x128 bokeh (square, soft falloff), NOT the 512x96 pill: the pill only
      // works at its natural width and would smear if squashed square.
      // Rotation is driven by the shared anim UpdateEvent; addIconGetMat scales
      // uniformly (sizeCM, sizeCM), so spinning can't shear the glyph.
      const spinRoot = this.obj(cell, "RepaintSpinner", new vec3(0, 0, 0.09))
      const scrim = this.obj(spinRoot, "SpinnerScrim", new vec3(0, 0, 0))
      const scrimMat = this.addIconGetMat(scrim, TEX_BOKEH, 5.2)
      scrimMat.mainPass.baseColor = new vec4(0.02, 0.05, 0.04, 0.78)
      const glyph = this.obj(spinRoot, "SpinnerGlyph", new vec3(0, 0, 0.01))
      this.spinnerMat = this.addIconGetMat(glyph, ICON_REPLAY, 2.6)
      this.spinnerMat.mainPass.baseColor = GOLD
      spinRoot.enabled = false
      this.spinnerSO = spinRoot
      this.spinnerGlyphSO = glyph   // spin the glyph only — the scrim stays still

      const item = cell.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Center
    })

    // Crossfade slider row: [Before | themed slider | After]. Slider/Switch are
    // the explicit _size + initialize() pair (/specs-build-ui G2). onKnobMoved
    // fires every knob update DURING the drag (live scrubbing); onValueChange is
    // the release commit — subscribe to both. setCrossfade only writes the alpha
    // uniform (no material rebuild), so per-frame is cheap.
    this.crossfadeRowSO = this.flexChild(col, {w: W - 2.4, h: this.SLOT_H}, (rowObj) => {
      this.crossfadeRowItem = rowObj.getComponent(FlexItem.getTypeName()) as FlexItem
      const row = this.flexRow(rowObj, W - 2.4, 2.0, {
        gap: 0.4, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 2.8, h: 1.4}, (cell) => {
        this.bindText(this.addRowText(cell, S().beforeLabel, "Caption", 2.8), () => S().beforeLabel)
      })
      this.flexChild(row, {w: 9.4, h: 1.8}, (cell) => {
        const slider = cell.createComponent(Slider.getTypeName()) as Slider
        ;(slider as any)._size = new vec3(9.4, 1.6, 1)
        slider.initialize()
        slider.currentValue = 1
        slider.knobSize = new vec2(1.4, 1.4)
        slider.onKnobMoved.add((v: number) => this.setCrossfade(v))
        slider.onValueChange.add((v: number) => this.setCrossfade(v))
        this.crossfadeSlider = slider
        // Fengshui theme — style the visuals once they exist (post-initialize)
        this.createEvent("OnStartEvent").bind(() => {
          try {
            const track = slider.visual as RoundedRectangleVisual
            if (track) {
              track.defaultBaseType = "Gradient"
              track.defaultGradient = SLIDER_TRACK_GRAD
              track.hoveredBaseType = "Gradient"
              track.hoveredGradient = SLIDER_TRACK_GRAD
            }
            const fill = slider.trackFillVisual as RoundedRectangleVisual
            if (fill) {
              fill.defaultBaseType = "Gradient"
              fill.defaultGradient = SLIDER_FILL_GRAD
              fill.hoveredBaseType = "Gradient"
              fill.hoveredGradient = SLIDER_FILL_GRAD
            }
            const knob = slider.knobVisual as RoundedRectangleVisual
            if (knob) {
              knob.defaultBaseType = "Gradient"
              knob.defaultGradient = SLIDER_KNOB_GRAD
              knob.hoveredBaseType = "Gradient"
              knob.hoveredGradient = SLIDER_KNOB_GRAD
            }
          } catch (e) {
            print("[FengshuiUI] slider theming skipped: " + e)
          }
        })
      })
      this.flexChild(row, {w: 2.6, h: 1.4}, (cell) => {
        this.bindText(this.addRowText(cell, S().afterLabel, "Caption", 2.6), () => S().afterLabel)
      })
    })

    // Scan view navigator — occupies the SAME slot as the crossfade row above
    // (they are never both meaningful: crossfade needs an improved image, the
    // navigator needs a multi-frame scan). setCompareMode picks one.
    this.navRowSO = this.flexChild(col, {w: W - 2.4, h: 0.01}, (rowObj) => {
      this.navRowItem = rowObj.getComponent(FlexItem.getTypeName()) as FlexItem
      const row = this.flexRow(rowObj, W - 2.4, 2.0, {
        gap: 0.4, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 2.4, h: 2.0}, (cell) => {
        this.addIconButton(cell, ICON_PREV, 2.4, () => this._onScanStep.invoke(-1))
      })
      this.flexChild(row, {w: 13, h: 1.6}, (cell) => {
        this.navLabel = this.addRowText(cell, "", "Caption", 13)
        this.navLabel.textFill.color = WHITE
      })
      this.flexChild(row, {w: 2.4, h: 2.0}, (cell) => {
        this.addIconButton(cell, ICON_NEXT, 2.4, () => this._onScanStep.invoke(1))
      })
    })
    this.deferredHide.push(this.navRowSO)

    // Spatialize button — nested-container cell: both w and h declared
    this.flexChild(col, {w: W - 2.4, h: 3.2}, (rowObj) => {
      const row = this.flexRow(rowObj, W - 2.4, 3.2, {
        gap: 0.5, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 10.4, h: 3.0}, (cell) => {
        this.bindText(this.addIconTextButton(cell, ICON_AR, S().viewIn3dBtn, 10.4, 3.0, () => this._onSpatialize.invoke()).label, () => S().viewIn3dBtn)
      })
    })

    // QA row — icon + text, hidden until showAfter provides a verdict (the bare
    // check icon with empty text read as a "random tick" under the image).
    this.flexChild(col, {w: W - 2.4, h: 1.6}, (rowObj) => {
      const row = this.flexRow(rowObj, W - 2.4, 1.6, {
        gap: 0.5, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 1.6, h: 1.6}, (cell) => {
        this.addIcon(cell, ICON_CHECK, 1.4)
      })
      this.flexChild(row, {w: 11, h: 1.6}, (cell) => {
        this.qaText = this.addRowText(cell, "", "Caption", 11)
      })
      this.qaRow = rowObj
      this.deferredHide.push(rowObj)
    })
  }

  /**
   * Swap the hero panel's secondary row between the Before/After crossfade
   * (assess) and the scan view navigator. Collapsing overrideHeight is what
   * actually reclaims the space — see the field comment.
   */
  setCompareMode(scanMode: boolean): void {
    if (!this.crossfadeRowItem || !this.navRowItem) return
    this.crossfadeRowItem.overrideHeight = scanMode ? 0.01 : this.SLOT_H
    this.navRowItem.overrideHeight = scanMode ? this.SLOT_H : 0.01
    if (this.startupGateDone) {
      this.crossfadeRowSO.enabled = !scanMode
      this.navRowSO.enabled = scanMode
    }
    if (this.compareFlex && !isNull(this.compareFlex)) this.compareFlex.markDirty()
  }

  /** Caption under the hero image while paging through scan views. */
  setScanNavLabel(text: string): void {
    if (this.navLabel) this.navLabel.text = this.clip(text, 40)
  }

  /** Show an arbitrary frame in the hero slot (scan navigation). */
  showFrame(tex: Texture): void {
    this.showPanel("images")
    this.beforeMat.mainPass.baseTex = tex
    this.beforeMat.mainPass.baseColor = new vec4(1, 1, 1, 1)
    this.afterImageSO.enabled = false
  }

  /**
   * Generic Master-panel content. The panel is NOT mic-only: the pan scan drives
   * it too, so the master has something to say about every view without the user
   * ever pressing the mic.
   */
  showMasterSays(heading: string, body: string, hint: string): void {
    this.showPanel("master")
    this.setRowText(this.masterQuestionRow, this.clip(heading, 140))
    this.masterBodyText = this.clip(body, MASTER_BODY_MAX)
    this.setRowText(this.masterAnswerRow, this.masterBodyText)
    if (this.masterHintText) this.masterHintText.text = hint
    this.refreshMaster()
  }

  /**
   * Append a bullet to what the master ALREADY said rather than replacing it.
   * The rebalance used to call showMasterSays, which wiped the answer the user
   * had just asked for — the event should read as one more thing the master
   * noticed, not as the end of the conversation.
   *
   * Returns false when there is nothing to append to, so the caller can fall
   * back to showMasterSays and still give the note a heading.
   *
   * The total stays inside MASTER_BODY_MAX (this panel has no ScrollWindow, so
   * an unbounded body would grow straight off the plate). When the budget is
   * tight the OLDER text loses characters, never the new bullet — the newest
   * line is the one the user is waiting on.
   */
  appendMasterNote(note: string, hint: string): boolean {
    if (!this.masterBodyText) return false
    this.showPanel("master")
    const bullet = "• " + note
    // The forced line break costs a rendered line that a pure character budget
    // would not charge for, so buy it back (~one line of glyphs). Without this
    // an appended answer renders ~1cm taller than the plain worst case, and the
    // panel is only 26.5cm with no room to spare.
    const room = Math.max(0, MASTER_BODY_MAX - bullet.length - 1 - MASTER_APPEND_SLACK)
    const head = this.clip(this.masterBodyText, room)
    this.masterBodyText = head + "\n" + bullet
    this.setRowText(this.masterAnswerRow, this.masterBodyText)
    if (this.masterHintText) this.masterHintText.text = hint
    this.refreshMaster()
    return true
  }

  private setCrossfade(v: number): void {
    const a = Math.max(0, Math.min(1, v))
    this.afterMat.mainPass.baseColor = new vec4(1, 1, 1, a)
  }

  // ═══ Ask the master ════════════════════════════════════════════════════════
  //
  // PLACEMENT NOTE. The obvious home was a fourth chip on the insight rail, but
  // the chips do not fit: the tab row is W−0.4 = 19.6cm and the chips are
  // 5.6cm + 0.4 gaps, so a fourth takes 4×5.6 + 3×0.4 = 23.6cm. Squeezing them
  // to 4.6cm lands on exactly 19.6cm — zero side margin inside a 20cm panel,
  // with "Blockers"/"Chi Plan" already ~3.5cm of glyphs per chip. A previous
  // pass flagged chip crowding at THREE.
  //
  // So the answer gets its own panel, mirrored off the insight rail on the
  // right (the rail sits at x −21.5 with its inner edge at −11.5; this is the
  // same panel reflected to +21.5 / +11.5, so the cluster stays symmetric and
  // the empty right half is finally used). Three further reasons it is the
  // better home: the answer is transient and conversational, so it should
  // appear WITHOUT costing a tab tap; it must not evict whichever of
  // Blockers/Plan/Shop the user was reading; and at 20×24 it can show the whole
  // answer as text — which matters because ElevenLabs narration is disabled
  // (no valid sk_ key), so a voice-only answer would be invisible.
  private buildMasterPanel(): void {
    const root = this.obj(this.sceneObject, "MasterPanel", new vec3(21.5, -3.5, 0))
    this.panelRoots["master"] = root
    const W = 20
    // 24 → 26.5 to pay for the archive navigator without squeezing a long
    // answer. Panel spans y −16.75..9.75 at x 11.5..31.5 — its own column,
    // clear of the hero panel and the score gauge.
    const H = 26.5
    this.makePlate(root, W, H)

    const content = this.obj(root, "Content", new vec3(0, 0, 0.6))
    const col = this.flexColumn(content, W, H, {
      gap: 0.4, padY: 0.9, padX: 1.0,
      justify: FlexJustify.Start, align: FlexAlign.Stretch,
    })
    this.masterFlex = col.getComponent(FlexLayout.getTypeName()) as FlexLayout
    const TEXT_W = W - 2.6

    this.bindText(this.addCenteredText(col, S().masterAnswers, "Callout", 1.5, WHITE), () => S().masterAnswers)
    this.addElementRule(col, TEXT_W)
    // Question first (what was heard — doubles as transcript confirmation),
    // then the answer beneath it.
    this.masterQuestionRow = this.addDynamicRow(col, "Caption", TEXT_W, GOLD)
    this.masterAnswerRow = this.addDynamicRow(col, "Caption", TEXT_W, WHITE)
    this.masterHintText = this.addCenteredText(col, "", "Caption", 1.3, SOFT)

    // Archive navigator — collapsed until there is at least one past ask, so a
    // first-time panel is not cluttered by arrows that go nowhere.
    this.askNavSO = this.flexChild(col, {w: TEXT_W, h: 0.01}, (rowObj) => {
      this.askNavItem = rowObj.getComponent(FlexItem.getTypeName()) as FlexItem
      const row = this.flexRow(rowObj, TEXT_W, 2.2, {
        gap: 0.4, justify: FlexJustify.Center, align: FlexAlign.Center,
      })
      this.flexChild(row, {w: 2.2, h: 2.2}, (cell) => {
        this.addIconButton(cell, ICON_PREV, 2.2, () => this._onAskNav.invoke(-1))
      })
      this.flexChild(row, {w: 9.5, h: 1.6}, (cell) => {
        this.askNavLabel = this.addRowText(cell, "", "Caption", 9.5)
        this.askNavLabel.textFill.color = SOFT
      })
      this.flexChild(row, {w: 2.2, h: 2.2}, (cell) => {
        this.addIconButton(cell, ICON_NEXT, 2.2, () => this._onAskNav.invoke(1))
      })
    })
    this.deferredHide.push(this.askNavSO)
  }

  /**
   * Show/hide the archive navigator and set its caption. Collapsing
   * overrideHeight (not just `enabled`) is what reclaims the row — FlexLayout
   * lays out its registered items regardless of SceneObject enabled state.
   */
  setAskNav(visible: boolean, label: string): void {
    if (!this.askNavItem) return
    this.askNavItem.overrideHeight = visible ? 2.2 : 0.01
    if (this.startupGateDone) this.askNavSO.enabled = visible
    if (this.askNavLabel) this.askNavLabel.text = this.clip(label, 30)
    this.refreshMaster()
  }

  /** Mic released: show the heard question and a waiting state for the answer. */
  showAsk(question: string): void {
    this.showPanel("master")
    this.setRowText(this.masterQuestionRow, '"' + this.clip(question, 140) + '"')
    this.setRowText(this.masterAnswerRow, "…")
    if (this.masterHintText) this.masterHintText.text = S().masterConsidering
    this.refreshMaster()
  }

  /**
   * The master's reply. 420 chars ≈ 11 wrapped lines at Caption/17.4cm, which
   * still clears the 24cm plate once the header, rule and question are paid for
   * — a 2-4 sentence answer lands well inside it.
   */
  showAnswer(answer: string): void {
    this.showPanel("master")
    this.setRowText(this.masterAnswerRow, this.clip(answer, 420))
    if (this.masterHintText) this.masterHintText.text = S().masterAskAgain
    this.refreshMaster()
  }

  /** Failure path — the panel says what went wrong instead of staying on "…". */
  showAskError(message: string): void {
    this.showPanel("master")
    this.setRowText(this.masterAnswerRow, message)
    if (this.masterHintText) this.masterHintText.text = S().masterTryAgain
    this.refreshMaster()
  }

  private refreshMaster(): void {
    if (this.masterFlex && !isNull(this.masterFlex)) this.masterFlex.markDirty()
  }

  // Checklist row: toggle button + checkbox icon + wrapped step text
  private addPlanRow(pcol: SceneObject, index: number, W: number): void {
    // Insets trimmed from 2.4 to 1.2 (the parent column already pads 0.6 a side,
    // so the old value double-counted it) — 1.2cm straight back to the wrap width.
    this.flexChild(pcol, {w: W - 1.2, h: 3.6}, (rowObj) => {
      const btn = this.themed(rowObj.createComponent(Button.getTypeName()) as Button)
      btn.size = new vec3(W - 1.2, 3.4, 1)   // BEFORE init
      this.planRowItems[index] = rowObj.getComponent(FlexItem.getTypeName()) as FlexItem
      this.planButtons[index] = btn
      const row = this.flexRow(rowObj, W - 1.2, 3.6, {
        gap: 0.5, justify: FlexJustify.Start, align: FlexAlign.Center, padX: 0.3,
      })
      this.liftInZ(row, 0.08)   // row content sits ON the button face
      this.flexChild(row, {w: 1.8, h: 1.8}, (cell) => {
        this.planIconMats[index] = this.addIconGetMat(cell, ICON_CB_OFF, 1.8)
      })
      this.flexChild(row, {w: W - 4.4, h: 3.4}, (cell) => {
        const tcol = this.flexColumn(cell, W - 4.4, -1, {
          justify: FlexJustify.Center, align: FlexAlign.Stretch,
        })
        const rec = this.addDynamicRow(tcol, "Caption", W - 4.8, WHITE)
        this.planRows[index] = rec
        this.planTexts[index] = rec.t
      })
      btn.onTriggerUp.add(() => {
        this.planDone[index] = !this.planDone[index]
        this.planIconMats[index].mainPass.baseTex = this.planDone[index] ? ICON_CB_ON : ICON_CB_OFF
        this._onPlanToggle.invoke({index: index, done: this.planDone[index]})
      })
      this.addHoverFeedback(btn, this.planTexts[index], this.planIconMats[index])
    })
  }

  // ═══ Composition helpers (verbatim from /specs-build-ui references) ════════

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const sceneObject = global.scene.createSceneObject(name)
    sceneObject.setParent(parent)
    if (position) sceneObject.getTransform().setLocalPosition(position)
    return sceneObject
  }

  private liftInZ(sceneObject: SceneObject, zOffset: number): void {
    const transform = sceneObject.getTransform()
    const pos = transform.getLocalPosition()
    transform.setLocalPosition(new vec3(pos.x, pos.y, pos.z + zOffset))
  }

  private flexColumn(parent: SceneObject, width: number, height: number,
      opts?: {gap?: number, padY?: number, padX?: number, justify?: FlexJustify, align?: FlexAlign}): SceneObject {
    return this.makeFlex(parent, FlexDirection.Column, width, height, opts)
  }

  private flexRow(parent: SceneObject, width: number, height: number,
      opts?: {gap?: number, padY?: number, padX?: number, justify?: FlexJustify, align?: FlexAlign}): SceneObject {
    return this.makeFlex(parent, FlexDirection.Row, width, height, opts)
  }

  private makeFlex(parent: SceneObject, direction: FlexDirection, width: number, height: number,
      opts?: {gap?: number, padY?: number, padX?: number, justify?: FlexJustify, align?: FlexAlign}): SceneObject {
    const container = this.obj(parent, "Flex")
    this.liftInZ(container, LAYOUT_Z_LIFT)
    const flexLayout = container.createComponent(FlexLayout.getTypeName()) as FlexLayout
    // We register children explicitly via addItems() in flexChild — which runs in
    // onAwake, before the layout initializes. UIKit 2.0 throws on pre-init addItems
    // unless auto-discovery is off (FlexLayout.ts:641).
    flexLayout.autoDiscoverItemsOnStart = false
    const flexItem = container.createComponent(FlexItem.getTypeName()) as FlexItem
    if (width > 0) flexItem.overrideWidth = width
    if (height > 0) flexItem.overrideHeight = height

    flexLayout.onInitialized.add(() => {
      flexLayout.width = width
      flexLayout.height = height
      flexLayout.direction = direction
      if (direction === FlexDirection.Row) {
        flexLayout.columnGap = opts?.gap ?? 0
      } else {
        flexLayout.rowGap = opts?.gap ?? 0
      }
      flexLayout.paddingTop = opts?.padY ?? 0
      flexLayout.paddingBottom = opts?.padY ?? 0
      flexLayout.paddingLeft = opts?.padX ?? 0
      flexLayout.paddingRight = opts?.padX ?? 0
      flexLayout.justifyContent = opts?.justify ?? FlexJustify.Start
      flexLayout.alignItems = opts?.align ?? FlexAlign.Stretch
    })
    return container
  }

  private flexChild(parent: SceneObject, size: {w?: number, h?: number, grow?: number},
      builder: (childObject: SceneObject) => void): SceneObject {
    const child = this.obj(parent, "Item")
    this.liftInZ(child, LAYOUT_Z_LIFT)
    const flexItem = child.createComponent(FlexItem.getTypeName()) as FlexItem
    if (size.w !== undefined && size.w > 0) flexItem.overrideWidth = size.w
    if (size.h !== undefined && size.h > 0) flexItem.overrideHeight = size.h
    flexItem.flexGrow = size.grow ?? 0
    flexItem.flexShrink = 0

    builder(child)

    const parentFlexLayout = parent.getComponent(FlexLayout.getTypeName()) as FlexLayout | null
    if (parentFlexLayout) parentFlexLayout.addItems([flexItem])
    return child
  }

  // Centered dynamic text in a column — placeholder rect + alignSelf Stretch
  private addCenteredText(parent: SceneObject, text: string, role: TextRole, h: number, color: vec4): Text {
    let result!: Text
    this.flexChild(parent, {h: h}, (so) => {
      const t = so.createComponent("Component.Text") as Text
      t.text = text
      t.depthTest = true
      applyTextRole(t, role)
      t.textFill.color = color
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center
      t.horizontalOverflow = HorizontalOverflow.Overflow
      t.verticalOverflow = VerticalOverflow.Overflow
      t.layoutRect = Rect.create(-0.5, 0.5, -0.5, 0.5)
      const item = so.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Stretch
      result = t
    })
    return result
  }

  // ── Dynamic text rows ──────────────────────────────────────────────────────
  // A wrapped row that RESIZES to its content: setRowText recomputes the line
  // count, grows the FlexItem + layoutRect, and re-lays out the column. With the
  // ScrollWindow wrapping the column, long text scrolls instead of colliding.

  /** Approx wrapped height (cm) for `text` at `widthCM` in `role`. */
  private wrappedHeight(text: string, role: TextRole, widthCM: number): number {
    const em = roleSize(role) / 43.886          // em-square height in cm
    const charW = em * 0.5                      // avg glyph advance
    const lineH = em * 1.22
    const perLine = Math.max(6, Math.floor(widthCM / charW))
    // Measure each explicit line separately. A pure character count treats
    // "a\nb" as one short line, so an appended bullet (see appendMasterNote)
    // would under-measure and let the row overlap whatever sits below it.
    const segments = (text || "").split("\n")
    let lines = 0
    for (let i = 0; i < segments.length; i++) {
      lines += Math.max(1, Math.ceil(segments[i].length / perLine))
    }
    return Math.max(lineH, Math.max(1, lines) * lineH) + 0.25
  }

  /** Set a dynamic row's text and resize it to fit (then relayout + rescroll). */
  private setRowText(rec: TextRow, text: string): void {
    rec.t.text = text
    const h = this.wrappedHeight(text, rec.role, rec.w)
    rec.item.overrideHeight = h
    rec.t.layoutRect = Rect.create(-rec.w / 2, rec.w / 2, -h / 2, h / 2)
  }

  /** Re-run a tab column's layout after its rows resized. */
  private refreshTab(mode: string): void {
    const flex = this.tabFlex[mode]
    if (flex && !isNull(flex)) flex.markDirty()
  }

  // Multi-line wrapping text row (problem details) — hard width budget: the
  // authored layoutRect IS the wrap width, so lines can never exceed the panel.
  private addWrappedText(parent: SceneObject, text: string, role: TextRole,
      widthCM: number, h: number, color: vec4): Text {
    let result!: Text
    this.flexChild(parent, {h: h}, (so) => {
      const t = so.createComponent("Component.Text") as Text
      t.text = text
      t.depthTest = true
      applyTextRole(t, role)
      t.textFill.color = color
      t.horizontalAlignment = HorizontalAlignment.Center
      t.verticalAlignment = VerticalAlignment.Center   // wrap grows symmetrically, never up into row above
      t.horizontalOverflow = HorizontalOverflow.Wrap
      t.verticalOverflow = VerticalOverflow.Overflow
      t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -h / 2, h / 2)
      const item = so.getComponent(FlexItem.getTypeName()) as FlexItem
      item.alignSelf = FlexAlignSelf.Center   // allocation = authored width, not stretched
      result = t
    })
    return result
  }

  // Row-direction text with a real width rect (for cells with siblings)
  private addRowText(parent: SceneObject, text: string, role: TextRole, widthCM: number,
                     pinBuiltin: boolean = false): Text {
    const t = parent.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role, 110, pinBuiltin)
    t.textFill.color = SOFT
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -1.2, 1.2)
    return t
  }

  // Icon Image (non-interactive)
  private addIcon(parent: SceneObject, icon: Texture, sizeCM: number): void {
    this.addIconGetMat(parent, icon, sizeCM)
  }

  private addIconGetMat(parent: SceneObject, icon: Texture, sizeCM: number): Material {
    const img = parent.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = icon
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    parent.getTransform().setLocalScale(new vec3(sizeCM, sizeCM, 1))
    return mat
  }

  // Labeled button with leading icon — icon cell + raw-text label cell on the button
  // face (R2 width-budgeted; no ElementContent so nothing can auto-collapse).
  // Returns the label Text + icon Material so callers can retheme (e.g. Exit 3D swap).
  private addIconTextButton(parent: SceneObject, icon: Texture, text: string,
      w: number, h: number, onClick: () => void): {label: Text; iconMat: Material} {
    const btn = this.themed(parent.createComponent(Button.getTypeName()) as Button)
    btn.size = new vec3(w, h, 1)   // BEFORE init
    const face = this.obj(parent, "BtnFace", new vec3(0, 0, 0.08))
    const labelW = w - 1.8 - 1.6   // button width − icon cell − gaps/padding
    const row = this.flexRow(face, w - 0.6, h - 0.4, {
      gap: 0.5, justify: FlexJustify.Center, align: FlexAlign.Center,
    })
    let iconMat!: Material
    this.flexChild(row, {w: 1.6, h: 1.6}, (cell) => {
      iconMat = this.addIconGetMat(cell, icon, 1.6)
    })
    let label!: Text
    this.flexChild(row, {w: labelW, h: h - 0.6}, (cell) => {
      label = this.addRowText(cell, text, "Button", labelW)
      label.textFill.color = WHITE
    })
    btn.onTriggerUp.add(onClick)
    this.addHoverFeedback(btn, label, iconMat)
    return {label: label, iconMat: iconMat}
  }

  // Hover feedback: jade tint on label/icon + hover event (main plays the tick).
  private addHoverFeedback(btn: Button, label: Text | null, iconMat: Material | null): void {
    btn.onHoverEnter.add(() => {
      if (label) label.textFill.color = JADE
      if (iconMat) iconMat.mainPass.baseColor = JADE
      this._onHover.invoke()
    })
    btn.onHoverExit.add(() => {
      if (label) label.textFill.color = WHITE
      if (iconMat) iconMat.mainPass.baseColor = WHITE
    })
  }

  // Icon-only button
  private addIconButton(parent: SceneObject, icon: Texture, sizeCM: number, onClick: () => void): void {
    this.addIconButtonGetMat(parent, icon, sizeCM, onClick)
  }

  private addIconButtonGetMat(parent: SceneObject, icon: Texture, sizeCM: number, onClick: () => void): Material {
    const btn = this.themed(parent.createComponent(Button.getTypeName()) as Button)
    btn.size = new vec3(sizeCM, sizeCM, 1)   // BEFORE init
    const iconObj = this.obj(parent, "BtnIcon", new vec3(0, 0, 0.08))
    const mat = this.addIconGetMat(iconObj, icon, sizeCM * 0.62)
    btn.onTriggerUp.add(onClick)
    this.addHoverFeedback(btn, null, mat)
    return mat
  }

  /**
   * Square button carrying a short text label instead of an icon — used for the
   * language toggle, where the affordance IS the glyph ("中" / "EN"). No icon in
   * the Material Icons set says "switch to Mandarin" as plainly as the character
   * itself does.
   */
  private addTextButtonGetLabel(parent: SceneObject, text: string, sizeCM: number,
                                onClick: () => void): Text {
    const btn = this.themed(parent.createComponent(Button.getTypeName()) as Button)
    btn.size = new vec3(sizeCM, sizeCM, 1)   // BEFORE init
    const labelObj = this.obj(parent, "BtnLabel", new vec3(0, 0, 0.08))
    // pinBuiltin: this label is "中" while the UI is in English — Barlow has no
    // CJK, so it must always keep the built-in font (see applyFont).
    const label = this.addRowText(labelObj, text, "Button", sizeCM, true)
    label.textFill.color = WHITE
    btn.onTriggerUp.add(onClick)
    this.addHoverFeedback(btn, label, null)
    return label
  }
}
