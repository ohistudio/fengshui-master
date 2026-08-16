// FengshuiVoice.ts — the feng shui master's speaking voice.
//
// PRIMARY: OpenAI TTS through the Remote Service Gateway. OpenAI.speech() hands
// back a ready AudioTrackAsset, so playback is just "assign and play" — none of
// the PCM-16 decode-and-enqueue plumbing the ElevenLabs path needs.
//
// FALLBACK: the original ElevenLabs REST path, kept behind its existing key
// guard. That guard has never opened — ELEVEN_KEY is still the placeholder — so
// in practice this file going live is the FIRST time the master is audible at
// all. Worth knowing when judging whether the voice sounds right: there is no
// previous behaviour to compare against.
//
// Language needs no switch here. OpenAI TTS infers the spoken language from the
// text it is given, and by the time text reaches speak() the string table and
// the prompt directive have already made it English or Chinese. Passing a
// locale as well would be a second source of truth for something already
// decided upstream.

import {OpenAI} from "RemoteServiceGateway.lspkg/HostedExternal/OpenAI"
import {getLang, describeRemoteAuthError} from "./FengshuiStrings"

const TTS_OUTPUT_TRACK = requireAsset("../Audio/TTSAudioOutput.audioOutput") as AudioTrackAsset

// ── The master's voice ───────────────────────────────────────────────────────
// One constant, so changing the voice after hearing it is a one-word edit.
// Options: alloy, echo, fable, onyx, nova, shimmer, sage, verse.
// `sage` over `onyx`: onyx is a deep broadcast-announcer voice that reads as
// authoritative-by-volume, which fights the calm the app is trying to create.
// sage is measured and unhurried — a master who has no need to convince you.
const TTS_VOICE = "sage"
// gpt-4o-mini-tts is the only speech model that honours `instructions`, which is
// what lets the delivery be directed rather than merely selected.
const TTS_MODEL = "gpt-4o-mini-tts"

// Delivery direction. Separate per language on purpose: the same instruction
// read across both produces an English cadence wearing Chinese words, the exact
// failure the prompt directive avoids on the text side.
const TTS_INSTRUCTIONS_EN =
  "Speak as an old feng shui master: calm, unhurried, warm but authoritative. " +
  "Measured pace, gentle downward cadence at the end of sentences. " +
  "Never brisk, never salesy, never theatrical."
const TTS_INSTRUCTIONS_ZH =
  "以一位年长风水师的口吻说话：沉稳、从容、温和而有威信。" +
  "语速平缓，句尾语调自然下沉，带有传统中文的说话节奏。" +
  "不急促，不推销，不夸张。"

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

  constructor(private internetModule: InternetModule, host: SceneObject) {
    const so = global.scene.createSceneObject("FengshuiVoiceOut")
    so.setParent(host)
    this.audio = so.createComponent("Component.AudioComponent") as AudioComponent
    this.provider = (TTS_OUTPUT_TRACK as any).control
  }

  private warnedNoKey = false

  speak(text: string): void {
    if (this.muted || this.inFlight || !this.audio) return
    const spoken = (text || "").trim()
    if (!spoken) return

    this.inFlight = true
    OpenAI.speech({
      model: TTS_MODEL,
      input: spoken,
      voice: TTS_VOICE,
      instructions: getLang() === "zh" ? TTS_INSTRUCTIONS_ZH : TTS_INSTRUCTIONS_EN,
      // mp3 is what loadResourceAsAudioTrackAsset handles most reliably, and the
      // clip is one-shot narration — the bitrate saving of opus buys nothing.
      response_format: "mp3",
    })
      .then((track: AudioTrackAsset) => {
        this.inFlight = false
        if (this.muted || !track) return
        this.playTrack(track)
      })
      .catch((e: any) => {
        this.inFlight = false
        // Print the payload, not just "failed" — an RSG rejection here is
        // almost always auth, and the body says so. A silent master is the
        // hardest failure to notice, so it gets the same remedy the assess and
        // scan paths print rather than dying quietly in the log.
        print("[FengshuiVoice] OpenAI TTS failed: " + e)
        const advice = describeRemoteAuthError(e)
        if (advice) print("[FengshuiVoice] " + advice)
        this.speakViaElevenLabs(spoken)
      })
  }

  /** Assign-and-play. One clip at a time — never loop narration. */
  private playTrack(track: AudioTrackAsset): void {
    try {
      const a = this.audio!
      if (a.isPlaying()) a.stop(false)
      a.audioTrack = track
      a.play(1)
      print("[FengshuiVoice] speaking (" + TTS_VOICE + ", " + getLang() + ")")
    } catch (e) {
      print("[FengshuiVoice] play error: " + e)
    }
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

  private playPcm(bytes: Uint8Array): void {
    try {
      if (!this.initialized) {
        this.provider.sampleRate = 24000
        this.audio!.audioTrack = TTS_OUTPUT_TRACK
        this.initialized = true
      }
      if (!this.audio!.isPlaying()) this.audio!.play(1) // play ONCE per clip — never loop
      // PCM16 interleaved mono -> Float32
      const safeLength = bytes.length - (bytes.length % 2)
      const mono = new Float32Array(safeLength / 2)
      for (let i = 0, j = 0; i < safeLength; i += 2, j++) {
        const s = ((bytes[i] | (bytes[i + 1] << 8)) << 16) >> 16
        mono[j] = s / 32768.0
      }
      this.provider.enqueueAudioFrame(mono, new vec3(mono.length, 1, 1))
    } catch (e) {
      print("[FengshuiVoice] play error: " + e)
    }
  }
}
