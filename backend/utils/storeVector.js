import { createEmbedding } from "./createEmbeddings.js";
import { namespaceFor } from "./sessions.js";

/**
 * Embeds a document's chunks and writes them into the calling session's
 * Pinecone namespace.
 *
 * Vector ids are prefixed with the document's own id. A bare `chunk-${i}` id
 * would make every upload overwrite the previous document's chunks, because
 * upsert replaces by id.
 *
 * @param index    - Pinecone index handle
 * @param sessionId
 * @param document - `{ id, filename }`
 * @param chunks   - `[{ text, page }]` from `chunkDocument`
 */
export async function storeVectors(index, sessionId, document, chunks) {
  const namespace = namespaceFor(sessionId);
  const vectors = [];

  for (let i = 0; i < chunks.length; i++) {
    const { text, page } = chunks[i];
    const embedding = await createEmbedding(text);

    vectors.push({
      id: `${document.id}-chunk-${i}`,
      values: embedding,
      metadata: {
        text,
        page,
        chunkIndex: i,
        documentId: document.id,
        filename: document.filename,
      },
    });
  }

  if (vectors.length === 0) {
    return 0;
  }

  await index.upsert({ records: vectors, namespace });

  console.log(
    `Stored ${vectors.length} vectors for "${document.filename}" in namespace ${namespace}`
  );

  return vectors.length;
}
