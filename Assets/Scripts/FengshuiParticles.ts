// FengshuiParticles.ts — chi flow: the room's energy made visible.
//
// Particles ride one coherent current instead of drifting independently — a calm
// jade river through the space. At each detected problem position the current
// stalls, thickens and curls into a stagnant amber eddy: particles slow, crowd
// inward and orbit before struggling past. When the improved room lands the eddies
// ease out over ~2s (plus a brief flow surge) and the current runs clear jade again.
//
// Script-driven CPU field — ~22 image quads, all-scalar math, no per-frame allocs
// beyond the pre-existing billboard quaternion.

import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material
const TEX_PETAL = requireAsset("../Textures/petal.png") as Texture
const TEX_BOKEH = requireAsset("../Textures/bokeh.png") as Texture

// 36, not the original 22: an eddy needs enough particles to read as a CLUMP.
// 22 over this ~140x62x100cm volume is one particle per ~40,000cm3, so a blockage
// could only ever gather 1-2 — invisible. 36 gathers ~9/2/3 across the three
// nodes while staying a sparse, subtle field (still ~5 quads on screen at once).
const COUNT = 36
const X_BOUND = 70
const Y_MIN = -28
const Y_MAX = 34
const Z_MIN = -150
const Z_MAX = -50
const PUSH_RADIUS = 16 // cm around each index tip
const PUSH_FORCE = 320 // cm/s^2 at zero distance

// ── Sorting ──────────────────────────────────────────────────────────────────
// Particles must never paint over the UI. Same root cause as the chi markers:
// "ChiParticles" is created at RUNTIME, so it appends as the last scene root,
// and with every renderOrder tied at 0 the hierarchy order breaks the tie in the
// particles' favour — deterministically, on every frame, not by luck.
//
// One difference from the markers, and it is the reason this is a deliberate
// choice rather than a pure bugfix: the field spans Z_MIN..Z_MAX (-150..-50)
// while the panels sit at about -110, so a particle at -60 genuinely IS in front
// of a panel. Depth-correct rendering would draw it on top, and it would still
// be wrong — an amber blob over the master's answer is noise whatever the
// geometry says. So the panels are treated as an overlay you read THROUGH, and
// the field is pushed behind them unconditionally.
//
// Below MARKER_RENDER_ORDER (-20) as well: ambient decoration should never
// obscure an informational tag either. Order back-to-front is
// particles (-30) → markers (-20) → panels (0).
const PARTICLE_RENDER_ORDER = -30

// The current. Particles steer onto a shared velocity field rather than carrying
// independent random drift — that shared field is what reads as "flow".
const STEER = 1.8       // 1/s — how hard a particle is pulled onto the current
const FLOW_SPEED = 4.5  // cm/s
const FLOW_K = 0.035    // spatial frequency (~180cm wavelength) so neighbours agree
const FLOW_W = 0.35     // rad/s — the field itself breathes slowly

// Blockage eddies
const BLOCK_RADIUS = 34   // cm of influence around a problem position
const BLOCK_STALL = 0.85  // fraction of the current killed at the core
// Swirl is a capped SPEED, not omega*r — an omega*r vortex accelerates with radius
// and made blocked particles the fastest things on screen, the opposite of stalling.
const BLOCK_SWIRL = 3.0   // cm/s tangential, just under the ambient current
const BLOCK_PULL = 4.5    // cm/s inward crowding
const BLOCK_CORE = 6      // cm — inside this the eddy pushes back out (no stacking)
const BLOCK_THICKEN = 0.5 // extra scale at the core — a size cue that survives glare
const RAMP_IN = 1.2       // s for a blockage to thicken up
const RAMP_OUT = 2.0      // s to clear after the improved room lands
const SURGE_TIME = 2.5    // s of extra flow right after release — the exhale
const SURGE_GAIN = 0.5
const RELEASE_PUSH = 7    // cm/s outward burst that opens the clumps on release

