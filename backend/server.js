import express from "express";
import cors from "cors";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pinecone } from "@pinecone-database/pinecone";

import {
  PORT,
  CORS_ORIGIN,
  PINECONE_API_KEY,
  PINECONE_INDEX_NAME,
  MAX_UPLOAD_BYTES,
  SOURCE_SNIPPET_LENGTH,
  MIN_SCORE,
  MAX_CONTEXT_CHUNKS,
  NO_ANSWER_MESSAGE,
} from "./config.js";
import { chunkDocument } from "./utils/chunkText.js";
import { storeVectors } from "./utils/storeVector.js";
import { searchVectors } from "./utils/searchVectors.js";
import { generateAnswer } from "./utils/generateAnswer.js";
import {
  createSession,
  getSession,
  getOrCreateSession,
  addDocument,
  forgetSession,
  isValidSessionId,
  namespaceFor,
} from "./utils/sessions.js";

if (!PINECONE_API_KEY) {
  console.error("PINECONE_API_KEY is not set -- copy .env.example to .env");
  process.exit(1);
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.index(PINECONE_INDEX_NAME);

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// --------------------------------------------------------------------------
// Health
// --------------------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "RAG backend is running",
    index: PINECONE_INDEX_NAME,
    minScore: MIN_SCORE,
    maxContextChunks: MAX_CONTEXT_CHUNKS,
  });
});

// --------------------------------------------------------------------------
// Sessions
//
// A session is the unit of isolation: its documents live in their own Pinecone
// namespace, and a query only ever searches the namespace it was asked about.
// --------------------------------------------------------------------------

app.post("/api/session", (req, res) => {
  const session = createSession();

  res.status(201).json({
    sessionId: session.id,
    createdAt: session.createdAt,
    documents: [],
  });
});

app.get("/api/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ message: "Invalid session id" });
  }

  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({ message: "Unknown session" });
  }

  res.json({
    sessionId: session.id,
    createdAt: session.createdAt,
    documents: session.documents,
  });
});

/** Ends a session and deletes its vectors, so nothing is left behind. */
app.delete("/api/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ message: "Invalid session id" });
  }

  try {
    await index.deleteNamespace(namespaceFor(sessionId));
  } catch (error) {
    // A session where nothing was ever uploaded has no namespace to delete.
    console.warn(`Could not delete namespace for ${sessionId}:`, error.message);
  }

  forgetSession(sessionId);

  res.json({ message: "Session cleared", sessionId });
});

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

app.post("/api/upload", upload.single("document"), async (req, res) => {
  const sessionId = req.body?.sessionId;

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const filePath = req.file.path;

  try {
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ message: "A valid sessionId is required" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(415).json({ message: "Only PDF files are supported" });
    }

    const dataBuffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: dataBuffer });

    let parsed;

    try {
      parsed = await parser.getText();
    } finally {
      await parser.destroy();
    }

    // Chunk page by page so each chunk keeps the page number it came from.
    const chunks = chunkDocument(parsed.pages);

    if (chunks.length === 0) {
      return res.status(422).json({
        message:
          "No text found in this PDF. Scanned documents need OCR before they can be indexed.",
      });
    }

    const document = {
      id: randomUUID(),
      filename: req.file.originalname,
      pages: parsed.total,
      chunks: chunks.length,
      uploadedAt: new Date().toISOString(),
    };

    await storeVectors(index, sessionId, document, chunks);

    const session = addDocument(sessionId, document);

    res.json({
      message: "Document indexed for this session",
      sessionId,
      document,
      documents: session.documents,
    });
  } catch (error) {
    console.error("Upload failed:", error);

    res.status(500).json({ message: "Error processing PDF" });
  } finally {
    // The PDF has been embedded; the temp file on disk is no longer needed.
    await fs.unlink(filePath).catch(() => {});
  }
});

// --------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------

app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  const sessionId = req.query.sessionId;

  if (typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ message: "Query parameter 'q' is required" });
  }

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json({ message: "A valid sessionId is required" });
  }

  try {
    // Recreate a forgotten-but-valid session so a server restart does not
    // break a browser that still holds its id.
    getOrCreateSession(sessionId);

    const { matches, stats } = await searchVectors(index, sessionId, query.trim());
    const answer = await generateAnswer(query.trim(), matches);

    // Chunks can clear the relevance threshold and still not contain the
    // answer, in which case the model returns the refusal message. Listing
    // "sources" under an "I could not find it" answer would be misleading, so
    // report none.
    const answered = answer.trim() !== NO_ANSWER_MESSAGE;
    const sources = answered ? matches : [];

    res.json({
      answer,
      sources: sources.map((match) => ({
        filename: match.metadata.filename,
        page: match.metadata.page,
        score: Number(match.score.toFixed(4)),
        snippet: match.metadata.text.slice(0, SOURCE_SNIPPET_LENGTH),
      })),
      retrieval: { ...stats, answered },
    });
  } catch (error) {
    console.error("Search failed:", error);

    res.status(500).json({ message: "Search failed" });
  }
});

// --------------------------------------------------------------------------

// Multer rejects oversized uploads with its own error class; translate it into
// a 413 instead of letting it surface as a generic 500.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

    return res.status(status).json({ message: error.message });
  }

  return next(error);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Pinecone index: ${PINECONE_INDEX_NAME}`);
});
