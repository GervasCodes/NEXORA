// Nexora Assistant - non-AI fallback (Workstream A, Phase 3).
//
// Used by ai.service.js#chat whenever the model could not answer: AI
// switched off, a spend cap reached, no provider configured, a provider
// error, or an empty knowledge pack. It is deterministic, free (no tokens)
// and bilingual (English / Swahili), and it never invents facts: every
// topic answer below restates what the Phase 1 pack and the app UI already
// say, at summary level.
//
// It does three things:
//   1. Greetings and thanks get a friendly template reply.
//   2. A question that clearly matches a known topic gets that topic's
//      short answer.
//   3. Anything else gets an honest "not sure" reply plus suggested-topic
//      ids. The drawer shows them as buttons; each button sends the
//      question in TOPIC_QUESTIONS (kept in step with the frontend i18n
//      keys assistant.topic.<id>.question - a test guards the matching).
//
// OWNER REVIEW REQUIRED: the Swahili wording was written by an AI and has
// not been reviewed by a native speaker.

const { SUPPORT_CONTACT } = require("./nexoraKnowledge");

const LANGUAGES = ["en", "sw"];

// Buttons offered when the assistant is not sure (order = display order).
// "bookings" is answerable by keyword but not offered as a button.
const SUGGESTED_TOPIC_IDS = ["track_order", "refunds", "payments", "cancel_order", "become_seller", "support"];

// Words with a trailing * match any word starting with that stem.
const TOPICS = {
    track_order: {
        keywords: ["track*", "where is my order", "where is my package", "order status", "fuatili*", "nafuatili*", "kufuatili*", "liko wapi", "iko wapi", "nipo wapi"],
        answer: {
            en: "Open Orders from your account menu, tap the order, then \"Track order\" to see live delivery status.",
            sw: "Fungua Maagizo kwenye menyu ya akaunti yako, bofya agizo husika, kisha \"Fuatilia agizo\" kuona hali ya usafirishaji moja kwa moja."
        }
    },
    refunds: {
        keywords: ["refund*", "money back", "return*", "rudisha*", "kurudisha*", "marejesho", "kurudishiwa", "pesa zangu"],
        answer: {
            en: "Refunds and returns are handled through your order: open it and choose \"Report a problem\" (Disputes), or start a return on a delivered order. See the Refund Policy for timelines.",
            sw: "Marejesho na refund hushughulikiwa kupitia agizo lako: lifungue na uchague \"Ripoti tatizo\" (Migogoro), au anzisha marejesho kwenye agizo lililofika. Soma Sera ya Marejesho kwa muda wake."
        }
    },
    payments: {
        keywords: ["pay", "paying", "payment*", "mobile money", "mpesa", "m-pesa", "tigo", "airtel", "halopesa", "cash on delivery", "cod", "lipa", "kulipa", "malipo", "nalipaje"],
        answer: {
            en: "NEXORA supports mobile money, card payments, the NEXORA wallet and cash on delivery where available. The options you see at checkout depend on the seller and your location.",
            sw: "NEXORA inakubali pesa za simu, kadi, pochi ya NEXORA na malipo wakati wa kupokea (pale yanapopatikana). Chaguo unazoziona wakati wa kulipa hutegemea muuzaji na eneo lako."
        }
    },
    cancel_order: {
        keywords: ["cancel*", "kughairi*", "ghairi*", "nighairi*", "futa agizo", "futa oda"],
        answer: {
            en: "You can cancel from Orders while the order is still pending or processing. Once it moves on, cancelling is no longer available and you would use \"Report a problem\" (Disputes) instead.",
            sw: "Unaweza kughairi kutoka Maagizo wakati agizo bado liko \"pending\" au \"processing\". Likishaendelea, kughairi hakupatikani tena na unatumia \"Ripoti tatizo\" (Migogoro)."
        }
    },
    become_seller: {
        keywords: ["become a seller", "become seller", "start selling", "sell on", "open a store", "open a shop", "kuwa muuzaji", "kuuza", "nauzaje", "muuzaji", "fungua duka", "kufungua duka"],
        answer: {
            en: "Create an account, then choose \"Become a seller\" from your account menu (or use the Sell page) and follow the seller setup. You will be asked for some documents and approval is needed before you can sell.",
            sw: "Fungua akaunti, kisha chagua \"Kuwa muuzaji\" kwenye menyu ya akaunti yako (au tumia ukurasa wa Uza) na ufuate hatua za usajili wa muuzaji. Utaombwa nyaraka kadhaa na idhini inahitajika kabla ya kuuza."
        }
    },
    bookings: {
        keywords: ["booking*", "book a service", "appointment*", "uhifadhi", "miadi", "kuhifadhi", "nahifadhije"],
        answer: {
            en: "For services, pick an available time on the provider's page and confirm. You can follow the status and updates under Bookings.",
            sw: "Kwa huduma, chagua muda unaopatikana kwenye ukurasa wa mtoa huduma na uthibitishe. Hali na taarifa za uhifadhi unaziona kwenye Uhifadhi."
        }
    },
    support: {
        keywords: ["support", "contact*", "customer care", "customer service", "help desk", "msaada", "wasiliana", "mawasiliano", "huduma kwa wateja"],
        answer: {
            en: `You can reach NEXORA support from the Contact page, by email at ${SUPPORT_CONTACT.email} or by phone on ${SUPPORT_CONTACT.phone}.`,
            sw: `Unaweza kuwasiliana na msaada wa NEXORA kupitia ukurasa wa Wasiliana nasi, kwa barua pepe ${SUPPORT_CONTACT.email} au kwa simu ${SUPPORT_CONTACT.phone}.`
        }
    }
};

