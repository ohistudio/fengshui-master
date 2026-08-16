// FengshuiStrings — every user-facing string in one place, in English and
// Mandarin, plus the language setting the whole Lens reads from.
//
// Why a table rather than inline literals: the intro status used to live in two
// files (FengshuiMain's INTRO_STATUS and a hardcoded literal in FengshuiUI's
// buildControlPanel). They had already drifted apart in spirit and would have
// drifted in fact. Worse, a literal left inline silently stays English when the
// user switches to 中文 — which nobody notices in testing, because the screen is
// still full of words. Every string a user can read belongs here.
//
// Read strings through S() at the point of use, never cached into a local at
// module load — the pack swaps when the language changes, and a cached
// reference would keep rendering the old language.
//
// The default Lens Studio font has full CJK coverage (verified by rendering
// Chinese into the live status line), so no font asset is needed.

export type Lang = "en" | "zh"

/** One localised string set. Parameterised entries are functions. */
export interface Pack {
  // ── Shell ────────────────────────────────────────────────────────────────
  appTitle: string
  intro: string

  // ── Buttons ──────────────────────────────────────────────────────────────
  assessBtn: string
  exit3dBtn: string
  scanBtn: string
  scanningBtn: string
  viewIn3dBtn: string
  scanProgressBtn: (done: number, total: number) => string

  // ── Score gauge ──────────────────────────────────────────────────────────
  chiScore: string
  fiveElements: string
  elementNames: string[]
  wholeRoomReading: string
  wholeRoomBest: (best: number) => string
  targetBest: (target: number, best: number) => string
  facingLine: (dir: string) => string
  directionNames: {[key: string]: string}

  // ── Verdicts ─────────────────────────────────────────────────────────────
  verdictMasterful: string
  verdictBalanced: string
  verdictGentle: string
  verdictRestless: string
  verdictBlocked: string

  // ── Insight rail ─────────────────────────────────────────────────────────
  tabBlockers: string
  tabPlan: string
  tabShop: string
  doTheseInRoom: string
  thenAssessAgain: string
  masterSuggests: string
  beforeLabel: string
  afterLabel: string

  // ── Master panel ─────────────────────────────────────────────────────────
  masterAnswers: string
  masterConsidering: string
  masterAskAgain: string
  masterTryAgain: string
  masterHintBrowse: string
  theWholeRoom: string
  noNoteForView: string

  // ── Status line ──────────────────────────────────────────────────────────
  noInternet: string
  alreadyWorking: string
  exit3dFirst: string
  standStillTurn: string
  noRotationTracking: string
  keepTurningPct: (pct: number) => string
  turningDeg: (deg: number, need: number) => string
  didntTurn: string
  needMoreRoom: string
  scanFailed: string
  scanFirst: string
  listening: string
  micError: (what: string) => string
  micUnavailable: string
  masterStillWorking: string
  masterStillWorkingAsk: string
  assessFirstThenAsk: string
  consultingMaster: string
  nothingHeard: string
  masterHasSpoken: string
  askFailed: (e: string) => string
  noPastQuestions: string
  rebalanceFailed: string
  assessFailed: string
  slideToCompare: string
  assessOrScanFirst: string
  spatialUnavailable: string
  stageBuildingDepth: string
  stepIntoRoom: string
  spatialFailed: string
  searchOnPhone: (q: string) => string
  openingCheckout: string
  checkoutCancelled: string
  checkoutUnavailable: string
  checkoutFailed: string
  planComplete: string
  scanNavWhole: (count: number) => string
  scanNavView: (i: number, count: number, title: string) => string
  viewNumber: (i: number) => string
  viewOfCount: (i: number, count: number) => string
  readNOfM: (n: number, m: number) => string
  wholeRoomRead: string

  // ── Progress stages ──────────────────────────────────────────────────────
  stageCapturingFrame: (n: number, total: number) => string
  stageReadingWholeRoom: string
  stageTrimming: string
  stageAskingEachView: string
  stageCapturingRoom: string
  stageConsultingMaster: string
  stagePainting: string
  stageCheckingWork: string
  stageRefining: (n: number) => string

