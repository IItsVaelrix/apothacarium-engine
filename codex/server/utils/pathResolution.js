import path from 'node:path';
import { existsSync } from 'node:fs';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Robustly resolves a database path, especially in production environments like Render.
 * 
 * Logic:
 * 1. If path is already absolute and exists, use it.
 * 2. If in production and path looks like a local dev path (e.g. /home/deck/...), 
 *    try to find the file in /var/data or /app.
 * 3. Fallback to /var/data if available and file exists there.
 * 4. Finally, return the original resolved path (calling code will handle existence checks).
 */
export function resolveDatabasePath(rawPath, defaultBasename) {
  if (!rawPath && !defaultBasename) return null;
  
  const resolved = rawPath ? path.resolve(String(rawPath).trim()) : null;
  
  if (IS_PRODUCTION) {
    const basename = resolved ? path.basename(resolved) : defaultBasename;
    
    // Try /var/data first (persistent disk)
    const varDataPath = path.join('/var/data', basename);
    if (existsSync(varDataPath)) return varDataPath;
    
    // Try /app (project root in container)
    const appPath = path.join('/app', basename);
    if (existsSync(appPath)) return appPath;
    
    // If it's an absolute path that doesn't exist, it might be a synced local path.
    // Return the /var/data path even if it doesn't exist yet (ritual will create it).
    if (resolved && path.isAbsolute(resolved) && !existsSync(resolved)) {
      return varDataPath;
    }
  }
  
  return resolved ?? path.resolve(defaultBasename);
}
