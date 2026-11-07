import { randomUUID } from "node:crypto";

/**
 * In-memory registry of chat sessions.
 *
 * Each session owns one Pinecone namespace, which is what keeps one session's
 * documents from leaking into another session's answers. The vectors themselves
 * live in Pinecone; this map only tracks metadata (which documents were uploaded
 * and when) so the UI can show it. It is therefore lost on server restart --
 * see `getOrCreateSession` for how that is handled.
 */
const sessions = new Map();

/** Session ids are used to build Pinecone namespaces, so keep the charset tight. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidSessionId(sessionId) {
  return typeof sessionId === "string" && SESSION_ID_PATTERN.test(sessionId);
}

/** Pinecone namespace that isolates this session's vectors. */
export function namespaceFor(sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }

  return `session-${sessionId}`;
}

export function createSession() {
  const session = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    documents: [],
  };

  sessions.set(session.id, session);

  return session;
}

export function getSession(sessionId) {
  return sessions.get(sessionId);
}

/**
 * Returns the tracked session, recreating an empty record for a valid id we no
 * longer know about. This happens after a server restart: the browser still
 * holds its session id and the vectors are still in Pinecone, so search must
 * keep working even though we have forgotten the document list.
 */
export function getOrCreateSession(sessionId) {
  if (!isValidSessionId(sessionId)) {
    return null;
  }

  const existing = sessions.get(sessionId);

  if (existing) {
    return existing;
  }

  const recovered = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    documents: [],
    recovered: true,
  };

  sessions.set(sessionId, recovered);

  return recovered;
}

export function addDocument(sessionId, document) {
  const session = getOrCreateSession(sessionId);

  if (session) {
    session.documents.push(document);
  }

  return session;
}

export function forgetSession(sessionId) {
  return sessions.delete(sessionId);
}