  masterHintAsk: string
  masterHintEarlier: string
  askNav: (i: number, n: number) => string
  masterTitleRoomRead: string
  masterTitleRebalanced: string
  masterBodyRebalanced: string
  qaVerified: (pass: number, total: number) => string
  qaApplied: string

  // ── Spoken (TTS) ─────────────────────────────────────────────────────────
  spokenScore: (score: number, verdict: string) => string
  spokenScanSummary: (score: number, verdict: string, titles: string) => string
  masterBodyRoomRead: (score: number, verdict: string, facing: string | null,
                       titles: string, note: string) => string
}

const EN: Pack = {
  appTitle: "Fengshui Master",
  intro: "Look at your room, then assess its energy",

  assessBtn: "Assess my Room",
  exit3dBtn: "Exit 3D",
  scanBtn: "Scan Whole Room",
  scanningBtn: "Scanning…",
  viewIn3dBtn: "View in 3D",
  scanProgressBtn: (d, t) => "Scanning… " + d + "/" + t,

  chiScore: "Chi Score",
  fiveElements: "Five Elements",
  elementNames: ["Wood", "Fire", "Earth", "Metal", "Water"],
  wholeRoomReading: "Whole room reading",
  wholeRoomBest: (b) => "Whole room · Best " + b,
  targetBest: (t, b) => "Target " + t + " · Best " + b,
  facingLine: (dir) => "Read facing " + dir + " · bagua applied",
  directionNames: {
    north: "north", northeast: "northeast", east: "east", southeast: "southeast",
    south: "south", southwest: "southwest", west: "west", northwest: "northwest",
  },

  verdictMasterful: "Masterful harmony",
  verdictBalanced: "Balanced & calm",
  verdictGentle: "Gentle imbalance",
  verdictRestless: "Restless energy",
  verdictBlocked: "Blocked chi",

  tabBlockers: "Blockers",
  tabPlan: "Chi Plan",
  tabShop: "Shop",
  doTheseInRoom: "Do these in your real room",
  thenAssessAgain: "Then assess again — watch your chi rise",
  masterSuggests: "The master suggests",
  beforeLabel: "Before",
  afterLabel: "After",

  masterAnswers: "The Master Answers",
  masterConsidering: "The master is considering",
  masterAskAgain: "Hold the mic to ask again",
  masterTryAgain: "Hold the mic to try again",
  masterHintBrowse: "◀ ▶ to walk the room · hold the mic to ask",
  theWholeRoom: "The whole room",
  noNoteForView: "The master left no note for this view.",

  noInternet: "No internet — connect to assess your room",
  alreadyWorking: "Already working — wait for this to finish",
  exit3dFirst: "Exit 3D first, then scan the room",
  standStillTurn: "Stand still and turn slowly on the spot",
  noRotationTracking: "No rotation tracking — capturing on a timer, keep turning",
  keepTurningPct: (p) => "Keep turning on the spot — " + p + "% of the way round",
  turningDeg: (d, n) => "Turning… " + d + "° of " + n + "°",
  didntTurn: "You didn't turn — press Scan, then spin slowly on the spot",
  needMoreRoom: "Need more of the room — press Scan and keep turning",
  scanFailed: "Scan failed — check connection, try again",
  scanFirst: "Scan the room first, then browse the views",
  listening: "Listening…",
  micError: (w) => "Mic error: " + w,
  micUnavailable: "Mic unavailable on this build",
  masterStillWorking: "The master is still working — wait, then ask",
  masterStillWorkingAsk: "The master is still working — ask again in a moment",
  assessFirstThenAsk: "Assess your room first, then ask the master",
  consultingMaster: "Consulting the master…",
  nothingHeard: "Nothing heard — hold the mic and speak",
  masterHasSpoken: "The master has spoken",
  askFailed: (e) => "Ask failed: " + e,
  noPastQuestions: "No past questions yet — hold the mic to ask",
  rebalanceFailed: "Chi assessed — rebalance failed, assess again to retry",
  assessFailed: "Assessment failed — check connection, try again",
  slideToCompare: "Slide to compare — or view your room in 3D",
  assessOrScanFirst: "Assess or scan your room first",
  spatialUnavailable: "Spatial view unavailable on this build",
  stageBuildingDepth: "Building depth — hold still a moment",
  stepIntoRoom: "Step into your better room — Exit 3D returns",
  spatialFailed: "Spatial view failed — flat compare still works",
  searchOnPhone: (q) => 'Search "' + q + '" on your phone to buy',
  openingCheckout: "Opening checkout…",
  checkoutCancelled: "Checkout cancelled",
  checkoutUnavailable: "Checkout unavailable",
  checkoutFailed: "Checkout failed — try again",
  planComplete: "Plan complete — assess again and watch your chi rise",
  scanNavWhole: (c) => "Whole room · " + c + " views",
  scanNavView: (i, c, t) => "View " + i + " of " + c + " · " + t,
  viewNumber: (i) => "View " + i,
  viewOfCount: (i, c) => "View " + i + " of " + c + " · ◀ ▶ to browse",
  readNOfM: (n, m) => "Read " + n + " of " + m + " views — ◀ ▶ to browse, or scan again",
  wholeRoomRead: "Whole room read — use ◀ ▶ to walk through each view",

  stageCapturingFrame: (n, t) => "Capturing frame " + n + " of " + t,
  stageReadingWholeRoom: "Reading the whole room…",
  stageTrimming: "Still reading — trimming the payload…",
  stageAskingEachView: "Asking the master about each view…",
  stageCapturingRoom: "Capturing your room…",
  stageConsultingMaster: "Consulting the feng shui master…",
  stagePainting: "Painting your room…",
  stageCheckingWork: "Checking the work…",
  stageRefining: (n) => "Refining " + n + " missed edit(s)…",

  masterHintAsk: "Hold the mic to ask the master",
  masterHintEarlier: "An earlier question",
  askNav: (i, n) => "Ask " + i + " of " + n,
  masterTitleRoomRead: "Your room, read",
  masterTitleRebalanced: "Your room, rebalanced",
  masterBodyRebalanced: "Behold: your room, rebalanced. Follow the chi plan, then assess again.",
  qaVerified: (p, t) => "Edits verified " + p + "/" + t,
  qaApplied: "Edits applied",

  spokenScore: (s, v) =>
    "Your chi score is " + s + " out of one hundred. " + v + ".",
  masterBodyRoomRead: (score, verdict, facing, titles, note) =>
    "Your chi score is " + score + " out of one hundred. " + verdict +
    (facing ? ". You face " + facing : "") +
    ". I sense three energy blockers: " + titles + "." + note,
  spokenScanSummary: (s, v, titles) =>
    "Your whole room scores " + s + " out of one hundred. " + v +
    ". Three things hold it back: " + titles + ".",
}

