// Central configuration. Importing this module also loads .env, so any module
// that needs an environment variable should import it from here rather than
// reading process.env directly.
import "dotenv/config";

/** Pinecone index that holds every session's vectors (one namespace per session). */
export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || "ragg-index";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const CHAT_MODEL = "gemini-3.6-flash";

export const PORT = Number(process.env.PORT) || 5000;
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

/** Chunking: characters per chunk and how much each chunk repeats of the previous one. */
export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

/**
 * Retrieval tuning.
 *
 * We ask Pinecone for CANDIDATE_TOP_K matches, drop everything scoring below
 * MIN_SCORE, and feed at most MAX_CONTEXT_CHUNKS of the survivors to the LLM.
 * Asking for more candidates than we use costs nothing extra and makes the
 * filtering visible in the API response.
 *
 * Calibrating MIN_SCORE: gemini-embedding-001 cosine scores do not run from
 * 0 to 1 in practice. Measured against a two-page test document:
 *
 *   on-topic question      -> 0.81
 *   loosely related page   -> 0.57
 *   completely unrelated   -> 0.46
 *
 * So 0.4 admits almost everything, including junk, and 0.6 is roughly where
 * on-topic and off-topic separate. Raise MIN_SCORE in .env if the bot answers
 * from chunks that are not actually relevant.
 */
export const CANDIDATE_TOP_K = 10;
export const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.4);
export const MAX_CONTEXT_CHUNKS = Number(process.env.MAX_CONTEXT_CHUNKS ?? 3);

/** Reject uploads larger than this (bytes). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Characters of each source chunk returned to the browser for display. */
export const SOURCE_SNIPPET_LENGTH = 500;

/** Returned verbatim whenever retrieval finds nothing above MIN_SCORE. */
export const NO_ANSWER_MESSAGE =
  "I could not find the answer in the documents uploaded in this session.";
