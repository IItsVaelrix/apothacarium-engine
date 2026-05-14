const SUNO_HOSTS = new Set(["suno.com", "www.suno.com", "suno.ai", "www.suno.ai"]);
const SUNO_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSunoHost(hostname) {
  return SUNO_HOSTS.has(String(hostname || "").toLowerCase());
}

function getPathParts(parsedUrl) {
  return parsedUrl.pathname.split("/").filter(Boolean);
}

function parseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const normalizedUrl = rawUrl.trim();
  if (!normalizedUrl) return null;
  try {
    return new URL(
      normalizedUrl,
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost"
    );
  } catch {
    return null;
  }
}

export function getMusicProvider(rawUrl) {
  const parsed = parseUrl(rawUrl);
  if (!parsed) return "unknown";

  const host = parsed.hostname.toLowerCase();

  if (isSunoHost(host)) {
    return "suno";
  }

  if (parsed.pathname.match(/\.(mp3|wav|ogg|m4a)$/i)) {
    return "direct";
  }

  return "unknown";
}

export function getSunoEmbedUrl(trackUrl, { autoPlay = false } = {}) {
  const parsed = parseUrl(trackUrl);
  if (!parsed) return null;

  const pathParts = getPathParts(parsed);
  const explicitSongId =
    (pathParts[0] === "song" || pathParts[0] === "embed") && pathParts[1] ? pathParts[1] : null;
  const inferredSongId = pathParts.find((segment) => SUNO_UUID_PATTERN.test(segment)) || null;
  let embedUrl;

  if (explicitSongId || inferredSongId) {
    embedUrl = new URL(`https://suno.com/embed/${explicitSongId || inferredSongId}`);
  } else {
    embedUrl = new URL(parsed.toString());
  }

  if (autoPlay) {
    embedUrl.searchParams.set("autoplay", "1");
  }

  return embedUrl.toString();
}

export function getSunoSongId(trackUrl) {
  const parsed = parseUrl(trackUrl);
  if (!parsed) return null;
  if (!isSunoHost(parsed.hostname)) return null;

  const pathParts = getPathParts(parsed);
  if ((pathParts[0] === "song" || pathParts[0] === "embed") && pathParts[1]) {
    return pathParts[1];
  }

  const songIdInPath = pathParts.find((segment) => SUNO_UUID_PATTERN.test(segment));
  if (songIdInPath) return songIdInPath;

  const songIdFromParams = ["songId", "song", "id"]
    .map((key) => parsed.searchParams.get(key))
    .find((value) => SUNO_UUID_PATTERN.test(String(value || "")));
  if (songIdFromParams) return songIdFromParams;

  return null;
}

export function getSunoAudioUrl(trackUrl) {
  const songId = getSunoSongId(trackUrl);
  if (!songId) return null;
  return `https://cdn1.suno.ai/${songId}.mp3`;
}

export function getTrackEmbedConfig(trackUrl, options = {}) {
  const provider = getMusicProvider(trackUrl);

  if (provider === "suno") {
    return {
      provider,
      src: getSunoEmbedUrl(trackUrl, options),
      audioUrl: getSunoAudioUrl(trackUrl),
      title: "Suno player",
    };
  }

  if (provider === "direct") {
    return {
      provider,
      src: null,
      audioUrl: trackUrl,
      title: "Local audio player",
    };
  }

  return {
    provider: "unknown",
    src: null,
    title: "Track player",
  };
}
