# NEXORA - tests + upload progress

Drop the files into the matching paths (all under `frontend/`).

## 1. Tests
New: `tests/components/ui/ProgressBar.test.jsx` (9), `tests/components/ui/PullToRefresh.test.jsx` (18),
`tests/hooks/useInfiniteScroll.test.jsx` (14).
Extended: `tests/components/ui/Button.test.jsx` (4 -> 15 tests: type, disabled, loading, sizes, polymorphic link, ref).

Cleanup - 3 stale tests that were already failing on the uploaded zip (not caused by this change):
- `tests/a11y/keyPages.a11y.test.jsx` - waited for a "Next slide" button; the carousel is intentionally arrow-less now.
- `tests/pages/StorePage.test.jsx` - expected "Loading..." text; page now shows a skeleton labelled `loading.store`.
- `tests/pages/stock/Phase8Screens.test.jsx` - exact-args assertion; importStockItems now also receives `onUploadProgress`.

## 2. Upload progress
- `src/components/delivery/DeliveryProofForm.jsx` - ProgressBar under the photo input while uploading (new `uploadProgress` prop).
- `src/pages/delivery/DeliveryMine.jsx` - `useUploadProgress` wired into the delivery-proof photo PUT.
- `src/pages/Register.jsx` - ProgressBar on the documents step while the multipart registration uploads.
- `src/context/AuthContext.jsx` - `register(payload, { onUploadProgress })`; only forwarded for FormData, JSON path unchanged.
New tests: `tests/components/DeliveryProofForm.test.jsx`, `tests/pages/RegisterUploadProgress.test.jsx`, 2 added to `tests/context/AuthContext.test.jsx`.

## Verification
Full suite: 90 files / 549 tests passing. ESLint clean on the 4 touched source files.
