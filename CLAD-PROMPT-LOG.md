# Fengshui Master — CLAD Prompt Log

**Competition submission artifact.** This document records the prompts and AI-assisted workflow used to build *Fengshui Master*, a Specs Lens that reads the feng shui of your room, scores it, repaints it, and sells you the fix.

> **No credentials appear in this document.** API keys, RSG tokens and account identifiers are deliberately excluded. Where a key was supplied during the build it is shown as `<REDACTED>`.

---

## 1. What was built

A Specs Lens with a single-pinch ritual:

**Capture your room → Gemini analyses it → Gemini repaints it → a second Gemini pass QA-verifies the repaint → results land in world-anchored panels.**

Around that core: a chi score with history, five-element (五行) balance, world-anchored problem markers, chi-flow particles that congest at blockages and clear on improvement, a spatialised 3D view of the improved room, a "Scan Whole Room" pan capture, hold-to-talk voice Q&A with the master, real IKEA products with in-Lens checkout, and a full English/Chinese toggle.

---

## 2. Tooling and workflow model

**CLAD** (Claude + the Lens Studio MCP server) drove the entire build. Lens Studio exposes an MCP endpoint; Claude Code connects to it and can read the scene graph, execute Editor API code, recompile TypeScript, capture the preview, and **drive simulated hand interactions** (pinch, hold, drag, hover) in the running Lens.

The workflow that emerged was a **build/verify split**:

| Role | Did | Could not |
|---|---|---|
| **Orchestrator** (main agent) | Directed work, drove real pinches/drags in the preview, judged captures, accepted or rejected results | — |
| **Builder** (subagent) | Wrote all TypeScript, mutated the scene, recompiled, read logs | Press its own buttons (no interaction tools in its toolset) |

That asymmetry was accidental at first and turned out to be the single most useful property of the setup: **the thing that wrote the code could not confirm its own UI worked.** Every interactive change came back explicitly marked "unverified — I could not drive a pinch", and the orchestrator then drove it and frequently found it broken. Several defects below were caught only because verification was performed by a different party than the author.

Midway through, a self-verifying agent variant was created (`specs-builder-selfverify`) that *does* hold the interaction tools, for cases where the round-trip cost outweighed the independence.

---

## 3. Prompt log

Prompts are the operator's own words, **verbatim including typos**, in order. Prompts sent directly to the build subagent are marked *(to builder)* and are paraphrased from the agent's own reports where the original wording wasn't retained.

### Session start — environment

> do you have clad installed for lens studio?

> lens is open and server is on

*(MCP was registered but pointing at a stale port — Lens Studio issues a new port on each launch. Diagnosed and re-registered.)*

### The brief

> okie so there s a challegne the theme - Build a spatial experience that helps people organize, plan, or be more productive. the judging 50% CLAD Execution / 25% User Experience / 25% Creativity & Usefulness - i thinking of making a fenghui lens so using gemini we assess the users current room and grade thier fengshui we can then alter th eimage again with gemini suggesting where and how to chnage the room. i think we did a demo for this a few weeks back look for that prompt.

The agent searched the machine, found the earlier API-only experiment in old session transcripts, and recovered the prompts that had already been proven against real rooms — including the hard-won rules that became the core of the Lens (see §5).

> done  *(project saved to a real path after being warned it was an unsaved template in a temp folder)*

### First revision round

> i dont like the texutee on the particles i wanted a loading bar to show its loading, the negery blockers paragraphs are cut off at end . the emnu doesnt move at all. the labels placed on worlds dont hit the world and the text is cut off..the chi plan is also cut off textu doesnt fit, you can redeisng this so it can fit correctly

> when i do the sldier for before and after it applies th echnages fater i elt go of the slider i want it so i can go left and right and it does it too

### Scrolling

> make it a scroll window, you can make all info on blocker, chi plan and shop longer just add scroll functionaility. the titles on shop overlap the text

> the scroll you made is a button why can we have a vertical scroll bar - also is the tools for you to use gestures added?

> how we fix this?  *(on discovering the builder had no interaction tools)*

> for the lisder i dont thon you need to enable/ disable content just as long as its masked

### Feature expansion

> dont do anything yet but what else can we add to this? based on the competitions themes and judging criteria

> do chi flow effect.do the elements and yes do add the speak tot eh master- for theme isnt fengshui about organising?

> asr as in mic input? that does work on preview!  *(correcting the agent, which had trusted documentation claiming ASR was device-only — the operator was right)*

> did you add talk to the master?

### Localisation

> okie can you make an iption to chnage language from english to chinese? what voice can we use thats not eleven labs?

### Prompts sent directly to the build agent *(paraphrased)*

- Add real IKEA product images to the shop cards
- Merge assess and improve into one button
- Make the particles feel alive; add hover feedback; quieten the music
- Add a "stand and spin" whole-room pan capture
- The scan doesn't work
- Assess should clear the previous results
- Keep an archive of past questions to the master
- The world labels are too small; the spatial image is cropped
- Give it a custom theme instead of stock SnapOS
- Generate a logo and rename the Lens

---

## 4. Representative orchestration prompts

The orchestrator's briefs to the builder are where most of the engineering direction lived. Two abridged examples showing the pattern — *evidence first, then the constraint, then the acceptance test*:

**Diagnosing a dead control:**

