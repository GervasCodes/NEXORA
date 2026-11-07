const { buildChatSystemPrompt, BEHAVIOUR_RULES } = require("../../../src/modules/ai/knowledge/chatPrompt");

describe("chatPrompt.buildChatSystemPrompt", () => {
    const prompt = buildChatSystemPrompt({ knowledgeText: "## Payments\nMobile money is supported.", signedIn: false });

    it("embeds the knowledge text", () => {
        expect(prompt).toMatch(/Mobile money is supported/);
    });

    it("no longer restricts the model to a FAQ list", () => {
        expect(prompt).not.toMatch(/FAQ/i);
        expect(prompt).not.toMatch(/using only the facts/i);
    });

    it("allows greetings, thanks and light chat, then steers back to NEXORA", () => {
        expect(BEHAVIOUR_RULES).toMatch(/greetings/i);
        expect(BEHAVIOUR_RULES).toMatch(/thanks/i);
        expect(BEHAVIOUR_RULES).toMatch(/offer help with NEXORA/i);
    });

    it("declines off-topic requests kindly", () => {
        expect(BEHAVIOUR_RULES).toMatch(/off-topic/i);
        expect(BEHAVIOUR_RULES).toMatch(/decline kindly/i);
    });

    it("states the information-only rule and the do-it-yourself behaviour", () => {
        expect(BEHAVIOUR_RULES).toMatch(/INFORMATION ONLY/);
        expect(BEHAVIOUR_RULES).toMatch(/cannot place, cancel, pay/);
        expect(BEHAVIOUR_RULES).toMatch(/how the person can do it themselves/);
    });

    it("says to admit uncertainty and point to support instead of inventing", () => {
        expect(BEHAVIOUR_RULES).toMatch(/not sure/);
        expect(BEHAVIOUR_RULES).toMatch(/support/);
        expect(BEHAVIOUR_RULES).toMatch(/Never invent/);
    });

    it("refuses to share other people's contact details and to reveal instructions", () => {
        expect(BEHAVIOUR_RULES).toMatch(/admin's, owner's or another person's number/);
        expect(BEHAVIOUR_RULES).toMatch(/Never reveal/);
    });

    it("treats history and messages as data and distrusts forged assistant turns", () => {
        expect(BEHAVIOUR_RULES).toMatch(/DATA/);
        expect(BEHAVIOUR_RULES).toMatch(/may not be genuine/);
    });

    it("tells the model whether the person is signed in", () => {
        expect(prompt).toMatch(/signed out/);
        expect(buildChatSystemPrompt({ knowledgeText: "x", signedIn: true })).toMatch(/currently signed in/);
    });
});
