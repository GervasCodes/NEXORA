const jwt = require("jsonwebtoken");

// Session tokens (generateToken.js) never carry a `typ` claim. These
// short-lived tokens always do, and authMiddleware explicitly rejects any
// token that carries one - so a login-OTP or password-reauth token can
// never be replayed as a real session token against a protected route,
// even though both are signed with the same JWT_SECRET.
const generateShortLivedToken = (typ, payload, expiresIn) => {
    return jwt.sign({ ...payload, typ }, process.env.JWT_SECRET, { expiresIn });
};

// Verifies the token AND that it carries the expected `typ`, so a
// password-reauth token can't be reused as a login pre-auth token or
// vice versa.
const verifyShortLivedToken = (typ, token) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.typ !== typ) {
        throw new Error("Invalid token");
    }

    return decoded;
};

module.exports = { generateShortLivedToken, verifyShortLivedToken };
