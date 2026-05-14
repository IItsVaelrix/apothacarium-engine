const targets = [
  '../core/shared.js',
  '../core/bytecode-error.js',
  '../core/anti-alias-control.js',
  '../core/procedural-noise.js',
  '../core/gear-glide-amp.js',
  '../core/coord-symmetry-amp.js',
  '../core/coord-symmetry-errors.js',
  '../core/template-grid-engine.js',
  '../core/extension-registry.js',
  '../core/extensions/style-extensions.js',
  '../core/extensions/physics-extensions.js',
];
let pass = 0, fail = 0;
for (const t of targets) {
  try {
    const m = await import(t);
    const keys = Object.keys(m).length;
    console.log('LOAD OK  ' + t + '  (' + keys + ' exports)');
    pass++;
  } catch (e) {
    console.log('LOAD FAIL ' + t);
    console.log('  ' + (e.message || e));
    fail++;
  }
}
console.log('---');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
