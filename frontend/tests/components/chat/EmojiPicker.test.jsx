import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import EmojiPicker, { REACTION_EMOJIS } from "../../../src/components/chat/EmojiPicker";

describe("EmojiPicker", () => {
    it("renders every reaction in the curated set (kept in lockstep with the backend's ALLOWED_REACTIONS)", () => {
        render(<EmojiPicker onSelect={() => {}} />);
        REACTION_EMOJIS.forEach((emoji) => {
            expect(screen.getByRole("menuitem", { name: emoji })).toBeInTheDocument();
        });
    });

    it("calls onSelect with the clicked emoji", () => {
        const onSelect = vi.fn();
        render(<EmojiPicker onSelect={onSelect} />);

        fireEvent.click(screen.getByRole("menuitem", { name: "🔥" }));
        expect(onSelect).toHaveBeenCalledWith("🔥");
    });

    it("marks an emoji the user already reacted with as pressed", () => {
        render(<EmojiPicker onSelect={() => {}} myReactions={["👍"]} />);

        expect(screen.getByRole("menuitem", { name: "👍" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("menuitem", { name: "🔥" })).toHaveAttribute("aria-pressed", "false");
    });
});
