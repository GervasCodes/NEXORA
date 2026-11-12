const jwt = require("jsonwebtoken");

// Administrator sessions are deliberately short: a stolen admin token is the
// highest-impact credential on the platform. ADMIN_SESSION_TTL overrides it.
const TTL_USER = "7d";
const TTL_ADMIN = process.env.ADMIN_SESSION_TTL || "8h";

const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: payload && payload.role === "admin" ? TTL_ADMIN : TTL_USER,
    });
};

module.exports = generateToken;
