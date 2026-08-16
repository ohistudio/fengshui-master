// FengshuiHistory.ts — local chi-score history via PersistentStorageSystem.
// Per-device, offline, zero setup. (Snap Cloud is the upgrade path for cross-device.)

const STORE_KEY = "fengshui_history_v1"

export type ChiEntry = {t: number; score: number}

export class FengshuiHistory {
  private entries: ChiEntry[] = []

  constructor() {
    try {
      const raw = global.persistentStorageSystem.store.getString(STORE_KEY)
      if (raw) this.entries = JSON.parse(raw) as ChiEntry[]
    } catch (e) {
      this.entries = []
    }
  }

  record(score: number): void {
    this.entries.push({t: Date.now(), score: score})
    if (this.entries.length > 60) this.entries = this.entries.slice(-60)
    try {
      global.persistentStorageSystem.store.putString(STORE_KEY, JSON.stringify(this.entries))
    } catch (e) {
      print("[FengshuiHistory] save failed: " + e)
    }
  }

  best(): number | null {
    if (this.entries.length === 0) return null
    return this.entries.reduce((m, e) => Math.max(m, e.score), 0)
  }

  // Last score BEFORE the current session's newest entry (or newest overall)
  last(): number | null {
    if (this.entries.length === 0) return null
    return this.entries[this.entries.length - 1].score
  }

  count(): number {
    return this.entries.length
  }

  // One compact line for the gauge, e.g. "Best 84 · Last 62 · 5 scans"
  summaryLine(): string {
    if (this.entries.length === 0) return ""
    return "Best " + this.best() + " · Last " + this.last() + " · " + this.entries.length + " scans"
  }
}
