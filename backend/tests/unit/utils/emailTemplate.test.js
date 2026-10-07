const { escapeHtml, html, rawHtml, textToHtml } = require("../../../src/utils/emailTemplate");

describe("emailTemplate", () => {
    it("escapes HTML metacharacters", () => {
        expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
            "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"
        );
    });

    it("treats null and undefined as empty", () => {
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
    });

    it("escapes interpolated values in the html tag but not the template itself", () => {
        const name = `<img src=x onerror=alert(1)>`;
        expect(html`<p>Hello ${name}</p>`).toBe("<p>Hello &lt;img src=x onerror=alert(1)&gt;</p>");
    });

    it("leaves explicitly trusted markup alone", () => {
        expect(html`<p>${rawHtml("<b>ok</b>")}</p>`).toBe("<p><b>ok</b></p>");
    });

    it("turns plain text into escaped paragraphs and line breaks", () => {
        expect(textToHtml("Hi <b>there</b>\nsecond line\n\nNew paragraph")).toBe(
            "<p>Hi &lt;b&gt;there&lt;/b&gt;<br>second line</p><p>New paragraph</p>"
        );
    });
});
