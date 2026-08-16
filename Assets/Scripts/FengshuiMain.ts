// FengshuiMain.ts — entry point for the Fengshui Lens.
// Flow: Assess (capture -> gemini-2.5-flash analysis -> score + problems + markers + voice) ->
//       Improve (gemini-3.1-flash-image edit -> QA verify -> tightened retry -> crossfade
//       compare + target score + Chi Plan checklist) -> View in 3D (spatial image).
// All UI lives in FengshuiUI (UIKit); this script only pushes data and subscribes to events.

import {FengshuiUI, MarkerInfo} from "./FengshuiUI"
import {FengshuiGemini, FengshuiAnalysis, QAResult, FengshuiView} from "./FengshuiGemini"
import {FengshuiCameraService} from "./FengshuiCamera"
import {FengshuiVoice} from "./FengshuiVoice"
import {FengshuiHistory} from "./FengshuiHistory"
import {FengshuiParticles} from "./FengshuiParticles"
import {FengshuiCompass} from "./FengshuiCompass"
import {FengshuiIkea} from "./FengshuiIkea"
import {CommerceKit} from "CommerceKit.lspkg/CommerceKit"
import {DepthCache} from "./DepthCache"
import {S, getLang, setLang, localeTag, directionName, describeRemoteAuthError} from "./FengshuiStrings"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {RemoteServiceGatewayCredentials, AvaliableApiTypes} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"

// RSG tokens are NOT hardcoded here any more. They live as @input fields on the
// RSGCredentials SceneObject (RemoteServiceGatewayCredentials component), so they
// persist in the .scene file and can be refreshed without touching code.
// They expire roughly hourly — regenerate before every demo, see REBUILD.md
// ("Refresh RSG tokens"). Its onAwake populates the static store everything reads.

const BGM_TRACK = requireAsset("../GeneratedSFX/AmbientZen.wav") as AudioTrackAsset
const SFX_CLICK = requireAsset("../GeneratedSFX/ButtonClick.wav") as AudioTrackAsset
const SFX_SHUTTER = requireAsset("../GeneratedSFX/CameraShutter.wav") as AudioTrackAsset
const SFX_CHIME = requireAsset("../GeneratedSFX/RevealChime.wav") as AudioTrackAsset
const SFX_WHOOSH = requireAsset("../GeneratedSFX/ImproveWhoosh.wav") as AudioTrackAsset
const SFX_HOVER = requireAsset("../GeneratedSFX/HoverTick.wav") as AudioTrackAsset

const BGM_VOLUME = 0.22 // quiet ambient bed, well under the SFX

// Intro copy now lives in the string table (S().intro) — it used to be here AND
// hardcoded in FengshuiUI.buildControlPanel, which is exactly the drift a table exists to stop.

// Dev escape hatch for testing the ask round-trip without a microphone: with a
// non-empty string here, releasing the mic having heard nothing submits THIS
// question instead of reporting "Nothing heard", and the ask no longer requires
// a captured room photo. MUST ship as "" — otherwise an accidental mic press
// fires a Gemini request.
const DEV_CANNED_QUESTION = ""

// ── Pan scan ("Scan Whole Room") ─────────────────────────────────────────────
// Six frames ≈ 55° apart covers ~330° of turn — a full sweep of the room without
// asking the user to nail a complete revolution.
// FOUR frames, ~85° apart — roughly the four walls, ~255° of turn.
//
// Not six. RSG enforces a ~30s request deadline and the payload is dominated by
// the images: six frames measured 26s (pass) once and then `Code:4 Deadline
// Exceeded` twice, while four frames has never missed. Four also reads better as
// a gallery, and a wider step covers the same room with less redundancy.
const SCAN_FRAMES = 4
const SCAN_STEP_DEG = 85
const SCAN_TARGET_SWEEP_DEG = SCAN_STEP_DEG * (SCAN_FRAMES - 1) // ~255° of turn
// Rotation comes from HEAD YAW (the camera transform), not the compass: it is
// real rotation, needs no location permission, and exists in the editor preview.
// The compass is kept only for naming each frame's bagua direction.
// Timer fallback applies ONLY when head tracking is entirely unavailable, and
// the user is told when that happens — silently shooting six frames of one wall
// and calling it a whole-room reading is exactly the bug to avoid.
const SCAN_UNTRACKED_STEP_S = 1.6
const SCAN_TIMEOUT_S = 60
const SCAN_POLL_S = 0.2

// How many past Q&As the archive keeps. Ten is far more than a demo needs and
// costs nothing but a few strings.
const ASK_HISTORY_MAX = 10

// ── Spatial ("View in 3D") window ────────────────────────────────────────────
// frameOn draws the rounded-corner portal, which masks the image and trims its
// edges — that is the "cuts the image off a bit". Off shows the full photo.
// Flip back to true if the portal look is wanted more than the full frame.
const SPATIAL_FRAME_ON = false
// "Depth of feel" — how far the depth mesh displaces. The package default is
// 100; the flat look was partly this being left at the authored value and
// partly the staleness bug described in handleSpatialize. Single tuning knob:
// raise for more parallax, lower if the room starts to look stretched/torn.
const SPATIAL_DEPTH_SCALE = 175
// Deliberately NOT overriding frameHeight. Raising it to 150 was tried and
// blew the image past the edges of the view — the window size authored on the
// SpatialAfter object is already right, and the reported clipping was the
// portal mask above, not the scale.
// No capture for this long while frames are still owed = the user has stopped
// turning, so nudge them rather than sitting there looking broken.
const SCAN_STALL_S = 4.0

// Marker projection constants (approximate frustum at capture depth)
const MARKER_DEPTH_CM = 180
const MARKER_SPAN_W = 200
const MARKER_SPAN_H = 150

@component
export class FengshuiMain extends BaseScriptComponent {
  // Wired by the bootstrap to the FengshuiUI panel's ScriptComponent.
  @input
  uiHud!: FengshuiUI

  // Spatial Image custom component + its host object (wired by bootstrap; optional)
  @input
  @allowUndefined
  spatialImage: ScriptComponent

  @input
  @allowUndefined
  spatialImageObject: SceneObject

  // Depth+color snapshot cache — surface-accurate marker placement (device only)
  @input
  @allowUndefined
  depthCache: DepthCache

  // Typed require — NOT `as any`. Casting hides the one bug that silently kills
  // this feature: AsrTranscriptionOptions.create() must come off the GLOBAL
  // AsrModule namespace, not off this instance (instance access returns
  // undefined and the mic just never opens).
  private asrModule: AsrModule = require("LensStudio:AsrModule")
  private internetModule: InternetModule = require("LensStudio:InternetModule")
  private remoteMediaModule: RemoteMediaModule = require("LensStudio:RemoteMediaModule")
  private gemini!: FengshuiGemini
  private camera!: FengshuiCameraService
  private voice!: FengshuiVoice
  private history!: FengshuiHistory

  private bgmAudio!: AudioComponent
  private clickAudio!: AudioComponent
  private shutterAudio!: AudioComponent
  private chimeAudio!: AudioComponent
  private whooshAudio!: AudioComponent
  private hoverAudio!: AudioComponent
  private particles!: FengshuiParticles

  private busy = false
  private analysis: FengshuiAnalysis | null = null
  private beforeB64: string | null = null
  private afterTexture: Texture | null = null
  private spatialVisible = false
  private capturePose: {pos: vec3; rot: quat} | null = null
  private compass = new FengshuiCompass()
  private depthFrameId: number | null = null
  private shopProductIds: (string | null)[] = [null, null, null]
  private thumbCache: Map<string, Texture> = new Map<string, Texture>()
  private thumbLoading = false

  // Ask-the-master state
  private asrOptions: AsrModule.AsrTranscriptionOptions | null = null
  private micHeld = false      // button is physically down
  private askGrace = false     // released, still collecting a trailing final
  private askFinal = ""        // concatenated finalized utterances
  private askPartial = ""      // the interim tail currently being spoken
  private askTranscript = ""   // askFinal + askPartial, what actually gets sent

  // Pan-scan gallery. Index 0 is the whole-room verdict; 1..N are the captured
  // views, so the user can page through exactly what the scan saw.
  private scanTextures: Texture[] = []
  private scanViews: FengshuiView[] = []
  private scanOverall = ""
  private scanIndex = 0

