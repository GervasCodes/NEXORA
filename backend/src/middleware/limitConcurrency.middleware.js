// Caps how many requests run a given (memory-heavy) handler at once on this
// process. Used for video uploads, which are buffered in RAM (up to 50 MB
// each) - without a cap a handful of simultaneous uploads can exhaust memory.
// Excess requests get a clear, retryable 503 instead of crashing the server.
module.exports = (max, message = "The server is busy processing other uploads. Please try again in a moment.") => {
    let active = 0;
    return (req, res, next) => {
        if (active >= max) {
            res.set("Retry-After", "10");
            return res.status(503).json({ success: false, message });
        }
        active += 1;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            active -= 1;
        };
        res.on("finish", release);
        res.on("close", release);
        next();
    };
};
