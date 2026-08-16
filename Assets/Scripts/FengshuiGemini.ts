// FengshuiGemini.ts — direct Gemini REST calls via InternetModule.fetch.
// Prompts are the proven set from the July 12 API demo (verbatim analyze prompt;
// improve prompt uses remove/add/replace only + explicit preserve list).
// NOTE: baked API key = prototype only. Swap to Remote Service Gateway before publishing.

export type FengshuiEdit = {action: string; object: string; placement: string; constraint: string; todo?: string}
// `frame` is populated ONLY by the pan scan (analyzeRoomPan) — it says which of
// the spin-captured photos the problem was seen in, so the marker can be placed
// against that frame's camera pose. The single-shot analyze path never sets it.
export type FengshuiProblem = {
  title: string; detail: string; point?: {x: number; y: number}; frame?: number
}
export type FengshuiShopItem = {item: string; reason: string; search: string}
// Wu xing — the five elements. Weights are 0-100 describing the room's current
// elemental balance; `note` names the deficient or dominant one in a short line.
export type FengshuiElements = {
  wood: number
  fire: number
  earth: number
  metal: number
  water: number
  note?: string
}
export type FengshuiAnalysis = {
  score: number
  problems: FengshuiProblem[]
  edits: FengshuiEdit[]
  preserve: string[]
  shopping?: FengshuiShopItem[]
  // Optional so a model that omits it can never fail the whole analysis parse
  elements?: FengshuiElements
  // Pan scan only — the master's spoken verdict on the room as a whole, and one
  // remark per captured view. Absent on the single-shot analyze path.
  overall?: string
  views?: FengshuiView[]
}
export type QAResult = {passCount: number; total: number; failedEdits: number[]}
// Per-captured-view commentary — pan scan only. Lets the user page through the
// photos the scan actually took and hear what the master makes of each one.
export type FengshuiView = {frame: number; title: string; note: string}

import {Gemini} from "RemoteServiceGateway.lspkg/HostedExternal/Gemini"
import {
  RemoteServiceGatewayCredentials, AvaliableApiTypes,
} from "RemoteServiceGateway.lspkg/RemoteServiceGatewayCredentials"
import {getLang} from "./FengshuiStrings"

// Transport switch. true  = Snap's Remote Service Gateway (billed to Snap; needs a
//                           fresh GOOGLE-spec token on the RSGCredentials object).
//                  false = direct REST with the baked personal key below.
// Flip to false only if RSG is down — the personal key is currently 429'd on its
// monthly spend cap, so it is NOT a working fallback today.
const USE_RSG = true
// Personal AI Studio key — prototype only, and now only used when USE_RSG is false.
// ROTATE THIS: it is live and in plaintext in version control.
const API_KEY = "REPLACE_WITH_GOOGLE_AI_STUDIO_KEY"
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/"
const ANALYZE_MODEL = "gemini-2.5-flash"
const IMAGE_MODEL = "gemini-3.1-flash-image"
// Speech. Outputs PCM-16 LE mono at a FIXED 24 kHz — that rate is not a request
// parameter, it is the model's contract, and it is why FengshuiVoice hardcodes
// 24000 on the audio output provider. Multilingual: the spoken language follows
// the language of the input text, so the 中文 mode needs no separate voice.
const TTS_MODEL = "gemini-2.5-flash-preview-tts"

// Verbatim from the proven demo pipeline
const ANALYZE_PROMPT =
  'You are a feng shui master analyzing this room for an AR app. Respond with JSON only, no markdown fences: ' +
  '{"score": <0-100>, "problems": [3 items: {"title": 2-5 words, ' +
  '"detail": 2-3 full sentences, 180-280 characters — name what you actually see, ' +
  'explain why it blocks chi, and say what the room feels like because of it, ' +
  '"point": {"x": <0-1 fraction from left edge>, "y": <0-1 fraction from top edge>} locating the problem in the photo}], ' +
  '"edits": [3 image-edit instructions; strongly prefer remove/add/replace over move; each: ' +
  '{"action": "remove|add|replace", "object": exact visible object with color/material, ' +
  '"placement": exact spatial location in the photo, "constraint": size limit or what must not be disturbed, ' +
  '"todo": clear imperative instruction a human can act on in their real room, ' +
  '1-2 sentences up to 170 characters — say what to move/remove/add AND where it should end up}], ' +
  '"preserve": [notable objects/beings in the photo that must stay exactly as they are, e.g. pets, people, the view], ' +
  '"shopping": [3 items worth buying to lift the chi: {"item": product name 2-4 words, ' +
  '"reason": why it improves THIS room specifically — reference something you can ' +
  'see in the photo, 1-2 sentences up to 150 characters, ' +
  '"search": a web search query to buy it}], ' +
  '"elements": {"wood": <0-100>, "fire": <0-100>, "earth": <0-100>, "metal": <0-100>, ' +
  '"water": <0-100>, "note": one short sentence naming which of the five elements ' +
  'is most deficient or most dominant in this room, max 48 characters} ' +
  '— the wu xing weights describe how strongly each element is currently expressed ' +
  'in the room (materials, colours, shapes, light), NOT how much it is needed}'

