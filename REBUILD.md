# Fengshui — CLAD recreation prompt log

How this Lens was built with CLAD (Claude + Lens Studio MCP), as an ordered prompt log. Each numbered block is one prompt to the agent, from a fresh Specs project open in Lens Studio 5.22+ (so the MCP connects at session start).

## 1. The core build

> Build a Specs Lens called "Fengshui" for a productivity-themed hackathon (judging: 50% CLAD execution / 25% UX / 25% creativity). Flow: capture a still of my room via CameraModule (continuous stream + `Base64.encodeTextureAsync`, works in editor preview) → send to `gemini-2.5-flash` in JSON mode with this exact prompt: *"You are a feng shui master analyzing this room for an AR app. Respond with JSON only, no markdown fences: {score 0-100, problems: [3 × {title, detail}], edits: [3 image-edit instructions; strongly prefer remove/add/replace over move; each: {action, object with color/material, placement, constraint}], preserve: [objects/beings that must stay exactly as they are]}"* → show an animated count-up Chi Score gauge (jade/gold/ember by band) + 3 problem cards → "Improve Room" sends the photo + numbered edit sentences to `gemini-3.1-flash-image` (`responseModalities: ["IMAGE"]`) with explicit "Keep X exactly as it is" preserve lines → QA-verify the result with a per-edit PASS/FAIL checklist back through 2.5-flash, one tightened regenerate on failure → show Before/After. Direct REST via InternetModule fetch. World-anchored UIKit panels at z=-110, never head-locked. Zen ambient music bed + generated SFX (click, shutter, chime, whoosh).

## 2. Layout polish

> The problem-card detail text needs a hard wrap-width budget inside its panel, and compact the vertical spread so gauge + side panels + control panel all fit ~45cm at z=-110 without head-craning.

## 3. The six feature adds

> Add all of these: (1) spatial-image view of the After photo — reuse the **Spatial Image .lsc from DinoLens** (`~/Documents/DinoLens/Packages/Spatial Image.lsc`); (2) Chi Plan checklist — the 3 edits become tappable todos after Improve, plus re-score the improved image and show "Target N" in the gauge; (3) world-anchored problem markers — extend the analyze prompt to return a per-problem `point {x,y}`, project onto a plane ~1.8m along the capture pose; (4) ElevenLabs voice narration of the verdict — port the DinoLens PCM-24kHz → AudioOutput-asset play-once pattern; (5) before/after crossfade slider; (6) local chi-score history via PersistentStorageSystem ("Best X · N scans").

## 4. The spatialization auth fix (will recur!)

> The Spatial Image component fails with "no API spec id" / silent nothing: wire its `remoteServiceModule`/`remoteMediaModule` inputs to the **modules packed inside the .lsc** ("Spatial Image Module", "Spatial Image Remote Media Module") — not freshly created bare modules — and supply the RSG Snap token. **(Superseded — see 4b.)** This used to be a runtime `setApiToken(Snap, <token>)` call against a hardcoded literal; tokens now live on the `RSGCredentials` SceneObject instead, so they persist and can be refreshed without a code edit. Note: the .lsc's post-response chain (download → blob → gltf → instantiate) has no catch — failures die as uncaught rejections with zero logs.

## 4b. RUN THIS BEFORE DEMOING — refresh the RSG tokens

RSG tokens expire roughly **hourly**. When they lapse, the whole Lens degrades in a
way that looks like unrelated bugs: assess fails, and "View in 3D" silently does
nothing. A dead token mid-demo kills the spatial moment, so refresh first, every time.

Tokens now live on the **`RSGCredentials` SceneObject** (a `RemoteServiceGatewayCredentials`
component with `snapToken` / `googleToken` / `openAIToken` `@input`s), so they persist in
the `.scene` file. Nothing is hardcoded in `FengshuiMain` any more.

**Step 1 — mint.** Run via `ExecuteEditorCode` (MCP), or the Lens Studio script console.
You must be **signed in to Lens Studio with your Snap account** or this returns 401.