// Mandarin. Note these read shorter than the English for the same meaning —
// CJK carries more per character — so rows tuned for English gain slack rather
// than overflowing. Punctuation uses full-width forms (，。—) as is correct in
// Chinese typesetting; the interpunct · and arrows ◀ ▶ are kept because they
// are symbols shared with the English layout, not words.
const ZH: Pack = {
  appTitle: "风水大师",
  intro: "环视你的房间，然后评估气场",

  assessBtn: "评估房间",
  exit3dBtn: "退出 3D",
  scanBtn: "扫描整个房间",
  scanningBtn: "扫描中…",
  viewIn3dBtn: "3D 查看",
  scanProgressBtn: (d, t) => "扫描中… " + d + "/" + t,

  chiScore: "气场评分",
  fiveElements: "五行",
  elementNames: ["木", "火", "土", "金", "水"],
  wholeRoomReading: "全屋解读",
  wholeRoomBest: (b) => "全屋 · 最佳 " + b,
  targetBest: (t, b) => "目标 " + t + " · 最佳 " + b,
  facingLine: (dir) => "朝" + dir + "解读 · 已应用八卦",
  directionNames: {
    north: "北", northeast: "东北", east: "东", southeast: "东南",
    south: "南", southwest: "西南", west: "西", northwest: "西北",
  },

  verdictMasterful: "上乘和谐",
  verdictBalanced: "平衡安宁",
  verdictGentle: "略有失衡",
  verdictRestless: "气息躁动",
  verdictBlocked: "气场阻滞",

  tabBlockers: "阻碍",
  tabPlan: "气场计划",
  tabShop: "选购",
  doTheseInRoom: "在真实房间里这样做",
  thenAssessAgain: "然后再次评估，看气场提升",
  masterSuggests: "大师推荐",
  beforeLabel: "调理前",
  afterLabel: "调理后",

  masterAnswers: "大师解答",
  masterConsidering: "大师正在思量",
  masterAskAgain: "长按麦克风再问一次",
  masterTryAgain: "长按麦克风重试",
  masterHintBrowse: "◀ ▶ 环视房间 · 长按麦克风提问",
  theWholeRoom: "整个房间",
  noNoteForView: "大师未对此视角留下批注。",

  noInternet: "无网络连接，请联网后评估房间",
  alreadyWorking: "正在处理中，请稍候",
  exit3dFirst: "请先退出 3D，再扫描房间",
  standStillTurn: "站定原地，缓缓转身一圈",
  noRotationTracking: "无旋转追踪，将按时间取景，请继续转身",
  keepTurningPct: (p) => "继续原地转身，已完成 " + p + "%",
  turningDeg: (d, n) => "转身中… " + d + "° / " + n + "°",
  didntTurn: "你没有转身。按下扫描，然后原地慢慢转圈",
  needMoreRoom: "房间取景不足。按下扫描并继续转身",
  scanFailed: "扫描失败，请检查网络后重试",
  scanFirst: "请先扫描房间，再浏览各个视角",
  listening: "聆听中…",
  micError: (w) => "麦克风错误：" + w,
  micUnavailable: "此版本无法使用麦克风",
  masterStillWorking: "大师仍在推演，请稍候再问",
  masterStillWorkingAsk: "大师仍在推演，请稍后再问",
  assessFirstThenAsk: "请先评估房间，再请教大师",
  consultingMaster: "正在请教大师…",
  nothingHeard: "未听清，请长按麦克风说话",
  masterHasSpoken: "大师已作答",
  askFailed: (e) => "提问失败：" + e,
  noPastQuestions: "尚无提问记录，长按麦克风提问",
  rebalanceFailed: "气场已评估，调理失败，请重新评估",
  assessFailed: "评估失败，请检查网络后重试",
  slideToCompare: "滑动对比，或以 3D 查看房间",
  assessOrScanFirst: "请先评估或扫描房间",
  spatialUnavailable: "此版本无法使用空间视图",
  stageBuildingDepth: "正在生成景深，请稍候",
  stepIntoRoom: "步入你更好的房间，退出 3D 可返回",
  spatialFailed: "空间视图失败，平面对比仍可使用",
  searchOnPhone: (q) => "在手机上搜索「" + q + "」即可购买",
  openingCheckout: "正在打开结账…",
  checkoutCancelled: "结账已取消",
  checkoutUnavailable: "结账不可用",
  checkoutFailed: "结账失败，请重试",
  planComplete: "计划已完成，再次评估，看气场提升",
  scanNavWhole: (c) => "全屋 · " + c + " 个视角",
  scanNavView: (i, c, t) => "视角 " + i + " / " + c + " · " + t,
  viewNumber: (i) => "视角 " + i,
  viewOfCount: (i, c) => "视角 " + i + " / " + c + " · ◀ ▶ 浏览",
  readNOfM: (n, m) => "已解读 " + n + " / " + m + " 个视角 — ◀ ▶ 浏览，或重新扫描",
  wholeRoomRead: "全屋已解读 — 用 ◀ ▶ 逐一查看各视角",

  stageCapturingFrame: (n, t) => "正在取景 " + n + " / " + t,
  stageReadingWholeRoom: "正在解读整个房间…",
  stageTrimming: "仍在解读，正在精简数据…",
  stageAskingEachView: "正在逐一请教各视角…",
  stageCapturingRoom: "正在拍摄你的房间…",
  stageConsultingMaster: "正在请教风水大师…",
  stagePainting: "正在描绘你的房间…",
  stageCheckingWork: "正在检查成果…",
  stageRefining: (n) => "正在修正 " + n + " 处遗漏…",

  masterHintAsk: "长按麦克风请教大师",
  masterHintEarlier: "较早的提问",
  askNav: (i, n) => "提问 " + i + " / " + n,
  masterTitleRoomRead: "你的房间，已解读",
  masterTitleRebalanced: "你的房间，已调理",
  masterBodyRebalanced: "且看：你的房间已然调理。依此气场计划行事，再来评估。",
  qaVerified: (p, t) => "已核验修改 " + p + "/" + t,
  qaApplied: "修改已应用",

  spokenScore: (s, v) => "你的气场评分是一百分中的 " + s + " 分。" + v + "。",
  masterBodyRoomRead: (score, verdict, facing, titles, note) =>
    "你的气场评分是一百分中的 " + score + " 分。" + verdict +
    (facing ? "。你面朝" + facing : "") +
    "。我察觉到三处气场阻碍：" + titles + "。" + note,
  spokenScanSummary: (s, v, titles) =>
    "你的整个房间得分为一百分中的 " + s + " 分。" + v +
    "。有三处阻碍了它：" + titles + "。",
}

