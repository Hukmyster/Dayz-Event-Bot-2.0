const sessions = new Map();

function createSession(userId, data = {}) {
  const session = {
    userId,
    channelId: data.channelId || null,
    messageId: data.messageId || null,
    betAmount: null,
    betType: null,
    betChoice: null,
    lastResult: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + (10 * 60 * 1000),
    timeout: null,
    active: true
  };

  sessions.set(userId, session);
  return session;
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function updateSession(userId, patch = {}) {
  const session = sessions.get(userId);
  if (!session) return null;

  Object.assign(session, patch, { updatedAt: Date.now() });
  sessions.set(userId, session);
  return session;
}

function touchSession(userId, ms = 10 * 60 * 1000) {
  const session = sessions.get(userId);
  if (!session) return null;

  session.updatedAt = Date.now();
  session.expiresAt = Date.now() + ms;
  sessions.set(userId, session);
  return session;
}

function deleteSession(userId) {
  const session = sessions.get(userId);
  if (session?.timeout) clearTimeout(session.timeout);
  sessions.delete(userId);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  touchSession,
  deleteSession
};
