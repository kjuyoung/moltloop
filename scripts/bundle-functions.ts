/**
 * Bundle Supabase Edge Functions with esbuild
 *
 * Resolves extensionless imports from packages/ so that
 * the bundled output is a single file Deno can execute.
 */
import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

const FUNCTIONS_DIR = path.resolve(__dirname, '../supabase/functions');
const OUT_DIR = path.resolve(__dirname, '../supabase/functions-bundled');

const functionNames = fs
  .readdirSync(FUNCTIONS_DIR)
  .filter((name) => {
    const entry = path.join(FUNCTIONS_DIR, name, 'index.ts');
    return fs.existsSync(entry);
  });

async function bundle() {
  // Clean output
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true });
  }

  for (const name of functionNames) {
    const entryPoint = path.join(FUNCTIONS_DIR, name, 'index.ts');
    const outFile = path.join(OUT_DIR, name, 'index.ts');

    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      outfile: outFile,
      // Keep Deno-specific imports external
      external: [
        'https://*',
        'npm:*',
      ],
      // Resolve .ts files for extensionless imports
      resolveExtensions: ['.ts', '.js', '.json'],
      // Map @moltloop/* to packages/*/src/index.ts
      alias: Object.fromEntries(
        fs.readdirSync(path.resolve(__dirname, '../packages')).map((pkg) => [
          `@moltloop/${pkg}`,
          path.resolve(__dirname, `../packages/${pkg}/src/index.ts`),
        ]),
      ),
    });

    console.log(`  Bundled: ${name}`);
  }

  console.log(`\nAll ${functionNames.length} functions bundled to ${OUT_DIR}`);
}

bundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
