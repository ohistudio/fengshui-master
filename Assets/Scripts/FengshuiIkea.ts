// FengshuiIkea.ts — mock retail-partner integration ("brands like IKEA could
// partner with this"). A curated catalog of real IKEA products, keyword-matched
// against the master's shopping suggestions. Deterministic + offline — demo-safe.
// Real integration path: partner product API + web/phone companion for checkout
// (no in-Lens browser or card entry exists on Specs, by platform design).

export type IkeaProduct = {
  id: string
  name: string
  desc: string
  usd: number // 1.99–99.99 (CommerceKit bounds)
  img: string // IKEA CDN base URL — append a size param, never fetch the bare original
  keywords: string[]
}

// ⚠️ DEMO ONLY: product imagery is hotlinked from IKEA's public CDN for this
// private hackathon build. IKEA is not a real partner and these images are not
// licensed for distribution — replace with owned/licensed art (or a real partner
// product API) before ANY public publish or store submission.
const IMG = "https://www.ikea.com/us/en/images/products/"

// Image size params (verified): xs≈24KB, s≈32KB, m≈42KB, bare original≈147KB.
// Thumbnails use xs; the native purchase sheet icon uses s.
const THUMB_SIZE = "?f=xs"
const ICON_SIZE = "?f=s"

// Every URL below was resolved once at author time from IKEA's search endpoint
// and verified 200 + correct product. Do NOT resolve these at runtime.
const CATALOG: IkeaProduct[] = [
  {id: "ikea_fejka", name: "FEJKA", desc: "Artificial potted plant, monstera", usd: 12.99,
    img: IMG + "fejka-artificial-potted-plant-indoor-outdoor-hanging-monstera__1441217_pe986315_s5.jpg",
    keywords: ["plant", "monstera", "greenery", "botanical"]},
  {id: "ikea_dracaena", name: "DRACAENA", desc: "Potted dragon tree, live", usd: 18.99,
    img: IMG + "dracaena-massangeana-potted-plant-dom-plant-2-stem__1471115_pe997057_s5.jpg",
    keywords: ["plant", "tree", "live plant", "wood energy"]},
  {id: "ikea_fado", name: "FADO", desc: "Table lamp, warm white globe", usd: 19.99,
    img: IMG + "fado-table-lamp-white__0606976_pe682645_s5.jpg",
    keywords: ["lamp", "light", "glow", "warm light", "salt lamp"]},
  {id: "ikea_solklint", name: "SOLKLINT", desc: "Table lamp, brass/clear glass", usd: 24.99,
    img: IMG + "solklint-table-lamp-brass-gray-clear-glass__0842257_pe781832_s5.jpg",
    keywords: ["lamp", "light", "accent light", "corner light"]},
  {id: "ikea_risbyn", name: "RISBYN", desc: "Pendant lamp shade, onion shape", usd: 16.99,
    img: IMG + "risbyn-pendant-lamp-shade-onion-shape-white__0756761_pe749065_s5.jpg",
    keywords: ["pendant", "ceiling light", "soft light"]},
  {id: "ikea_glamberget", name: "GLAMBERGET", desc: "Room divider, pine", usd: 89.99,
    img: IMG + "glamberget-room-divider-pine-katorp-beige__1336028_pe947272_s5.jpg",
    keywords: ["divider", "screen", "bamboo", "partition", "shield"]},
  {id: "ikea_kallax", name: "KALLAX", desc: "Shelf unit, storage cubes", usd: 45.99,
    img: IMG + "kallax-shelf-unit-white__0644757_pe702939_s5.jpg",
    keywords: ["storage", "shelf", "clutter", "organize", "boxes"]},
  {id: "ikea_kuggis", name: "KUGGIS", desc: "Box with lid, white", usd: 8.99,
    img: IMG + "kuggis-box-with-lid-white__0713072_pe729176_s5.jpg",
    keywords: ["storage", "box", "clutter", "tidy", "organize"]},
  {id: "ikea_lindbyn", name: "LINDBYN", desc: "Round mirror, black", usd: 49.99,
    img: IMG + "lindbyn-mirror-black__1374978_pe960159_s5.jpg",
    keywords: ["mirror", "round mirror", "reflect"]},
  {id: "ikea_stockholm", name: "STOCKHOLM", desc: "Rug, flatwoven handmade stripe", usd: 99.99,
    img: IMG + "stockholm-rug-flatwoven-handmade-stripe-black-off-white__0131986_pe178432_s5.jpg",
    keywords: ["rug", "carpet", "ground", "soft flooring", "earth"]},
  {id: "ikea_gurli", name: "GURLI", desc: "Cushion cover, unbleached", usd: 3.99,
    img: IMG + "gurli-cushion-cover-unbleached__1409327_pe972205_s5.jpg",
    keywords: ["cushion", "pillow", "warm color", "earth tone", "soft"]},
  {id: "ikea_majgull", name: "MAJGULL", desc: "Room darkening curtains, 1 pair", usd: 29.99,
    img: IMG + "majgull-room-darkening-curtains-1-pair-beige-yellow-with-heading-tape__1279712_pe931490_s5.jpg",
    keywords: ["curtain", "drape", "window", "light control"]},
  {id: "ikea_jaemlik", name: "JÄMLIK", desc: "Scented candle in glass, vanilla", usd: 2.99,
    img: IMG + "jaemlik-scented-candle-in-glass-vanilla-light-beige__1060475_pe850035_s5.jpg",
    keywords: ["candle", "scent", "fire energy", "calm"]},
  {id: "ikea_vattenkrasse", name: "VATTENKRASSE", desc: "Propagation set, glass/ivory-gold", usd: 9.99,
    img: IMG + "vattenkrasse-propagation-set-clear-glass-ivory-gold__1227658_pe915641_s5.jpg",
    keywords: ["watering", "water energy", "gold accent"]},
  {id: "ikea_bekvam", name: "BEKVÄM", desc: "Step stool, rubberwood", usd: 15.99,
    img: IMG + "bekvaem-step-stool-rubberwood__1389752_pe965251_s5.jpg",
    keywords: ["wood", "stool", "birch", "natural material"]},
  {id: "ikea_skurup", name: "SKURUP", desc: "Wall lamp, black", usd: 34.99,
    img: IMG + "skurup-wall-lamp-black__0687259_pe722000_s5.jpg",
    keywords: ["floor lamp", "uplight", "dark corner", "yang energy"]},
  {id: "ikea_branaes", name: "BRANÄS", desc: "Basket, rattan", usd: 14.99,
    img: IMG + "branaes-basket-rattan__0710999_pe727908_s5.jpg",
    keywords: ["basket", "woven", "natural", "tidy", "storage"]},
]

export class FengshuiIkea {
  // CommerceKit-shaped catalog (id/type/displayName/price/iconUri) for
  // initializeCatalog — iconUri feeds the native Snap purchase sheet on device.
  static catalogForCommerce(): any[] {
    return CATALOG.map((p) => ({
      id: p.id,
      type: "NonConsumable",
      displayName: "IKEA " + p.name + " — " + p.desc,
      price: {price: p.usd, currency: "USD"},
      iconUri: p.img + ICON_SIZE,
    }))
  }

  /** Thumbnail URL for a Shop-tab row (smallest size — Lens perf). */
  static thumbUrl(p: IkeaProduct): string {
    return p.img + THUMB_SIZE
  }

  // Match a shopping suggestion (item + reason + search text) to a catalog product
  static match(text: string): IkeaProduct | null {
    const t = text.toLowerCase()
    let best: IkeaProduct | null = null
    let bestScore = 0
    for (const p of CATALOG) {
      let score = 0
      for (const k of p.keywords) {
        if (t.indexOf(k) >= 0) score += k.length // longer keyword = stronger signal
      }
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
    return bestScore > 3 ? best : null
  }
}