  // Ask archive. Every answered question is kept so the user can page back
  // through them; askIndex is -1 whenever the panel is showing something that
  // is NOT an archived ask (a scan view note), so the first arrow press jumps
  // to the newest ask rather than stepping from a stale position.
  private askHistory: {q: string; a: string}[] = []
  private askIndex = -1

  // Camera transform — used to face the UI cluster at the user while it's dragged
  private camTransform: Transform | null = null

  // World-query hit-test session for marker placement (device; plane fallback in editor)
  private hitSession: HitTestSession | null = null

  onAwake(): void {
    // Own the CommerceKit catalog with the IKEA partner products (this object is
    // high in the hierarchy, so this runs before any scene ProductCatalog and
    // wins the one-shot initializeCatalog). Editor = mock flow; device = real
    // Snap purchase sheet (Closed Beta — draft-environment testing).
    try {
      CommerceKit.getInstance().initializeCatalog(FengshuiIkea.catalogForCommerce())
    } catch (e) {
      print("[Fengshui] CommerceKit init failed (shop taps fall back to search hint): " + e)
    }


    this.gemini = new FengshuiGemini(this.internetModule)
    this.camera = new FengshuiCameraService()
    this.voice = new FengshuiVoice(this.internetModule, this.sceneObject)
    this.history = new FengshuiHistory()

    // Background bed starts as the Lens loads (loops forever, well under SFX level)
    this.startMusic()

    this.clickAudio = this.makeSfx("SfxClick", SFX_CLICK)
    this.shutterAudio = this.makeSfx("SfxShutter", SFX_SHUTTER)
    this.chimeAudio = this.makeSfx("SfxChime", SFX_CHIME)
    this.whooshAudio = this.makeSfx("SfxWhoosh", SFX_WHOOSH)
    this.hoverAudio = this.makeSfx("SfxHover", SFX_HOVER)
    this.hoverAudio.volume = 0.5

    // Ambient chi particles — hands push them away
    this.particles = new FengshuiParticles(this)

    this.createEvent("OnStartEvent").bind(() => {
      this.checkRsgCredentials()
      // Subscribe here, not in onAwake — awake order between FengshuiMain and
      // FengshuiUI is not guaranteed ("Component is not yet awake" otherwise).
      this.uiHud.onAssess.add(() => this.handleAssess())
      this.uiHud.onReset.add(() => this.handleReset())
      this.uiHud.onSpatialize.add(() => this.handleSpatialize())
      this.uiHud.onMuteToggle.add((m: boolean) => this.handleMute(m))
      this.uiHud.onLangToggle.add(() => this.handleLangToggle())
      this.uiHud.onPlanToggle.add((e: {index: number; done: boolean}) => this.handlePlanToggle(e))
      this.uiHud.onShopTap.add((i: number) => this.handleShopTap(i))
      this.uiHud.onHover.add(() => this.playSfx(this.hoverAudio))
      this.uiHud.onAskStart.add(() => this.handleAskStart())
      this.uiHud.onAskEnd.add(() => this.handleAskEnd())
      this.uiHud.onScan.add(() => this.handleScan())
      this.uiHud.onScanStep.add((d: number) => this.handleScanStep(d))
      this.uiHud.onAskNav.add((d: number) => this.handleAskNav(d))
      // Camera lifecycle: request only after start, never in onAwake
      this.camera.start()
      // Compass heading for bagua-aware advice (no-op in editor / no permission)
      this.compass.start()
      // Playback-mode property writes belong in OnStartEvent (specs-audio):
      // input-reactive cues get LowLatency; the bed stays on the LowPower default.
      this.clickAudio.playbackMode = Audio.PlaybackMode.LowLatency
      this.shutterAudio.playbackMode = Audio.PlaybackMode.LowLatency
      this.chimeAudio.playbackMode = Audio.PlaybackMode.LowLatency
      this.whooshAudio.playbackMode = Audio.PlaybackMode.LowLatency
      this.hoverAudio.playbackMode = Audio.PlaybackMode.LowLatency
      if (this.spatialImageObject && !isNull(this.spatialImageObject)) {
        this.spatialImageObject.enabled = false
      }
      // Spatialization is a REMOTE, async depth-generation request — the mesh
      // lands seconds after setImage returns, and on failure the package only
      // fires onLoaded(status !== 1) and leaves the view empty. Without this the
      // Lens claimed "step into your better room" instantly and never learned
      // whether depth actually arrived, so a slow or failed request just looked
      // like a flat photo. Subscribed ONCE here (never per-spatialize, which
      // would stack duplicate listeners).
      if (this.spatialImage && !isNull(this.spatialImage)) {
        try {
          const si = this.spatialImage as any
          si.onLoadingStart.add(() => {
            if (this.spatialVisible) this.uiHud.setStatus(S().stageBuildingDepth)
          })
          si.onLoaded.add((status: number) => {
            if (!this.spatialVisible) return
            if (status === 1) {
              this.uiHud.setStatus(S().stepIntoRoom)
            } else {
              print("[Fengshui] spatialize failed, status=" + status)
              this.exitSpatial()
              this.uiHud.setStatus(S().spatialFailed)
            }
          })
        } catch (e) {
          print("[Fengshui] spatial load events unavailable: " + e)
        }
      }
      const hist = this.history.summaryLine()
      if (hist) this.uiHud.setGaugeMeta(hist)
      if (!global.deviceInfoSystem.isInternetAvailable()) {
        this.uiHud.setStatus(S().noInternet)
      }
      // World-query session for surface-snapped markers (fails soft in editor)
      try {
        const wqm: WorldQueryModule = require("LensStudio:WorldQueryModule")
        this.hitSession = wqm.createHitTestSession()
        this.hitSession.start()
      } catch (e) {
        print("[Fengshui] WorldQuery unavailable (markers use plane fallback): " + e)
      }
      try {
        this.camTransform = WorldCameraFinderProvider.getInstance().getTransform()
      } catch (e) {
        print("[Fengshui] camera transform unavailable (drag-facing disabled): " + e)
      }
      // ASR options + their event subscriptions are built ONCE, here in
      // OnStartEvent (never onAwake), and reused for every hold.
      this.setupAsr()
    })

    // While the user pinch-drags the cluster (grab handle), keep it yawed toward
    // them so it lands readable wherever they put it. No auto-follow otherwise.
    const dragFace = this.createEvent("UpdateEvent")
    dragFace.bind(() => this.updateDragFacing())
  }

