import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { LanguageProvider } from "../../../src/context/LanguageContext";
import Select from "../../../src/components/ui/Select";
import FieldError from "../../../src/components/ui/FieldError";
import PhoneInput from "../../../src/components/PhoneInput";

describe("Select", () => {
    it("links the error to the control and marks it invalid", () => {
        render(
            <Select id="reason" label="Reason" error="Choose a reason." value="" onChange={() => {}}>
                <option value="" disabled>Pick</option>
                <option value="a">A</option>
            </Select>
        );
        const select = screen.getByLabelText("Reason");
        expect(select).toHaveAttribute("aria-invalid", "true");
        expect(select).toHaveAttribute("aria-describedby", "reason-error");
        expect(screen.getByRole("alert")).toHaveTextContent("Choose a reason.");
        expect(select.className).toContain("border-coral");
    });

    it("shows the hint, and no invalid state, when there is no error", () => {
        render(
            <Select id="reason" label="Reason" hint="Pick one" value="a" onChange={() => {}}>
                <option value="a">A</option>
            </Select>
        );
        const select = screen.getByLabelText("Reason");
        expect(select).not.toHaveAttribute("aria-invalid");
        expect(select).toHaveAttribute("aria-describedby", "reason-hint");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("has no detectable accessibility violations with an error showing", async () => {
        const { container } = render(
            <Select id="reason" label="Reason" error="Choose a reason." value="" onChange={() => {}}>
                <option value="" disabled>Pick</option>
            </Select>
        );
        expect(await axe(container)).toHaveNoViolations();
    });
});

describe("FieldError", () => {
    it("renders nothing without a message", () => {
        const { container } = render(<FieldError id="x">{undefined}</FieldError>);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders an alert with the id the control should point at", () => {
        render(<FieldError id="terms">Accept the terms.</FieldError>);
        expect(screen.getByRole("alert")).toHaveAttribute("id", "terms-error");
    });
});

describe("PhoneInput error", () => {
    const renderPhone = (props) =>
        render(
            <LanguageProvider>
                <label htmlFor="ph">Phone</label>
                <PhoneInput id="ph" value="" onChange={() => {}} {...props} />
            </LanguageProvider>
        );

    it("marks the number field invalid and describes it with the message", () => {
        renderPhone({ error: "Enter a phone number." });
        const input = screen.getByLabelText("Phone");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAttribute("aria-describedby", "ph-error");
        expect(screen.getByRole("alert")).toHaveTextContent("Enter a phone number.");
    });

    it("is unchanged when there is no error", () => {
        renderPhone({});
        const input = screen.getByLabelText("Phone");
        expect(input).not.toHaveAttribute("aria-invalid");
        expect(input).not.toHaveAttribute("aria-describedby");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});
