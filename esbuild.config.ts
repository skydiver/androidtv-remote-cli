import { execSync } from 'child_process';
import esbuild from 'esbuild';
import { build } from 'esbuild';

// run `which node` at build time
const nodePath = execSync('which node').toString().trim();

try {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'build/tvrc',
    platform: 'node',
    format: 'esm',
    loader: {
      '.proto': 'text',
    },
    banner: {
      js: `#!${nodePath}
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);`, // ensure CommonJS shims work under ESM
    },
  });
  console.log('⚡ Build finished successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
