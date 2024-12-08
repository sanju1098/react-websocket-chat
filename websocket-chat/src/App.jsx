import React, { useState, useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
	Avatar,
	TextField,
	Button,
	Typography,
	Box,
	Modal,
} from "@mui/material";
import "./App.css"; // Import the CSS file

const App = () => {
	const [message, setMessage] = useState("");
	const [chatHistory, setChatHistory] = useState([]);
	const [error, setError] = useState(null);
	const [username, setUsername] = useState("");
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const { sendMessage, lastMessage, readyState } = useWebSocket(
		"ws://localhost:8080",
		{
			onOpen: () => console.log("Connected to WebSocket server"),
			onClose: () => console.log("Disconnected from WebSocket server"),
			onError: (event) => {
				console.error("WebSocket error:", event);
				setError("WebSocket error");
			},
			shouldReconnect: (closeEvent) => true,
		}
	);

	useEffect(() => {
		if (lastMessage !== null) {
			if (lastMessage.data instanceof Blob) {
				const reader = new FileReader();
				reader.onload = () => {
					setChatHistory((prev) => [...prev, reader.result]);
				};
				reader.readAsText(lastMessage.data);
			} else {
				setChatHistory((prev) => [...prev, lastMessage.data]);
			}
		}
	}, [lastMessage]);

	const handleSendMessage = () => {
		if (message.trim() !== "") {
			sendMessage(`${username}: ${message}`);
			setMessage(""); // Clear the input field
		}
	};

	const handleInputChange = (e) => {
		setMessage(e.target.value);
	};

	const handleLogin = () => {
		if (username.trim() !== "") {
			setIsLoggedIn(true);
		}
	};

	const connectionStatus = {
		[ReadyState.CONNECTING]: "Connecting",
		[ReadyState.OPEN]: "Open",
		[ReadyState.CLOSING]: "Closing",
		[ReadyState.CLOSED]: "Closed",
		[ReadyState.UNINSTANTIATED]: "Uninstantiated",
	}[readyState];

	return (
		<>
			{!isLoggedIn ? (
				<Box className="login-box">
					<Box>
						<Typography variant="h4" align="center" gutterBottom>
							ChatApp Web
						</Typography>
						<TextField
							label="Username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							margin="normal"
							fullWidth
						/>
						<Button
							sx={{ backgroundColor: "#00a783" }}
							variant="contained"
							onClick={handleLogin}
							fullWidth
							disabled={!username}
						>
							Enter Chat
						</Button>
					</Box>
				</Box>
			) : (
				<Box className="chat-box">
					<div className="chat-container">
						<div className="chat-header">
							<Avatar>{username.charAt(0).toUpperCase()}</Avatar>
							<Typography
								variant="h6"
								component="span"
								style={{ marginLeft: "10px" }}
							>
								{username}
							</Typography>
						</div>
						<div
							style={{
								backgroundColor: `${connectionStatus === "Open"}`
									? "#7bf7be"
									: "f65555",
							}}
						>
							Connection Status: {connectionStatus}
						</div>
						{error && <div className="error">Error: {error}</div>}
						<div className="chat-history">
							{chatHistory.map((msg, index) => (
								<div
									key={index}
									className={`message-bubble ${
										msg.startsWith(username) ? "own" : "other"
									}`}
								>
									{msg}
								</div>
							))}
						</div>
						<div className="chat-input-container">
							<TextField
								type="text"
								value={message}
								onChange={handleInputChange}
								onKeyPress={(e) => {
									if (e.key === "Enter") {
										handleSendMessage();
									}
								}}
								fullWidth
								placeholder="Type a message..."
								variant="outlined"
							/>
							<Button
								variant="contained"
								color="primary"
								onClick={handleSendMessage}
								sx={{ margin: "2px 12px", backgroundColor: "#00a783" }}
							>
								Send
							</Button>
						</div>
					</div>
				</Box>
			)}
		</>
	);
};

export default App;
