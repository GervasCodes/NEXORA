import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SideDrawer from "../../../src/components/ui/SideDrawer";

// Guards the previously-fixed "unreachable nav items" bug (a
// permanently-mounted-but-hidden scroll container, or a drawer with no
// scroll region at all, both reintroduce it) plus the standard
// dismiss affordances every consumer (Header/AdminLayout/SellerLayout)
// relies on.
describe("SideDrawer", () => {
    it("does not render its content while closed", () => {
        render(
            <SideDrawer open={false} onClose={() => {}}>
                <p>Nav content</p>
            </SideDrawer>
        );

        expect(screen.queryByText("Nav content")).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("mounts its scrollable content only while open", () => {
        render(
            <SideDrawer open={true} onClose={() => {}}>
                <p>Nav content</p>
            </SideDrawer>
        );

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Nav content")).toBeInTheDocument();
    });

    it("calls onClose on Escape", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
            <SideDrawer open={true} onClose={onClose}>
                <p>Nav content</p>
            </SideDrawer>
        );

        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose on backdrop click", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { container } = render(
            <SideDrawer open={true} onClose={onClose}>
                <p>Nav content</p>
            </SideDrawer>
        );

        const backdrop = container.querySelector('[aria-hidden="true"]');
        await user.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("unmounts after closing instead of staying hidden in the DOM", async () => {
        const { rerender } = render(
            <SideDrawer open={true} onClose={() => {}}>
                <p>Nav content</p>
            </SideDrawer>
        );
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        rerender(
            <SideDrawer open={false} onClose={() => {}}>
                <p>Nav content</p>
            </SideDrawer>
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});
