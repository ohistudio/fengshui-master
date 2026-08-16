// FengshuiVoice.ts — the feng shui master's speaking voice.
//
// PRIMARY: Gemini TTS (gemini-2.5-flash-preview-tts) over the same Remote
// Service Gateway transport the rest of the Lens uses, played through the
// AudioOutputProvider streaming path below.
//
// WHY NOT OpenAI. The previous implementation called OpenAI.speech() and got an
// AudioTrackAsset back, so playback was a tidy "assign and play". It was never
// heard by anyone — the only thing ever verified was that the call returned. It
// has been removed rather than kept as a fallback: two speech paths where
// neither is confirmed audible is how this shipped mute in the first place.
//
// FALLBACK: the original ElevenLabs REST path, kept behind its existing key
// guard. That guard has never opened — ELEVEN_KEY is still the placeholder.
//
// Language needs no switch on the model. Gemini TTS is multilingual and infers
// the spoken language from the text it is given, and by the time text reaches
// speak() the string table and the prompt directive have already made it
// English or Chinese. What DOES switch is the style directive below, which must
// match the language of the line — see TTS_INSTRUCTIONS_*.

import {FengshuiGemini} from "./FengshuiGemini"
import {getLang, describeRemoteAuthError} from "./FengshuiStrings"

const TTS_OUTPUT_TRACK = requireAsset("../Audio/TTSAudioOutput.audioOutput") as AudioTrackAsset

// Gemini TTS emits PCM-16 LE mono at this rate, always. Not negotiable, not a
// request parameter — set the provider to anything else and the master speaks
// at the wrong pitch.
const TTS_SAMPLE_RATE = 24000

// ── The master's voice ───────────────────────────────────────────────────────
// One constant, so changing the voice after hearing it is a one-word edit.
// Options: Puck, Charon, Kore, Fenrir, Aoede, Leda, Orus, Zephyr.
// `Charon` is the low, unhurried, informative one — closest to an old master who
// has no need to convince you. Kore (firm) and Orus (firm) read as brisker;
// Puck / Fenrir / Zephyr are bright and upbeat, which fights the calm the app is
// trying to create. Liam's ear decides — change this word and nothing else.
const TTS_VOICE = "Charon"

// Delivery direction. Separate per language on purpose: the same instruction
// read across both produces an English cadence wearing Chinese words, the exact
// failure the prompt directive avoids on the text side. Gemini TTS has no
// instructions parameter — these are PREPENDED to the line as a spoken-style
// prompt, which is how that model is directed.
// ONE clause ending in a colon, not a paragraph of directions. Gemini TTS reads
// a "Say <how>: <what>" prefix as direction and everything after the colon as
// the line; give it three sentences of standalone instruction and it becomes
// ambiguous whether that text is direction or script, and it can be read aloud.
// If the master is ever heard narrating his own stage directions, this constant
// is the culprit — shorten it further or drop it to "" for a plain read.
const TTS_INSTRUCTIONS_EN =
  "Say the following calmly and unhurriedly, as an old feng shui master — " +
  "warm but authoritative, never brisk or theatrical:"
const TTS_INSTRUCTIONS_ZH =
  "请以一位年长风水师的口吻，沉稳从容地说出下面这段话，温和而有威信，不急促、不夸张："

// ── ElevenLabs fallback (unchanged, still gated) ─────────────────────────────
// NOTE: must be a real API key starting with "sk_" (elevenlabs.io -> API Keys).
// The old 64-hex value here was the key *ID* — ElevenLabs stopped accepting IDs
// as of ~Aug 2026 ("api_key_id_used_as_api_key" -> HTTP 400).
const ELEVEN_KEY = "REPLACE_WITH_SK_KEY"
const ELEVEN_VOICE = "av1BMOR1GPgThz9p4fLo" // warm narrator voice (from the DinoLens stack)
const ELEVEN_MODEL = "eleven_v3"

export class FengshuiVoice {
  private provider: any = null
  private audio: AudioComponent | null = null
  private initialized = false
  private inFlight = false
  public muted = false
  private stopEvent: DelayedCallbackEvent | null = null
  private speakN = 0

  /**
   * `script` is here only so the clip-end stop can be scheduled (see playPcm) —
   * a plain class has no createEvent of its own. `gemini` supplies the RSG
   * transport so the voice is authenticated and billed exactly like the words.
   */
  constructor(
    private internetModule: InternetModule,
    host: SceneObject,
    private script: ScriptComponent,
    private gemini: FengshuiGemini,
  ) {
    const so = global.scene.createSceneObject("FengshuiVoiceOut")
    so.setParent(host)
    this.audio = so.createComponent("Component.AudioComponent") as AudioComponent
    this.provider = (TTS_OUTPUT_TRACK as any).control
  }

