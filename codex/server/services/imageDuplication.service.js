import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES } from '../../core/pixelbrain/bytecode-error.js';

/**
 * IMAGE DUPLICATION SERVICE
 * 
 * Generates Scholomance-textured duplicates of uploaded reference images.
 * Uses sharp for high-performance image composition and blending.
 */

const TEXTURE_DIR = path.resolve(process.cwd(), 'public/textures');
const TEMP_DIR = path.resolve(process.cwd(), '.tmp/duplicates');

// Ensure temp directory exists
await fs.mkdir(TEMP_DIR, { recursive: true }).catch(() => {});

/**
 * Generate textured duplicates
 * @param {Buffer} buffer - Original image buffer
 * @param {Object} options - { textures, schools, blendMode, opacity, count }
 * @returns {Promise<Object>} Generated duplicates metadata
 */
export async function generateTexturedDuplicates(buffer, options = {}) {
  const {
    textures = ['parchment'],
    schools = [],
    blendMode = 'multiply',
    opacity = 0.7,
    count = 1
  } = options;

  if (!buffer || buffer.length === 0) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMGPIX,
      ERROR_CODES.MISSING_REQUIRED,
      { parameterName: 'image' }
    );
  }

  try {
    const originalMetadata = await sharp(buffer).metadata();
    const { width, height } = originalMetadata;

    const duplicates = [];

    // Generate variants based on combinations of textures and schools
    const variants = [];
    
    // If no schools provided, just use textures
    if (schools.length === 0) {
      textures.forEach(tex => variants.push({ texture: tex, school: null }));
    } else {
      // Create cross-product of textures and schools
      textures.forEach(tex => {
        schools.forEach(school => variants.push({ texture: tex, school }));
      });
    }

    // Limit to requested count or total variants
    const finalVariants = variants.slice(0, Math.min(count, 10));

    for (const variant of finalVariants) {
      const duplicateId = randomUUID();
      const filename = `${duplicateId}.png`;
      const filepath = path.join(TEMP_DIR, filename);

      // 1. Prepare base image
      let pipeline = sharp(buffer);

      // 2. Load and composite texture
      const texturePath = path.join(TEXTURE_DIR, 'base', `${variant.texture}_base.png`);
      
      // Check if texture exists, fallback to parchment if not
      const texExists = await fs.access(texturePath).then(() => true).catch(() => false);
      const activeTexturePath = texExists ? texturePath : path.join(TEXTURE_DIR, 'base', 'parchment_base.png');

      const textureBuffer = await sharp(activeTexturePath)
        .resize(width, height)
        .toBuffer();

      // 3. Apply school coloring if applicable
      let schoolOverlay = null;
      if (variant.school) {
        const schoolTexturePath = path.join(TEXTURE_DIR, 'school', `${variant.school.toLowerCase()}_resonance.png`);
        const schoolExists = await fs.access(schoolTexturePath).then(() => true).catch(() => false);
        
        if (schoolExists) {
          schoolOverlay = await sharp(schoolTexturePath)
            .resize(width, height)
            .toBuffer();
        }
      }

      // 4. Composite everything
      const composites = [
        {
          input: textureBuffer,
          blend: blendMode,
          opacity: opacity
        }
      ];

      if (schoolOverlay) {
        composites.push({
          input: schoolOverlay,
          blend: 'add',
          opacity: 0.5
        });
      }

      await pipeline
        .composite(composites)
        .toFile(filepath);

      // 5. Create preview base64
      const previewBase64 = await sharp(filepath)
        .resize(128, 128, { fit: 'contain' })
        .toBuffer()
        .then(b => `data:image/png;base64,${b.toString('base64')}`);

      duplicates.push({
        id: duplicateId,
        url: `/api/image/duplicate/download/${filename}`,
        texture: variant.texture,
        school: variant.school,
        dimensions: { width, height },
        previewBase64
      });
    }

    return {
      success: true,
      duplicates,
      metadata: {
        originalDimensions: { width, height },
        variantCount: duplicates.length
      }
    };

  } catch (error) {
    console.error('[ImageDuplication] Generation failed:', error);
    throw new BytecodeError(
      ERROR_CATEGORIES.RENDER,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMGPIX,
      ERROR_CODES.RENDER_FAILED,
      { error: error.message }
    );
  }
}

/**
 * Get duplicate file path
 */
export function getDuplicatePath(filename) {
  // Security: prevent path traversal
  const safeFilename = path.basename(filename);
  return path.join(TEMP_DIR, safeFilename);
}
