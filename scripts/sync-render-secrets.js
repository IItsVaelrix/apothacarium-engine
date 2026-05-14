import fs from 'node:fs';
import path from 'node:path';

/**
 * sync-render-secrets.js
 * 
 * Synchronizes local .env secrets to a Render.com service via the Render API.
 */

// Simple .env parser to get bootstrap variables
function bootstrapEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...rest] = trimmed.split('=');
        const k = key.trim();
        let v = rest.join('=').trim();

        // Sanitize absolute paths that look like local dev paths
        if (v.includes('/home/deck/Downloads/scholomance-V11')) {
          v = v.replace('/home/deck/Downloads/scholomance-V11', '/app');
          // If it's a known database path, use /var/data if available
          if (v.endsWith('.sqlite')) {
            v = v.replace('/app', '/var/data');
          }
        }

        if (k && !process.env[k]) {
          process.env[k] = v;
        }
      }
    });
  }
}

bootstrapEnv();

const API_KEY = process.env.RENDER_API_KEY;
const SERVICE_ID = process.env.RENDER_SERVICE_ID;

async function sync() {
  if (!API_KEY || !SERVICE_ID) {
    console.error('Error: RENDER_API_KEY and RENDER_SERVICE_ID must be set in .env or environment.');
    process.exit(1);
  }

  // Load .env
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found in current directory.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = envContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const [key, ...rest] = line.split('=');
      const k = key.trim();
      let v = rest.join('=').trim();

      // Sanitize absolute paths for Render parity
      if (v.includes('/home/deck/Downloads/scholomance-V11')) {
        v = v.replace('/home/deck/Downloads/scholomance-V11', '/app');
        if (v.endsWith('.sqlite')) {
          v = v.replace('/app', '/var/data');
        }
      }

      return { key: k, value: v };
    });

  console.log(`🚀 Syncing ${envVars.length} environment variables to Render...`);

  try {
    const response = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(envVars)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Render API responded with ${response.status}: ${JSON.stringify(errorData)}`);
    }

    console.log('✅ Successfully synchronized environment variables to Render.');
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

sync();
