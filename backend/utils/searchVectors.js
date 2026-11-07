import { createEmbedding } from "./createEmbeddings.js";
import { namespaceFor } from "./sessions.js";
import { CANDIDATE_TOP_K, MIN_SCORE, MAX_CONTEXT_CHUNKS } from "../config.js";

/**
 * Retrieves context for a query from one session's namespace only.
 *
 * Two filters are applied, in this order:
 *   1. Relevance floor -- drop any match scoring below MIN_SCORE. Without it
 *      Pinecone always returns its best k matches, so an off-topic question
 *      still gets fed three irrelevant chunks and the model invents an answer.
 *   2. Context budget -- keep at most MAX_CONTEXT_CHUNKS of the survivors.
 *
 * @returns `{ matches, stats }` where `matches` is what should go to the LLM
 *          and `stats` explains what was discarded.
 */
export async function searchVectors(index, sessionId, query) {
  const namespace = namespaceFor(sessionId);
  const queryEmbedding = await createEmbedding(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK: CANDIDATE_TOP_K,
    includeMetadata: true,
    namespace,
  });

  // Pinecone returns matches sorted by descending score.
  const candidates = results.matches ?? [];
  const relevant = candidates.filter((match) => match.score >= MIN_SCORE);
  const matches = relevant.slice(0, MAX_CONTEXT_CHUNKS);

  return {
    matches,
    stats: {
      candidates: candidates.length,
      passedThreshold: relevant.length,
      used: matches.length,
      minScore: MIN_SCORE,
      topScore: candidates.length > 0 ? candidates[0].score : null,
    },
  };
}