// The question each topic button sends. MUST match the frontend i18n keys
// assistant.topic.<id>.question (en.js / sw.js) and each must match its own
// topic's keywords (asserted in the unit test).
const TOPIC_QUESTIONS = {
    track_order: { en: "How do I track my order?", sw: "Nafuatiliaje agizo langu?" },
    refunds: { en: "How do refunds and returns work?", sw: "Marejesho na refund hufanyaje kazi?" },
    payments: { en: "How can I pay on NEXORA?", sw: "Nalipaje kwenye NEXORA?" },
    cancel_order: { en: "How do I cancel an order?", sw: "Nighairije agizo?" },
    become_seller: { en: "How do I become a seller?", sw: "Nawezaje kuwa muuzaji?" },
    support: { en: "How do I contact support?", sw: "Nawasilianaje na msaada?" }
};

const TEMPLATES = {
    greeting: {
        en: "Hi! I'm Nexora Assistant. I can help with orders, payments, delivery, returns, selling and more. What would you like to know?",
        sw: "Mambo! Mimi ni Nexora Assistant. Naweza kukusaidia kuhusu maagizo, malipo, usafirishaji, marejesho, kuuza na mengineyo. Ungependa kujua nini?"
    },
    thanks: {
        en: "You're welcome! Is there anything else about NEXORA I can help with?",
        sw: "Karibu sana! Kuna jingine kuhusu NEXORA ninaloweza kukusaidia?"
    },
    notSure: {
        en: "I'm not sure about that one. Pick a topic below, or contact NEXORA support and the team will help you directly.",
        sw: "Sina uhakika kuhusu hilo. Chagua mada hapa chini, au wasiliana na msaada wa NEXORA na timu itakusaidia moja kwa moja."
    }
};

// ---- text helpers ---------------------------------------------------------

