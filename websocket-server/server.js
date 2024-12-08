const WebSocket = require("ws");

const server = new WebSocket.Server({ port: 8080 });

server.on("connection", (socket) => {
	console.log("Client connected");

	socket.on("message", (message) => {
		console.log(`Received message: ${message}`);

		// Broadcast the message to all connected clients
		server.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message);
			}
		});
	});

	socket.on("close", () => {
		console.log("Client disconnected");
	});

	socket.on("error", (error) => {
		console.error("WebSocket error:", error);
	});
});

console.log("WebSocket server is running on ws://localhost:8080");
