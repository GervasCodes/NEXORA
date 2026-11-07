// Swahili -> English search-term synonym map.
//
// Product/service names and descriptions on NEXORA are overwhelmingly
// written in English (sellers list in English even when their storefront
// UI is set to Swahili - see database/seed.js's category names), so the
// FULLTEXT index SearchBox.jsx queries (backend/src/utils/productSearch.js)
// has nothing in it to match a Swahili word against. This map lets a
// shopper typing "simu" still find "phone" listings: SearchBox expands
// the typed term to include its mapped English equivalent(s) and searches
// both, merging/deduping results - see SearchBox.jsx's useEffect.
//
// Deliberately a flat, hand-maintained list rather than a translation
// library - this only needs to cover common shopping nouns across the
// app's existing departments (Phones & Electronics, Fashion & Beauty,
// Home & Living, Groceries & Food, Vehicles & Transport, Sports &
// Outdoors) plus Services, not general-purpose Swahili<->English
// translation. Keys are lowercase; lookups normalize the typed term the
// same way before checking the map.
const SW_TO_EN = {
    // Phones & Electronics
    simu: "phone",
    "simu ya mkononi": "phone",
    kompyuta: "computer",
    laptop: "laptop",
    runinga: "television",
    televisheni: "television",
    chaja: "charger",
    hedfoni: "headphones",
    vipokea: "headphones",
    kamera: "camera",
    betri: "battery",
    saa: "watch",

    // Fashion & Beauty
    nguo: "clothes",
    mavazi: "clothes",
    viatu: "shoes",
    kiatu: "shoes",
    mkoba: "bag",
    begi: "bag",
    saruni: "salon",
    vipodozi: "cosmetics",
    manukato: "perfume",
    nywele: "hair",
    kanga: "kanga",
    kitenge: "kitenge",

    // Home & Living
    jikoni: "kitchen",
    samani: "furniture",
    fanicha: "furniture",
    kitanda: "bed",
    godoro: "mattress",
    sofa: "sofa",
    friji: "fridge",
    jiko: "stove",

    // Groceries & Food
    chakula: "food",
    mboga: "vegetables",
    matunda: "fruits",
    mchele: "rice",
    unga: "flour",
    sukari: "sugar",
    mafuta: "oil",

    // Vehicles & Transport
    gari: "car",
    pikipiki: "motorcycle",
    bodaboda: "motorcycle",
    baiskeli: "bicycle",
    matairi: "tyres",
    tairi: "tyre",
    spea: "spare parts",

    // Sports & Outdoors
    michezo: "sports",
    mpira: "ball",
    mazoezi: "fitness",

    // Services
    huduma: "service",
    usafirishaji: "delivery",
    ujenzi: "construction",
    usafi: "cleaning",
    ufundi: "repair"
};

// Reverse lookup so a shopper who types the English word still works the
// normal way (no behavior change there) while this stays a single source
// of truth for the pairing.
const EN_TO_SW = Object.entries(SW_TO_EN).reduce((acc, [sw, en]) => {
    if (!acc[en]) acc[en] = [];
    acc[en].push(sw);
    return acc;
}, {});

// Given a raw (already-trimmed) search term, returns extra terms worth
// searching alongside it - e.g. "simu" -> ["phone"]. Matches the whole
// term against the map first (covers multi-word entries like "simu ya
// mkononi"), then falls back to a per-word match so "simu mpya" (new
// phone) still picks up "phone" from its first word. Always returns a
// deduped array that excludes the original term itself.
export function getSearchSynonyms(term) {
    const normalized = (term || "").trim().toLowerCase();
    if (!normalized) return [];

    const found = new Set();

    if (SW_TO_EN[normalized]) found.add(SW_TO_EN[normalized]);

    for (const word of normalized.split(/\s+/)) {
        if (SW_TO_EN[word]) found.add(SW_TO_EN[word]);
    }

    found.delete(normalized);
    return Array.from(found);
}

export { SW_TO_EN, EN_TO_SW };