// Markers land ~180cm out and can sit above/below the particle volume entirely.
// Each eddy keeps its marker's exact on-screen DIRECTION but has its distance
// pulled along that ray until it lands inside the particle box — otherwise the
// swirl would happen where there are no particles to swirl.
const NODE_EDGE_PAD = 8   // cm kept clear of the box walls
const NODE_MIN_DIST = 60  // fallback range when the ray misses the box entirely
const NODE_MAX_DIST = 135
const MAX_NODES = 4
// The UI panel stack sits at z = -110 (measured live: ControlPanel, ProblemsPanel,
// BeforeAfterPanel and ScoreGauge all on that plane). Eddies resolved further than
// that are hidden BEHIND the panels — which is exactly what happened in preview,
// where two markers collapsed to x~0 and landed at z -128 and -142. Keep eddy
// centres in front of the panel plane so congestion reads over the UI, not behind.
const EDDY_Z_FAR = -100
// Two problems can unproject to nearly the same direction; without this they stack
// into one blob and read as a single blockage.
const NODE_MIN_SEP = 26

const PETAL_TINT = new vec4(0.55, 0.92, 0.65, 0.3)
const GLOW_TINTS = [
  new vec4(0.95, 0.82, 0.5, 0.2),  // warm gold
  new vec4(1.0, 1.0, 1.0, 0.14),   // soft white
  new vec4(0.5, 0.88, 0.62, 0.18), // faint jade
]
// Stagnant chi — jade/gold shifts toward a dull ember as the current stalls
// Legibility beats subtlety here: a judge has to read "blocked" across a room, so
// stagnant chi goes to a hot, saturated ember at near-full opacity. The earlier
// muted values (1.0/0.58/0.2 at 1.7x alpha) did not register against a bright room.
const EMBER_R = 1.0
const EMBER_G = 0.42
const EMBER_B = 0.08
const EMBER_ALPHA_GAIN = 3.0
// Particles wrap at the field bounds, which teleports them — a hard pop. Fade
// alpha to nothing across the last stretch before every bound so they dissolve
// out and bloom back in instead of snapping.
const FADE_MARGIN = 10 // cm

type Particle = {
  so: SceneObject
  tr: Transform
  mat: Material
  color: vec4       // owned scratch — mutated then re-assigned, never re-allocated
  br: number        // authored tint, for lerping toward ember
  bg: number
  bb: number
  ba: number
  vx: number
  vy: number
  vz: number
  phase: number
  swaySpeed: number
  riseSpeed: number
  tilt: number
  spin: number      // rad/s in-plane twirl (petals; glows barely)
  baseSize: number  // for the breathing scale pulse
  stag: number      // last applied stagnation — gates material writes
  edge: number      // last applied edge fade — gates material writes
}

type Blockage = {
  x: number   // true world position of the problem
  y: number
  z: number
  ex: number  // effective (range-clamped) eddy centre, recomputed per frame
  ey: number
  ez: number
  ax: number  // swirl axis — viewer -> node, so the whirl reads on screen
  ay: number
  az: number
  s: number       // current strength 0..1
  target: number  // 0 = clear, 1 = blocked
  used: boolean   // slot ever filled — gates the release burst
}

export class FengshuiParticles {
  private root: SceneObject
  private parts: Particle[] = []
  private nodes: Blockage[] = []
  private nodeCount = 0
  private surge = 0
  private hands: any[] | null = null
  private camT: Transform | null = null
  private t = 0
  // Scratch vectors reused every frame
  private tmpPos = new vec3(0, 0, 0)
  private tmpScale = new vec3(1, 1, 1)
  private tmpToCam = new vec3(0, 0, 1)

  constructor(script: BaseScriptComponent) {
    this.root = global.scene.createSceneObject("ChiParticles")
    for (let i = 0; i < COUNT; i++) this.spawn(i)
    for (let i = 0; i < MAX_NODES; i++) {
      this.nodes.push({
        x: 0, y: 0, z: 0, ex: 0, ey: 0, ez: 0,
        ax: 0, ay: 0, az: -1, s: 0, target: 0, used: false,
      })
    }
    const ev = script.createEvent("UpdateEvent")
    ev.bind(() => this.update())
  }

  // ═══ Chi state (called by FengshuiMain) ════════════════════════════════════

