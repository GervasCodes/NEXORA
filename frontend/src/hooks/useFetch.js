import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useFetch (Phase 4 remediation).
 *
 * A number of pages fetched on mount with a bare `.then(setState)` and
 * either no `.catch()` at all, or a `.catch(() => {})` that threw the
 * error away - so a network failure left the page stuck on its loading
 * spinner forever (Wallet, Loyalty) or silently showed an empty/default
 * state indistinguishable from "there's genuinely nothing here"
 * (Affiliate, Saved). This hook is the one place that loading/error/data
 * bookkeeping happens, so a page can't forget the `.catch()`.
 *
 * `fetcher` is a function returning a promise that resolves to the data
 * to store (already unwrapped from the axios response / `data.data`
 * envelope - callers do that in the fetcher itself, since the envelope
 * shape isn't this hook's concern). It is re-run whenever anything in
 * `deps` changes, and can be re-run on demand via the returned `retry`.
 *
 * `fetcher` may return `{ notFound: true }` (or throw an error with
 * `.notFound = true`) to distinguish an expected "no such resource"
 * state (e.g. Affiliate's 404 "not an affiliate yet") from a genuine
 * load failure - see the `notFound` flag in the return value, which a
 * caller can branch on separately from `error`.
 */
export default function useFetch(fetcher, deps = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notFound, setNotFound] = useState(false);
    // Guards against setting state after the component unmounted, and
    // against a stale retry's response landing after a newer one -
    // bumped on every call, only the response from the call that
    // started last is applied.
    const requestId = useRef(0);

    const run = useCallback(() => {
        const thisRequest = ++requestId.current;
        setLoading(true);
        setError(null);
        setNotFound(false);
        return Promise.resolve()
            .then(fetcher)
            .then((result) => {
                if (requestId.current !== thisRequest) return;
                if (result && result.notFound) {
                    setNotFound(true);
                    setData(null);
                } else {
                    setData(result);
                }
            })
            .catch((err) => {
                if (requestId.current !== thisRequest) return;
                if (err && err.notFound) {
                    setNotFound(true);
                    setData(null);
                } else {
                    setError(err);
                }
            })
            .finally(() => {
                if (requestId.current === thisRequest) setLoading(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { data, loading, error, notFound, retry: run, setData };
}
