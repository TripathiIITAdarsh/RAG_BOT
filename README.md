# RAG Chatbot

Ask questions about your own PDFs and get answers grounded in them, with the
exact source page cited for every claim.

Each browser tab is an isolated **session**: documents you upload in one session
are never used to answer questions asked in another. Retrieved chunks are also
filtered by a relevance score before they reach the language model, so an
off-topic question gets "I could not find the answer" instead of a confident
guess built from irrelevant text.

---

## Contents

- [How it works](#how-it-works)
- [Session isolation](#session-isolation)
- [Retrieval pipeline](#retrieval-pipeline)
- [Retrieval calibration](#retrieval-calibration)
- [Setup](#setup)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## How it works

Two phases: documents are indexed once on upload, then every question runs a
retrieve-then-generate cycle against that index.

### Indexing (on upload)

```
PDF file
   |
   v
pdf-parse  ->  text, page by page
   |
   v
chunkDocument()  ->  1000-char chunks, 200-char overlap, each tagged with its page
   |
   v
gemini-embedding-001  ->  one vector per chunk
   |
   v
Pinecone, namespace "session-<sessionId>"
   id: <documentId>-chunk-<i>
   metadata: { text, page, chunkIndex, documentId, filename }
```

### Answering (on every question)

```
question
   |
   v
gemini-embedding-001  ->  query vector
   |
   v
Pinecone query, namespace "session-<sessionId>"   <-- only this session's vectors
   topK = 10
   |
   v
drop everything with score < MIN_SCORE           <-- relevance floor
   |
   v
keep the best MAX_CONTEXT_CHUNKS                 <-- context budget
   |
   +-- nothing left?  -->  return the refusal message, never call the LLM
   |
   v
gemini-3.6-flash, prompted to answer only from the given context
   |
   v
answer + the sources it was allowed to use
```

### Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite |
| Backend | Node, Express 5 (ESM) |
| PDF text | `pdf-parse` |
| Embeddings | Gemini `gemini-embedding-001` |
| Generation | Gemini `gemini-3.6-flash` |
| Vector store | Pinecone (one namespace per session) |

---

## Session isolation

A session is the unit of isolation. It exists so that two people — or the same
person in two tabs — can upload different documents and never see each other's
content in an answer.

**Mechanism.** Every session owns one Pinecone namespace, `session-<uuid>`.
Uploads write only into that namespace, and queries read only from it. Isolation
is therefore enforced at the vector store, not by filtering results after the
fact, so there is no code path where a stray document can leak into an answer.

**Lifecycle.**

1. On first load the browser asks for a session (`POST /api/session`) and stores
   the id in `sessionStorage`.
2. `sessionStorage` is used deliberately instead of `localStorage`: the id
   survives a page reload but dies with the tab, which is exactly what "one
   session per tab" means.
3. **New session** deletes the namespace and its vectors, then starts a fresh
   session — so nothing is left behind in Pinecone.

**Vector ids are namespaced by document too.** Each id is
`<documentId>-chunk-<i>`, not `chunk-<i>`. With a bare index, uploading a second
document would overwrite the first one's chunks, because `upsert` replaces by
id. The document id prefix means several documents can coexist inside one
session.

**After a server restart**, a valid session id the server no longer recognises is
accepted and re-registered. The vectors are still in Pinecone, so search keeps
working; only the display list of uploaded filenames is lost, because that list
is in memory (see [Known limitations](#known-limitations)).

---

## Retrieval pipeline

Two filters are applied, in order, between Pinecone and the model.

**1. Relevance floor.** Pinecone always returns its best `topK` matches, no
matter how poor they are. Without a floor, an off-topic question still arrives
at the model attached to three irrelevant chunks, which is how RAG systems end
up fabricating answers. Any match scoring below `MIN_SCORE` is dropped.

**2. Context budget.** At most `MAX_CONTEXT_CHUNKS` (default 3) of the survivors
are sent on. We ask Pinecone for 10 candidates and use at most 3; the extra
candidates cost nothing and make the filtering observable in the API response.

If nothing survives, the API returns the refusal message **without calling the
language model** — faster, cheaper, and more reliable than asking a model to
decline.

Every `/api/search` response reports what happened, which makes the filter easy
to demonstrate and tune:

```json
"retrieval": {
  "candidates": 10,
  "passedThreshold": 4,
  "used": 3,
  "minScore": 0.4,
  "topScore": 0.814,
  "answered": true
}
```

---

## Retrieval calibration

**`MIN_SCORE` defaults to 0.4, and that is probably too permissive.** Worth
understanding before you rely on it.

Gemini embedding cosine scores do not spread across 0 to 1 in practice —
unrelated English prose still lands around 0.46. Measured against a two-page
test document:

| Question | Top score | Should it match? |
|---|---|---|
| "What revenue did the Quarnix reactor division report?" | **0.814** | yes |
| (a different page of the same document) | 0.573 | marginal |
| "How do I bake sourdough bread at home?" | **0.467** | no |

A floor of 0.4 admits all three. The on-topic and off-topic cases separate
around **0.6**, so that is the better default:

```env
MIN_SCORE=0.6
```

Re-measure this for your own corpus rather than trusting the number — the right
floor depends on your documents and your embedding model. The `retrieval` block
in each response gives you the scores you need to do it.

Note that the grounding prompt is a second line of defence: in the sourdough
case above the model still correctly refused, even though the chunks reached it.
The threshold and the prompt are both load-bearing, and neither alone is enough.

---

## Setup

### Prerequisites

- Node 18 or newer
- A [Google AI Studio](https://aistudio.google.com/apikey) API key
- A [Pinecone](https://app.pinecone.io) account and index

### Create the Pinecone index

Create a dense index with:

- **Metric:** `cosine`
- **Dimension:** must equal your embedding model's output size.
  `gemini-embedding-001` returns **3072** values by default.

If upserts fail with a dimension mismatch, check the real size by printing
`(await createEmbedding("test")).length` and recreate the index to match.

### Backend

```bash
cd backend
npm install
cp .env.example .env     # then fill in your keys
npm start
```

Serves on `http://localhost:5000`. `GET /` reports the active index and
retrieval settings.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Serves on `http://localhost:5173`. To point it at a non-default backend, create
`frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

---

## API reference

### `POST /api/session`

Creates a session. Returns `201`.

```json
{ "sessionId": "46714713-...", "createdAt": "2026-11-07T18:31:00.744Z", "documents": [] }
```

### `GET /api/session/:sessionId`

Returns the session and the documents indexed in it. `404` if unknown.

### `DELETE /api/session/:sessionId`

Deletes the session's Pinecone namespace and forgets it.

### `POST /api/upload`

`multipart/form-data` with `sessionId` (text) and `document` (a PDF).

```json
{
  "message": "Document indexed for this session",
  "sessionId": "46714713-...",
  "document": {
    "id": "a7244499-...",
    "filename": "test-report.pdf",
    "pages": 2,
    "chunks": 2,
    "uploadedAt": "2026-11-07T18:31:00.744Z"
  },
  "documents": [ "...every document in this session..." ]
}
```

Errors: `400` no file or bad session id · `413` over the size limit ·
`415` not a PDF · `422` no extractable text (a scanned PDF needing OCR).

### `GET /api/search?q=<question>&sessionId=<id>`

```json
{
  "answer": "The Quarnix reactor division reported revenue of 47.3 million credits in fiscal year 2031 (test-report.pdf, page 1).",
  "sources": [
    {
      "filename": "test-report.pdf",
      "page": 1,
      "score": 0.814,
      "snippet": "Zylantis Corporation Annual Report 2031..."
    }
  ],
  "retrieval": { "candidates": 2, "passedThreshold": 2, "used": 1, "minScore": 0.4, "topScore": 0.814, "answered": true }
}
```

`sources` is empty whenever the answer is the refusal message — listing sources
under "I could not find it" would imply the answer came from them.

Errors: `400` missing `q` or bad session id.

---

## Project structure

```
backend/
  server.js              Express app, routes, validation, temp-file cleanup
  config.js              All tunables; also the single place .env is loaded
  utils/
    sessions.js          Session registry and namespace naming
    chunkText.js         chunkText() and page-aware chunkDocument()
    createEmbeddings.js  Gemini embedding client (lazily constructed)
    storeVector.js       Embed a document's chunks into a session namespace
    searchVectors.js     Query one namespace, apply threshold + context budget
    generateAnswer.js    Grounded prompt, refuses when context is empty
  uploads/               Temp PDFs, deleted immediately after indexing

frontend/
  src/
    App.jsx              Chat UI, session bootstrap, upload, source display
    api.js               Backend client; reads VITE_API_URL
    App.css, index.css
```

---

## Configuration

Backend, via `backend/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Required. Embeddings and generation. |
| `PINECONE_API_KEY` | — | Required. |
| `PINECONE_INDEX_NAME` | `ragg-index` | Index holding every session's namespaces. |
| `PORT` | `5000` | |
| `CORS_ORIGIN` | `*` | Set to your frontend origin in production. |
| `MIN_SCORE` | `0.4` | Relevance floor. See [calibration](#retrieval-calibration). |
| `MAX_CONTEXT_CHUNKS` | `3` | Chunks sent to the model. |

Compile-time constants in `config.js`: `CHUNK_SIZE` (1000), `CHUNK_OVERLAP`
(200), `CANDIDATE_TOP_K` (10), `MAX_UPLOAD_BYTES` (20 MB).

---

## Known limitations

- **The session registry is in memory.** A restart loses the list of uploaded
  filenames. Vectors and search survive, because they live in Pinecone, but the
  UI's document list comes back empty. A small database would fix this.
- **Embedding is sequential.** `storeVectors` awaits one API call per chunk, so a
  large PDF takes minutes and a single failure aborts the whole upload with no
  retry or partial progress. Batching is the highest-value performance fix.
- **No conversation memory.** Each question is embedded on its own, so follow-ups
  that depend on earlier turns ("explain that further") retrieve poorly.
- **Fixed-size chunking.** Chunks are cut at character offsets, so they can split
  mid-sentence. Overlap hides most of the damage but not all of it.
- **Scanned PDFs are rejected**, not OCR'd (`422`).
- **No authentication.** Session ids are unguessable UUIDs, but anyone holding one
  can query that session. Do not treat this as a security boundary.
- **Abandoned namespaces are not reaped.** Closing a tab without pressing
  "New session" leaves its vectors in Pinecone.
- **Answers render as plain text**, so any markdown the model emits shows as
  literal `**asterisks**`.
- **No automated tests.**

---

## Roadmap

Roughly in order of value:

1. Batch the embedding calls
2. Persist sessions and documents in a database
3. Conversation memory with query rewriting before retrieval
4. Per-document delete, and querying a chosen subset of a session's documents
5. Stream answers over SSE
6. Hybrid search (dense + BM25) with a reranking pass
7. Semantic chunking on sentence and paragraph boundaries
8. An evaluation set measuring retrieval hit-rate and answer faithfulness
9. Render answers as markdown
10. Authentication, and a TTL that reaps abandoned namespaces
