import { createEmbedding } from "./createEmbeddings.js";

export async function searchVectors(index, query) {
  const queryEmbedding = await createEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK: 3,
    includeMetadata: true
  });

  return results.matches;
}