const PACKS: {[key: string]: Pack} = {en: EN, zh: ZH}

// Persisted alongside the chi-score history (see FengshuiHistory), same
// PersistentStorageSystem, same per-device offline story. A user who picks 中文
// expects it to still be 中文 next time they put the glasses on.
const LANG_STORE_KEY = "fengshui_lang_v1"

// null = not yet read from storage. Deliberately LAZY rather than loaded from an
// init() call: FengshuiUI builds every panel in its own onAwake, and script
// order decides whether that runs before or after FengshuiMain. An explicit
// init would have to win that race to matter — and if it lost, the whole UI
// would build in English and only correct itself if something later happened to
// fire a change event. Resolving on first read means the very first S() call,
// wherever it comes from, already sees the stored language.
let current: Lang | null = null
const listeners: (() => void)[] = []

function ensureLoaded(): Lang {
  if (current !== null) return current
  current = "en"
  try {
    const raw = global.persistentStorageSystem.store.getString(LANG_STORE_KEY)
    // Validate rather than trusting the store — a corrupt or stale value must
    // fall back to English, never index PACKS with undefined.
    if (raw === "zh" || raw === "en") current = raw as Lang
  } catch (e) {
    print("[FengshuiStrings] language load failed, defaulting to en: " + e)
  }
  return current
}