> Every attempt to Pinch / Poke / Drag it fails with `obstructed: Blocked by "InteractionPlaneColliderRoot"`. This is NOT a tool artifact — I proved it by pinching a tab chip on the SAME panel which succeeded. `ProblemsPanel`'s InteractionPlane bounds span z −89 to −131 — a 42cm-deep collider box — and the ScrollBar sits at z −109.29, fully inside it. Prove the fix with an actual Drag plus a capture showing the content scrolled.

**Rejecting a proposed shortcut:**

> Do NOT fade the chi VFX out during results. That throws away the feature to dodge a layout problem. In editor preview markers use the plane fallback, which is why two collapsed to x≈0 dead centre — on device they unproject onto real surfaces, so this may be largely a preview artifact. Don't over-fit to it.

Standing instructions carried into nearly every brief:

- Never auto-fire the assess pipeline on preview refresh — overlapping pipelines hard-crash Lens Studio's native layer
- Re-query runtime IDs immediately before interacting; they go stale on any preview reset
- Reset the preview camera before judging a capture — an off-axis view creates a parallax illusion of clipped text
- Report what you **drove** versus what you **inferred**

---

## 5. What the AI-assisted process actually caught

The findings below are the substance of the CLAD execution. Several contradict official documentation and were established by evidence rather than assumption.

**The gateway *does* serve Gemini image editing.** Snap's Remote Service Gateway was believed unable to perform image edits — the package's own Imagen client says "Edit/upscale are currently not supported", and the platform skill states every Gemini image model 404s. Three probes failed and appeared to confirm it. All three had used a **Snap-scoped token for a Google-spec call**; the gateway rejects on scope before it ever looks at the model. With a correctly scoped token, image editing works. This moved the entire pipeline off a personal API key and onto Snap's billing — and unblocked the project when the personal key hit its monthly spend cap mid-build.

**A whole-room scan that silently faked itself.** Frame capture was gated on the compass, which returns null in preview *and* on device without location permission — so it fell through to a wall-clock timer. Stand still, and it would capture six frames of the same wall and confidently report a whole-room reading. Re-gated on head yaw from the tracked camera transform; a stationary user now gets "Keep turning on the spot" and an honest partial result.

**A feature validated on one lucky run.** The scan was reported working, then found to be failing: six images sat exactly on the gateway's ~30-second request deadline — one pass at 26s, then two consecutive failures. Reduced to four frames and split into two sequential calls, the second deliberately expendable.

**A UI control that could never be pressed.** A scroll bar rendered perfectly and was unreachable. Every UIKit backplate spawns an interaction collider ~42cm deep, jutting toward the viewer; the neighbouring hero panel's collider intercepted every ray. Diagnosed by contrast — another control on the *same* panel was reachable, so it was geometry, not registration.

**Markers that beat panels deterministically.** World labels drew over the UI. Not a depth problem: both render at order 0, so the tie fell to hierarchy order, and a runtime-created root always appends last. Explicit negative render order fixed it.

**Text that vanished for a non-obvious reason.** Element labels silently failed to render while headers and bars on the same rows appeared. `alignSelf = Stretch` on a width-less row stretches by *scaling the transform*, and that scale propagates to children — off-centre children were flung ~95cm outside the panel. Centred children were immune, which is exactly why the symptom looked impossible.

**A rename that reported success and reverted.** `project.metaInfo` returns a detached copy; mutating and saving writes nothing, and re-reading returns your own local copy — so in-memory agreement is a false confirmation. Caught only by verifying against the file on disk after a full reload. (The Lens name had also sat at the template default `SpecsBaseTemplate` and would have shipped that way.)

**An error handler that would have failed silently.** A classifier written to detect auth failures by matching `"401"` was checked against a real logged failure and matched nothing: the gateway rejects with the response *body*, and a genuine 401 arrives **empty** — the status code never crosses into JavaScript. Rewritten to treat an empty rejection as the signal.

**A startup check that was actively misleading.** It reported "credentials present" throughout a window when every request was 401ing, because it validated that token strings existed rather than that they worked. A Lens cannot self-verify authorization at runtime — the authoritative check is Editor-API only. It now states just what it confirmed and names the remedy.

---

## 6. Verification discipline

Every interactive claim in this project was checked by **driving the running Lens and judging a screenshot**, not by reading code. That caught, among others: a scroll bar that couldn't be grabbed, tab chips blocked by row colliders, text rendering ~5 characters wide, an ember effect too faint to see across a room, and the scan failing outright.

Two rules earned the hard way:

- **A single success is not proof of a marginal feature.** The scan passed once at 26 seconds against a 30-second deadline and was reported working. It was not.
- **Verify in short bursts and save often.** Lens Studio crashed several times during long verification sessions with many refreshes and full pipelines; work was only ever lost when the project hadn't been saved between steps.

---

## 7. Reproducing the build

`REBUILD.md` in this repository contains the ordered recreation prompts and the full gotcha list needed to rebuild the Lens from a fresh Specs project.

**Credentials required (not included):** a Google AI Studio key for direct Gemini access *or* — preferred — Remote Service Gateway tokens minted from a signed-in Lens Studio session, which route through Snap's billing. RSG tokens expire roughly hourly; the refresh procedure is documented in `REBUILD.md` §4b.
