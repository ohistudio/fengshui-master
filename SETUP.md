# Setup

This repository ships **without credentials**. Two places need filling in before the Lens will run.

## 1. Remote Service Gateway tokens (the path the Lens actually uses)

The Lens routes Gemini and OpenAI calls through Snap's Remote Service Gateway, so
requests bill to Snap rather than a personal key. Tokens are **per-spec** and expire
roughly **hourly**.

1. Open the project in Lens Studio 5.22+ and **sign in with your Snap account**.
2. Mint tokens and paste them into the `RSGCredentials` object's `snapToken`,
   `googleToken` and `openAIToken` inputs, then save.
   The minting snippet is in `REBUILD.md` §4b.
3. Confirm on refresh: `[Fengshui] RSG tokens configured (Google + Snap + OpenAI).`

If calls return **401**, check Lens Studio is signed in **before** re-minting —
re-minting while signed out returns the same tokens and fixes nothing.

## 2. Optional fallback keys

- `Assets/Scripts/FengshuiGemini.ts` — `REPLACE_WITH_GOOGLE_AI_STUDIO_KEY`.
  Only used when `USE_RSG = false`. Bills your own Google AI Studio project.
- `Assets/Scripts/FengshuiVoice.ts` — `REPLACE_WITH_SK_KEY` (ElevenLabs).
  Optional; the master's voice uses OpenAI TTS via RSG by default.

## Committing safely

`.gitignore` cannot protect a credential embedded in a tracked file. Before committing:

- **`Assets/Scene.scene` stores RSG tokens in plaintext.** Blank the three token
  fields before pushing. They expire hourly, so nothing is lost.
- Keep API keys as placeholders in source; never commit a live key.
