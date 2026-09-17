import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import EmojiPicker, { REACTION_EMOJIS } from "../../../src/components/chat/EmojiPicker";

// The buttons use role="menuitemcheckbox" (not "menuitem"): each one is a
// toggle for a reaction the user can have on or off, and ARIA only allows
// the checked-state attribute on the checkbox-flavored menu roles.
describe("EmojiPicker", () => {
    it("renders every reaction in the curated set (kept in lockstep with the backend's ALLOWED_REACTIONS)", () => {
        render(<EmojiPicker onSelect={() => {}} />);
        REACTION_EMOJIS.forEach((emoji) => {
            expect(screen.getByRole("menuitemcheckbox", { name: emoji })).toBeInTheDocument();
        });
    });

    it("calls onSelect with the clicked emoji", () => {
        const onSelect = vi.fn();
        render(<EmojiPicker onSelect={onSelect} />);

        fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "🔥" }));
        expect(onSelect).toHaveBeenCalledWith("🔥");
    });

    it("marks an emoji the user already reacted with as checked", () => {
        render(<EmojiPicker onSelect={() => {}} myReactions={["👍"]} />);

        expect(screen.getByRole("menuitemcheckbox", { name: "👍" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("menuitemcheckbox", { name: "🔥" })).toHaveAttribute("aria-checked", "false");
    });
});
