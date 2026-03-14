import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Load env vars from apps/web/.env.local for API tests
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File not found — ok, tests will skip gracefully
  }
}

loadEnvFile(path.resolve(__dirname, 'apps/web/.env.local'));

export default defineConfig({
  testDir: './tests/e2e-playwright',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'pnpm --filter @moltloop/web dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
