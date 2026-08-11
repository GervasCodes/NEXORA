const registry = require("../../../src/modules/ai/providers/registry");

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

describe("ai/providers/registry.getActiveProvider", () => {
    it("returns null when AI_PROVIDER is unset (the default, no-code-change state)", () => {
        delete process.env.AI_PROVIDER;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;

        expect(registry.getActiveProvider()).toBeNull();
    });

    it("returns null when AI_PROVIDER names a real provider but its API key isn't set", () => {
        process.env.AI_PROVIDER = "anthropic";
        delete process.env.ANTHROPIC_API_KEY;

        expect(registry.getActiveProvider()).toBeNull();
    });

    it("returns null for an unrecognized AI_PROVIDER value", () => {
        process.env.AI_PROVIDER = "some-typo'd-vendor";

        expect(registry.getActiveProvider()).toBeNull();
    });

    it("returns the anthropic adapter when selected and configured", () => {
        process.env.AI_PROVIDER = "anthropic";
        process.env.ANTHROPIC_API_KEY = "sk-test";

        const provider = registry.getActiveProvider();
        expect(provider).not.toBeNull();
        expect(provider.name).toBe("anthropic");
    });

    it("returns the openai adapter when selected and configured", () => {
        process.env.AI_PROVIDER = "openai";
        process.env.OPENAI_API_KEY = "sk-test";

        const provider = registry.getActiveProvider();
        expect(provider).not.toBeNull();
        expect(provider.name).toBe("openai");
    });
});

describe("ai/providers/registry.isAnyConfigured", () => {
    it("mirrors getActiveProvider as a boolean", () => {
        delete process.env.AI_PROVIDER;
        expect(registry.isAnyConfigured()).toBe(false);

        process.env.AI_PROVIDER = "anthropic";
        process.env.ANTHROPIC_API_KEY = "sk-test";
        expect(registry.isAnyConfigured()).toBe(true);
    });
});

describe("ai/providers/registry.validateRegistry", () => {
    const makeLogger = () => ({ warn: jest.fn() });

    it("does nothing when AI_PROVIDER is unset - not configuring AI is not a warning", () => {
        delete process.env.AI_PROVIDER;
        const logger = makeLogger();

        registry.validateRegistry(logger);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("warns when AI_PROVIDER is set to an unrecognized value", () => {
        process.env.AI_PROVIDER = "not-a-real-provider";
        const logger = makeLogger();

        registry.validateRegistry(logger);

        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it("warns when AI_PROVIDER is recognized but its credentials are missing", () => {
        process.env.AI_PROVIDER = "openai";
        delete process.env.OPENAI_API_KEY;
        const logger = makeLogger();

        registry.validateRegistry(logger);

        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it("stays silent when AI_PROVIDER is recognized and fully configured", () => {
        process.env.AI_PROVIDER = "openai";
        process.env.OPENAI_API_KEY = "sk-test";
        const logger = makeLogger();

        registry.validateRegistry(logger);

        expect(logger.warn).not.toHaveBeenCalled();
    });
});
