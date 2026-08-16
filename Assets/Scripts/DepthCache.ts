// Copyright 2026 Specs Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * DepthCache — depth + color frame snapshot cache for pixel-to-world projection.
 * Ported from the current specs-devs/samples "Depth Cache" sample (logger/decorator
 * deps replaced with plain prints), plus two convenience helpers at the bottom.
 *
 * Editor preview: the camera side runs (Default_Color, small request) so the whole
 * pipeline stays warm, but the platform does NOT deliver depth frames in preview —
 * saveDepthFrame() returns -1 there and callers fall back. Test depth on device.
 * Device: depth is aligned to the LEFT camera; if the left color feed delivers
 * nothing (some units), auto-falls back to Right_Color (slight stereo offset).
 *
 * NOTE: device depth requires Project Settings -> "Allow Experimental API"
 * (the official sample's .esproj declares EXPERIMENTAL_API).
 */

class ColorCameraFrame {
  public imageFrame: Texture
  public colorTimestampSeconds: number
  constructor(imageFrame: Texture, colorTimestamp: number) {
    this.imageFrame = imageFrame
    this.colorTimestampSeconds = colorTimestamp
  }
}

class DepthColorPair {
  public colorCameraFrame: ColorCameraFrame
  public depthFrameData: Float32Array
  public depthDeviceCamera: DeviceCamera
  public depthTimestampSeconds: number
  public depthCameraPose: mat4
  constructor(
    colorCameraFrame: ColorCameraFrame,
    depthFrameData: Float32Array,
    depthDeviceCamera: DeviceCamera,
    depthTimestampSeconds: number,
    depthCameraPose: mat4
  ) {
    this.colorCameraFrame = colorCameraFrame
    this.depthFrameData = depthFrameData
    this.depthDeviceCamera = depthDeviceCamera
    this.depthTimestampSeconds = depthTimestampSeconds
    this.depthCameraPose = depthCameraPose
  }
}

@component
export class DepthCache extends BaseScriptComponent {
  @input
  @hint("Camera module used to request the color camera feed")
  camModule: CameraModule

  private colorCamera: string = "Left"
  private colorDeviceCamera: DeviceCamera
  private depthModule = require("LensStudio:DepthModule") as DepthModule
  private depthFrameSession: DepthFrameSession = null
  private isEditor = global.deviceInfoSystem.isEditor()
  private camTexture: Texture
  private camFrameHistory: ColorCameraFrame[] = []

  private latestCameraDepthPair: DepthColorPair = null
  private cachedDepthFrames: Map<number, DepthColorPair> = new Map<number, DepthColorPair>()

  // Frame-delivery instrumentation (one probe line at ~5s, then ~1Hz depth log)
  private depthFrameCount = 0
  private camFrameCount = 0
  private lastDepthLogTimeSec = 0

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  private onStart() {
    this.startCameraUpdates()
    this.startDepthUpdate()

    // If no frames have arrived a few seconds in, the platform is not
    // delivering them (vs. a lens-side bug). Reports once at ~5s.
    const probe = this.createEvent("DelayedCallbackEvent")
    probe.bind(() => {
      print(
        "[DepthCacheDebug] 5s after start: " + this.depthFrameCount + " depth frame(s), " +
        this.camFrameCount + " camera frame(s) received. " +
        (this.depthFrameCount === 0
          ? "NO depth frames — platform is not delivering DepthFrameData (expected in editor preview; test on device)."
          : this.camFrameCount === 0
            ? "Depth OK but NO camera frames — pairing cannot happen."
            : this.latestCameraDepthPair == null
              ? "Both streams OK but no pair formed yet — check findClosestCameraFrame."
              : "Pipeline OK — depth/color pairs are forming.")
      )
      // On device, some units do not deliver the left color feed. If depth is
      // flowing but the camera is silent and we started on Left, retry with
      // Right. (In the editor we use Default_Color, so this does not apply.)
      if (!this.isEditor && this.depthFrameCount > 0 && this.camFrameCount === 0 && this.colorCamera !== "Right") {
        print("[DepthCacheDebug] Left color camera delivered nothing — falling back to Right_Color.")
        this.colorCamera = "Right"
        this.requestCameraFeed(CameraModule.CameraId.Right_Color)
      }
    })
    probe.reset(5.0)
  }

  /**
   * Saves the latest depth/color pair and returns its ID, or -1 when no pair
   * has been captured yet (depth frames arrive ~5hz on device; none in editor).
   */
  saveDepthFrame(): number {
    if (this.latestCameraDepthPair == null) {
      print("[DepthCache] no depth/color pair yet (none is expected in editor preview)")
      return -1
    }
    const depthFrameID = Date.now()
    this.cachedDepthFrames.set(depthFrameID, this.latestCameraDepthPair)
    return depthFrameID
  }

  getCamImageWithID(depthFrameID: number): Texture | null {
    const pair = this.cachedDepthFrames.get(depthFrameID)
    return pair ? pair.colorCameraFrame.imageFrame : null
  }

  /** Most recent color camera frame, independent of depth (works in editor). */
  getLatestCamImage(): Texture | null {
    if (this.camFrameHistory.length === 0) return null
    return this.camFrameHistory[this.camFrameHistory.length - 1].imageFrame
  }

  /** True when at least one depth+color pair has arrived (device only). */
  hasDepth(): boolean {
    return this.latestCameraDepthPair != null
  }

  /**
   * Convenience: same as getWorldPositionWithID but takes NORMALIZED (0-1) color
   * UV instead of pixels — matches what vision models like Gemini return.
   */
  getWorldPositionNormalized(uv: vec2, depthFrameID: number): vec3 | null {
    if (!this.colorDeviceCamera) return null
    return this.getWorldPositionWithID(uv.mult(this.colorDeviceCamera.resolution), depthFrameID)
  }

  getWorldPositionWithID(pixelPos: vec2, depthFrameID: number): vec3 | null {
    const pair = this.cachedDepthFrames.get(depthFrameID)
    if (pair == null) return null

    // Remap color-frame pixel -> depth-frame UV (depth is a cropped/downscaled
    // view aligned with the left camera).
    const normalizedColor = pixelPos.div(this.colorDeviceCamera.resolution)
    const pointInCamSpace = this.colorDeviceCamera.unproject(normalizedColor, 100.0)
    const normalizedDepth = pair.depthDeviceCamera.project(pointInCamSpace)
    if (!this.isNormalizedPointInImage(normalizedDepth)) return null

    const depthPixel = normalizedDepth.mult(pair.depthDeviceCamera.resolution)
    const depthVal = this.getMedianDepth(
      pair.depthFrameData,
      pair.depthDeviceCamera.resolution.x,
      pair.depthDeviceCamera.resolution.y,
      Math.floor(depthPixel.x),
      Math.floor(depthPixel.y),
      1
    )
    if (depthVal == null) return null

    const pointInDeviceRef = pair.depthDeviceCamera.unproject(normalizedDepth, depthVal)
    return pair.depthCameraPose.multiplyPoint(pointInDeviceRef)
  }

  disposeDepthFrame(depthFrameID: number) {
    this.cachedDepthFrames.delete(depthFrameID)
  }

  private getMedianDepth(
    depthData: Float32Array,
    width: number,
    height: number,
    x: number,
    y: number,
    radius: number
  ): number | null {
    // Radius 1 = 3x3 window; skips zero/invalid samples; robust to depth holes.
    const xi = Math.round(x)
    const yi = Math.round(y)
    const samples: number[] = []
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = xi + dx, ny = yi + dy
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const val = depthData[nx + ny * width]
          if (val > 0) samples.push(val)
        }
      }
    }
    if (samples.length === 0) return null
    samples.sort((a, b) => a - b)
    const mid = Math.floor(samples.length / 2)
    return samples.length % 2 === 0 ? (samples[mid - 1] + samples[mid]) / 2 : samples[mid]
  }

  private startCameraUpdates() {
    // The editor preview only simulates the Default_Color camera; the stereo
    // Left/Right feeds are device-only. On device, depth is aligned to Left.
    const camId = this.isEditor
      ? CameraModule.CameraId.Default_Color
      : this.colorCamera === "Right"
        ? CameraModule.CameraId.Right_Color
        : CameraModule.CameraId.Left_Color
    this.requestCameraFeed(camId)
  }

  private requestCameraFeed(camId: CameraModule.CameraId) {
    const camRequest = CameraModule.createCameraRequest()
    camRequest.cameraId = camId
    // The editor Preview needs a smaller request to deliver frames reliably.
    camRequest.imageSmallerDimension = this.isEditor ? 352 : 756
    this.camTexture = this.camModule.requestCamera(camRequest)
    const camTexControl = this.camTexture.control as CameraTextureProvider
    camTexControl.onNewFrame.add((frame: CameraFrame) => {
      this.camFrameCount++
      this.camFrameHistory.push(new ColorCameraFrame(this.camTexture.copyFrame(), frame.timestampSeconds))
      // Cam frames ~30hz, depth ~5hz — keep a short rolling window for pairing.
      if (this.camFrameHistory.length > 5) this.camFrameHistory.shift()
    })
    this.colorDeviceCamera = global.deviceInfoSystem.getTrackingCameraForId(camId)
  }

  private startDepthUpdate() {
    this.depthFrameSession = this.depthModule.createDepthFrameSession()
    this.depthFrameSession.onNewFrame.add((depthFrameData: DepthFrameData) => {
      this.depthFrameCount++
      const nowSec = getTime()
      if (this.depthFrameCount === 1 || nowSec - this.lastDepthLogTimeSec >= 1.0) {
        this.lastDepthLogTimeSec = nowSec
        const res = depthFrameData.deviceCamera.resolution
        print("[DepthCacheDebug] depth frame #" + this.depthFrameCount +
          " res=" + res.x + "x" + res.y + ", paired=" + (this.latestCameraDepthPair != null))
      }
      const closestFrame = this.findClosestCameraFrame(depthFrameData)
      if (closestFrame == null) return
      // Deep-copy: depthFrame buffer and pose matrix get reused by the runtime.
      this.latestCameraDepthPair = new DepthColorPair(
        closestFrame,
        depthFrameData.depthFrame.slice(),
        depthFrameData.deviceCamera,
        depthFrameData.timestampSeconds,
        mat4.fromColumns(
          depthFrameData.toWorldTrackingOriginFromDeviceRef.column0,
          depthFrameData.toWorldTrackingOriginFromDeviceRef.column1,
          depthFrameData.toWorldTrackingOriginFromDeviceRef.column2,
          depthFrameData.toWorldTrackingOriginFromDeviceRef.column3
        )
      )
    })
    this.depthFrameSession.start()
  }

  private findClosestCameraFrame(depthFrame: DepthFrameData, maxOffset = 0.001): ColorCameraFrame | null {
    if (!this.camFrameHistory || this.camFrameHistory.length === 0) return null
    const closest = this.camFrameHistory.reduce((c, cur) =>
      Math.abs(cur.colorTimestampSeconds - depthFrame.timestampSeconds) <
      Math.abs(c.colorTimestampSeconds - depthFrame.timestampSeconds) ? cur : c
    )
    return Math.abs(closest.colorTimestampSeconds - depthFrame.timestampSeconds) <= maxOffset
      ? closest
      : this.camFrameHistory[this.camFrameHistory.length - 1]
  }

  private isNormalizedPointInImage(p: vec2): boolean {
    return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  }
}
