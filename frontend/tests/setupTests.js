// Import the matchers directly and register them with vitest's `expect`
// ourselves, instead of relying on the "@testing-library/jest-dom/vitest"
// auto-registration subpath. That subpath silently fails to attach the
// matchers under this project's vitest 4 / chai 6 combo (every jest-dom
// matcher - toBeInTheDocument, toHaveAttribute, toBeEmptyDOMElement, etc. -
// comes back as "Invalid Chai property"), even though the import itself
// resolves fine. Extending `expect` explicitly is the documented fallback
// and isn't sensitive to that subpath's export resolution.
import { expect, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { toHaveNoViolations } from "jest-axe";

expect.extend(matchers);
// (Accessibility & Internationalization): jest-axe's own
// "jest-axe/extend-expect" subpath has the same auto-registration problem
// documented above for jest-dom - it's built for jest's `expect`, not
// vitest's, and silently no-ops under this project's vitest 4 / chai 6
// combo. Registering the matcher explicitly avoids that.
expect.extend(toHaveNoViolations);

// jsdom (the test environment below) doesn't implement IntersectionObserver,
// so any component that uses it - ProductGrid's infinite-scroll trigger, for
// instance - throws "IntersectionObserver is not defined" the moment it
// mounts. This is a minimal stub, not a real implementation: it never
// actually fires the callback, since none of the current tests depend on
// the observer *triggering* - they just need mounting/unmounting not to
// crash. A test that needs to simulate a scroll-into-view should capture
// the callback passed to the constructor and invoke it directly.
class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}

global.IntersectionObserver = IntersectionObserverStub;

// (Metadata & Error Polish): react-helmet-async's <Helmet> throws
// ("Cannot read properties of undefined (reading 'add')") when rendered
// without a <HelmetProvider> ancestor - and none of the existing page
// test files wrap with one (each wraps manually with just MemoryRouter,
// there's no shared render helper to add it to centrally). Rather than
// touch every page test file that now renders a PageMeta/<Helmet>, mock
// the module globally: no test asserts on document.title or meta tags
// today, so a no-op that just renders nothing is behavior-neutral for
// every existing test while letting PageMeta mount without crashing.
vi.mock("react-helmet-async", () => ({
    Helmet: () => null,
    HelmetProvider: ({ children }) => children
}));

