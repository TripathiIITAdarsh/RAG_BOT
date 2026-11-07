import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import "./App.css";

/**
 * The session id is kept in sessionStorage, not localStorage: it should survive
 * a page reload but not outlive the browser tab, which is what makes each tab
 * an independent session with its own documents.
 */
const SESSION_STORAGE_KEY = "rag-session-id";

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [documents, setDocuments] = useState([]);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [isAnswering, setIsAnswering] = useState(false);

  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Restore the tab's session, or start a new one on first visit.
  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);

    if (stored) {
      setSessionId(stored);
      return;
    }

    let cancelled = false;

    api
      .createSession()
      .then((data) => {
        if (cancelled) return;

        sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
        setSessionId(data.sessionId);
      })
      .catch(() => {
        if (!cancelled) {
          setUploadStatus({
            type: "error",
            text: "Could not reach the backend. Is it running on port 5000?",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnswering]);

  const handleUpload = async () => {
    if (!file || !sessionId || isUploading) return;

    setIsUploading(true);
    setUploadStatus({ type: "pending", text: `Indexing ${file.name}...` });

    try {
      const data = await api.uploadDocument(sessionId, file);

      setDocuments(data.documents);
      setUploadStatus({
        type: "success",
        text: `${data.document.filename} indexed - ${data.document.chunks} chunks from ${data.document.pages} pages.`,
      });

      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadStatus({ type: "error", text: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    const question = message.trim();

    if (!question || !sessionId || isAnswering) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setMessage("");
    setIsAnswering(true);

    try {
      const data = await api.search(sessionId, question);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          retrieval: data.retrieval,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: error.message, isError: true },
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  /** Deletes this session's vectors and starts a fresh, empty session. */
  const handleNewSession = async () => {
    if (!sessionId) return;

    try {
      await api.deleteSession(sessionId);
    } catch {
      // Clearing the server side is best effort; the new session is what matters.
    }

    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId(null);
    setDocuments([]);
    setMessages([]);
    setUploadStatus(null);
    setFile(null);

    try {
      const data = await api.createSession();

      sessionStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId);
    } catch (error) {
      setUploadStatus({ type: "error", text: error.message });
    }
  };

  const isReady = Boolean(sessionId);

  const documentSummary =
    documents.length === 0
      ? "Answers come only from documents you upload in this session"
      : `${documents.length} document${documents.length > 1 ? "s" : ""} in this session: ${documents
          .map((doc) => doc.filename)
          .join(", ")}`;

  return (
    <div className="app">
      <div className="chat-container">
        <header className="chat-header">
          <div>
            <h1>RAG Chatbot</h1>
            <p>{documentSummary}</p>
          </div>

          <button
            className="secondary"
            onClick={handleNewSession}
            disabled={!isReady}
            title="Delete this session's documents and start over"
          >
            New session
          </button>
        </header>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="welcome">
              <h2>Welcome</h2>
              <p>Upload a PDF, then ask a question about it.</p>
              <p className="muted">
                Each browser tab is its own session. Questions are answered only
                from the documents uploaded in that session.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                <div className={msg.isError ? "bubble error" : "bubble"}>
                  {msg.text}
                </div>

                {msg.sources?.length > 0 && (
                  <details className="sources">
                    <summary>
                      {msg.sources.length} source
                      {msg.sources.length > 1 ? "s" : ""} used
                      {msg.retrieval &&
                        ` (${msg.retrieval.passedThreshold} of ${msg.retrieval.candidates} chunks scored above ${msg.retrieval.minScore})`}
                    </summary>

                    {msg.sources.map((source, i) => (
                      <div className="source" key={i}>
                        <div className="source-meta">
                          <span>
                            {source.filename} &middot; page {source.page}
                          </span>
                          <span className="score">
                            score {source.score.toFixed(3)}
                          </span>
                        </div>
                        <p>{source.snippet}</p>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))
          )}

          {isAnswering && (
            <div className="message assistant">
              <div className="bubble thinking">Searching this session...</div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="upload-section">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              setFile(e.target.files[0] ?? null);
              setUploadStatus(null);
            }}
            disabled={!isReady || isUploading}
          />

          <button
            onClick={handleUpload}
            disabled={!file || !isReady || isUploading}
          >
            {isUploading ? "Indexing..." : "Upload PDF"}
          </button>
        </div>

        {uploadStatus && (
          <p className={`status ${uploadStatus.type}`}>{uploadStatus.text}</p>
        )}

        <div className="chat-input">
          <input
            type="text"
            placeholder={isReady ? "Ask something..." : "Connecting to backend..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            disabled={!isReady || isAnswering}
          />

          <button
            onClick={handleSend}
            disabled={!message.trim() || !isReady || isAnswering}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
