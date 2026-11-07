import { useCallback, useState } from "react";

/**
 * useUploadProgress - bookkeeping for a single axios upload.
 *
 *   const { progress, onUploadProgress, reset } = useUploadProgress();
 *   await api.post(url, formData, { onUploadProgress });
 *   ...finally { reset(); }
 *   {progress !== null && <ProgressBar value={progress} />}
 *
 * `progress` is 0-100 while bytes are being sent and null when idle.
 * (It reports bytes *sent*; the brief server-side processing afterwards
 * is covered by the caller's own busy state.)
 */
export default function useUploadProgress() {
    const [progress, setProgress] = useState(null);
    const onUploadProgress = useCallback((e) => {
        if (e && e.total) setProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        else setProgress((p) => (p === null ? 0 : p));
    }, []);
    const reset = useCallback(() => setProgress(null), []);
    return { progress, onUploadProgress, reset };
}
