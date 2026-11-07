import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/context/LanguageContext", () => ({
    useLanguage: () => ({ t: (key) => key })
}));

import DeliveryProofForm from "../../src/components/delivery/DeliveryProofForm";

const openPhotoTab = async (user) => {
    await user.click(screen.getByRole("tab", { name: "delivery.agent.proof.usePhoto" }));
};

describe("DeliveryProofForm - photo upload progress", () => {
    let originalGeo;
    beforeEach(() => { originalGeo = navigator.geolocation; });
    afterEach(() => {
        Object.defineProperty(navigator, "geolocation", { value: originalGeo, configurable: true });
    });

    it("shows no progress bar before an upload starts", async () => {
        const user = userEvent.setup();
        render(<DeliveryProofForm busy={false} uploadProgress={null} onSubmit={() => {}} onCancel={() => {}} />);
        await openPhotoTab(user);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("shows a determinate progress bar while the photo is uploading", async () => {
        const user = userEvent.setup();
        render(<DeliveryProofForm busy uploadProgress={64} onSubmit={() => {}} onCancel={() => {}} />);
        await openPhotoTab(user);
        const bar = screen.getByRole("progressbar", { name: "upload.progress" });
        expect(bar).toHaveAttribute("aria-valuenow", "64");
        expect(screen.getByText("64%")).toBeInTheDocument();
    });

    it("hides the bar when not busy even if a stale progress value is passed", async () => {
        const user = userEvent.setup();
        render(<DeliveryProofForm busy={false} uploadProgress={100} onSubmit={() => {}} onCancel={() => {}} />);
        await openPhotoTab(user);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("does not show the bar on the handover-code tab (nothing is uploaded)", () => {
        render(<DeliveryProofForm busy uploadProgress={30} onSubmit={() => {}} onCancel={() => {}} />);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("still submits the photo with GPS coordinates", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        Object.defineProperty(navigator, "geolocation", {
            value: { getCurrentPosition: (ok) => ok({ coords: { latitude: -6.8, longitude: 39.28 } }) },
            configurable: true
        });
        render(<DeliveryProofForm busy={false} onSubmit={onSubmit} onCancel={() => {}} />);
        await openPhotoTab(user);
        const file = new File(["x"], "drop.jpg", { type: "image/jpeg" });
        await user.upload(document.getElementById("dropoff-photo"), file);
        fireEvent.submit(document.getElementById("dropoff-photo").closest("form"));
        expect(onSubmit).toHaveBeenCalledWith({ photo: file, lat: -6.8, lng: 39.28 });
    });
});
