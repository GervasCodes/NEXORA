import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { LanguageProvider, LANGUAGES } from "../../src/context/LanguageContext";
import LanguageToggle from "../../src/components/LanguageToggle";

function GoToAbout() {
    const navigate = useNavigate();
    return <button type="button" onClick={() => navigate("/about")}>go</button>;
}

const setup = (props = {}) => {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <LanguageProvider>
                <LanguageToggle {...props} />
                <GoToAbout />
                <button type="button">outside</button>
            </LanguageProvider>
        </MemoryRouter>
    );
    return user;
};

const trigger = () => screen.getByRole("button", { name: /English/ });

describe("LanguageToggle (nav variant)", () => {
    beforeEach(() => localStorage.clear());

    it("shows the current code and is closed by default", () => {
        setup();
        expect(screen.getByText("EN")).toBeInTheDocument();
        expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
        expect(trigger()).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("opens a menu listing every language in LANGUAGES, with the active one checked", async () => {
        const user = setup();
        await user.click(trigger());

        expect(trigger()).toHaveAttribute("aria-expanded", "true");
        const items = within(screen.getByRole("menu")).getAllByRole("menuitemradio");
        expect(items).toHaveLength(LANGUAGES.length);
        expect(items.map((i) => i.textContent)).toEqual(LANGUAGES.map((l) => l.label));
        expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("menuitemradio", { name: "Kiswahili" })).toHaveAttribute("aria-checked", "false");
    });

    it("selecting a language switches it and closes the menu", async () => {
        const user = setup();
        await user.click(trigger());
        await user.click(screen.getByRole("menuitemradio", { name: "Kiswahili" }));

        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(screen.getByText("SW")).toBeInTheDocument();
    });

    it("closes on Escape and returns focus to the trigger", async () => {
        const user = setup();
        await user.click(trigger());
        await user.keyboard("{Escape}");

        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(trigger()).toHaveFocus();
    });

    it("closes on an outside click", async () => {
        const user = setup();
        await user.click(trigger());
        await user.click(screen.getByRole("button", { name: "outside" }));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes on route change", async () => {
        const user = setup();
        await user.click(trigger());
        expect(screen.getByRole("menu")).toBeInTheDocument();
        // The menu is open, so reach the nav button without a pointer
        // click (which would also count as an outside click).
        act(() => screen.getByRole("button", { name: "go" }).click());
        await vi.waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    });

    it("ArrowDown on the closed trigger opens it; arrows move focus and wrap", async () => {
        const user = setup();
        trigger().focus();
        await user.keyboard("{ArrowDown}");
        expect(screen.getByRole("menu")).toBeInTheDocument();
        // Focus starts on the active option (English).
        expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus();

        await user.keyboard("{ArrowDown}");
        expect(screen.getByRole("menuitemradio", { name: "Kiswahili" })).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus();
        await user.keyboard("{ArrowUp}");
        expect(screen.getByRole("menuitemradio", { name: "Kiswahili" })).toHaveFocus();
        await user.keyboard("{Home}");
        expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveFocus();
        await user.keyboard("{End}");
        expect(screen.getByRole("menuitemradio", { name: "Kiswahili" })).toHaveFocus();
    });

    it("Enter on a focused option selects it", async () => {
        const user = setup();
        trigger().focus();
        await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
        expect(screen.getByText("SW")).toBeInTheDocument();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("Tab closes the menu", async () => {
        const user = setup();
        await user.click(trigger());
        await user.keyboard("{Tab}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
});

describe("LanguageToggle (row variant, mobile menu)", () => {
    beforeEach(() => localStorage.clear());

    it("renders as an in-flow row that expands in place and lists all languages", async () => {
        const user = setup({ variant: "row" });
        const row = screen.getByRole("button", { expanded: false });
        expect(row).toHaveTextContent("English");

        await user.click(row);
        expect(row).toHaveAttribute("aria-expanded", "true");
        expect(within(screen.getByRole("menu")).getAllByRole("menuitemradio")).toHaveLength(LANGUAGES.length);

        await user.click(screen.getByRole("menuitemradio", { name: "Kiswahili" }));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
});
