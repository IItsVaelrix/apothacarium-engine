const API_PREFIXES = ['/api', '/auth', '/collab'];
const STATIC_PREFIXES = ['/assets/', '/audio/'];
const STATIC_FILE_NAMES = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/site.webmanifest',
  '/sw.js',
]);
const STATIC_EXTENSIONS = new Set([
  'js', 'mjs', 'css', 'map', 'json', 'txt', 'xml',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico',
  'woff', 'woff2', 'ttf', 'eot',
  'mp3', 'wav', 'ogg', 'm4a', 'webm',
  'pdf',
]);

export function stripQueryFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return '/';
  }
  const [pathname] = rawUrl.split('?');
  return pathname || '/';
}

export function isApiRoutePath(rawUrl) {
  const pathname = stripQueryFromUrl(rawUrl);
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isStaticAssetPath(rawUrl) {
  const pathname = stripQueryFromUrl(rawUrl);
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  if (STATIC_FILE_NAMES.has(pathname)) {
    return true;
  }

  const lastSegment = pathname.split('/').pop() || '';
  const dotIndex = lastSegment.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) {
    return false;
  }
  const extension = lastSegment.slice(dotIndex + 1).toLowerCase();
  return STATIC_EXTENSIONS.has(extension);
}
