import { useEffect, useState } from "react";

// Object URL for a File/Blob that is revoked on change/unmount.
export default function useObjectUrl(file) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        if (!file) {
            setUrl(null);
            return undefined;
        }
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [file]);
    return url;
}
