const {
    SUGGESTED_TOPIC_IDS, TOPICS, TOPIC_QUESTIONS, TEMPLATES,
    detectLanguage, classifySmallTalk, matchTopic, buildFallback
} = require("../../../src/modules/ai/knowledge/fallback");

describe("fallback.detectLanguage", () => {
    it.each([
        ["Mambo vipi", undefined, "sw"],
        ["nafuatiliaje agizo langu", undefined, "sw"],
        ["how do I track my order", undefined, "en"],
        ["hello", "sw", "sw"],
        ["xyz", undefined, "en"],
        ["how do I track my order", "sw", "en"]
    ])("%s (hint %s) -> %s", (message, hint, expected) => {
        expect(detectLanguage(message, hint)).toBe(expected);
    });

    it("ignores an unsupported hint", () => {
        expect(detectLanguage("xyz", "fr")).toBe("en");
    });
});

describe("fallback.classifySmallTalk", () => {
    it.each(["hi", "Hello!", "hey there", "good morning", "Mambo", "mambo vipi", "habari yako", "Niaje", "Hujambo"])(
        "treats %s as a greeting", (message) => expect(classifySmallTalk(message)).toBe("greeting")
    );

    it.each(["thanks", "Thank you!", "asante", "Asante sana", "thx"])(
        "treats %s as thanks", (message) => expect(classifySmallTalk(message)).toBe("thanks")
    );

    it("does not treat a greeting followed by a real question as small talk", () => {
        expect(classifySmallTalk("hi, how do I track my order?")).toBeNull();
        expect(classifySmallTalk("mambo nataka kujua jinsi ya kulipa kwa simu leo")).toBeNull();
    });

    it("does not treat unrelated or empty text as small talk", () => {
        expect(classifySmallTalk("")).toBeNull();
        expect(classifySmallTalk("who won the match")).toBeNull();
        expect(classifySmallTalk("this is a high priority")).toBeNull();
    });
});

describe("fallback.matchTopic", () => {
    it("matches whole words and stems, not substrings inside other words", () => {
        expect(matchTopic("how do refunds work")).toBe("refunds");
        expect(matchTopic("I want to cancel")).toBe("cancel_order");
        expect(matchTopic("what is a facebook page")).toBeNull();
        expect(matchTopic("asdkjfh qwerty nonsense")).toBeNull();
    });
});

describe("fallback.buildFallback", () => {
    it("greets in English and offers topic buttons", () => {
        const r = buildFallback({ message: "hi" });
        expect(r.reply).toBe(TEMPLATES.greeting.en);
        expect(r.suggestedTopics).toEqual(SUGGESTED_TOPIC_IDS);
    });

    it("greets in Swahili", () => {
        const r = buildFallback({ message: "mambo" });
        expect(r.reply).toBe(TEMPLATES.greeting.sw);
        expect(r.language).toBe("sw");
    });

    it("replies to thanks with no buttons", () => {
        expect(buildFallback({ message: "asante sana" })).toMatchObject({ reply: TEMPLATES.thanks.sw, suggestedTopics: [] });
        expect(buildFallback({ message: "thank you" })).toMatchObject({ reply: TEMPLATES.thanks.en, suggestedTopics: [] });
    });

    it("answers a matched topic in the detected language with no buttons", () => {
        expect(buildFallback({ message: "how do I track my order" })).toMatchObject({ reply: TOPICS.track_order.answer.en, suggestedTopics: [] });
        expect(buildFallback({ message: "nawezaje kuwa muuzaji" }).reply).toBe(TOPICS.become_seller.answer.sw);
    });

    it("replaces the generic dead-end with an honest 'not sure' plus topic buttons", () => {
        const r = buildFallback({ message: "asdkjfh qwerty nonsense" });
        expect(r.reply).toBe(TEMPLATES.notSure.en);
        expect(r.reply).toMatch(/support/i);
        expect(r.suggestedTopics).toEqual(SUGGESTED_TOPIC_IDS);
    });

    it("uses the UI language hint when the message itself is ambiguous", () => {
        expect(buildFallback({ message: "qwerty", language: "sw" }).reply).toBe(TEMPLATES.notSure.sw);
    });

    it("never answers an off-topic or action request with a made-up fact", () => {
        const r = buildFallback({ message: "order this for me" });
        expect(r.reply).toBe(TEMPLATES.notSure.en);
    });
});

describe("fallback topic buttons", () => {
    // These strings must stay identical to frontend i18n keys
    // assistant.topic.<id>.question in en.js / sw.js.
    it.each(SUGGESTED_TOPIC_IDS.flatMap((id) => ["en", "sw"].map((lang) => [id, lang])))(
        "button question for %s (%s) resolves to its own topic answer in that language",
        (id, lang) => {
            const question = TOPIC_QUESTIONS[id][lang];
            expect(matchTopic(question)).toBe(id);
            expect(buildFallback({ message: question, language: lang }).reply).toBe(TOPICS[id].answer[lang]);
        }
    );

    it("every suggested id has a topic, a question and an answer in both languages", () => {
        for (const id of SUGGESTED_TOPIC_IDS) {
            for (const lang of ["en", "sw"]) {
                expect(TOPICS[id].answer[lang]).toBeTruthy();
                expect(TOPIC_QUESTIONS[id][lang]).toBeTruthy();
            }
        }
    });

    it("keeps internal terms out of every canned reply", () => {
        const all = JSON.stringify([TOPICS, TEMPLATES]);
        expect(all).not.toMatch(/escrow|token cap|admin manual|fraud|credential|password/i);
    });
});

describe("fallback regressions found by the Phase 4 evaluation set", () => {
    it("treats 'asante kwa msaada' and 'thanks for the help' as thank-yous, not support requests", () => {
        for (const message of ["ahsante kwa msaada", "asante kwa msaada wako", "thanks for the help", "thank you for your support"]) {
            expect(classifySmallTalk(message)).toBe("thanks");
        }
    });

    it("still treats a real support request that mentions thanks as a question", () => {
        expect(classifySmallTalk("thanks, I need support")).toBeNull();
    });

    it("matches the Swahili infinitive 'kurudisha' as a returns question", () => {
        expect(matchTopic("Naweza kurudisha bidhaa nikiona haifai?")).toBe("refunds");
    });

    it("matches 'kufungua duka' as a become-a-seller question", () => {
        expect(matchTopic("Ninawezaje kufungua duka kwenye NEXORA?")).toBe("become_seller");
    });
});