/** The active string pack. Call at the point of use — never cache the result. */
export function S(): Pack {
  return PACKS[ensureLoaded()]
}

export function getLang(): Lang {
  return ensureLoaded()
}

/**
 * The BCP-47 tag for the active language, for ASR and TTS. Mandarin is
 * requested as zh-CN (Simplified, mainland) to match the strings above.
 */
export function localeTag(): string {
  return ensureLoaded() === "zh" ? "zh-CN" : "en-US"
}

/** Human name of the active language, for the prompt directive. */
export function langName(): string {
  return ensureLoaded() === "zh" ? "Mandarin Chinese (Simplified)" : "English"
}

export function setLang(lang: Lang): void {
  if (lang === ensureLoaded()) return
  current = lang
  // Persist BEFORE notifying: a listener that throws must not cost the user
  // their choice. Storage failing is survivable — the language still changes
  // for this run, it simply won't be remembered.
  try {
    global.persistentStorageSystem.store.putString(LANG_STORE_KEY, lang)
  } catch (e) {
    print("[FengshuiStrings] language save failed: " + e)
  }
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i]()
    } catch (e) {
      print("[FengshuiStrings] language listener failed: " + e)
    }
  }
}

/** Fires after the language changes, so the UI can re-render static labels. */
export function onLangChange(fn: () => void): void {
  listeners.push(fn)
}

