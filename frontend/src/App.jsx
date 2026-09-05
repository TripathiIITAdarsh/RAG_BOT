import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);

  const handleSend = async () => {
  if (!message.trim()) return;

  const question = message;

  setMessages((prev) => [
    ...prev,
    { role: "user", text: question }
  ]);

  setMessage("");

  try {
    const response = await fetch(
      `http://localhost:5000/api/search?q=${encodeURIComponent(question)}`
    );

    const data = await response.json();

    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: data.answer }
    ]);

  } catch (error) {
    console.error(error);

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text: "Sorry, something went wrong."
      }
    ]);
  }
};

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
};

const handleUpload = async () => {
  if (!file) return;

  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch("http://localhost:5000/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  console.log(data);
};

  return (
  <div className="app">
    <div className="chat-container">

      <div className="chat-header">
        <h1>RAG Chatbot</h1>
        <p>Ask questions about your documents</p>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome">
            <h2>👋 Welcome!</h2>
            <p>Upload a document and start asking questions.</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.role}`}
            >
              {msg.text}
            </div>
          ))
        )}
      </div>

      {/* Upload */}
      <div className="upload-section">
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
        />

        <button onClick={handleUpload}>
          Upload PDF
        </button>
      </div>

      {/* Chat input */}
      <div className="chat-input">
        <input
          type="text"
          placeholder="Ask something..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
        />

        <button onClick={handleSend}>
          Send
        </button>
      </div>

    </div>
  </div>
);
}

export default App;