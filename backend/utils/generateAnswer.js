import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

export async function generateAnswer(query, chunks) {

  const context = chunks
    .map((match, index) => `Chunk ${index + 1}:\n${match.metadata.text}`)
    .join("\n\n");

  const prompt = `
You are a helpful RAG assistant.

Answer the user's question using ONLY the provided context.
If the answer is not present in the context, say:
"I could not find the answer in the provided document."

Context:
${context}

Question:
${query}

Answer:
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt
  });

  return response.text;
}