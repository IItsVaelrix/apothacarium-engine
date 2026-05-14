/**
 * IMAGE ANALYSIS ROUTES
 * 
 * POST /api/image/analyze - Upload and analyze reference image
 */

import { generateTexturedDuplicates, getDuplicatePath } from '../services/imageDuplication.service.js';
import fs from 'fs';

/**
 * @param {import('fastify').FastifyInstance} app
 */
export async function imageAnalysisRoutes(app) {
  // Upload and analyze reference image
  app.post('/analyze', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    // ... rest of schema
  }, async (_request, _reply) => {
    // ... existing implementation
  });

  // Simple JSON-based endpoint for base64 images
  app.post('/analyze/base64', {
    // ... existing implementation
  }, async (_request, _reply) => {
    // ... existing implementation
  });

  // NEW: Generate textured duplicates
  app.post('/duplicate', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    try {
      const data = await request.file({
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB max
          files: 1,
        },
      });

      if (!data) {
        return reply.code(400).send({ error: 'No image provided' });
      }

      const buffer = await data.toBuffer();
      const fields = data.fields;

      // Parse options from fields
      const textures = fields.textures ? JSON.parse(fields.textures.value) : ['parchment'];
      const schools = fields.schools ? JSON.parse(fields.schools.value) : [];
      const blendMode = fields.blendMode ? fields.blendMode.value : 'multiply';
      const opacity = fields.opacity ? parseFloat(fields.opacity.value) : 0.7;
      const count = fields.count ? parseInt(fields.count.value) : 1;

      const result = await generateTexturedDuplicates(buffer, {
        textures,
        schools,
        blendMode,
        opacity,
        count
      });

      return reply.send(result);
    } catch (error) {
      app.log.error({ error }, 'Image duplication failed');
      return reply.code(error.status || 500).send({
        error: error.message,
        bytecode: error.bytecode
      });
    }
  });

  // NEW: Download duplicate
  app.get('/duplicate/download/:filename', async (request, reply) => {
    const { filename } = request.params;
    const filepath = getDuplicatePath(filename);

    if (!fs.existsSync(filepath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const stream = fs.createReadStream(filepath);
    return reply.type('image/png').send(stream);
  });
}