  // ═══ Pan scan — "Scan Whole Room" ══════════════════════════════════════════
  //
  // Deliberately a SEPARATE flow from handleAssess: the user spins on the spot,
  // we grab a frame every ~55° of heading change (or on a timer where there is
  // no compass), then send ALL frames in ONE Gemini call for a whole-room
  // reading. Captures are local (camera + Base64), so the loop never issues a
  // concurrent remote request — there is exactly one, at the end.
  //
  // Does NOT chain into improve: the image edit path takes a single photo, and
  // rewriting it for N frames would mean touching the proven assess pipeline.
  private async handleScan(): Promise<void> {
    if (this.busy) {
      this.uiHud.setStatus(S().alreadyWorking)
      return
    }
    if (this.spatialVisible) {
      this.uiHud.setStatus(S().exit3dFirst)
      return
    }
    this.busy = true
    try {
      this.playSfx(this.clickAudio)
      this.clearResults() // same rule for the pan scan
      this.uiHud.startLoading()
      this.uiHud.setScanActive(true, S().scanProgressBtn(0, SCAN_FRAMES))
      this.uiHud.setStatus(S().standStillTurn)

      const frames: string[] = []
      const textures: Texture[] = []
      const poses: ({pos: vec3; rot: quat} | null)[] = []
      const headings: (string | null)[] = []
      const t0 = getTime()
      const tracked = this.camYawDeg() !== null
      if (!tracked) {
        // Be honest rather than pretending we watched them turn.
        print("[Fengshui] pan scan: NO head tracking — falling back to a timer")
        this.uiHud.setStatus(S().noRotationTracking)
      }
      let lastYaw = this.camYawDeg()
      let sinceCapture = SCAN_STEP_DEG   // pre-armed so frame 1 is grabbed on press
      let sweep = 0                      // total degrees turned, for the readout
      let lastCaptureT = getTime() - SCAN_UNTRACKED_STEP_S
      let stallNudged = false

      while (frames.length < SCAN_FRAMES && getTime() - t0 < SCAN_TIMEOUT_S) {
        const yaw = this.camYawDeg()
        let due: boolean
        if (yaw !== null) {
          if (lastYaw !== null) {
            const d = Math.abs(this.angleDelta(yaw, lastYaw))
            sinceCapture += d
            sweep += d
          }
          lastYaw = yaw
          due = sinceCapture >= SCAN_STEP_DEG
        } else {
          due = getTime() - lastCaptureT >= SCAN_UNTRACKED_STEP_S
        }

        if (due) {
          const n = frames.length + 1
          this.uiHud.setStage(S().stageCapturingFrame(n, SCAN_FRAMES),
            0.05 + 0.5 * (frames.length / SCAN_FRAMES))
          this.playSfx(this.shutterAudio)
          // Pose is read at the moment we decide to capture rather than after the
          // encode resolves — closest available proxy for the frame's own pose.
          poses.push(this.readCameraPose())
          const h = this.compass.headingDeg()
          headings.push(h !== null ? FengshuiCompass.nameFor(h) : null)
          const shot = await this.camera.captureJpegBase64()
          frames.push(shot)
          // Decode as we go so paging the gallery afterwards is instant.
          try {
            textures.push(await this.decodeTexture(shot))
          } catch (e) {
            print("[Fengshui] frame " + n + " decode failed: " + e)
          }
          sinceCapture = 0
          lastCaptureT = getTime()
          stallNudged = false
          this.uiHud.setScanActive(true, S().scanProgressBtn(frames.length, SCAN_FRAMES))
          if (textures.length === 1) this.uiHud.showBefore(textures[0])
        } else if (tracked) {
          // Live rotation readout — the user can see the scan reacting to them.
          const pct = Math.min(100, Math.round((sweep / SCAN_TARGET_SWEEP_DEG) * 100))
          if (getTime() - lastCaptureT > SCAN_STALL_S) {
            if (!stallNudged) {
              stallNudged = true
              print("[Fengshui] pan scan: stalled at " + Math.round(sweep) + "°")
            }
            this.uiHud.setStatus(S().keepTurningPct(pct))
          } else {
            this.uiHud.setStatus(S().turningDeg(Math.round(sweep), SCAN_TARGET_SWEEP_DEG))
          }
        }
        await this.delay(SCAN_POLL_S)
      }

      this.uiHud.setScanActive(false)
      if (frames.length < 2) {
        this.uiHud.endLoading(false)
        this.uiHud.setStatus(tracked ? S().didntTurn : S().needMoreRoom)
        return
      }
      const partial = frames.length < SCAN_FRAMES
      print("[Fengshui] pan scan: " + frames.length + " frames, sweep=" +
        Math.round(sweep) + "° tracked=" + tracked + " headings=" +
        headings.map((x) => x ?? "?").join("/"))

      this.uiHud.setStage(S().stageReadingWholeRoom, 0.7)
      let analysis: FengshuiAnalysis
      try {
        analysis = await this.gemini.analyzeRoomPan(frames, headings)
      } catch (e) {
        // Almost always RSG's ~30s deadline on a heavy multi-image payload.
        // Drop to every other frame (still spanning the full turn) and try once
        // more rather than losing the whole scan.
        print("[Fengshui] pan analyze failed, retrying with fewer frames: " + e)
        this.uiHud.setStage(S().stageTrimming, 0.75)
        const lean = frames.filter((_, i) => i % 2 === 0)
        const leanHeadings = headings.filter((_, i) => i % 2 === 0)
        analysis = await this.gemini.analyzeRoomPan(lean, leanHeadings)
      }
      this.analysis = analysis
      // Frame 1 becomes the room photo the master reasons about when asked.
      this.beforeB64 = frames[0]
      this.capturePose = poses[0]

      const score = Math.max(0, Math.min(100, Math.round(analysis.score)))
      const prevBest = this.history.best()
      this.history.record(score)
      print("[Fengshui] pan score=" + score + " problems=" + analysis.problems.length)

      this.uiHud.showScore(score, this.verdictFor(score))
      this.uiHud.setGaugeMeta(
        prevBest !== null
          ? S().wholeRoomBest(Math.max(prevBest, score))
          : S().wholeRoomReading
      )
      this.uiHud.showProblems(analysis.problems)
      this.uiHud.setElements(analysis.elements ?? null)
      this.uiHud.setFacing(this.compass.facing())

      this.shopProductIds = [null, null, null]
      const thumbJobs: {index: number; url: string}[] = []
      this.uiHud.setShop((analysis.shopping ?? []).map((s, i) => {
        const p = FengshuiIkea.match(s.item + " " + s.reason + " " + s.search)
        if (p && i < 3) {
          this.shopProductIds[i] = p.id
          thumbJobs.push({index: i, url: FengshuiIkea.thumbUrl(p)})
        }
        return p
          ? {item: "IKEA " + p.name + " · $" + p.usd, reason: p.desc + " — " + s.reason, search: "IKEA " + p.name}
          : s
      }))
      this.loadShopThumbs(thumbJobs)

      this.showScanMarkers(analysis, poses)
      this.uiHud.showPlan(this.gemini.planSteps(analysis))

      // Gallery: page through the captured views and the master's remark on
      // each. Index 0 is the whole-room verdict.
      //
      // The commentary is a SECOND, sequential request (never concurrent — that
      // crashes the native layer) and is explicitly non-fatal: RSG's ~30s
      // deadline means it can time out, and when it does the user still keeps
      // the score, the blockers, the plan and a browsable gallery. They just
      // lose the per-view prose.
      this.scanTextures = textures
      this.scanIndex = 0
      this.scanViews = []
      this.scanOverall = this.verdictFor(score)
      this.uiHud.setCompareMode(true)
      this.showScanView(0)
      this.uiHud.setStage(S().stageAskingEachView, 0.85)
      try {
        const commentary = await this.gemini.describeViews(frames, analysis)
        if (commentary.overall) this.scanOverall = commentary.overall
        this.scanViews = commentary.views
        print("[Fengshui] gallery: " + textures.length + " views, notes=" + this.scanViews.length)
      } catch (e) {
        print("[Fengshui] per-view commentary failed (non-fatal): " + e)
      }
      this.showScanView(0)

      this.uiHud.endLoading(true)
      this.playSfx(this.chimeAudio)

      const titles = analysis.problems.slice(0, 3).map((p) => p.title).join("; ")
      this.voice.speak(
        S().spokenScanSummary(score, this.verdictFor(score), titles)
      )
      this.uiHud.setStatus(partial
        ? S().readNOfM(frames.length, SCAN_FRAMES)
        : S().wholeRoomRead)
    } catch (e) {
      this.reportRemoteFailure("pan scan failed", e)
      this.uiHud.setScanActive(false)
      this.uiHud.endLoading(false)
      this.uiHud.setStatus(S().scanFailed)
    } finally {
      this.busy = false
    }
  }

  // ═══ Scan gallery ══════════════════════════════════════════════════════════

  /** ◀ / ▶ on the hero panel. Wraps around 0..N (0 = whole-room verdict). */
  private handleScanStep(delta: number): void {
    const count = this.scanTextures.length
    if (count === 0) {
      this.uiHud.setStatus(S().scanFirst)
      return
    }
    this.playSfx(this.clickAudio)
    const span = count + 1 // +1 for the overall entry at index 0
    this.scanIndex = ((this.scanIndex + delta) % span + span) % span
    this.showScanView(this.scanIndex)
  }

