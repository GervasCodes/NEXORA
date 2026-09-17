// Admin "active users" view (Phase 4, per the Phase 1.3 decision:
// online-right-now/presence-based, not a filtered account-status list).
// Covers socket.js's in-process presence map directly - the thing
// admin.service.js#listUsers reads via isUserOnline() to annotate each
// row with is_online. Real sockets over a real (ephemeral-port) HTTP
// server, same pattern as socket.auth.test.js, since the presence map is
// only ever mutated from inside the real "connection"/"disconnect"
// event handlers - there's no seam to unit-test this through mocks
// without re-implementing the thing under test.
jest.mock("../../src/config/db", () => require("../helpers/mockDb"));
jest.mock("../../src/modules/chat/chat.service", () => ({}));

const http = require("http");
const { Server: HttpServer } = http;
const { io: ioClient } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const db = require("../../src/config/db");
const socket = require("../../src/socket/socket");

const signToken = (payload) => jwt.sign({ id: 1, role: "buyer", tv: 0, ...payload }, process.env.JWT_SECRET);

// Presence state changes on the server as a direct side effect of a
// socket.io "connection"/"disconnect" event firing on the server, which
// happens asynchronously relative to the client-side connect/close call
// resolving. Poll briefly rather than asserting immediately after
// client.close() - a fixed setTimeout would either flake under load or
// pad every test with dead time.
const waitFor = async (predicate, { timeoutMs = 2000, intervalMs = 20 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return predicate();
};

describe("Socket.IO presence tracking (admin active-users view)", () => {
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

    const connect = (userId) => new Promise((resolve, reject) => {
        db.query.mockResolvedValueOnce([[{ is_active: 1, suspended_at: null, token_version: 0 }]]);

        const client = ioClient(`http://localhost:${port}`, {
            auth: { token: signToken({ id: userId }) },
            reconnection: false,
            transports: ["websocket"]
        });

        client.on("connect", () => resolve(client));
        client.on("connect_error", reject);
    });

    it("marks a user online on connect and offline again once their socket disconnects", async () => {
        expect(socket.isUserOnline(101)).toBe(false);

        const client = await connect(101);
        expect(socket.isUserOnline(101)).toBe(true);
        expect(socket.getOnlineUserIds()).toContain(101);

        client.close();
        await waitFor(() => socket.isUserOnline(101) === false);

        expect(socket.isUserOnline(101)).toBe(false);
        expect(socket.getOnlineUserIds()).not.toContain(101);
    });

    it("keeps a user online while ANY of their sockets is still open (two tabs)", async () => {
        const tabA = await connect(202);
        const tabB = await connect(202);
        expect(socket.isUserOnline(202)).toBe(true);

        tabA.close();
        await waitFor(() => true, { timeoutMs: 100 }); // let the first disconnect settle
        expect(socket.isUserOnline(202)).toBe(true); // tabB still open

        tabB.close();
        await waitFor(() => socket.isUserOnline(202) === false);
        expect(socket.isUserOnline(202)).toBe(false);
    });

    it("tracks multiple distinct users independently in getOnlineCount", async () => {
        const before = socket.getOnlineCount();

        const clientA = await connect(303);
        const clientB = await connect(404);
        expect(socket.getOnlineCount()).toBe(before + 2);

        clientA.close();
        clientB.close();
        await waitFor(() => socket.getOnlineCount() === before);
        expect(socket.getOnlineCount()).toBe(before);
    });
});
