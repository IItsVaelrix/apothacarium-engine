/**
 * PROMPT ASSEMBLER
 *
 * Optional helper: composes a text prompt describing a generated
 * apothecary scene. Useful as a seed for downstream image diffusion
 * models or for documentation.
 */

const CATEGORY_LABELS = {
  jars: 'glass apothecary jars with handwritten labels',
  herbs: 'bundles of dried hanging herbs',
  mushrooms: 'mushrooms and roots',
  scrolls: 'parchment scrolls and ink labels',
  symbols: 'occult etched symbols on aged wood',
  glowing: 'amber glowing tincture',
};

function describeCabinet(lattice) {
  const aspect = lattice.height / lattice.width;
  if (aspect > 1.3) return 'tall narrow wooden cabinet';
  if (aspect < 0.8) return 'wide low wooden counter';
  return 'square wooden apothecary cabinet';
}

function paletteDescription(palette) {
  if (!palette || !palette.name) return 'muted occult palette';
  return `${palette.name.toLowerCase()} palette (${palette.colors.slice(0, 4).join(', ')})`;
}

export function assemblePrompt(scene) {
  const { lattice, palette } = scene;
  const counts = {};
  lattice.cells.forEach((c) => {
    const cat = c.prop?.category || 'unknown';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const parts = [
    '80s occult herbal poster',
    describeCabinet(lattice),
    'pixel-art, CRT scanlines, vignette',
    paletteDescription(palette),
  ];

  for (const [cat, n] of Object.entries(counts)) {
    if (cat === 'unknown') continue;
    const label = CATEGORY_LABELS[cat] || cat;
    parts.push(`${n} ${label}`);
  }

  parts.push('hand-warped vertical symmetry');
  parts.push('no modern equipment, no neon, no holograms');

  return parts.join(', ');
}