  /**
   * Render gallery entry `i`: swap the hero image, caption the navigator, and
   * put the master's words for that view on the right-hand panel. This is what
   * keeps the Master panel alive without anyone touching the mic.
   */
  private showScanView(i: number): void {
    const count = this.scanTextures.length
    if (count === 0) return
    // The panel is no longer showing an archived ask; the next arrow press on
    // the archive nav should jump to the newest one.
    this.askIndex = -1
    this.showArchiveAffordance()
    if (i === 0) {
      this.uiHud.showFrame(this.scanTextures[0])
      this.uiHud.setScanNavLabel(S().scanNavWhole(count))
      this.uiHud.showMasterSays(S().theWholeRoom, this.scanOverall,
        S().masterHintBrowse)
      this.showArchiveAffordance()
      return
    }
    const fi = i - 1
    this.uiHud.showFrame(this.scanTextures[Math.min(fi, count - 1)])
    // Prefer the model's note for this frame; fall back to a plain caption so a
    // missing/short `views` array can never leave the panel blank.
    const view = this.scanViews.find((v) => Math.round(v.frame) === i) ?? this.scanViews[fi]
    const title = view && view.title ? view.title : S().viewNumber(i)
    this.uiHud.setScanNavLabel(S().scanNavView(i, count, title))
    this.uiHud.showMasterSays(
      title,
      view && view.note ? view.note : S().noNoteForView,
      S().viewOfCount(i, count)
    )
    this.showArchiveAffordance()
  }

  /**
   * While the panel is showing scan commentary, keep the archive one press
   * away rather than hiding it — otherwise past asks are unreachable until you
   * ask a new question.
   */
  private showArchiveAffordance(): void {
    const n = this.askHistory.length
    this.uiHud.setAskNav(n > 0, n === 1 ? "1 past ask" : n + " past asks")
  }

  /** Shortest signed difference between two headings, in degrees. */
  private angleDelta(a: number, b: number): number {
    return ((a - b + 540) % 360) - 180
  }

