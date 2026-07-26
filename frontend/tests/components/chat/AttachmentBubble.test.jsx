import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import AttachmentBubble from "../../../src/components/chat/AttachmentBubble";

describe("AttachmentBubble", () => {
    it("renders nothing when the message has no attachment url", () => {
        const { container } = render(
            <AttachmentBubble attachment={{ attachment_url: null }} mine={false} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders an image attachment and opens the lightbox on click", () => {
        const onOpenLightbox = vi.fn();
        render(
            <AttachmentBubble
                attachment={{ attachment_url: "https://cdn.test/photo.jpg", attachment_type: "image", attachment_name: "photo.jpg" }}
                onOpenLightbox={onOpenLightbox}
                mine
            />
        );

        fireEvent.click(screen.getByRole("button"));
        expect(onOpenLightbox).toHaveBeenCalledWith("https://cdn.test/photo.jpg");
    });

    it("renders a video element for a video attachment", () => {
        const { container } = render(
            <AttachmentBubble
                attachment={{ attachment_url: "https://cdn.test/clip.mp4", attachment_type: "video" }}
                mine={false}
            />
        );
        expect(container.querySelector("video")).toBeTruthy();
    });

    it("renders an audio element for an audio attachment", () => {
        const { container } = render(
            <AttachmentBubble
                attachment={{ attachment_url: "https://cdn.test/voice.ogg", attachment_type: "audio" }}
                mine={false}
            />
        );
        expect(container.querySelector("audio")).toBeTruthy();
    });

    it("renders a downloadable file link with a human-readable size for a generic file", () => {
        render(
            <AttachmentBubble
                attachment={{
                    attachment_url: "https://cdn.test/invoice.pdf",
                    attachment_type: "file",
                    attachment_name: "invoice.pdf",
                    attachment_size: 2 * 1024 * 1024
                }}
                mine={false}
            />
        );

        const link = screen.getByText("invoice.pdf").closest("a");
        expect(link).toHaveAttribute("href", "https://cdn.test/invoice.pdf");
        expect(link).toHaveAttribute("download", "invoice.pdf");
        expect(screen.getByText("2.0 MB")).toBeInTheDocument();
    });
});