```ts
const Network: any = await import('LensStudio:Network');
const generateToken = (tokenType: string): Promise<string> => new Promise((resolve, reject) => {
  const req = new Network.HttpRequest();
  req.url = `https://gcp.api.snapchat.com/smart-gate/v2/token/${tokenType}`;
  req.method = Network.HttpRequest.Method.Post;
  Network.performAuthorizedHttpRequest(req, (resp: any) => {
    if (resp.statusCode === 200) { try { resolve(JSON.parse(resp.body).token); } catch (e) { reject(`parse: ${e}`); } }
    else { reject(`HTTP ${resp.statusCode}: ${String(resp.body).slice(0,160)}`); }
  });
});
const out: any = {};
for (const t of ['SNAP', 'GOOGLE', 'OPENAI']) {
  try { out[t] = await generateToken(t); } catch (e) { out[t] = 'ERR ' + e; }
}
return out;
```

**Step 2 — paste** each token into the matching `@input` on `RSGCredentials` (Inspector),
then **save the project**.

**Step 3 — confirm.** Refresh preview and look for
`[Fengshui] RSG credentials present (Google + Snap).` A `WARN: no RSG … token` line
names exactly which one is missing.

Notes:
- The endpoint is **idempotent while a token is still valid** — calling it again returns
  the *same* token rather than minting a new one. So "it didn't change" is normal, not a
  failure. It issues a new one once the old has expired.
- Tokens are **per-spec**. The SNAP token does *not* work for Gemini — using it there
  gives `Proxy error: token is not allowed to access the endpoint: Spec not allowed for
  token`. GOOGLE gates assess; SNAP gates View in 3D.
- `RemoteServiceGatewayCredentials.setApiToken()` only has a `Snap` branch — it silently
  no-ops for Google. That is why the credentials component exists rather than a code call.

## 5. Immersive mode

> When "View in 3D" is on, hide the gauge/plan/compare panels (keep the control panel) so the spatialized room is unobstructed — and while immersive, retheme the Improve Room button as "Exit 3D" so there's always a way back; Assess and Reset should auto-exit immersive too.

## Gotchas worth pasting into any re-run

- **Never `rm` + rewrite a wired `.ts`** — the ScriptComponent's `scriptAsset` link dies silently (component just stops executing, no error). Edit in place; if it happens, re-set `scriptAsset` then re-wire the `@input`s.
- UIKit 2.0: `flexLayout.autoDiscoverItemsOnStart = false` before pre-init `addItems`; flex cells hosting **nested containers must declare both w and h** (height-only → the no-handler fallback scales x by allocatedWidth); wrapped text needs an authored real-width `layoutRect`.
- Component-typed `@input`s wire to the **component UUID**, not the SceneObject ref.
- Subscribe to the UI module's events in `OnStartEvent`, not `onAwake` (awake order isn't guaranteed).
- One in-flight Gemini request at a time (concurrent RemoteApiRequest bursts crash the native layer on device).
- Preview-testing gotchas: runtime uniqueIds go stale across any preview reset (re-query right before interacting); simulated pinches can double-fire onto the adjacent button — use atomic short pinches; reset the preview camera before judging captures (off-axis views cause a parallax "text clipping" illusion on UIKit panels).
- **Fonts / CJK.** The Lens Studio default that renders Chinese is an **implicit engine fallback, not an asset** — `Text.fontSource` reads `null` and there is nothing to pin. Every font shipped in the installed packages (all 8 `SpecsSans-*`, all 3 `ObjektivMk3-*`) is Latin-only, stopping at U+FB02/U+FEFF, as is Barlow. So a per-language font must set an explicit face for `en` and assign **`font = null`** for `zh` to fall back to the engine default — verified safe, restores `fontSource` to null without crashing. No CJK font import is needed (and none should be added: multi-MB in a demo build). Also note `Text.font` reads back `null` whenever the source is a `FontFamily`/`FontCollection`, so restore through `fontSource`, and remember the language chip shows the language you'd switch **to** (中 while in English) — it must be exempted from the English font or it tofus the one control that escapes a language you can't read.
- **`project.metaInfo` returns a DETACHED COPY — you must assign it back or `save()` writes nothing.** Mutating it and saving reports success and silently reverts on the next refresh; re-reading in the same session returns your own local copy, so in-memory agreement is a false signal. Correct form: `const m = p.metaInfo; m.lensName = "…"; p.metaInfo = m; p.save()`. Verify against the `.esproj` on disk *and* after a full refresh. Same trap applies to `activationCamera`, `lensApplicability`, and every other metaInfo field.
- **Check the Lens name before publishing.** It sat at the template default `SpecsBaseTemplate` for this project's whole life and would have shipped as the public name.
- **`GenerateLensIcon` filters religious/spiritual symbolism** — a prompt mentioning *bagua* was rejected outright as a guidelines violation. Use a secular/botanical treatment. Best results come from echoing a glyph already used in-app, so the icon and the in-app mark read as one identity.
- **`addRowText` sets `horizontalOverflow: Overflow`** — an undersized cell does not clip or wrap, glyphs spill symmetrically over neighbouring controls. Size cells to the longest string in EVERY language; check the widest (English is usually ~2× the Chinese width).
- **Simulated pinches on the control row land ~1.7 cm LEFT of where you aim.** A pinch aimed at the mic button (x 6.0) resolves to *Assess* and fires the whole assess→improve→QA pipeline. `uniqueId`-targeted pinches time out entirely on that row — only explicit `worldPosition` works, aimed ~1.7 cm right of true centre (mic = aim x 7.7). This is a preview-interaction artifact, not a Lens bug; real hand input is unaffected.
- **Never auto-fire assess on preview refresh.** Two overlapping assess pipelines issue concurrent `RemoteApiRequest`s and hard-crash the Lens Studio native layer. This crashed LS several times during development. Drive assess only with single explicit pinches, one at a time.
- UIKit `alignSelf = Stretch` on a row with no explicit width stretches by **scaling the transform**, and the scale propagates to children — off-centre children get flung far outside the panel while centred ones render fine. Always give such rows an explicit `w`.
- UIKit `BackPlate` spawns an `InteractionPlane` collider ~42 cm deep (it juts ~21 cm toward the viewer). A control placed near a *neighbouring* panel's x-range becomes unreachable because the ray hits that panel's plane first — symptom is `obstructed: Blocked by "InteractionPlaneColliderRoot"`. Diagnose by contrast: if another control on the same panel IS reachable, it's geometry, not registration.

## Appendix — exact shipping Gemini prompts (from FengshuiGemini.ts)

**Analyze** (`gemini-2.5-flash`, JSON mode, sent with the room JPEG) — the demo prompt plus the `point` field for world markers:

> You are a feng shui master analyzing this room for an AR app. Respond with JSON only, no markdown fences: {"score": <0-100>, "problems": [3 items: {"title": short, "detail": what you see and why it is bad feng shui, "point": {"x": <0-1 fraction from left edge>, "y": <0-1 fraction from top edge>} locating the problem in the photo}], "edits": [3 image-edit instructions; strongly prefer remove/add/replace over move; each: {"action": "remove|add|replace", "object": exact visible object with color/material, "placement": exact spatial location in the photo, "constraint": size limit or what must not be disturbed}], "preserve": [notable objects/beings in the photo that must stay exactly as they are, e.g. pets, people, the view]}

**Improve** (`gemini-3.1-flash-image`, `responseModalities: ["IMAGE"]`, same room JPEG) — built at runtime from the analyze JSON:

> Edit this photo of a room to improve its feng shui while keeping the same room, camera angle, walls, windows, furniture and overall style. Apply these changes: 1. \<Action> \<object> at \<placement>. \<constraint>. 2. … 3. … Keep everything photorealistic and consistent with the original lighting. Keep \<preserve item> exactly as it is. *(one line per preserve item)*

On the tightened retry it appends: *"IMPORTANT: a previous attempt missed the following edits — they MUST be clearly and visibly applied this time: \<the failed numbered edits>"*

**QA verify** (`gemini-2.5-flash`, JSON mode, sent with the *generated* image):

> You are verifying that photo edits were applied to an image of a room. The image you see SHOULD already include these edits: \<numbered edit sentences> For each numbered edit, judge from the image whether it was applied. Respond with JSON only, no markdown fences: {"results": [{"edit": <number>, "status": "PASS|FAIL", "reason": short}]}

## Keys

API keys (Gemini, ElevenLabs) are intentionally not in this file — they're baked in `Assets/Scripts/` for the hackathon build only.

**Gemini now runs through RSG by default.** `FengshuiGemini.ts` has a `USE_RSG` switch:
`true` (default) routes every Gemini call through Snap's Remote Service Gateway, billed
to Snap and authenticated by the GOOGLE token on `RSGCredentials`. `false` falls back to
the baked personal AI Studio key — which is currently **429'd on its monthly spend cap**,
so it is not a working fallback today. Verified working through RSG: `gemini-2.5-flash`
(text/vision) *and* `gemini-3.1-flash-image` **image editing** (input image + instruction
→ edited image). Note `Imagen.ts`'s "edit/upscale not supported" comment applies to the
*Imagen* surface only, not Gemini `generateContent`.

**The personal Gemini key in `FengshuiGemini.ts` is live and in plaintext — rotate it.**

The scripts in `Assets/Scripts/` (Main, UI, Gemini, Camera, Voice, History) are the reference implementation if a recreation diverges.
