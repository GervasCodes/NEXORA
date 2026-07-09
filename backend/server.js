const http = require("http");
const app = require("./src/app");
const socket = require("./src/socket/socket");

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

socket.init(httpServer);

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
