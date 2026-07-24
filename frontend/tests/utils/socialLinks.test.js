import { describe, it, expect } from "vitest";
import { getSocialLinks } from "../../src/utils/socialLinks";

describe("getSocialLinks", () => {
    it("returns an empty array when none of the fields are set", () => {
        expect(getSocialLinks({})).toEqual([]);
    });

    it("turns a bare Instagram handle into a profile URL", () => {
        const links = getSocialLinks({ social_instagram: "@mamantilie" });
        expect(links).toEqual([{ key: "instagram", label: "Instagram", href: "https://instagram.com/mamantilie" }]);
    });

    it("leaves a full Instagram URL untouched", () => {
        const links = getSocialLinks({ social_instagram: "https://instagram.com/mamantilie" });
        expect(links[0].href).toBe("https://instagram.com/mamantilie");
    });

    it("turns a bare Facebook page name into a page URL", () => {
        const links = getSocialLinks({ social_facebook: "mamantilie" });
        expect(links).toEqual([{ key: "facebook", label: "Facebook", href: "https://facebook.com/mamantilie" }]);
    });

    it("strips non-digit characters from a WhatsApp number for the wa.me link", () => {
        const links = getSocialLinks({ social_whatsapp: "+255 700 000 000" });
        expect(links).toEqual([{ key: "whatsapp", label: "WhatsApp", href: "https://wa.me/255700000000" }]);
    });

    it("returns links in a fixed order and skips unset fields", () => {
        const links = getSocialLinks({
            social_whatsapp: "255700000000",
            social_instagram: "mamantilie"
        });
        expect(links.map((l) => l.key)).toEqual(["instagram", "whatsapp"]);
    });
});