  /**
   * Head yaw in degrees from the tracked camera transform — this is what tells
   * us the user is actually spinning.
   *
   * Chosen over the compass deliberately: the compass needs location permission
   * and returns null in the editor preview, so gating on it meant a stationary
   * user still got six frames of the same wall. Head yaw is real rotation, needs
   * no permission, and is driven by the preview camera in the editor. LS forward
   * is −Z, so a camera at identity yields atan2(0, 1) = 0°.
   */
  private camYawDeg(): number | null {
    if (!this.camTransform) return null
    try {
      const f = this.camTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, -1))
      return (Math.atan2(f.x, -f.z) * 180) / Math.PI
    } catch (e) {
      return null
    }
  }

  /**
   * Await a delay. ONE pooled DelayedCallbackEvent, reused: the scan loop polls
   * ~300 times in a worst-case 60s sweep, and creating an event per tick would
   * leak that many scene events. Safe because only one delay is ever
   * outstanding (the loop is sequential and gated by `busy`).
   */
  private delayEvent: DelayedCallbackEvent | null = null
  private delayResolve: (() => void) | null = null

  private delay(seconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.delayEvent) {
        this.delayEvent = this.createEvent("DelayedCallbackEvent")
        this.delayEvent.bind(() => {
          const r = this.delayResolve
          this.delayResolve = null
          if (r) r()
        })
      }
      this.delayResolve = resolve
      this.delayEvent.reset(seconds)
    })
  }

  /**
   * Pan markers. Same projection as the single-shot path, except each problem
   * is unprojected through the pose of the FRAME it was seen in (Gemini returns
   * a `frame` index), so tags land around the user rather than all in front.
   * Kept separate from showProblemMarkers so the assess path is untouched.
   */
  private showScanMarkers(analysis: FengshuiAnalysis,
      poses: ({pos: vec3; rot: quat} | null)[]): void {
    try {
      type Pending = {index: number; title: string; pos: vec3}
      const pending: Pending[] = []
      for (let i = 0; i < analysis.problems.length && i < 3; i++) {
        const p = analysis.problems[i]
        if (!p.point || typeof p.point.x !== "number" || typeof p.point.y !== "number") continue
        const fi = Math.max(1, Math.min(poses.length, Math.round(p.frame ?? 1))) - 1
        const pose = poses[fi]
        if (!pose) continue

        const fwd = pose.rot.multiplyVec3(new vec3(0, 0, -1))
        const right = pose.rot.multiplyVec3(new vec3(1, 0, 0))
        const up = pose.rot.multiplyVec3(new vec3(0, 1, 0))
        const nx = Math.max(0, Math.min(1, p.point.x)) - 0.5
        const ny = 0.5 - Math.max(0, Math.min(1, p.point.y))
        const dir = fwd.uniformScale(MARKER_DEPTH_CM)
          .add(right.uniformScale(nx * MARKER_SPAN_W))
          .add(up.uniformScale(ny * MARKER_SPAN_H))
          .normalize()
        pending.push({
          index: i + 1,
          title: p.title,
          pos: pose.pos.add(dir.uniformScale(MARKER_DEPTH_CM)),
        })
        print("[Fengshui] pan marker " + (i + 1) + " frame=" + (fi + 1))

        // Refine onto a real surface where world query has depth (device only).
        if (this.hitSession) {
          const slot = pending.length - 1
          try {
            this.hitSession.hitTest(pose.pos, pose.pos.add(dir.uniformScale(500)), (hit) => {
              if (hit && hit.position) {
                pending[slot].pos = hit.position.add(dir.uniformScale(-4))
                this.uiHud.showMarkers(pending)
                this.particles.setBlockages(pending.map((q) => q.pos))
              }
            })
          } catch (e) {
            // no depth source (editor) — plane fallback stands
          }
        }
      }
      this.uiHud.showMarkers(pending)
      this.particles.setBlockages(pending.map((q) => q.pos))
      print("[Fengshui] pan markers placed: " + pending.length)
    } catch (e) {
      print("[Fengshui] pan markers skipped: " + e)
    }
  }

  // ═══ Ask the master (hold-to-talk ASR → Gemini) ════════════════════════════

  /**
   * Build the ASR session options once and subscribe here in OnStartEvent.
   * The same options object is handed to every startTranscribing() call, so the
   * handlers are registered exactly once — re-creating options per hold would
   * stack duplicate subscriptions.
   */
  private setupAsr(): void {
    try {
      // GLOBAL namespace, not `this.asrModule.AsrTranscriptionOptions` — see the
      // field comment. The same applies to AsrMode below.
      const opts = AsrModule.AsrTranscriptionOptions.create()
      opts.mode = AsrModule.AsrMode.HighAccuracy
      // Long enough that a natural mid-question pause doesn't terminate the
      // utterance while the user is still holding the button.
      opts.silenceUntilTerminationMs = 2000
      opts.onTranscriptionUpdateEvent.add((ev: AsrModule.TranscriptionUpdateEvent) =>
        this.onTranscript(ev))
      opts.onTranscriptionErrorEvent.add((code: AsrModule.AsrStatusCode) =>
        this.onTranscriptError(code))
      this.asrOptions = opts
      print("[Fengshui] ASR ready (mode=HighAccuracy)")
    } catch (e) {
      this.asrOptions = null
      print("[Fengshui] ASR setup failed — ask disabled: " + e)
    }
  }

  private static ASR_STATUS_NAMES = ["Success", "InternalError", "Unauthenticated", "NoInternet"]

  private onTranscript(ev: AsrModule.TranscriptionUpdateEvent): void {
    // Accept updates while held AND through the short post-release grace window,
    // so a final that lands just after the user lets go still counts.
    if (!this.micHeld && !this.askGrace) return
    const text = ev.text ?? ""
    if (ev.isFinal) {
      this.askFinal += (this.askFinal ? " " : "") + text
      this.askPartial = ""
    } else {
      this.askPartial = text
    }
    const live = (this.askFinal + " " + this.askPartial).trim()
    this.askTranscript = live
    print("[Fengshui] ASR update isFinal=" + ev.isFinal + " text='" + text + "'")
    // Live feedback: stream the PARTIAL into the status line — don't wait for
    // isFinal, or the user watches a dead status bar while they talk.
    if (this.micHeld) {
      this.uiHud.setStatus(live ? this.tailClip(live, 58) : S().listening)
    }
  }

  private onTranscriptError(code: AsrModule.AsrStatusCode): void {
    const name = FengshuiMain.ASR_STATUS_NAMES[code] ?? ("code " + code)
    print("[Fengshui] ASR error: " + name + " (" + code + ")")
    this.micHeld = false
    this.askGrace = false
    this.uiHud.setMicActive(false)
    // Verbatim status code, never a generic "failed" — the code is the whole
    // diagnosis (Unauthenticated = sign in, NoInternet = connect, etc).
    this.uiHud.setStatus(S().micError(name))
  }

  /** Button DOWN — open the mic. */
  private handleAskStart(): void {
    if (this.micHeld) return
    if (this.busy) {
      // One remote request at a time: concurrent RemoteApiRequests hard-crash
      // the native layer, so this refuses loudly rather than firing in parallel.
      this.uiHud.setStatus(S().masterStillWorking)
      return
    }
    if (!this.asrOptions) {
      this.uiHud.setStatus(S().micUnavailable)
      return
    }
    if (!this.beforeB64 && !DEV_CANNED_QUESTION) {
      this.uiHud.setStatus(S().assessFirstThenAsk)
      return
    }
    this.playSfx(this.clickAudio)
    this.askFinal = ""
    this.askPartial = ""
    this.askTranscript = ""
    this.micHeld = true
    this.uiHud.setMicActive(true)
    this.uiHud.setStatus(S().listening)
    try {
      this.asrModule.startTranscribing(this.asrOptions)
      print("[Fengshui] ASR started")
    } catch (e) {
      this.micHeld = false
      this.uiHud.setMicActive(false)
      this.uiHud.setStatus(S().micError(String(e)))
      print("[Fengshui] startTranscribing threw: " + e)
    }
  }

  /** Button UP — close the mic and submit whatever was heard. */
  private handleAskEnd(): void {
    if (!this.micHeld) return
    this.micHeld = false
    this.askGrace = true
    this.uiHud.setMicActive(false)
    this.uiHud.setStatus("Consulting the master…")
    // Grace window before stopping: stopTranscribing() DISCARDS the session, so
    // calling it on the release frame can throw away a final that is milliseconds
    // out. Wait, collect, then stop and submit.
    const grace = this.createEvent("DelayedCallbackEvent")
    grace.bind(() => {
      this.askGrace = false
      try {
        this.asrModule.stopTranscribing()
          .catch((e: any) => print("[Fengshui] stopTranscribing rejected: " + e))
      } catch (e) {
        print("[Fengshui] stopTranscribing threw: " + e)
      }
      const question = (this.askTranscript || DEV_CANNED_QUESTION).trim()
      if (!question) {
        this.uiHud.setStatus(S().nothingHeard)
        return
      }
      this.submitAsk(question)
    })
    grace.reset(0.7)
  }

  private async submitAsk(question: string): Promise<void> {
    if (this.busy) {
      this.uiHud.setStatus(S().masterStillWorkingAsk)
      return
    }
    this.busy = true // shares the assess mutex — never two remote calls at once
    try {
      print("[Fengshui] ask: " + question)
      this.uiHud.showAsk(question)
      this.uiHud.setStatus("Consulting the master…")
      const answer = await this.gemini.askMaster(question, this.beforeB64, this.analysis)
      print("[Fengshui] answer: " + answer.substring(0, 160))
      // Archive it, then display from the archive so the newest entry is just
      // "the last page" — one render path for live and past answers.
      this.askHistory.push({q: question, a: answer})
      if (this.askHistory.length > ASK_HISTORY_MAX) this.askHistory.shift()
      this.askIndex = this.askHistory.length - 1
      this.showAskEntry(this.askIndex)
      this.playSfx(this.chimeAudio)
      this.uiHud.setStatus(S().masterHasSpoken)
      this.voice.speak(answer)
    } catch (e) {
      this.reportRemoteFailure("ask failed", e)
      this.uiHud.showAskError("" + e)
      this.uiHud.setStatus(S().askFailed(String(e)))
    } finally {
      this.busy = false
    }
  }

  // ═══ Ask archive ═══════════════════════════════════════════════════════════

  /**
   * ◀ / ▶ on the Master panel — page back through past questions. Reachable
   * even while the panel is showing a scan note: from there the first press
   * jumps to the most recent ask instead of stepping blindly.
   */
  private handleAskNav(delta: number): void {
    const n = this.askHistory.length
    if (n === 0) {
      this.uiHud.setStatus(S().noPastQuestions)
      return
    }
    this.playSfx(this.clickAudio)
    if (this.askIndex < 0) {
      this.askIndex = n - 1
    } else {
      this.askIndex = ((this.askIndex + delta) % n + n) % n
    }
    this.showAskEntry(this.askIndex)
  }

  /**
   * The master speaks. Single path for BOTH the spoken line and the right-hand
   * panel, so his dialogue can never again be audio-only.
   *
   * This matters more than it looks: narration is currently disabled (no valid
   * ElevenLabs sk_ key), so every voice.speak() line was being written and then
   * thrown away unseen. Routing them here makes the panel open on assess,
   * improve and plan-completion — not just on a scan.
   */
  private masterSays(heading: string, body: string): void {
    this.askIndex = -1 // panel is showing live dialogue, not an archived ask
    this.uiHud.showMasterSays(heading, body, S().masterHintAsk)
    this.showArchiveAffordance()
    this.voice.speak(body)
  }

  /**
   * Like masterSays, but ADDS to what the master already said instead of
   * replacing it — for events that land while an answer is on screen. Falls
   * back to a normal replace when the panel is empty, so the note still gets a
   * heading rather than appearing as an orphan bullet.
   */
  private masterAppends(heading: string, body: string): void {
    this.askIndex = -1 // still live dialogue, not an archived ask
    if (!this.uiHud.appendMasterNote(body, S().masterHintAsk)) {
      this.uiHud.showMasterSays(heading, body, S().masterHintAsk)
    }
    this.showArchiveAffordance()
    this.voice.speak(body)
  }

  /** Render archive entry `i` into the Master panel. */
  private showAskEntry(i: number): void {
    const e = this.askHistory[i]
    if (!e) return
    const n = this.askHistory.length
    const newest = i === n - 1
    this.uiHud.showMasterSays(
      '"' + e.q + '"',
      e.a,
      newest ? S().masterAskAgain : S().masterHintEarlier
    )
    this.uiHud.setAskNav(true, S().askNav(i + 1, n))
  }

  /** Keep the newest words visible when a transcript outruns the status line. */
  private tailClip(s: string, max: number): string {
    if (s.length <= max) return s
    return "…" + s.substring(s.length - max + 1)
  }

  // ═══ Drag facing ═══════════════════════════════════════════════════════════

  private updateDragFacing(): void {
    if (!this.camTransform || !this.uiHud.dragging) return
    const rootT = this.uiHud.getSceneObject().getTransform()
    const rootPos = rootT.getWorldPosition()
    const camPos = this.camTransform.getWorldPosition()
    // LS quat.lookAt aims +Z along `forward` (verified: passing the away-vector
    // yawed the cluster 180° and backface-culled every panel). Panels' visible
    // face is +Z, so pass the TOWARD-camera vector. Sanity: camera at identity,
    // root dead ahead -> toCam = +Z -> identity rotation = the authored pose.
    const toCam = new vec3(camPos.x - rootPos.x, 0, camPos.z - rootPos.z)
    if (toCam.length < 1) return
    rootT.setWorldRotation(quat.lookAt(toCam.normalize(), vec3.up()))
  }

  // ═══ Flow handlers ═════════════════════════════════════════════════════════

  private async handleAssess(): Promise<void> {
    if (this.busy) return // one in-flight request at a time — bursts crash the native layer
    // While immersive the primary button reads "Exit 3D" — do exactly that.
    if (this.spatialVisible) {
      this.playSfx(this.clickAudio)
      this.exitSpatial()
      return
    }
    this.busy = true
    try {
      this.playSfx(this.clickAudio)
      this.clearResults() // a new assess must not show the last room's findings
      this.uiHud.startLoading()
      this.uiHud.setStage(S().stageCapturingRoom, 0.1)
      this.playSfx(this.shutterAudio)
      this.capturePose = this.readCameraPose()
      // Freeze a depth+color pair for surface-accurate markers (device only —
      // saveDepthFrame returns -1 in the editor preview where depth never streams)
      if (this.depthCache && !isNull(this.depthCache)) {
        try {
          if (this.depthFrameId !== null) this.depthCache.disposeDepthFrame(this.depthFrameId)
          const id = this.depthCache.saveDepthFrame()
          this.depthFrameId = id >= 0 ? id : null
        } catch (e) {
          this.depthFrameId = null
        }
      }

      // CRITICAL for on-surface markers: when a depth pair exists, the photo we
      // send to Gemini must BE the depth-cached color frame (exact pixel<->depth
      // alignment, same camera+intrinsics — this is what the official sample does).
      // A photo from the separate capture stream maps Gemini's {x,y} through the
      // wrong camera and the depth lookup misses -> plane fallback.
      let b64: string | null = null
      if (this.depthFrameId !== null) {
        const cachedTex = this.depthCache!.getCamImageWithID(this.depthFrameId)
        if (cachedTex) {
          b64 = await this.encodeTexture(cachedTex)
          this.uiHud.showBefore(cachedTex)
        }
      }
      if (!b64) {
        b64 = await this.camera.captureJpegBase64()
        this.uiHud.showBefore(await this.decodeTexture(b64))
      }
      this.beforeB64 = b64
      print("[Fengshui] capture: depthFrame=" + this.depthFrameId +
        " hasDepth=" + (this.depthCache && !isNull(this.depthCache) ? this.depthCache.hasDepth() : false) +
        " facing=" + (this.compass.facing() ?? "unknown"))

      this.uiHud.setStage(S().stageConsultingMaster, 0.3)
      const analysis = await this.gemini.analyzeRoom(b64, this.compass.facing())
      this.analysis = analysis
      print("[Fengshui] score=" + analysis.score + " problems=" + analysis.problems.length)

      const score = Math.max(0, Math.min(100, Math.round(analysis.score)))
      const prevBest = this.history.best()
      this.history.record(score)
      this.uiHud.showScore(score, this.verdictFor(score))
      this.uiHud.setGaugeMeta(
        prevBest !== null
          ? "Best " + Math.max(prevBest, score) + " · " + this.history.count() + " scans"
          : ""
      )
      this.uiHud.showProblems(analysis.problems)
      // Wu xing balance — same analyze call, no extra round-trip
      this.uiHud.setElements(analysis.elements ?? null)
      if (analysis.elements) {
        const el = analysis.elements
        print("[Fengshui] elements wood=" + el.wood + " fire=" + el.fire +
          " earth=" + el.earth + " metal=" + el.metal + " water=" + el.water)
      } else {
        print("[Fengshui] WARN: analysis returned no elements field")
      }
      this.uiHud.setFacing(this.compass.facing())
      // Shop tab: match suggestions to the IKEA partner catalog; matched rows are
      // purchasable through CommerceKit (mock in editor, Snap sheet on device)
      this.shopProductIds = [null, null, null]
      const thumbJobs: {index: number; url: string}[] = []
      this.uiHud.setShop((analysis.shopping ?? []).map((s, i) => {
        const p = FengshuiIkea.match(s.item + " " + s.reason + " " + s.search)
        if (p && i < 3) {
          this.shopProductIds[i] = p.id
          thumbJobs.push({index: i, url: FengshuiIkea.thumbUrl(p)})
        }
        // Rows size to their text now (scrolling panel), so the product desc AND
        // the master's reason both fit.
        return p
          ? {item: "IKEA " + p.name + " · $" + p.usd, reason: p.desc + " — " + s.reason, search: "IKEA " + p.name}
          : s
      }))
      this.loadShopThumbs(thumbJobs) // fire-and-forget; rows are usable meanwhile
      this.showProblemMarkers(analysis)
      this.playSfx(this.chimeAudio)

      // The master's reading — spoken AND shown, so pressing Assess opens his
      // panel exactly like a scan does.
      const facing = this.compass.facing()
      const titles = analysis.problems.slice(0, 3).map((p) => p.title).join("; ")
      const note = analysis.elements && analysis.elements.note ? " " + analysis.elements.note : ""
      this.masterSays(
        S().masterTitleRoomRead,
        S().masterBodyRoomRead(score, this.verdictFor(score),
          facing ? directionName(facing) : null, titles, note)
      )

      // One flow: assessment rolls straight into the rebalanced-room render.
      // A failure here keeps the assessment results on screen.
      try {
        await this.runImprove()
      } catch (e) {
        print("[Fengshui] Auto-improve failed (assessment stands): " + e)
        this.uiHud.endLoading(false)
        this.uiHud.setStatus(S().rebalanceFailed)
      }
    } catch (e) {
      this.reportRemoteFailure("Assess failed", e)
      this.uiHud.endLoading(false)
      this.uiHud.setStatus(S().assessFailed)
    } finally {
      this.busy = false
    }
  }

  // The improve pipeline body — runs as the second half of the merged assess
  // flow. Caller owns busy/loading-start and error status.
  private async runImprove(): Promise<void> {
    this.uiHud.setStage(S().stagePainting, 0.55)
    let improvedB64 = await this.gemini.improveRoom(this.beforeB64!, this.analysis!, false)

    this.uiHud.setStage(S().stageCheckingWork, 0.8)
    let qa = await this.safeVerify(improvedB64)

    // One tightened regenerate if the QA checklist flagged missed edits
    if (qa && qa.total > 0 && qa.passCount < qa.total) {
      this.uiHud.setStage(S().stageRefining(qa.total - qa.passCount), 0.9)
      try {
        const retryB64 = await this.gemini.improveRoom(this.beforeB64!, this.analysis!, true, qa.failedEdits)
        const retryQa = await this.safeVerify(retryB64)
        if (!retryQa || retryQa.passCount >= qa.passCount) {
          improvedB64 = retryB64
          qa = retryQa ?? qa
        }
      } catch (e) {
        print("[Fengshui] Tightened retry failed, keeping first image: " + e)
      }
    }

    const afterTex = await this.decodeTexture(improvedB64)
    this.afterTexture = afterTex
    const qaMsg = qa && qa.total > 0
      ? S().qaVerified(qa.passCount, qa.total)
      : S().qaApplied
    this.uiHud.showAfter(afterTex, qaMsg)
    this.uiHud.endLoading(true)
    this.playSfx(this.whooshAudio)
    // Chi flow: blockages ease out over ~2s and a surge of clear chi runs through
    this.particles.releaseBlockages()
    print("[Fengshui] chi blockages released")

    // Chi Plan checklist replaces the blockers list — the edits become todos
    this.uiHud.showPlan(this.gemini.planSteps(this.analysis!))
    this.uiHud.setStatus(S().slideToCompare)
    // Append, don't replace: the rebalance used to overwrite the answer the
    // master had just given, so asking a question then improving the room cut
    // that answer off mid-conversation.
    this.masterAppends(
      S().masterTitleRebalanced,
      S().masterBodyRebalanced
    )

    // Score the imagined room — the attainable target
    try {
      const targetAnalysis = await this.gemini.analyzeRoom(improvedB64)
      const target = Math.max(0, Math.min(100, Math.round(targetAnalysis.score)))
      const best = this.history.best()
      this.uiHud.setGaugeMeta("Target " + target + (best !== null ? " · Best " + best : ""))
    } catch (e) {
      print("[Fengshui] Target scoring failed (non-fatal): " + e)
    }
  }

  /** Print a remote failure, plus its remedy when we can name one. */
  private reportRemoteFailure(context: string, e: any): void {
    print("[Fengshui] " + context + ": " + e)
    const advice = describeRemoteAuthError(e)
    if (advice) print("[Fengshui] " + advice)
  }

  // RSG tokens expire ~hourly. Warn loudly at start rather than failing silently
  // mid-demo — the Google token gates the whole assess flow, the Snap token gates
  // View in 3D. Fix is a token refresh (REBUILD.md), not a code change.
  private checkRsgCredentials(): void {
    try {
      const snap = RemoteServiceGatewayCredentials.getApiToken(AvaliableApiTypes.Snap)
      const google = RemoteServiceGatewayCredentials.getApiToken(AvaliableApiTypes.Google)
      // OpenAI now gates the master's VOICE (FengshuiVoice uses OpenAI TTS).
      // Checked here so a missing token shows up at start rather than as silence
      // three minutes into a demo — silence being the one failure mode nobody
      // recognises as a failure.
      const openai = RemoteServiceGatewayCredentials.getApiToken(AvaliableApiTypes.OpenAI)
      if (!google) {
        print("[Fengshui] WARN: no RSG Google token — assess will fail. Refresh per REBUILD.md.")
      }
      if (!snap) {
        print("[Fengshui] WARN: no RSG Snap token — View in 3D will fail. Refresh per REBUILD.md.")
      }
      if (!openai) {
        print("[Fengshui] WARN: no RSG OpenAI token — the master will be SILENT. Refresh per REBUILD.md.")
      }
      // Deliberately NOT phrased as "credentials present" any more. This check
      // reads three STRINGS off a component; it cannot tell whether the gateway
      // will accept them, and it stayed green through an hour in which every
      // single request 401'd because Lens Studio was signed out. A green line at
      // that moment is worse than no line, because it sends you hunting for the
      // problem anywhere except where it is.
      //
      // The authoritative check is Editor.IAuthorization.isAuthorized, which is
      // an EDITOR API — unreachable from inside a running Lens, so the Lens
      // cannot self-verify at startup. The honest thing the runtime can do is
      // state exactly what it confirmed, and let the first real failure name the
      // remedy (see describeRemoteError).
      const configured: string[] = []
      if (google) configured.push("Google")
      if (snap) configured.push("Snap")
      if (openai) configured.push("OpenAI")
      if (configured.length === 3) {
        print("[Fengshui] RSG tokens configured (" + configured.join(" + ") +
          "). NOT proof of authorization — if calls 401, check Lens Studio is " +
          "signed in to Snap BEFORE re-minting tokens.")
      } else if (configured.length > 0) {
        print("[Fengshui] RSG tokens configured (" + configured.join(" + ") +
          ") — others missing, see warnings above.")
      } else {
        print("[Fengshui] WARN: no RSG tokens configured at all — nothing remote will work.")
      }
    } catch (e) {
      print("[Fengshui] RSG credential check failed: " + e)
    }
  }

  /**
   * What "View in 3D" should spatialize: the improved room when an assess has
   * produced one, otherwise the scan view currently on screen (before this,
   * View in 3D simply dead-ended after a pan scan).
   */
  private currentSpatialTexture(): Texture | null {
    if (this.afterTexture) return this.afterTexture
    if (this.scanTextures.length === 0) return null
    const i = this.scanIndex <= 0
      ? 0
      : Math.min(this.scanIndex - 1, this.scanTextures.length - 1)
    return this.scanTextures[i]
  }

  private handleSpatialize(): void {
    this.playSfx(this.clickAudio)
    const tex = this.currentSpatialTexture()
    if (!tex) {
      this.uiHud.setStatus(S().assessOrScanFirst)
      return
    }
    if (!this.spatialImage || isNull(this.spatialImage) ||
        !this.spatialImageObject || isNull(this.spatialImageObject)) {
      this.uiHud.setStatus(S().spatialUnavailable)
      return
    }
    if (!this.spatialVisible) {
      try {
        this.spatialVisible = true
        this.spatialImageObject.enabled = true
        const si = this.spatialImage as any
        // ORDER MATTERS. `SpatialImage.material` is
        // `renderMeshVisual?.mainMaterial ?? spatialImageMaterial`, and
        // setImage() nulls renderMeshVisual then SYNCHRONOUSLY clones
        // spatialImageMaterial for the new mesh. Writing these after setImage
        // would land on the base material and only take effect on the NEXT
        // spatialize — i.e. look like it silently did nothing.
        //
        // ...and `material` is `renderMeshVisual?.mainMaterial ?? spatialImageMaterial`.
        // On a REPEAT spatialize renderMeshVisual still points at the PREVIOUS
        // mesh, so these writes would land on the old mesh's material while
        // spatialize() clones the untouched base — the depth setting silently
        // reverts to whatever was authored. Nulling it first forces the getter
        // to the base material that is about to be cloned, so the settings
        // stick on every spatialize, not just the first.
        si.renderMeshVisual = null
        // frameOn is the rounded-corner "portal" mask, and it is what was
        // clipping the edges of the photo. Off = the whole image is visible.
        si.frameOn = SPATIAL_FRAME_ON
        // The actual "it looks flat" knob — see SPATIAL_DEPTH_SCALE.
        si.depthScale = SPATIAL_DEPTH_SCALE
        si.setImage(tex)
        // Immersive mode: clear the result panels so the spatial window is
        // unobstructed. The Improve Room button becomes "Exit 3D".
        this.uiHud.setImmersive(true)
        this.playSfx(this.whooshAudio)
        // Depth is still generating remotely at this point — onLoaded flips this
        // to stepIntoRoom on success, or reports failure. Claiming "step into
        // your better room" here (as before) promised a 3D view that had not
        // arrived yet, which is exactly what read as "no depth".
        this.uiHud.setStatus(S().stageBuildingDepth)
      } catch (e) {
        print("[Fengshui] Spatialize failed: " + e)
        this.exitSpatial()
        this.uiHud.setStatus(S().spatialFailed)
      }
    } else {
      this.exitSpatial()
    }
  }

  private exitSpatial(): void {
    this.spatialVisible = false
    if (this.spatialImageObject && !isNull(this.spatialImageObject)) this.spatialImageObject.enabled = false
    this.uiHud.setImmersive(false)
    this.uiHud.setStatus(S().slideToCompare)
  }

  private handleMute(muted: boolean): void {
    this.voice.muted = muted
    this.bgmAudio.volume = muted ? 0 : BGM_VOLUME
  }

  // Download the matched products' thumbnails ONE AT A TIME (concurrent
  // RemoteApiRequests crash the native layer) and cache by URL so a re-assess
  // reuses textures. Failures leave the row text-only — never blocks the flow.
  private async loadShopThumbs(jobs: {index: number; url: string}[]): Promise<void> {
    if (this.thumbLoading) return // a previous batch is still draining
    this.thumbLoading = true
    try {
      for (const job of jobs) {
        const cached = this.thumbCache.get(job.url)
        if (cached) {
          this.uiHud.setShopThumb(job.index, cached)
          continue
        }
        try {
          const tex = await this.downloadTexture(job.url)
          this.thumbCache.set(job.url, tex)
          this.uiHud.setShopThumb(job.index, tex)
        } catch (e) {
          print("[Fengshui] shop thumb failed (" + job.url + "): " + e)
        }
      }
    } finally {
      this.thumbLoading = false
    }
  }

  private downloadTexture(url: string): Promise<Texture> {
    return new Promise<Texture>((resolve, reject) => {
      const resource = this.internetModule.makeResourceFromUrl(url)
      this.remoteMediaModule.loadResourceAsImageTexture(
        resource,
        (tex) => resolve(tex),
        (err) => reject(new Error("" + err))
      )
    })
  }

  // Shop row tap: partner products go through the CommerceKit purchase flow
  // (mock in editor, real Snap payment sheet on device); unmatched suggestions
  // fall back to a phone-search hint.
  private async handleShopTap(index: number): Promise<void> {
    this.playSfx(this.clickAudio)
    const productId = this.shopProductIds[index]
    if (!productId) {
      const q = this.uiHud.shopQuery(index)
      if (q) this.uiHud.setStatus(S().searchOnPhone(q))
      return
    }
    try {
      this.uiHud.setStatus(S().openingCheckout)
      const result = await CommerceKit.getInstance().purchaseProduct(productId)
      if (result && result.success) {
        this.uiHud.markShopOwned(index)
        this.playSfx(this.chimeAudio)
        this.uiHud.setStatus(global.deviceInfoSystem.isEditor()
          ? "Purchased ✓ (editor mock checkout)"
          : "Purchased ✓ — thank you")
      } else {
        this.uiHud.setStatus(result && result.cancelled ? S().checkoutCancelled : S().checkoutUnavailable)
      }
    } catch (e) {
      print("[Fengshui] purchase failed: " + e)
      this.uiHud.setStatus(S().checkoutFailed)
    }
  }

  private handlePlanToggle(e: {index: number; done: boolean}): void {
    this.playSfx(this.clickAudio)
    if (this.uiHud.planAllDone()) {
      this.playSfx(this.chimeAudio)
      this.uiHud.setStatus(S().planComplete)
      this.masterSays(
        "The plan is complete",
        "The plan is complete. Assess your room again, and watch your chi rise."
      )
    }
  }

  /**
   * Wipe every result surface — score, blockers, plan, shop, markers, chi
   * blockages, the scan gallery and the master's panel.
   *
   * Shared by Reset AND by the start of both Assess and Scan: a new reading must
   * never leave the previous room's findings on screen. Without this the panels
   * only changed as each new result happened to overwrite them, so a fresh
   * assess sat there showing the last room's score and chi plan — and anything
   * the new analysis didn't happen to fill (a scan gallery, the master's notes)
   * simply never cleared.
   */
  private clearResults(): void {
    this.analysis = null
    this.beforeB64 = null
    this.afterTexture = null
    this.capturePose = null
    this.shopProductIds = [null, null, null]
    this.scanTextures = []
    this.scanViews = []
    this.scanOverall = ""
    this.scanIndex = 0
    this.askIndex = -1
    this.particles.clearBlockages()
    this.uiHud.resetAll()
    // NOTE: askHistory deliberately survives. The core loop is "fix things, then
    // assess the SAME room again", so questions asked about that room are still
    // relevant afterwards — wiping them on every re-assess would throw away the
    // archive during exactly the flow it is useful in. Only Reset clears it.
  }

  private handleReset(): void {
    if (this.busy) return
    this.playSfx(this.clickAudio)
    this.exitSpatial()
    this.clearResults()
    this.askHistory = []   // Reset means start over — the archive goes too
    const hist = this.history.summaryLine()
    if (hist) this.uiHud.setGaugeMeta(hist)
    this.uiHud.setStatus(S().intro)
  }

  /**
   * Language toggle. Flips the string table, which re-renders every bound label,
   * and steers the model prompts and the spoken voice via S()/localeTag().
   *
   * ASR needs NO action here, and deliberately gets none. AsrTranscriptionOptions
   * exposes only `mode` and `silenceUntilTerminationMs` — there is no locale or
   * languageCode field on it (the `languageCode` in StudioLib belongs to the
   * deprecated VoiceML.ListeningOptions, a different API). AsrModule detects the
   * spoken language itself and handles mixed input, so Mandarin questions
   * transcribe without being told to expect them. Adding a locale setting here
   * would be a control that does nothing.
   *
   * Findings already on screen are model output in the OLD language and stay as
   * they are; the next assess or scan comes back in the new one.
   */
  private handleLangToggle(): void {
    this.playSfx(this.clickAudio)
    setLang(getLang() === "zh" ? "en" : "zh")
    print("[Fengshui] language → " + getLang() + " (locale " + localeTag() + ")")
  }

  // ═══ Markers ═══════════════════════════════════════════════════════════════

  private readCameraPose(): {pos: vec3; rot: quat} | null {
    try {
      const camT = WorldCameraFinderProvider.getInstance().getTransform()
      return {pos: camT.getWorldPosition(), rot: camT.getWorldRotation()}
    } catch (e) {
      print("[Fengshui] camera pose unavailable: " + e)
      return null
    }
  }

  // Marker placement: unproject each problem's photo point through the capture
  // pose and raycast against the real world (WorldQueryModule) so tags land ON
  // the surface. Falls back to the fixed-depth plane per-marker when there's no
  // hit (and always in the editor, where world query has no depth source).
  private showProblemMarkers(analysis: FengshuiAnalysis): void {
    try {
      const pose = this.capturePose
      if (!pose) return
      const fwd = pose.rot.multiplyVec3(new vec3(0, 0, -1))
      const right = pose.rot.multiplyVec3(new vec3(1, 0, 0))
      const up = pose.rot.multiplyVec3(new vec3(0, 1, 0))

      type Pending = {index: number; title: string; pos: vec3}
      const pending: Pending[] = []
      for (let i = 0; i < analysis.problems.length && i < 3; i++) {
        const p = analysis.problems[i]
        if (!p.point || typeof p.point.x !== "number" || typeof p.point.y !== "number") continue
        const ux = Math.max(0, Math.min(1, p.point.x))
        const uy = Math.max(0, Math.min(1, p.point.y))
        const nx = ux - 0.5
        const ny = 0.5 - uy
        // Direction through the image point (same frustum approximation as before)
        const dir = fwd.uniformScale(MARKER_DEPTH_CM)
          .add(right.uniformScale(nx * MARKER_SPAN_W))
          .add(up.uniformScale(ny * MARKER_SPAN_H))
          .normalize()
        const fallback = pose.pos.add(dir.uniformScale(MARKER_DEPTH_CM))
        pending.push({index: i + 1, title: p.title, pos: fallback})

        // Best source: the frozen depth+color pair from capture time — the exact
        // per-pixel depth of the analyzed photo (device only; null in editor).
        let depthHit = false
        if (this.depthCache && !isNull(this.depthCache) && this.depthFrameId !== null) {
          try {
            const wp = this.depthCache.getWorldPositionNormalized(new vec2(ux, uy), this.depthFrameId)
            if (wp) {
              // Pull 4cm back toward the capture viewpoint so the tag sits ON the surface
              pending[pending.length - 1].pos = wp.add(
                pose.pos.sub(wp).normalize().uniformScale(4))
              depthHit = true
              print("[Fengshui] marker " + (i + 1) + " source=depthCache")
            }
          } catch (e) {
            // depth unavailable — fall through to world query / plane
          }
        }
        if (!depthHit && this.hitSession) {
          const slot = pending.length - 1
          const rayEnd = pose.pos.add(dir.uniformScale(500))
          try {
            this.hitSession.hitTest(pose.pos, rayEnd, (hit) => {
              if (hit && hit.position) {
                // Pull the tag 4cm off the surface toward the viewer so it never z-fights
                pending[slot].pos = hit.position.add(dir.uniformScale(-4))
                print("[Fengshui] marker " + (slot + 1) + " source=worldQuery")
                this.uiHud.showMarkers(pending) // re-place with refined positions
                this.particles.setBlockages(pending.map((q) => q.pos))
              }
            })
          } catch (e) {
            // no depth source (editor) — fallback position stands
          }
        }
        if (!depthHit) print("[Fengshui] marker " + (i + 1) + " source=plane-fallback (until a hit lands)")
      }
      this.uiHud.showMarkers(pending)
      // Chi flow: the same problem positions become blockage nodes — the particle
      // current stalls and swirls amber there until the improved room lands.
      this.particles.setBlockages(pending.map((q) => q.pos))
      print("[Fengshui] chi blockages armed: " + pending.length)
    } catch (e) {
      print("[Fengshui] markers skipped: " + e)
    }
  }

  // ═══ Helpers ═══════════════════════════════════════════════════════════════

  private async safeVerify(imageB64: string): Promise<QAResult | null> {
    try {
      const qa = await this.gemini.verifyEdits(imageB64, this.analysis!)
      print("[Fengshui] QA verify: " + qa.passCount + "/" + qa.total + " passed")
      return qa
    } catch (e) {
      print("[Fengshui] QA verify failed (non-fatal): " + e)
      return null
    }
  }

  private encodeTexture(tex: Texture): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      Base64.encodeTextureAsync(
        tex,
        (s) => resolve(s),
        () => reject(new Error("texture encode failed")),
        CompressionQuality.HighQuality,
        EncodingType.Jpg
      )
    })
  }

  private decodeTexture(b64: string): Promise<Texture> {
    return new Promise<Texture>((resolve, reject) => {
      Base64.decodeTextureAsync(
        b64,
        (tex) => resolve(tex),
        () => reject(new Error("texture decode failed"))
      )
    })
  }

  private verdictFor(score: number): string {
    if (score >= 85) return S().verdictMasterful
    if (score >= 70) return S().verdictBalanced
    if (score >= 55) return S().verdictGentle
    if (score >= 40) return S().verdictRestless
    return S().verdictBlocked
  }

  private startMusic(): void {
    const so = global.scene.createSceneObject("FengshuiBGM")
    so.setParent(this.sceneObject)
    this.bgmAudio = so.createComponent("Component.AudioComponent") as AudioComponent
    this.bgmAudio.audioTrack = BGM_TRACK
    this.bgmAudio.volume = BGM_VOLUME
    this.bgmAudio.play(-1) // loop forever — LowPower default is right for a bed
  }

  private makeSfx(name: string, track: AudioTrackAsset): AudioComponent {
    const so = global.scene.createSceneObject(name)
    so.setParent(this.sceneObject)
    const a = so.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.volume = 0.9
    return a
  }

  private playSfx(a: AudioComponent): void {
    if (!isNull(a)) a.play(1)
  }
}
