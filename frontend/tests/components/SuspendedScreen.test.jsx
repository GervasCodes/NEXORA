import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import SuspendedScreen from "../../src/components/SuspendedScreen";

describe("SuspendedScreen", () => {
    it("shows the suspended headline and the generic contact-support copy without a reason", () => {
        render(<SuspendedScreen reason={null} onBack={() => {}} />);

        expect(screen.getByText("This account has been suspended.")).toBeInTheDocument();
        expect(screen.queryByText(/reason given/i)).not.toBeInTheDocument();
    });

    it("shows the admin-provided reason when one is given", () => {
        render(<SuspendedScreen reason="Repeated policy violations" onBack={() => {}} />);

        expect(screen.getByText(/reason given: repeated policy violations/i)).toBeInTheDocument();
    });

    it("calls onBack when 'Back to sign in' is clicked", () => {
        const onBack = vi.fn();
        render(<SuspendedScreen reason={null} onBack={onBack} />);

        screen.getByText("Back to sign in").click();
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