const normalize = (text) => ` ${String(text || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\u00c0-\u024f\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

const tokensOf = (normalized) => normalized.trim().split(" ").filter(Boolean);

const keywordMatches = (normalized, keyword) => {
    if (keyword.endsWith("*")) return normalized.includes(` ${keyword.slice(0, -1)}`);
    return normalized.includes(` ${keyword} `);
};

// Distinctive words only - words that are also common English are left out.
const SW_MARKERS = new Set([
    "mambo", "habari", "hujambo", "shikamoo", "salama", "asante", "ahsante", "shukrani", "vipi", "niaje", "poa", "karibu",
    "agizo", "maagizo", "oda", "nataka", "naomba", "jinsi", "gani", "nawezaje", "nitawezaje", "naweza", "nafuatiliaje",
    "nalipaje", "nighairije", "wasiliana", "nawasilianaje", "kuwa", "kuuza", "muuzaji", "malipo", "kulipa", "pesa", "bidhaa",
    "tafadhali", "sijui", "sina", "nina", "yangu", "wangu", "langu", "zangu", "kwenye", "kuhusu", "msaada", "marejesho",
    "hufanyaje", "inafanyaje", "ninawezaje", "pochi", "duka"
]);
const EN_MARKERS = new Set([
    "the", "how", "what", "where", "when", "why", "can", "could", "do", "does", "is", "are", "my", "i", "you", "to", "of",
    "please", "order", "payment", "refund", "help", "want", "need"
]);
// Bare greetings/thanks ("hello", "thanks") are deliberately NOT markers:
// they say nothing about the person's language, so the UI hint decides.

// message wins when it has clear markers; otherwise the UI language hint
// the drawer sends; otherwise English.
const detectLanguage = (message, hint) => {
    const tokens = tokensOf(normalize(message));
    const sw = tokens.filter((tk) => SW_MARKERS.has(tk)).length;
    const en = tokens.filter((tk) => EN_MARKERS.has(tk)).length;
    if (sw > en) return "sw";
    if (en > sw) return "en";
    return LANGUAGES.includes(hint) ? hint : "en";
};

const GREETING_STARTS = [
    "hi", "hello", "hey", "hallo", "good morning", "good afternoon", "good evening", "good day",
    "mambo", "habari", "hujambo", "hamjambo", "shikamoo", "salaam", "salama", "vipi", "niaje", "sasa", "poa", "hodi"
];
const THANKS_WORDS = new Set(["thanks", "thank", "thx", "asante", "ahsante", "shukrani"]);
const SMALL_TALK_MAX_TOKENS = 6;
const THANKS_FILLER = /\b(kwa|for)\s+(the\s+|your\s+)?(msaada|help|support)(\s+(wako|wenu|yenu))?\b/g;

const matchTopic = (message) => {
    const normalized = normalize(message);
    let bestId = null;
    let bestScore = 0;
    for (const [id, topic] of Object.entries(TOPICS)) {
        const score = topic.keywords.filter((kw) => keywordMatches(normalized, kw)).length;
        if (score > bestScore) {
            bestScore = score;
            bestId = id;
        }
    }
    return bestId;
};

// "greeting" | "thanks" | null. Only short messages with no topic words
// count, so "hi, how do I track my order?" is treated as a real question.
const classifySmallTalk = (message) => {
    const normalized = normalize(message);
    const tokens = tokensOf(normalized);
    if (tokens.length === 0 || tokens.length > SMALL_TALK_MAX_TOKENS) return null;
    const isThanks = tokens.some((tk) => THANKS_WORDS.has(tk));
    // "asante kwa msaada" / "thanks for the help" are thank-yous, not support
    // requests: drop that filler before looking for topic words.
    const forTopics = isThanks ? normalized.replace(THANKS_FILLER, " ") : message;
    if (matchTopic(forTopics)) return null;
    if (isThanks) return "thanks";
    if (GREETING_STARTS.some((g) => normalized.startsWith(` ${g} `))) return "greeting";
    return null;
};

// Returns { reply, suggestedTopics, language }. suggestedTopics is [] when
// the reply already answers the question or is a thank-you.
const buildFallback = ({ message, language: hint } = {}) => {
    const language = detectLanguage(message, hint);

    const smallTalk = classifySmallTalk(message);
    if (smallTalk === "thanks") return { reply: TEMPLATES.thanks[language], suggestedTopics: [], language };
    if (smallTalk === "greeting") return { reply: TEMPLATES.greeting[language], suggestedTopics: SUGGESTED_TOPIC_IDS, language };

    const topicId = matchTopic(message);
    if (topicId) return { reply: TOPICS[topicId].answer[language], suggestedTopics: [], language };

    return { reply: TEMPLATES.notSure[language], suggestedTopics: SUGGESTED_TOPIC_IDS, language };
};

module.exports = {
    LANGUAGES,
    SUGGESTED_TOPIC_IDS,
    TOPICS,
    TOPIC_QUESTIONS,
    TEMPLATES,
    detectLanguage,
    classifySmallTalk,
    matchTopic,
    buildFallback
};
