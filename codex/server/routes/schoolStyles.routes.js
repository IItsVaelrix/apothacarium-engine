/**
 * School Styles Route
 * Generates CSS variables for school theming dynamically
 */

import { SCHOOLS } from '../../core/constants/schools.js';

/**
 * Generate CSS variables for all schools
 */
function generateSchoolCSSVariables() {
  let css = ':root {\n';
  
  for (const [key, school] of Object.entries(SCHOOLS)) {
    const schoolKey = key.toLowerCase();
    const color = school.colorHsl 
      ? `hsl(${school.colorHsl.h}, ${school.colorHsl.s}%, ${school.colorHsl.l}%)`
      : '#808080';
    const glow = school.colorHsl
      ? `hsla(${school.colorHsl.h}, ${school.colorHsl.s}%, ${school.colorHsl.l}%, 0.3)`
      : 'rgba(128, 128, 128, 0.3)';
    
    css += `  --${schoolKey}-primary: ${color};\n`;
    css += `  --${schoolKey}-primary-glow: ${glow};\n`;
  }
  
  css += '}\n';
  return css;
}

/**
 * Register school styles routes
 */
export function registerSchoolStylesRoutes(fastify, options, done) {
  // Get school styles as CSS
  fastify.get('/api/styles/schools', async (request, reply) => {
    try {
      const css = generateSchoolCSSVariables();
      
      reply
        .code(200)
        .header('Content-Type', 'text/css')
        .header('Cache-Control', 'public, max-age=3600') // Cache for 1 hour
        .send(css);
    } catch (error) {
      request.log.error({ error }, 'Failed to generate school styles');
      reply.code(500).send({
        error: 'Failed to generate school styles',
        message: error.message
      });
    }
  });
  
  // Get school data as JSON
  fastify.get('/api/styles/schools/json', async (request, reply) => {
    try {
      const schools = Object.entries(SCHOOLS).map(([key, school]) => ({
        id: key,
        name: school.name,
        colorHsl: school.colorHsl,
        description: school.description
      }));
      
      reply
        .code(200)
        .header('Content-Type', 'application/json')
        .header('Cache-Control', 'public, max-age=3600')
        .send({ schools });
    } catch (error) {
      request.log.error({ error }, 'Failed to get school data');
      reply.code(500).send({
        error: 'Failed to get school data',
        message: error.message
      });
    }
  });
  
  done();
}

export default registerSchoolStylesRoutes;
