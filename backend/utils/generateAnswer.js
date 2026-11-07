import { GoogleGenAI } from "@google/genai";
import { CHAT_MODEL, GEMINI_API_KEY, NO_ANSWER_MESSAGE } from "../config.js";

let client;

function getClient() {
  if (!client) {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set -- copy .env.example to .env");
    }

    client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  return client;
}

/**
 * Answers a question from retrieved chunks only.
 *
 * If retrieval returned nothing above the relevance threshold we answer with
 * the canned message instead of calling the model. Prompting a model with an
 * empty context and asking it not to answer is both slower and less reliable
 * than simply not asking.
 */
export async function generateAnswer(query, matches) {
  if (!matches || matches.length === 0) {
    return NO_ANSWER_MESSAGE;
  }

  // Label each chunk with its real source so the model can cite it.
  const context = matches
    .map((match, i) => {
      const { filename, page, text } = match.metadata;

      return `[Source ${i + 1} | ${filename} | page ${page}]\n${text}`;
    })
    .join("\n\n");

  const prompt = `You are a RAG assistant. Answer the user's question using ONLY the context below.

Rules:
- If the context does not contain the answer, reply exactly: "${NO_ANSWER_MESSAGE}"
- Do not use outside knowledge and do not guess.
- Cite the sources you used inline, like (filename.pdf, page 12).

Context:
${context}

Question:
${query}

Answer:`;

  const response = await getClient().models.generateContent({
    model: CHAT_MODEL,
    contents: prompt,
  });

  return response.text;
}
