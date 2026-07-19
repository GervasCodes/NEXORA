import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyProvider, useCurrency, CURRENCIES } from "../../src/context/CurrencyContext";

// Small harness component that exposes the context's state/actions as
// clickable buttons + text nodes, so tests can drive it via user-event
// and assert on rendered output the way a consumer of the context would.
function Harness() {
    const { currency, setCurrency, syncFromProfile, format } = useCurrency();
    return (
        <div>
            <div data-testid="currency">{currency}</div>
            <div data-testid="formatted">{format(10000)}</div>
            <button onClick={() => setCurrency("USD")}>Switch to USD</button>
            <button onClick={() => setCurrency("bogus")}>Switch to bogus</button>
            <button onClick={() => syncFromProfile("KES")}>Sync from profile (KES)</button>
        </div>
    );
}

const renderWithProvider = () =>
    render(
        <CurrencyProvider>
            <Harness />
        </CurrencyProvider>
    );

beforeEach(() => {
    localStorage.clear();
});

describe("CurrencyContext", () => {
    it("defaults to TZS with no decimals when nothing is stored", () => {
        renderWithProvider();
        expect(screen.getByTestId("currency")).toHaveTextContent("TZS");
        expect(screen.getByTestId("formatted")).toHaveTextContent("TZS 10,000");
    });

    it("converts a TZS amount into the selected currency and switches to 2 decimal places", async () => {
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Switch to USD"));

        expect(screen.getByTestId("currency")).toHaveTextContent("USD");
        // 10000 TZS / 2600 = 3.846... -> USD 3.85
        expect(screen.getByTestId("formatted")).toHaveTextContent("USD 3.85");
    });

    it("persists the chosen currency to localStorage", async () => {
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Switch to USD"));

        expect(localStorage.getItem("nexora_currency")).toBe("USD");
    });

    it("restores the previously stored currency on next mount", () => {
        localStorage.setItem("nexora_currency", "GBP");
        renderWithProvider();

        expect(screen.getByTestId("currency")).toHaveTextContent("GBP");
    });

    it("ignores an unsupported currency code", async () => {
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Switch to bogus"));

        expect(screen.getByTestId("currency")).toHaveTextContent("TZS");
        expect(localStorage.getItem("nexora_currency")).toBeNull();
    });

    it("syncs from the user's profile currency only when nothing was explicitly chosen yet", async () => {
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Sync from profile (KES)"));
        expect(screen.getByTestId("currency")).toHaveTextContent("KES");
    });

    it("does not let a profile sync override a currency the user already picked", async () => {
        const user = userEvent.setup();
        renderWithProvider();

        await user.click(screen.getByText("Switch to USD"));
        await user.click(screen.getByText("Sync from profile (KES)"));

        expect(screen.getByTestId("currency")).toHaveTextContent("USD");
    });

    it("exposes every currency in a stable, sorted list", () => {
        expect(CURRENCIES).toEqual([...CURRENCIES].sort());
        expect(CURRENCIES).toContain("TZS");
    });
});
