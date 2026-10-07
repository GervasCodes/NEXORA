const { isAllowedLiveSellingLink } = require("../../../src/utils/liveSellingLink");

describe("isAllowedLiveSellingLink", () => {
    it.each([
        "https://www.youtube.com/watch?v=abc",
        "https://youtu.be/abc",
        "https://m.youtube.com/live/abc",
        "https://www.facebook.com/page/videos/123",
        "https://fb.watch/abc",
        "https://www.instagram.com/someone/live",
        "https://www.tiktok.com/@someone/live"
    ])("accepts %s", (url) => {
        expect(isAllowedLiveSellingLink(url)).toBe(true);
    });

    it.each([
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "http://www.youtube.com/watch?v=abc",
        "https://evil.example.com/watch",
        "https://youtube.com.evil.example.com/watch",
        "https://notyoutube.com/watch",
        "https://user:pass@www.youtube.com/watch",
        "not a url",
        ""
    ])("rejects %s", (url) => {
        expect(isAllowedLiveSellingLink(url)).toBe(false);
    });

    it("rejects non-strings and very long values", () => {
        expect(isAllowedLiveSellingLink(undefined)).toBe(false);
        expect(isAllowedLiveSellingLink(`https://www.youtube.com/${"a".repeat(2100)}`)).toBe(false);
    });
});