/**
 * The one language instruction, appended to every prompt whose output a human
 * reads. Deliberately a single function rather than a clause pasted into each
 * prompt — five copies would drift, and a prompt that quietly missed the
 * directive would return English into a Chinese UI.
 *
 * Applied to: analyzeRoom, analyzeRoomPan, describeViews, askMaster — i.e.
 * problem titles/details, edit todos, shopping reasons, the element note, the
 * per-view commentary and the master's spoken answers.
 *
 * NOT applied to two prompts, on purpose:
 *   • buildImprovePrompt — its audience is the image model, not a person. It
 *     emits pixels, no readable text, and image models follow English edit
 *     instructions more reliably. Translating it would cost fidelity and buy
 *     nothing.
 *   • verifyEdits — pure internal QA. Its PASS/FAIL `reason` never reaches the
 *     screen (the visible line is composed in code from the pass count), so
 *     keeping it English keeps the check stable.
 *
 * On register: the instruction asks for composition in Chinese rather than
 * translation. A literal rendering of the English produces a master who speaks
 * English grammar in Chinese words — fluent-looking and completely wrong in
 * voice. The tradition has its own vocabulary (气、五行、八卦、财位) and a more
 * formal register, and asking for it directly is what gets it.
 *
 * The character limits in the prompts were written for English. Chinese carries
 * far more meaning per character, so the same count would produce wildly
 * overlong text; the directive scales them down explicitly.
 */
function langDirective(): string {
  if (getLang() !== "zh") return ""
  return " LANGUAGE — IMPORTANT: Write every human-readable string value in " +
    "Simplified Chinese (简体中文). Keep every JSON KEY in English, spelled exactly " +
    "as specified above, and keep enum values such as remove/add/replace and " +
    "PASS/FAIL in English. Do not translate from English — compose directly in " +
    "Chinese, in the voice of a Chinese feng shui master (风水师) speaking to a " +
    "client: authoritative, measured, faintly literary. Use the tradition's own " +
    "vocabulary where it fits naturally (气、气场、五行、八卦、财位、明堂、藏风聚气) " +
    "rather than calques of English terms, and avoid English loanwords and " +
    "English sentence structure. " +
    "All character limits stated above were written for English; Chinese conveys " +
    "far more per character, so treat them as roughly 40% of the stated number " +
    "(e.g. a 180-280 character English field should be about 70-110 Chinese " +
    "characters). Being under the limit is always correct."
}

export class FengshuiGemini {
  constructor(private internetModule: InternetModule) {}

