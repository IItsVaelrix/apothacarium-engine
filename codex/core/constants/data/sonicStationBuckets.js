const DEFAULT_SONIC_STATION_BUCKETS = Object.freeze({
  SONIC: Object.freeze([
    "https://cdn1.suno.ai/44c7a9b9-4053-4d1e-84e3-2b8252f0f57b.mp3",
    "https://cdn1.suno.ai/236e9f87-4d38-43da-a98a-b39447256d21.mp3",
    "https://cdn1.suno.ai/74a37c2a-3c4c-4841-a618-fe244ba981a8.mp3",
  ]),
  VOID: Object.freeze([
    "https://cdn1.suno.ai/9dcaac18-70f1-48e6-8118-eb0ffac890d3.mp3", // Dark Techno
    "https://cdb1.suno.ai/1e8ead1e-4764-4545-aa0b-84acc37f7d10.mp3", // Industrial Ambient
  ]),
  WILL: Object.freeze([
    "https://cdn1.suno.ai/5c4c8872-e669-4954-94cc-5bbb3a96b695.mp3", // Orchestral Metal
    "https://cdn1.suno.ai/0f46d918-d703-48cb-b67a-f36afa79d698.mp3", // Anthemic Rock
  ]),
  ALCHEMY: Object.freeze([
    "https://cdn1.suno.ai/d5a049d9-0ce9-4c31-bc0a-b2df07d63ed7.mp3", // Glitch Hyperpop
    "https://cdn1.suno.ai/a423d0c4-42ea-4c36-af15-31b4a8a2fc37.mp3", // Experimental Jazz
  ]),
  PSYCHIC: Object.freeze([
    "https://cdn1.suno.ai/266d6db9-68c7-4097-80dc-81d62116fcc7.mp3", // Ethereal Trance
    "https://cdn1.suno.ai/51f237dc-afe1-4ab2-a005-11e162b8394b.mp3", // Dream Pop / Shoegaze
  ]),
});

const TRACK_URL_KEYS = Object.freeze(["url", "trackUrl", "suno", "sc"]);

function resolveTrackUrlFromEntry(entry) {
  if (!entry || typeof entry !== "object") return "";
  for (const key of TRACK_URL_KEYS) {
    const candidate = entry[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function normalizeTrackEntry(entry) {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return { url: trimmed, weight: 1 };
  }
  if (!entry || typeof entry !== "object") return null;
  const rawUrl = resolveTrackUrlFromEntry(entry);
  if (!rawUrl) return null;
  const parsedWeight = Number(entry.weight);
  const weight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1;
  return { url: rawUrl, weight };
}

export function getSonicStationBuckets() {
  return DEFAULT_SONIC_STATION_BUCKETS;
}

export function getSonicStationTrackPool() {
  return Object.entries(DEFAULT_SONIC_STATION_BUCKETS).flatMap(([schoolId, tracks]) =>
    (tracks || [])
      .map((track) => normalizeTrackEntry(track))
      .filter(Boolean)
      .map((track) => ({ ...track, schoolId }))
  );
}

export function getDefaultSonicStationTrackUrl() {
  const first = getSonicStationTrackPool()[0];
  return first?.url || null;
}

export function pickRandomSonicStationTrack({ schoolId = null, excludeUrl = null, randomFn = Math.random } = {}) {
  let pool = getSonicStationTrackPool();
  if (!pool.length) return null;

  // Filter by school if provided
  if (schoolId) {
    pool = pool.filter(track => track.schoolId === schoolId);
  }
  if (!pool.length) return null;

  const filtered = excludeUrl ? pool.filter((track) => track.url !== excludeUrl) : pool;
  const candidates = filtered.length ? filtered : pool;
  const totalWeight = candidates.reduce((acc, track) => acc + track.weight, 0);
  if (!totalWeight) return candidates[0]?.url || null;

  let cursor = Math.max(0, randomFn()) * totalWeight;
  for (const track of candidates) {
    cursor -= track.weight;
    if (cursor <= 0) return track.url;
  }
  return candidates[candidates.length - 1]?.url || null;
}
