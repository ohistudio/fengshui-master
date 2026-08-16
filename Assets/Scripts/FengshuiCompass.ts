// FengshuiCompass.ts — device compass heading for bagua-aware feng shui advice.
// RawLocationModule provides north-aligned head orientation on Specs (needs the
// user logged in + paired with location permission; unavailable in the editor —
// facing() returns null and the analyze prompt simply omits the direction).

require("LensStudio:RawLocationModule") // permission declaration

const DIRECTIONS = [
  "north", "northeast", "east", "southeast",
  "south", "southwest", "west", "northwest",
]

export class FengshuiCompass {
  private headingDeg_: number | null = null

  // Call from an OnStartEvent handler (location service lifecycle rule)
  start(): void {
    if (global.deviceInfoSystem.isEditor()) {
      // no heading in preview — and the GPS service spams warnings there
      return
    }
    try {
      const svc = GeoLocation.createLocationService()
      svc.accuracy = GeoLocationAccuracy.Navigation
      svc.onNorthAlignedOrientationUpdate.add((orientation: quat) => {
        try {
          this.headingDeg_ = GeoLocation.getNorthAlignedHeading(orientation)
        } catch (e) {
          // ignore per-update failures
        }
      })
    } catch (e) {
      print("[FengshuiCompass] unavailable (editor / no permission): " + e)
    }
  }

  /**
   * Raw north-aligned heading in degrees, or null when unknown (editor / no
   * permission). The pan scan gates its capture cadence on the CHANGE in this
   * value, so it needs the number rather than the 8-way bucket.
   */
  headingDeg(): number | null {
    return this.headingDeg_
  }

  /** 8-way compass name for an arbitrary heading (used per pan frame). */
  static nameFor(headingDeg: number): string {
    const h = ((headingDeg % 360) + 360) % 360
    return DIRECTIONS[Math.round(h / 45) % 8]
  }

  // 8-way compass name of the current gaze direction, or null when unknown
  facing(): string | null {
    if (this.headingDeg_ === null) return null
    return FengshuiCompass.nameFor(this.headingDeg_)
  }
}