  private warnedNoKey = false

  speak(text: string): void {
    if (this.muted || !this.audio) return
    const spoken = (text || "").trim()
    if (!spoken) return
    // In-flight guard, kept from the previous implementation and load-bearing:
    // concurrent feeds into the native audio output are what hang the device.
    // A line that arrives mid-clip is dropped, not queued — narration here is
    // one answer at a time, so there is nothing to coalesce.
    if (this.inFlight) {
      print("[FengshuiVoice] speak ignored — a clip is already in flight")
      return
    }

    this.inFlight = true
    const n = ++this.speakN
    const style = getLang() === "zh" ? TTS_INSTRUCTIONS_ZH : TTS_INSTRUCTIONS_EN
    print("[FengshuiVoice] TTS#" + n + " request (" + TTS_VOICE + ", " + getLang() +
      ", " + spoken.length + " chars)")
    this.gemini.ttsPcm(spoken, TTS_VOICE, style)
      .then((pcm: Uint8Array | null) => {
        this.inFlight = false
        if (this.muted) return
        if (!pcm || pcm.length === 0) {
          // Explicit, because "no audio" is the failure that hid for weeks.
          print("[FengshuiVoice] TTS#" + n + " returned NO audio — master stays silent")
          this.speakViaElevenLabs(spoken)
          return
        }
        print("[FengshuiVoice] TTS#" + n + " got " + pcm.length + " bytes (" +
          (pcm.length / (TTS_SAMPLE_RATE * 2)).toFixed(1) + "s)")
        this.playPcm(pcm)
      })
      .catch((e: any) => {
        this.inFlight = false
        // Print the payload, not just "failed" — an RSG rejection here is
        // almost always auth, and the body says so. A silent master is the
        // hardest failure to notice, so it gets the same remedy the assess and
        // scan paths print rather than dying quietly in the log.
        print("[FengshuiVoice] TTS#" + n + " failed: " + e)
        const advice = describeRemoteAuthError(e)
        if (advice) print("[FengshuiVoice] " + advice)
        this.speakViaElevenLabs(spoken)
      })
  }

  // ── Fallback path ──────────────────────────────────────────────────────────

