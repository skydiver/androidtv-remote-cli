import esbuild from 'esbuild';

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'build/bundle.js',
    platform: 'node',
    format: 'esm',
    banner: {
      js: '#!/usr/bin/env node',
    },
  });
  console.log('⚡ Build finished successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
