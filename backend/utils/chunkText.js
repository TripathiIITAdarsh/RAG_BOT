import { CHUNK_SIZE, CHUNK_OVERLAP } from "../config.js";

/**
 * Splits a string into overlapping fixed-size chunks.
 *
 * The overlap means a sentence straddling a chunk boundary still appears whole
 * in one of the two chunks, which keeps retrieval from missing it.
 */
export function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (overlap >= chunkSize) {
    // Without this guard `start` would never advance and the loop would hang.
    throw new Error("chunkText: overlap must be smaller than chunkSize");
  }

  const chunks = [];
  const stride = chunkSize - overlap;

  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start += stride;
  }

  return chunks;
}

/**
 * Chunks a PDF page by page so every chunk carries the page it came from.
 *
 * Chunking the whole document as one string would be simpler, but then a
 * chunk's page number can only be guessed. Chunking per page costs nothing and
 * lets answers cite a real page.
 *
 * @param pages - `TextResult.pages` from pdf-parse: `[{ num, text }]`
 * @returns `[{ text, page }]` in document order
 */
export function chunkDocument(pages, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];

  for (const page of pages) {
    if (!page?.text?.trim()) {
      continue; // Blank or image-only page: nothing to embed.
    }

    for (const text of chunkText(page.text, chunkSize, overlap)) {
      chunks.push({ text, page: page.num });
    }
  }

  return chunks;
}
