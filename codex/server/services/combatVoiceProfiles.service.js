import {
  createSpeakerVoiceProfile,
  normalizeVoiceProfile,
} from '../../core/speaking/index.js';

const SESSION_KEY = 'combatVoiceProfilesV1';

function toSafeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function resolveSessionSpeakerId(session, explicitSpeakerId = null) {
  const explicit = String(explicitSpeakerId || '').trim();
  if (explicit) return explicit;

  const userId = session?.user?.id;
  if (userId !== null && userId !== undefined && String(userId).trim()) {
    return `player:${String(userId).trim()}`;
  }

  const sessionId = String(session?.sessionId || '').trim();
  if (sessionId) {
    return `session:${sessionId}`;
  }

  return null;
}

export function loadSessionVoiceProfile(session, {
  speakerId,
  speakerType = 'PLAYER',
  school,
} = {}) {
  const resolvedSpeakerId = resolveSessionSpeakerId(session, speakerId);
  const store = toSafeObject(session?.[SESSION_KEY]);
  if (!resolvedSpeakerId) {
    return createSpeakerVoiceProfile({ speakerId: 'speaker:unknown', speakerType, school });
  }
  return normalizeVoiceProfile(store[resolvedSpeakerId], {
    speakerId: resolvedSpeakerId,
    speakerType,
    school,
  });
}

export async function persistSessionVoiceProfile(session, {
  speakerId,
  profile,
} = {}) {
  const resolvedSpeakerId = resolveSessionSpeakerId(session, speakerId);
  if (!session || !resolvedSpeakerId || !profile) {
    return;
  }

  const store = toSafeObject(session?.[SESSION_KEY]);
  session[SESSION_KEY] = {
    ...store,
    [resolvedSpeakerId]: normalizeVoiceProfile(profile, {
      speakerId: resolvedSpeakerId,
      speakerType: profile?.speakerType,
      school: profile?.school,
    }),
  };

  if (typeof session.save === 'function') {
    await session.save();
  }
}