  private speakViaElevenLabs(spoken: string): void {
    if (ELEVEN_KEY.indexOf("sk_") !== 0) {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true
        print("[FengshuiVoice] no ElevenLabs sk_ key — fallback narration unavailable")
      }
      return
    }
    if (this.muted || this.inFlight || !this.provider) return
    this.inFlight = true
    const url = "https://api.elevenlabs.io/v1/text-to-speech/" + ELEVEN_VOICE + "?output_format=pcm_24000"
    const body = JSON.stringify({
      text: spoken,
      model_id: ELEVEN_MODEL,
      voice_settings: {stability: 0.5, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true},
    })
    this.internetModule
      .fetch(url, {method: "POST", headers: {"xi-api-key": ELEVEN_KEY, "Content-Type": "application/json"}, body: body})
      .then((res: any) => {
        if (res.status !== 200) {
          // Surface the API's own error message — a bare status code cost us a
          // debugging round when ElevenLabs started rejecting legacy key IDs.
          res.text().then((t: string) =>
            print("[FengshuiVoice] HTTP " + res.status + ": " + ("" + t).substring(0, 220)))
          return null
        }
        return res.bytes()
      })
      .then((bytes: any) => {
        if (bytes && !this.muted) this.playPcm(bytes)
        this.inFlight = false
      })
      .catch((e: any) => {
        print("[FengshuiVoice] error: " + e)
        this.inFlight = false
      })
  }

  /**
   * PCM-16 LE mono @ 24 kHz -> Float32 -> the streaming AudioOutputProvider.
   *
   * Two details here are the difference between audible and not:
   *
   * 1. play(-1), not play(1). This is a STREAMING track: the provider is a queue
   *    that outputs silence when empty, not a fixed buffer. play(1) means "play
   *    one pass of the source", and on a source that is empty at the instant of
   *    the call — which it is, because enqueueAudioFrame happens after — that is
   *    a pass over nothing. The clip then arrives into a stopped component and
   *    is never heard. -1 keeps the stream open so the audio plays as it lands;
   *    it does NOT replay the clip, because the queue is consumed, not looped.
   * 2. Because -1 leaves the stream open forever, the stop is SCHEDULED at the
   *    clip's own duration (bytes / 2 / sampleRate) rather than left to the
   *    component. Without that the output sits open after the master finishes.
   */
  private playPcm(bytes: Uint8Array): void {
    try {
      if (!this.initialized) {
        this.provider.sampleRate = TTS_SAMPLE_RATE
        this.audio!.audioTrack = TTS_OUTPUT_TRACK
        this.initialized = true
      }
      // Any pending end-of-clip stop belongs to the PREVIOUS line; firing it now
      // would cut this one off mid-sentence.
      this.cancelScheduledStop()
      if (!this.audio!.isPlaying()) this.audio!.play(-1)
      // PCM16 interleaved mono -> Float32
      const safeLength = bytes.length - (bytes.length % 2)
      const mono = new Float32Array(safeLength / 2)
      for (let i = 0, j = 0; i < safeLength; i += 2, j++) {
        const s = ((bytes[i] | (bytes[i + 1] << 8)) << 16) >> 16
        mono[j] = s / 32768.0
      }
      this.diagnosePcm(mono)
      this.provider.enqueueAudioFrame(mono, new vec3(mono.length, 1, 1))
      const seconds = mono.length / TTS_SAMPLE_RATE
      this.scheduleStop(seconds + 0.4) // small tail so the last word isn't clipped
      print("[FengshuiVoice] enqueued " + mono.length + " samples (" +
        seconds.toFixed(1) + "s) — speaking")
    } catch (e) {
      print("[FengshuiVoice] play error: " + e)
    }
  }

  /**
   * TEMPORARY DIAGNOSTIC — safe to delete once the voice has been heard.
   *
   * Exists because "the request returned bytes" is the same weak evidence that
   * let the previous silent implementation ship. This checks the bytes are
   * actually plausible mono speech:
   *
   *  • rms/peak      — non-silent at a sane level (silence would be ~0).
   *  • zcr           — zero crossings per second. Speech sits ~500-3000; a few
   *                    tens means DC/rumble, ~10k+ means noise or garbage.
   *  • adjacent vs 2-apart mean delta — the mono/stereo test. In real mono the
   *    waveform is smooth, so neighbours differ LESS than samples two apart
   *    (d1 < d2). If the stream were interleaved stereo being misread as mono,
   *    neighbours would be opposite channels and samples two apart would be the
   *    same channel — inverting it to d2 < d1, and the clip would play at half
   *    speed and an octave low. That inversion is the thing to look for.
   */
  private diagnosePcm(mono: Float32Array): void {
    try {
      const n = Math.min(mono.length, TTS_SAMPLE_RATE * 4) // first ~4s is plenty
      if (n < 64) return
      let sumSq = 0, peak = 0, crossings = 0, d1 = 0, d2 = 0
      for (let i = 0; i < n; i++) {
        const v = mono[i]
        sumSq += v * v
        const a = v < 0 ? -v : v
        if (a > peak) peak = a
        if (i > 0 && ((mono[i - 1] < 0 && v >= 0) || (mono[i - 1] >= 0 && v < 0))) crossings++
        if (i + 2 < n) {
          const e1 = mono[i + 1] - v
          const e2 = mono[i + 2] - v
          d1 += e1 < 0 ? -e1 : e1
          d2 += e2 < 0 ? -e2 : e2
        }
      }
      const rms = Math.sqrt(sumSq / n)
      const zcr = crossings / (n / TTS_SAMPLE_RATE)
      const md1 = d1 / n
      const md2 = d2 / n
      print("[FengshuiVoice] pcm check: rms=" + rms.toFixed(4) +
        " peak=" + peak.toFixed(3) +
        " zcr=" + zcr.toFixed(0) + "/s" +
        " d1=" + md1.toFixed(5) + " d2=" + md2.toFixed(5) +
        " -> " + (md1 < md2 ? "MONO ok" : "SUSPECT interleaved/stereo"))
    } catch (e) {
      print("[FengshuiVoice] pcm check failed: " + e)
    }
  }

  // Deliberately NOT interruptAudioOutput()/stop-on-arrival. Clearing the native
  // output while a feed is in flight hangs the device (learned on DinoLens);
  // clips are left to finish and the stop is scheduled at their natural end.
  private scheduleStop(seconds: number): void {
    try {
      const ev = this.script.createEvent("DelayedCallbackEvent")
      ev.bind(() => {
        this.stopEvent = null
        try {
          if (this.audio && this.audio.isPlaying()) this.audio.stop(false)
        } catch (e) {}
      })
      ev.reset(seconds)
      this.stopEvent = ev
    } catch (e) {
      print("[FengshuiVoice] could not schedule clip end: " + e)
    }
  }

  private cancelScheduledStop(): void {
    if (this.stopEvent) {
      try { this.stopEvent.reset(-1) } catch (e) {}
      this.stopEvent = null
    }
  }
}
