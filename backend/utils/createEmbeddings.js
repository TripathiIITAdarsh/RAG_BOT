import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_MODEL, GEMINI_API_KEY } from "../config.js";

let client;

/**
 * Builds the Gemini client on first use.
 *
 * Creating it at module scope would read GEMINI_API_KEY at import time, which
 * silently produces a keyless client if this module happens to be evaluated
 * before .env is loaded.
 */
function getClient() {
  if (!client) {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set -- copy .env.example to .env");
    }

    client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  return client;
}

export async function createEmbedding(text) {
  const response = await getClient().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });

  return response.embeddings[0].values;
}
