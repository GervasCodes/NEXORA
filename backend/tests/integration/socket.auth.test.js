// Phase 2 (Security Hardening). Covers the fix in socket.js's `io.use`
// handshake middleware: a signature-valid JWT must now ALSO pass a fresh
// is_active/suspension/token_version check against the database before
// the socket is allowed to connect at all - mirroring
// auth.middleware.js's REST-side behavior exactly (same repository
// function, same reasoning: a 7-day token shouldn't keep working after
// the account is suspended, or after a password change bumps
// token_version).
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
// chat.service.js is required by socket.js at module load time; nothing
// in this test exercises chat behavior, so mock it out entirely to keep
// db.query's mock-call queue reserved for authRepository.findAccountStatusById.
jest.mock("../../src/modules/chat/chat.service", () => ({}));

const http = require("http");
const { Server: HttpServer } = http;
const { io: ioClient } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const db = require("../../src/config/db");
const socket = require("../../src/socket/socket");

const signToken = (payload) => jwt.sign({ id: 1, role: "buyer", tv: 0, ...payload }, process.env.JWT_SECRET);

describe("Socket.IO handshake - fresh account-status check", () => {
    let httpServer;
    let port;

    beforeAll((done) => {
        httpServer = new HttpServer();
        socket.init(httpServer);
        httpServer.listen(0, () => {
            port = httpServer.address().port;
            done();
        });
    });

    afterAll((done) => {
        httpServer.close(done);
    });

    const connectWith = (token) => new Promise((resolve) => {
        const client = ioClient(`http://localhost:${port}`, {
            auth: { token },
            reconnection: false,
            transports: ["websocket"]
        });

        client.on("connect", () => resolve({ ok: true, client }));
        client.on("connect_error", (error) => resolve({ ok: false, error, client }));
    });

    // Phase 4 (Testing & Session Hardening): the frontend no longer has
    // JS access to the token to pass via `auth: { token }` (it's an
    // httpOnly cookie now) - the handshake has to authenticate off the
    // cookie the browser sends automatically instead. Connects the same
    // way a real browser would: no `auth.token` at all, just the cookie
    // header on the initial handshake request.
    const connectWithCookie = (token) => new Promise((resolve) => {
        const client = ioClient(`http://localhost:${port}`, {
            extraHeaders: { Cookie: `nexora_session=${token}` },
            reconnection: false,
            transports: ["polling"] // websocket upgrade requests don't carry custom headers in Node's client; polling's initial HTTP request does
        });

        client.on("connect", () => resolve({ ok: true, client }));
        client.on("connect_error", (error) => resolve({ ok: false, error, client }));
    });

    it("accepts a valid token for an active account with a matching token_version", async () => {
        db.query.mockResolvedValueOnce([[{ is_active: 1, suspended_at: null, token_version: 0 }]]);

        const { ok, client } = await connectWith(signToken({ id: 1, tv: 0 }));
        expect(ok).toBe(true);
        client.close();
    });

    it("rejects a signature-valid token for a suspended account", async () => {
        db.query.mockResolvedValueOnce([[{ is_active: 0, suspended_at: new Date(), token_version: 0 }]]);

        const { ok, error } = await connectWith(signToken({ id: 2, tv: 0 }));
        expect(ok).toBe(false);
        expect(error.message).toMatch(/not active/i);
    });

    it("rejects a signature-valid token whose tv no longer matches the account's current token_version (password changed since issue)", async () => {
        db.query.mockResolvedValueOnce([[{ is_active: 1, suspended_at: null, token_version: 3 }]]);

        const { ok, error } = await connectWith(signToken({ id: 3, tv: 0 }));
        expect(ok).toBe(false);
        expect(error.message).toMatch(/invalid or expired/i);
    });

    it("rejects when the account no longer exists at all", async () => {
        db.query.mockResolvedValueOnce([[]]);

        const { ok, error } = await connectWith(signToken({ id: 999 }));
        expect(ok).toBe(false);
        expect(error.message).toMatch(/not active/i);
    });

    it("still rejects a missing token outright, before ever touching the database", async () => {
        const { ok, error } = await connectWith(undefined);
        expect(ok).toBe(false);
        expect(error.message).toMatch(/no token/i);
        expect(db.query).not.toHaveBeenCalled();
    });

    it("accepts a token sent via the httpOnly session cookie instead of the auth.token handshake field", async () => {
        db.query.mockResolvedValueOnce([[{ is_active: 1, suspended_at: null, token_version: 0 }]]);

        const { ok, client } = await connectWithCookie(signToken({ id: 1, tv: 0 }));
        expect(ok).toBe(true);
        client.close();
    });
});