// ── Diagnostics ──────────────────────────────────────────────────────────────
// Developer-facing, deliberately NOT localised — it goes to the log, is read by
// whoever is debugging, and must be greppable in one language.
//
// It lives in this module because it is the only leaf both FengshuiMain and
// FengshuiVoice already import. Main cannot own it (Voice would have to import
// Main, which imports Voice), and copying the wording into both is precisely
// the drift this whole file exists to prevent — a remedy that is right in one
// place and stale in the other is worse than having it once.

// The remedy, in the order that actually works. Sign-in FIRST, tokens second.
//
// This exists because of a genuinely misleading hour: every request returned
// 401 while the startup check cheerfully reported all three tokens present.
// Both were true. The tokens WERE configured — Lens Studio was signed out of
// its Snap account, and a signed-out session 401s no matter how valid the
// tokens are. Re-minting in that state silently succeeds and returns the SAME
// values, so "refresh the tokens" looks like it worked and changes nothing.
// The reverse order is a trap that costs an hour.
const AUTH_REMEDY =
  "Fix in this order: (1) sign Lens Studio in to your Snap account (account " +
  "menu, top-right) — a signed-out session 401s even with perfectly valid " +
  "tokens; (2) only then re-mint the RSG tokens per REBUILD.md. Re-minting " +
  "while signed out returns the SAME tokens and fixes nothing."

/**
 * Turns a thrown remote error into an actionable line, or null if there is
 * nothing useful to say.
 *
 * Two cases, and the second is the one that matters most.
 *
 * Matching on "401"/"unauthorized" alone would have been useless here. RSG
 * rejects with `response.body` (see Gemini.ts / OpenAI.ts), and the observed
 * 401 arrived with an EMPTY body — the engine logged
 * `UriResponse not successful: code: 401` at native level, but JavaScript
 * received `""`. The status code never crosses into the Lens. So the check that
 * was supposed to catch the auth failure would have matched nothing in exactly
 * the situation it was written for.
 *
 * Hence: an empty or whitespace-only remote error is itself treated as a strong
 * auth signal, because that is precisely what a gateway rejection looks like
 * from inside a Lens. Phrased as "most likely" rather than asserted, since an
 * empty body is evidence rather than proof.
 */
export function describeRemoteAuthError(e: any): string | null {
  const raw = ("" + e).trim()
  const s = raw.toLowerCase()

  if (s.indexOf("401") >= 0 || s.indexOf("unauthorized") >= 0 ||
      s.indexOf("unauthenticated") >= 0 || s.indexOf("authorize") >= 0) {
    return "AUTH FAILURE — the Lens is not authorized to call remote services. " +
      AUTH_REMEDY
  }

  // Empty/opaque rejection: the signature of a gateway-level refusal.
  if (raw === "" || raw === "undefined" || raw === "null") {
    return "EMPTY error body from the gateway — this is what a 401 looks like " +
      "from inside a Lens, because the status code never reaches JavaScript " +
      "(the engine logs it natively as 'UriResponse not successful: code: 401'). " +
      "Most likely an auth failure. " + AUTH_REMEDY
  }

  return null
}

/** Localised compass direction, falling back to the raw key if unmapped. */
export function directionName(dir: string): string {
  const map = S().directionNames
  return map[dir] ? map[dir] : dir
}