  async analyzeRoom(jpegB64: string, facing?: string | null): Promise<FengshuiAnalysis> {
    // Bagua awareness: when the device compass knows which way the photo faces,
    // tell the master so problems/edits can reference real compass directions.
    let prompt = ANALYZE_PROMPT
    if (facing) {
      prompt += " The camera is facing " + facing + ". Apply classical feng shui compass " +
        "(bagua) wisdom: reference the actual compass directions of objects in your " +
        "problems and edits where relevant (e.g. wealth corner, career north). " +
        "At least one problem detail and one edit todo MUST explicitly name a compass " +
        "direction or bagua area."
    }
    prompt += langDirective()
    // The enlarged schema occasionally comes back as malformed JSON even in
    // responseMimeType json mode — sanitize hard, and re-request ONCE on a
    // parse failure before surfacing (mirrors the QA-retry pattern; the caller's
    // "Consulting…" status holds through the retry).
    let lastError: any = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await this.post(ANALYZE_MODEL, {
        contents: [{
          role: "user",
          parts: [
            {inlineData: {mimeType: "image/jpeg", data: jpegB64}},
            {text: prompt},
          ],
        }],
        generationConfig: {responseMimeType: "application/json"},
      })
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        lastError = new Error("empty analysis response")
        print("[FengshuiGemini] empty analysis response (attempt " + (attempt + 1) + "/2)")
        continue
      }
      try {
        const parsed = JSON.parse(this.sanitizeJson(text)) as FengshuiAnalysis
        if (typeof parsed.score !== "number" || !parsed.problems || !parsed.edits) {
          throw new Error("analysis JSON missing fields")
        }
        return parsed
      } catch (e) {
        lastError = e
        print("[FengshuiGemini] analysis parse failed (attempt " + (attempt + 1) + "/2): " + e +
          " — raw[0..200]: " + ("" + text).substring(0, 200))
      }
    }
    throw lastError ?? new Error("analysis failed")
  }

  /**
   * PAN SCAN — one whole-room reading from N photos taken by turning on the
   * spot. Separate from analyzeRoom() on purpose: the single-shot path is a
   * proven, load-bearing pipeline and is left exactly as it was.
   *
   * All frames go in ONE generateContent call (multiple inlineData parts), so
   * this is still a single remote request — never N concurrent ones.
   *
   * Same JSON schema as analyzeRoom plus a `frame` index on each problem, so
   * markers can be projected through the pose of the frame they were seen in.
   */
  async analyzeRoomPan(frames: string[], headings: (string | null)[]): Promise<FengshuiAnalysis> {
    const n = frames.length
    const frameList = frames
      .map((_, i) => "frame " + (i + 1) + (headings[i] ? " (facing " + headings[i] + ")" : ""))
      .join(", ")
    let prompt =
      "You are a feng shui master. The " + n + " attached photos are consecutive views of " +
      "ONE room, captured by the user turning slowly on the spot: " + frameList + ". " +
      "Together they cover the whole room. Read them as a single space — judge the room " +
      "as a whole, and prefer problems about the ROOM's overall layout, flow and balance " +
      "(how chi travels between the areas you see across frames) over anything visible in " +
      "only one frame. Do not describe the same object twice under different names. " +
      'Respond with JSON only, no markdown fences: ' +
      '{"score": <0-100 for the whole room>, "problems": [3 items: {"title": 2-5 words, ' +
      '"detail": 2-3 full sentences, 180-280 characters — name what you actually see, ' +
      'explain why it blocks chi, and say what the room feels like because of it, ' +
      '"frame": <which photo number, 1-' + n + ', this problem is most visible in>, ' +
      '"point": {"x": <0-1 fraction from left edge>, "y": <0-1 fraction from top edge>} ' +
      'locating the problem WITHIN that frame}], ' +
      '"edits": [3 changes: {"action": "remove|add|replace", ' +
      '"object": exact visible object with color/material, ' +
      '"placement": exact spatial location including which frame it is in, ' +
      '"constraint": size limit or what must not be disturbed, ' +
      '"todo": clear imperative instruction a human can act on in their real room, ' +
      '1-2 sentences up to 170 characters}], ' +
      '"preserve": [notable objects/beings that must stay exactly as they are], ' +
      '"shopping": [3 items worth buying to lift the chi: {"item": product name 2-4 words, ' +
      '"reason": why it improves THIS room specifically — reference something you can ' +
      'see, 1-2 sentences up to 150 characters, "search": a web search query to buy it}], ' +
      '"elements": {"wood": <0-100>, "fire": <0-100>, "earth": <0-100>, "metal": <0-100>, ' +
      '"water": <0-100>, "note": one short sentence naming which of the five elements ' +
      'is most deficient or most dominant across the whole room, max 48 characters}} ' +
      "— the wu xing weights describe how strongly each element is expressed in the room " +
      "(materials, colours, shapes, light), NOT how much it is needed."
    if (headings.some((h) => !!h)) {
      prompt += " You know the compass direction each frame faces: apply classical bagua " +
        "wisdom and name real compass directions in at least one problem and one edit todo."
    }

    const parts: object[] = frames.map((f) => ({inlineData: {mimeType: "image/jpeg", data: f}}))
    parts.push({text: prompt + langDirective()})

    // Same hardened two-attempt parse as analyzeRoom — a bigger multi-image
    // payload makes malformed JSON slightly more likely, not less.
    let lastError: any = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await this.post(ANALYZE_MODEL, {
        contents: [{role: "user", parts: parts}],
        generationConfig: {responseMimeType: "application/json"},
      })
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        lastError = new Error("empty pan analysis response")
        print("[FengshuiGemini] empty pan response (attempt " + (attempt + 1) + "/2)")
        continue
      }
      try {
        const parsed = JSON.parse(this.sanitizeJson(text)) as FengshuiAnalysis
        if (typeof parsed.score !== "number" || !parsed.problems || !parsed.edits) {
          throw new Error("pan analysis JSON missing fields")
        }
        return parsed
      } catch (e) {
        lastError = e
        print("[FengshuiGemini] pan parse failed (attempt " + (attempt + 1) + "/2): " + e +
          " — raw[0..200]: " + ("" + text).substring(0, 200))
      }
    }
    throw lastError ?? new Error("pan analysis failed")
  }

  /**
   * SECOND, SMALLER pan call: the master's overall verdict plus one remark per
   * captured view, so the user can page through the gallery and hear what he
   * makes of each photo.
   *
   * Deliberately split from analyzeRoomPan rather than folded into its schema.
   * RSG enforces a ~30s request deadline (`Code:4 Deadline Exceeded`), and
   * asking one call for problems + edits + shopping + elements + overall + N
   * view notes generates enough output to blow through it — measured: the same
   * six frames succeeded in 26s on the analyze-only schema and timed out at 30s
   * with the view notes bolted on. Two sequential calls each finish comfortably,
   * and this one is the expendable half: the caller treats failure as non-fatal
   * so a timeout costs you the commentary, never the room reading.
   */
  async describeViews(frames: string[], analysis: FengshuiAnalysis):
      Promise<{overall: string; views: FengshuiView[]}> {
    const n = frames.length
    const blockers = (analysis.problems ?? []).map((p) => p.title).join(", ")
    const prompt =
      "You are a feng shui master. These " + n + " photos are consecutive views of ONE " +
      "room, captured by the user turning on the spot. You have already judged this room: " +
      "chi score " + Math.round(analysis.score) + "/100" +
      (blockers ? ", main blockers: " + blockers : "") + ". " +
      "Now speak briefly about each view in turn. " +
      'Respond with JSON only, no markdown fences: ' +
      '{"overall": your verdict on the room as a whole, exactly 2 sentences, max 200 characters, ' +
      '"views": [EXACTLY ' + n + ' items, one per photo IN ORDER: ' +
      '{"frame": <1-' + n + '>, "title": 2-4 words naming what this view shows ' +
      '(e.g. "Desk corner", "Window wall"), ' +
      '"note": what you see here and the single most useful change, ' +
      '1-2 sentences, max 170 characters}]} ' +
      "Speak as the master — calm, direct, concrete. No markdown, no preamble."

    const parts: object[] = frames.map((f) => ({inlineData: {mimeType: "image/jpeg", data: f}}))
    parts.push({text: prompt + langDirective()})

    const data = await this.post(ANALYZE_MODEL, {
      contents: [{role: "user", parts: parts}],
      generationConfig: {responseMimeType: "application/json"},
    })
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("empty views response")
    const parsed = JSON.parse(this.sanitizeJson(text)) as
      {overall?: string; views?: FengshuiView[]}
    return {overall: parsed.overall ?? "", views: parsed.views ?? []}
  }

  // Returns base64 JPEG/PNG data of the improved room image
  async improveRoom(jpegB64: string, analysis: FengshuiAnalysis,
      tightened: boolean, failedEdits?: number[]): Promise<string> {
    const data = await this.post(IMAGE_MODEL, {
      contents: [{
        role: "user",
        parts: [
          {inlineData: {mimeType: "image/jpeg", data: jpegB64}},
          {text: this.buildImprovePrompt(analysis, tightened, failedEdits)},
        ],
      }],
      generationConfig: {responseModalities: ["IMAGE"]},
    })
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) return p.inlineData.data as string
    }
    throw new Error("no image in improve response")
  }

  // Per-edit PASS/FAIL checklist against the generated image
  async verifyEdits(improvedB64: string, analysis: FengshuiAnalysis): Promise<QAResult> {
    const editLines = this.editSentences(analysis).map((s, i) => (i + 1) + ". " + s).join(" ")
    const prompt =
      "You are verifying that photo edits were applied to an image of a room. " +
      "The image you see SHOULD already include these edits: " + editLines + " " +
      'For each numbered edit, judge from the image whether it was applied. Respond with JSON only, no markdown fences: ' +
      '{"results": [{"edit": <number>, "status": "PASS|FAIL", "reason": short}]}'
    const data = await this.post(ANALYZE_MODEL, {
      contents: [{
        role: "user",
        parts: [
          {inlineData: {mimeType: "image/jpeg", data: improvedB64}},
          {text: prompt},
        ],
      }],
      generationConfig: {responseMimeType: "application/json"},
    })
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("empty verify response")
    const parsed = JSON.parse(this.sanitizeJson(text)) as {results: {edit: number; status: string}[]}
    const results = parsed.results ?? []
    const failed = results.filter((r) => r.status !== "PASS").map((r) => r.edit)
    return {passCount: results.length - failed.length, total: results.length, failedEdits: failed}
  }

  /**
   * "Ask the master" — a free-form spoken question answered ABOUT the captured
   * room. Same transport (RSG), same model, same persona as analyzeRoom; the
   * room photo goes in as inlineData and the existing analysis as text context,
   * so the master answers about what it already saw rather than in the abstract.
   * Plain text out (no responseMimeType json) — the answer is displayed verbatim.
   */
  async askMaster(question: string, jpegB64: string | null,
      analysis: FengshuiAnalysis | null): Promise<string> {
    const parts: object[] = []
    if (jpegB64) parts.push({inlineData: {mimeType: "image/jpeg", data: jpegB64}})

    let ctx = ""
    if (analysis) {
      const problems = (analysis.problems ?? [])
        .map((p) => p.title + " — " + p.detail).join(" | ")
      const todos = (analysis.edits ?? [])
        .map((e) => e.todo ?? (e.action + " " + e.object + " at " + e.placement)).join(" | ")
      const el = analysis.elements
      ctx = " You have already assessed this exact room. Chi score: " +
        Math.round(analysis.score) + "/100." +
        (problems ? " Energy blockers you found: " + problems + "." : "") +
        (todos ? " Changes you prescribed: " + todos + "." : "") +
        (el ? " Five-element balance — wood " + el.wood + ", fire " + el.fire +
          ", earth " + el.earth + ", metal " + el.metal + ", water " + el.water +
          (el.note ? " (" + el.note + ")" : "") + "." : "")
    }

    const prompt =
      "You are a feng shui master." +
      (jpegB64 ? " The attached photo is the user's actual room." : "") + ctx +
      ' The user asks you, out loud: "' + question + '" ' +
      "Answer about THIS room, naming things you can actually see in it. " +
      "Speak as the master — calm, direct, a little poetic, never generic advice. " +
      "Reply with 2-4 short spoken sentences of plain text. " +
      "No markdown, no bullet points, no JSON, no preamble." +
      langDirective()
    parts.push({text: prompt})

    const data = await this.post(ANALYZE_MODEL, {contents: [{role: "user", parts: parts}]})
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("empty answer response")
    return this.stripFences("" + text).trim()
  }

  // Human-readable checklist steps for the Chi Plan panel — prefer the short
  // per-edit "todo" from the model; fall back to the full edit sentence.
  planSteps(analysis: FengshuiAnalysis): string[] {
    const sentences = this.editSentences(analysis)
    return analysis.edits.map((e, i) => (e.todo && e.todo.length > 3 ? e.todo : sentences[i]))
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private editSentences(analysis: FengshuiAnalysis): string[] {
    return analysis.edits.map((e) => {
      const action = (e.action || "replace").charAt(0).toUpperCase() + (e.action || "replace").slice(1)
      let s = action + " " + e.object + " at " + e.placement + "."
      if (e.constraint) s += " " + e.constraint + "."
      return s
    })
  }

  private buildImprovePrompt(analysis: FengshuiAnalysis, tightened: boolean, failedEdits?: number[]): string {
    const sentences = this.editSentences(analysis)
    const numbered = sentences.map((s, i) => (i + 1) + ". " + s).join(" ")
    let prompt =
      "Edit this photo of a room to improve its feng shui while keeping the same room, camera angle, " +
      "walls, windows, furniture and overall style. Apply these changes: " + numbered + " " +
      "Keep everything photorealistic and consistent with the original lighting."
    for (const item of analysis.preserve ?? []) {
      prompt += " Keep " + item + " exactly as it is."
    }
    if (tightened && failedEdits && failedEdits.length > 0) {
      const missed = failedEdits
        .filter((n) => n >= 1 && n <= sentences.length)
        .map((n) => n + ". " + sentences[n - 1])
        .join(" ")
      prompt +=
        " IMPORTANT: a previous attempt missed the following edits — they MUST be clearly and " +
        "visibly applied this time: " + missed
    }
    return prompt
  }

  private stripFences(text: string): string {
    let t = text.trim()
    if (t.startsWith("```")) {
      t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "")
    }
    return t.trim()
  }

  // Hardened cleanup for model-emitted JSON: fences off, clamp to the outermost
  // object, and drop trailing commas (the classic Gemini artifacts).
  private sanitizeJson(text: string): string {
    let t = this.stripFences(text)
    const first = t.indexOf("{")
    const last = t.lastIndexOf("}")
    if (first >= 0 && last > first) t = t.substring(first, last + 1)
    t = t.replace(/,\s*([}\]])/g, "$1")
    return t
  }

  /**
   * Text → speech, as raw PCM bytes. Same transport as every other Gemini call
   * here (RSG when USE_RSG, direct REST otherwise), so the master's voice is
   * billed and authenticated exactly like his words are.
   *
   * Returns PCM-16 LE, mono, 24 kHz — the fixed output format of the Gemini TTS
   * models, and precisely what FengshuiVoice's AudioOutputProvider path wants.
   * Returns null (never throws) when the response carries no audio, so a mute
   * master degrades to silence-with-a-log rather than an unhandled rejection in
   * the middle of the ask flow.
   *
   * `style` is prepended to the text rather than passed as a parameter: Gemini
   * TTS is prompt-controlled — there is no instructions field — and a natural
   * language directive ahead of the line is how delivery is directed. Keep the
   * directive in the SAME language as the text; an English directive in front of
   * Chinese input has the model read the Chinese with an English voice, or read
   * the directive aloud.
   */
  async ttsPcm(text: string, voice: string, style: string): Promise<Uint8Array | null> {
    const spoken = (text || "").trim()
    if (!spoken) return null
    const body = {
      contents: [{parts: [{text: style ? style + "\n\n" + spoken : spoken}], role: "user"}],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: voice}}},
      },
    }
    const resp: any = await this.post(TTS_MODEL, body)
    const parts = resp && resp.candidates && resp.candidates[0] &&
      resp.candidates[0].content && resp.candidates[0].content.parts
    const b64 = parts && parts[0] && parts[0].inlineData && parts[0].inlineData.data
    if (!b64) {
      // Name the reason when the API gave one — a safety block and an auth
      // failure look identical from "no audio came back".
      const fb = resp && resp.promptFeedback ? JSON.stringify(resp.promptFeedback) : ""
      print("[FengshuiGemini] TTS returned no audio" + (fb ? " — promptFeedback: " + fb : ""))
      return null
    }
    return Base64.decode(b64)
  }

  // Two transports, same request/response shape. RSG proxies through Snap's gateway
  // (billed to Snap, needs a GOOGLE-spec token on the RSGCredentials object); the
  // direct path uses the baked personal key (billed to Liam's AI Studio project).
  // VERIFIED through RSG: gemini-2.5-flash text AND gemini-3.1-flash-image EDIT
  // (input image + instruction -> edited image). Note Imagen.ts's "edit not
  // supported" comment applies to the Imagen surface, NOT Gemini generateContent.
  private async post(model: string, body: object): Promise<any> {
    if (USE_RSG) return await this.postViaRsg(model, body)
    return await this.postDirect(model, body)
  }

  // RSG returns the same parsed GenerateContentResponse shape the REST call does,
  // so every caller downstream is unchanged.
  private async postViaRsg(model: string, body: object): Promise<any> {
    const token = RemoteServiceGatewayCredentials.getApiToken(AvaliableApiTypes.Google)
    if (!token) {
      throw new Error("No RSG Google token — refresh tokens (see REBUILD.md) or set USE_RSG = false")
    }
    return await Gemini.models({model: model, type: "generateContent", body: body} as any)
  }

  private async postDirect(model: string, body: object): Promise<any> {
    const url = BASE_URL + model + ":generateContent?key=" + encodeURIComponent(API_KEY)
    const response = await this.internetModule.fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    })
    if (response.status !== 200) {
      const errText = await response.text()
      throw new Error("HTTP " + response.status + ": " + errText.substring(0, 300))
    }
    return await response.json()
  }
}