  // Feed the detected problem world positions in. Blockages thicken in over ~1.2s.
  // Safe to call repeatedly as marker positions are refined by world query — the
  // ramp is preserved per slot so the swirl doesn't restart.
  public setBlockages(positions: vec3[]): void {
    const n = Math.min(positions.length, MAX_NODES)
    for (let i = 0; i < n; i++) {
      const nd = this.nodes[i]
      const p = positions[i]
      nd.x = p.x
      nd.y = p.y
      nd.z = p.z
      nd.target = 1
      nd.used = true
    }
    // Any slot beyond the new set eases out rather than popping off
    for (let i = n; i < MAX_NODES; i++) this.nodes[i].target = 0
    this.nodeCount = MAX_NODES // inactive slots hold s=0 and cost one branch
    this.surge = 0
  }

  // The improved room landed — let the blockages go and push a visible surge of
  // clear chi through the space. Deliberately paced over ~2s, not a snap.
  public releaseBlockages(): void {
    for (let i = 0; i < MAX_NODES; i++) this.nodes[i].target = 0
    this.surge = 1
  }

  // Hard clear (reset button) — no transition.
  public clearBlockages(): void {
    for (let i = 0; i < MAX_NODES; i++) {
      this.nodes[i].target = 0
      this.nodes[i].s = 0
      this.nodes[i].used = false
    }
    this.surge = 0
  }

  // ═══ Internals ═════════════════════════════════════════════════════════════

  private spawn(i: number): void {
    const so = global.scene.createSceneObject("Chi" + i)
    so.setParent(this.root)
    const isPetal = i % 3 !== 0 // ~2/3 petals, ~1/3 bokeh glows
    const img = so.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    const tint = isPetal ? PETAL_TINT : GLOW_TINTS[i % GLOW_TINTS.length]
    const color = new vec4(tint.x, tint.y, tint.z, tint.w)
    mat.mainPass.baseTex = isPetal ? TEX_PETAL : TEX_BOKEH
    mat.mainPass.baseColor = color
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    // Sort behind every panel and marker (see PARTICLE_RENDER_ORDER).
    try {
      img.renderOrder = PARTICLE_RENDER_ORDER
    } catch (e) {
      print("[FengshuiParticles] renderOrder skipped: " + e)
    }

    // Bokeh glows run larger and softer than petals
    const size = isPetal ? 1.6 + Math.random() * 1.6 : 2.4 + Math.random() * 2.2
    const tr = so.getTransform()
    tr.setLocalScale(new vec3(size, size, 1))
    tr.setWorldPosition(this.randomPos())

    this.parts.push({
      so: so,
      tr: tr,
      mat: mat,
      color: color,
      br: tint.x,
      bg: tint.y,
      bb: tint.z,
      ba: tint.w,
      vx: 0,
      vy: 0,
      vz: 0,
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.3 + Math.random() * 0.5,
      riseSpeed: 0.8 + Math.random() * 1.6,
      // Random in-plane tilt so petals don't all point the same way (composed
      // onto the billboard rotation each frame; glows are radially symmetric)
      tilt: isPetal ? Math.random() * Math.PI * 2 : 0,
      // Slow continuous twirl — petals tumble like they're on a breeze
      spin: isPetal ? (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.65) : 0,
      baseSize: size,
      stag: 0,
      edge: 1,
    })
  }

  private randomPos(): vec3 {
    return new vec3(
      (Math.random() * 2 - 1) * X_BOUND,
      Y_MIN + Math.random() * (Y_MAX - Y_MIN),
      Z_MIN + Math.random() * (Z_MAX - Z_MIN)
    )
  }

  private getHands(): any[] {
    // Lazy fetch (SIK access is safest after start); cache once resolved.
    if (this.hands) return this.hands
    try {
      const hid: any = SIK.HandInputData
      if (hid) this.hands = [hid.getHand("left"), hid.getHand("right")]
    } catch (e) {
      this.hands = []
    }
    return this.hands ?? []
  }

  private getCamera(): Transform | null {
    if (this.camT) return this.camT
    try {
      this.camT = WorldCameraFinderProvider.getInstance().getTransform()
    } catch (e) {
      // not available yet — retry next frame
    }
    return this.camT
  }

