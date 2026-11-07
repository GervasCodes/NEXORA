import { describe, it, expect, vi, afterEach } from "vitest";
import { focusFirstInvalid, isBlank, rules, validateFields } from "../../src/utils/formErrors";

// Identity-ish translator that also shows params, so tests can see both.
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

describe("isBlank", () => {
    it("treats empty, whitespace-only, null and undefined as blank", () => {
        expect(isBlank("")).toBe(true);
        expect(isBlank("   ")).toBe(true);
        expect(isBlank(null)).toBe(true);
        expect(isBlank(undefined)).toBe(true);
        expect(isBlank("a")).toBe(false);
        expect(isBlank(0)).toBe(false);
    });
});

describe("validateFields", () => {
    it("returns only failing fields, using the first failing rule of each", () => {
        const errors = validateFields(
            {
                email: [rules.required(), rules.email()],
                password: [rules.required("auth.error.passwordRequired"), rules.minLength(8)],
                name: [rules.required()]
            },
            { email: "", password: "abc", name: "Amina" },
            t
        );
        expect(errors).toEqual({
            email: "form.error.required",
            password: 'form.error.minLength:{"min":8}'
        });
    });

    it("accepts valid values", () => {
        expect(validateFields({ email: [rules.required(), rules.email()] }, { email: " a@b.co " }, t)).toEqual({});
    });

    it("supports match, required-true and custom rules", () => {
        const errors = validateFields(
            {
                confirm: [rules.matches("password", "auth.passwordMismatchError")],
                terms: [rules.requiredTrue("auth.termsRequiredError")],
                age: [rules.custom((v) => Number(v) >= 18, "too.young")]
            },
            { password: "a", confirm: "b", terms: false, age: "12" },
            t
        );
        expect(errors).toEqual({
            confirm: "auth.passwordMismatchError",
            terms: "auth.termsRequiredError",
            age: "too.young"
        });
    });

    it("does not report a missing optional-looking value for email/minLength (required handles that)", () => {
        expect(validateFields({ a: [rules.email(), rules.minLength(5)] }, { a: "" }, t)).toEqual({});
    });
});

describe("focusFirstInvalid", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    it("focuses and scrolls to the first aria-invalid control in DOM order", () => {
        document.body.innerHTML = `
            <form id="f">
                <input id="a" />
                <input id="b" aria-invalid="true" />
                <input id="c" aria-invalid="true" />
            </form>`;
        const b = document.getElementById("b");
        b.scrollIntoView = vi.fn();

        const result = focusFirstInvalid(document.getElementById("f"));

        expect(result).toBe(b);
        expect(document.activeElement).toBe(b);
        expect(b.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it("returns null when nothing is invalid", () => {
        document.body.innerHTML = '<form id="f"><input id="a" /></form>';
        expect(focusFirstInvalid(document.getElementById("f"))).toBeNull();
    });
});
