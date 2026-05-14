import { SCHOOLS, generateSchoolColor } from "../../constants/schools.js";
import { pickRandomSonicStationTrack } from "../../constants/data/sonicStationBuckets.js";

function getPrimaryTrackUrl(schoolId) {
  return pickRandomSonicStationTrack({ schoolId }) || null;
}

export const SCHOOL_AUDIO_CONFIG = Object.freeze(
  Object.values(SCHOOLS).reduce((acc, school) => {
    const trackUrl = getPrimaryTrackUrl(school.id);
    acc[school.id] = {
      schoolId: school.id,
      paletteKey: school.id.toLowerCase(),
      orbSkinKey: school.id.toLowerCase(),
      color: generateSchoolColor(school.id),
      trackUrl,
    };
    return acc;
  }, {})
);

export function getSchoolAudioConfig(schoolId) {
  return SCHOOL_AUDIO_CONFIG[schoolId] || null;
}

export function getRandomizedStationTrackUrl(schoolId, { excludeUrl = null } = {}) {
  const config = getSchoolAudioConfig(schoolId);
  return pickRandomSonicStationTrack({ schoolId, excludeUrl }) || config?.trackUrl || null;
}

export function getPlayableSchoolIds(unlockedSchools = []) {
  const ids = Array.isArray(unlockedSchools) ? unlockedSchools : [];
  // Ensure SONIC is always available as a base station
  const baseSchools = ids.length === 0 ? ['SONIC'] : ids;
  
  return Object.values(SCHOOL_AUDIO_CONFIG)
    .filter((config) => baseSchools.includes(config.schoolId) && Boolean(config?.trackUrl))
    .map((config) => config.schoolId);
}

export function getDefaultSchoolId(playableSchoolIds = []) {
  if (!Array.isArray(playableSchoolIds) || playableSchoolIds.length === 0) {
    return null;
  }
  return playableSchoolIds[0];
}