  // Advance blockage ramps and resolve each eddy's on-screen centre + swirl axis.
  private stepNodes(dt: number, cx: number, cy: number, cz: number): void {
    for (let i = 0; i < this.nodeCount; i++) {
      const nd = this.nodes[i]
      if (nd.target > nd.s) nd.s = Math.min(nd.target, nd.s + dt / RAMP_IN)
      else if (nd.target < nd.s) nd.s = Math.max(nd.target, nd.s - dt / RAMP_OUT)
      // Keep resolving centres through the release burst, after s has hit 0
      if (nd.s <= 0.0001 && !(this.surge > 0 && nd.used)) continue

      let dx = nd.x - cx
      let dy = nd.y - cy
      let dz = nd.z - cz
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 0.001) {
        dx = 0
        dy = 0
        dz = -1
        d = 1
      }
      nd.ax = dx / d
      nd.ay = dy / d
      nd.az = dz / d
      const cd = this.rangeOnRay(cx, cy, cz, nd.ax, nd.ay, nd.az, d)
      nd.ex = cx + nd.ax * cd
      nd.ey = cy + nd.ay * cd
      nd.ez = cz + nd.az * cd
    }

    // Push coincident eddies apart so three problems never read as one blob.
    for (let i = 0; i < this.nodeCount; i++) {
      const a = this.nodes[i]
      if (!a.used || (a.s <= 0.0001 && this.surge <= 0)) continue
      for (let j = i + 1; j < this.nodeCount; j++) {
        const b = this.nodes[j]
        if (!b.used || (b.s <= 0.0001 && this.surge <= 0)) continue
        let dx = b.ex - a.ex
        let dy = b.ey - a.ey
        let dz = b.ez - a.ez
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d >= NODE_MIN_SEP) continue
        if (d < 0.001) { dx = 1; dy = 0; dz = 0; d = 1 } // exactly coincident
        const push = (NODE_MIN_SEP - d) * 0.5 / d
        a.ex -= dx * push
        a.ey -= dy * push
        a.ez -= dz * push
        b.ex += dx * push
        b.ey += dy * push
        b.ez += dz * push
      }
    }
  }

  // Slab-clip the viewer->marker ray against the particle box and pull the marker's
  // distance into the part of the ray that actually holds particles. Direction is
  // untouched, so the eddy still reads as sitting "at" its marker on screen.
  private rangeOnRay(
    cx: number, cy: number, cz: number,
    ax: number, ay: number, az: number,
    d: number
  ): number {
    let lo = 5
    let hi = 1e9
    // X slab
    if (ax > 1e-5 || ax < -1e-5) {
      const t1 = (-X_BOUND - cx) / ax
      const t2 = (X_BOUND - cx) / ax
      if (t1 < t2) { if (t1 > lo) lo = t1; if (t2 < hi) hi = t2 }
      else { if (t2 > lo) lo = t2; if (t1 < hi) hi = t1 }
    } else if (cx < -X_BOUND || cx > X_BOUND) return this.fallbackRange(d)
    // Y slab
    if (ay > 1e-5 || ay < -1e-5) {
      const t1 = (Y_MIN - cy) / ay
      const t2 = (Y_MAX - cy) / ay
      if (t1 < t2) { if (t1 > lo) lo = t1; if (t2 < hi) hi = t2 }
      else { if (t2 > lo) lo = t2; if (t1 < hi) hi = t1 }
    } else if (cy < Y_MIN || cy > Y_MAX) return this.fallbackRange(d)
    // Z slab — clipped to the FRONT of the panel plane, not the full field depth
    if (az > 1e-5 || az < -1e-5) {
      const t1 = (EDDY_Z_FAR - cz) / az
      const t2 = (Z_MAX - cz) / az
      if (t1 < t2) { if (t1 > lo) lo = t1; if (t2 < hi) hi = t2 }
      else { if (t2 > lo) lo = t2; if (t1 < hi) hi = t1 }
    } else if (cz < EDDY_Z_FAR || cz > Z_MAX) return this.fallbackRange(d)

    if (hi <= lo) return this.fallbackRange(d)
    if (hi - lo <= NODE_EDGE_PAD * 2) return (lo + hi) * 0.5 // sliver — take the middle
    const near = lo + NODE_EDGE_PAD
    const far = hi - NODE_EDGE_PAD
    return d < near ? near : (d > far ? far : d)
  }

  private fallbackRange(d: number): number {
    return d < NODE_MIN_DIST ? NODE_MIN_DIST : (d > NODE_MAX_DIST ? NODE_MAX_DIST : d)
  }

  private update(): void {
    const dt = Math.min(getDeltaTime(), 0.05)
    this.t += dt
    const hands = this.getHands()
    const handCount = hands.length
    const cam = this.getCamera()
    const camPos = cam ? cam.getWorldPosition() : null
    const cx = camPos ? camPos.x : 0
    const cy = camPos ? camPos.y : 0
    const cz = camPos ? camPos.z : 0

    if (this.surge > 0) this.surge = Math.max(0, this.surge - dt / SURGE_TIME)
    // Ease the surge out so the release reads as a breath, not a kick
    const surgeGain = 1 + SURGE_GAIN * this.surge * this.surge
    const burst = this.surge
    this.stepNodes(dt, cx, cy, cz)

    const t = this.t
    for (let pi = 0; pi < this.parts.length; pi++) {
      const p = this.parts[pi]
      if (isNull(p.so)) continue
      const tr = p.tr
      const pos = tr.getWorldPosition()
      const x = pos.x
      const y = pos.y
      const z = pos.z

      // ── The current: one smooth field sampled at the particle's position, so
      // neighbouring particles agree and the motion reads as a single stream.
      let tvx = FLOW_SPEED * (0.6 + 0.5 * Math.sin(FLOW_K * z + FLOW_W * t))
      let tvy = FLOW_SPEED * 0.45 * Math.sin(FLOW_K * 1.3 * x - FLOW_W * 0.8 * t + 1.7) +
        p.riseSpeed * 0.35
      let tvz = FLOW_SPEED * 0.5 * Math.sin(FLOW_K * 2.0 * y + FLOW_W * 0.6 * t)
      // A whisper of individuality so it isn't a rigid conveyor belt
      tvx += Math.sin(t * p.swaySpeed + p.phase) * 0.8

      // ── Blockages: stall the current, swirl about the view axis, crowd inward
      let stag = 0
      let swx = 0
      let swy = 0
      let swz = 0
      for (let n = 0; n < this.nodeCount; n++) {
        const nd = this.nodes[n]
        const bursting = burst > 0 && nd.used
        if (nd.s <= 0.0001 && !bursting) continue
        const rx = x - nd.ex
        const ry = y - nd.ey
        const rz = z - nd.ez
        const r2 = rx * rx + ry * ry + rz * rz
        if (r2 > BLOCK_RADIUS * BLOCK_RADIUS) continue
        const r = Math.sqrt(r2)
        const lin = 1 - r / BLOCK_RADIUS
        const u = lin * lin * (3 - 2 * lin) * nd.s // smooth falloff * ramp
        if (u > stag) stag = u
        // Swirl about the view axis at a capped tangential SPEED, easing in from
        // the core so the very centre doesn't spin on the spot
        const tx = nd.ay * rz - nd.az * ry
        const ty = nd.az * rx - nd.ax * rz
        const tz = nd.ax * ry - nd.ay * rx
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz)
        if (tl > 0.5) {
          const w = (BLOCK_SWIRL * u * (tl < 6 ? tl / 6 : 1)) / tl
          swx += tx * w
          swy += ty * w
          swz += tz * w
        }
        if (r > 0.01) {
          // Crowd toward the blockage — held strong out to the rim (a smoothstep
          // profile is ~0 at the edge and nothing ever gets captured), but bounce
          // out of the very core so particles thicken into a knot, not a point.
          const uPull = nd.s * (0.35 + 0.65 * lin)
          const radial = (r < BLOCK_CORE ? 1.5 : -BLOCK_PULL) * uPull / r
          // Release: the knot bursts outward instead of diffusing over ~15s
          const out = bursting ? (RELEASE_PUSH * burst * lin) / r : 0
          swx += rx * (radial + out)
          swy += ry * (radial + out)
          swz += rz * (radial + out)
        }
      }

      const flowScale = (1 - BLOCK_STALL * stag) * surgeGain
      tvx = tvx * flowScale + swx
      tvy = tvy * flowScale + swy
      tvz = tvz * flowScale + swz

      // Steer onto the current. Stagnant chi is thicker — it grips harder, so
      // particles lose their own momentum faster inside a blockage.
      const steer = Math.min(1, STEER * (1 + 2 * stag) * dt)
      let vx = p.vx + (tvx - p.vx) * steer
      let vy = p.vy + (tvy - p.vy) * steer
      let vz = p.vz + (tvz - p.vz) * steer

      // Hand push: repel from each tracked index tip (impulse; the current
      // reclaims them afterwards)
      for (let hi = 0; hi < handCount; hi++) {
        const hand = hands[hi]
        try {
          if (!hand || !hand.isTracked()) continue
          const hp: vec3 = hand.indexTip.position
          const dx = x - hp.x
          const dy = y - hp.y
          const dz = z - hp.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < PUSH_RADIUS && dist > 0.001) {
            const f = (PUSH_FORCE * (1 - dist / PUSH_RADIUS) * dt) / dist
            vx += dx * f
            vy += dy * f
            vz += dz * f
          }
        } catch (e) {
          // hand data unavailable this frame — ignore
        }
      }

      p.vx = vx
      p.vy = vy
      p.vz = vz

      // Integrate + wrap bounds so the field never empties
      let nx = x + vx * dt
      let ny = y + vy * dt
      let nz = z + vz * dt
      if (nx > X_BOUND) nx = -X_BOUND
      else if (nx < -X_BOUND) nx = X_BOUND
      if (ny > Y_MAX) ny = Y_MIN
      else if (ny < Y_MIN) ny = Y_MAX
      if (nz > Z_MAX) nz = Z_MIN
      else if (nz < Z_MIN) nz = Z_MAX
      this.tmpPos.x = nx
      this.tmpPos.y = ny
      this.tmpPos.z = nz
      tr.setWorldPosition(this.tmpPos)

      // Alive: in-plane twirl (tumbling harder in an eddy) + breathing pulse,
      // thickening toward the core of a blockage
      p.tilt += p.spin * (1 + 1.5 * stag) * dt
      const pulse = 1 + 0.07 * Math.sin(t * 0.9 + p.phase)
      const size = p.baseSize * pulse * (1 + BLOCK_THICKEN * stag)
      this.tmpScale.x = size
      this.tmpScale.y = size
      this.tmpScale.z = 1
      tr.setLocalScale(this.tmpScale)

      // Edge fade — nearest approach to any bound, smoothstepped. Reaches 0 exactly
      // where the wrap teleport happens, so the jump is invisible.
      let edge = (X_BOUND - (nx < 0 ? -nx : nx)) / FADE_MARGIN
      const ey = (ny - Y_MIN < Y_MAX - ny ? ny - Y_MIN : Y_MAX - ny) / FADE_MARGIN
      if (ey < edge) edge = ey
      const ez = (nz - Z_MIN < Z_MAX - nz ? nz - Z_MIN : Z_MAX - nz) / FADE_MARGIN
      if (ez < edge) edge = ez
      if (edge < 0) edge = 0
      else if (edge > 1) edge = 1
      edge = edge * edge * (3 - 2 * edge)

      // Stagnant chi tints toward a dull ember and gains body. Gated so the
      // uniform write only happens when a value actually moved.
      if (
        Math.abs(stag - p.stag) > 0.03 ||
        Math.abs(edge - p.edge) > 0.02 ||
        (stag === 0 && p.stag !== 0)
      ) {
        p.stag = stag
        p.edge = edge
        const c = p.color
        c.x = p.br + (EMBER_R - p.br) * stag
        c.y = p.bg + (EMBER_G - p.bg) * stag
        c.z = p.bb + (EMBER_B - p.bb) * stag
        let a = p.ba * (1 + (EMBER_ALPHA_GAIN - 1) * stag)
        if (a > 1) a = 1
        c.w = a * edge
        p.mat.mainPass.baseColor = c
      }

      // Billboard toward the viewer. LS quat.lookAt aims +Z along `forward`
      // and the quad's visible face is +Z, so pass the TOWARD-camera vector.
      if (camPos) {
        this.tmpToCam.x = cx - nx
        this.tmpToCam.y = cy - ny
        this.tmpToCam.z = cz - nz
        if (this.tmpToCam.length > 1) {
          const face = quat.lookAt(this.tmpToCam.normalize(), vec3.up())
          tr.setWorldRotation(p.tilt !== 0
            ? face.multiply(quat.fromEulerAngles(0, 0, p.tilt))
            : face)
        }
      }
    }
  }
}
