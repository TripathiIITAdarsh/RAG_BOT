# 📚 RAG Chatbot

A full-stack **Retrieval-Augmented Generation (RAG) chatbot** that allows users to upload PDF documents and ask questions about their content.

The application processes the uploaded document, splits it into smaller chunks, converts those chunks into vector embeddings using Google's Gemini embedding model, stores them in Pinecone, and retrieves the most relevant information when a user asks a question.

The retrieved context is then passed to Gemini to generate a relevant and grounded answer.

---

## 🚀 Features

- 📄 Upload PDF documents
- 🔍 Extract text from PDFs
- ✂️ Split documents into smaller chunks
- 🧠 Generate vector embeddings using Gemini
- 🗄️ Store embeddings in Pinecone
- 🔎 Perform semantic similarity search
- 🤖 Generate answers using Gemini
- 💬 Interactive React chat interface
- ⚡ Fast development with Vite
- 🌐 REST API using Node.js and Express
- 🔐 Environment variables for API keys

---

## 🏗️ Architecture

The project follows a typical Retrieval-Augmented Generation pipeline.

### Document Upload Pipeline

```text
PDF Document
     ↓
React Frontend
     ↓
Express API
     ↓
Multer
     ↓
PDF Parser
     ↓
Text Extraction
     ↓
Text Chunking  
```
# 📦 Installation

## Prerequisites

Make sure you have the following installed or available:

- Node.js
- npm
- Git
- Google Gemini API key
- Pinecone API key
- Pinecone index

---

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/rag-chatbot.git
```

Move into the project directory:

```bash
cd rag-chatbot
```

---

# 💻 Backend Setup

Move into the backend directory:

```bash
cd backend
```

Install the required dependencies:

```bash
npm install
```

Create a `.env` file inside the `backend` directory:

```env
GEMINI_API_KEY=your_gemini_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_pinecone_index_name
```

> ⚠️ **Important:** Never commit your `.env` file or expose your API keys publicly.

Start the backend server:

```bash
node server.js
```

The backend will run on:

```text
http://localhost:5000
```

---

# 🎨 Frontend Setup

Open another terminal and move into the frontend directory:

```bash
cd frontend
```

Install the required dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

---

# 🔌 API Endpoints

## Health Check

### `GET /`

Checks whether the backend server is running.

**Example response:**

```json
{
  "message": "RAG Backend is running!"
}
```

---

## Test Endpoint

### `GET /api/test`

A simple endpoint used to verify that the backend API is working correctly.

**Example response:**

```json
{
  "message": "hlw from backend"
}
```

---

## Upload PDF

### `POST /api/upload`

Uploads and processes a PDF document.

**Request Content-Type:**

```text
multipart/form-data
```

**Form field:**

```text
document
```

The backend processes the document through the following pipeline:

```text
PDF
 ↓
Extract Text
 ↓
Chunk Text
 ↓
Generate Embeddings
 ↓
Store Embeddings in Pinecone
```

---

## Search / Ask Question

### `GET /api/search?q=<question>`

Used to ask a question about the uploaded document.

**Example:**

```text
/api/search?q=What is the main topic of the document?
```

The backend performs the following RAG pipeline:

```text
User Question
      ↓
Generate Query Embedding
      ↓
Pinecone Similarity Search
      ↓
Retrieve Relevant Chunks
      ↓
Pass Context to Gemini
      ↓
Generate Answer
      ↓
Return Answer to Frontend
```

The generated answer is then displayed in the React chat interface.


```
