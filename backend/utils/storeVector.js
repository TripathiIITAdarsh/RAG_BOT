import { createEmbedding } from "./createEmbeddings.js";

export async function storeVectors(index, chunks) {
  const vectors = [];

  console.log("Chunks received by storeVectors:", chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await createEmbedding(chunks[i]);

    console.log(`Creating vector ${i}, dimension:`, embedding.length);

    vectors.push({
      id: `chunk-${i}`,
      values: embedding,
      metadata: {
        text: chunks[i]
      }
    });
  }

  console.log("Total vectors before upsert:", vectors.length);

  await index.upsert({
    records: vectors
  });

  console.log(`${vectors.length} vectors stored in Pinecone`);
}