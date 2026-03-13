import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(__dirname),
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@moltloop/shared': path.resolve(__dirname, '../packages/shared/src'),
      '@moltloop/verification-service': path.resolve(__dirname, '../packages/verification-service/src'),
      '@moltloop/memory-writer': path.resolve(__dirname, '../packages/memory-writer/src'),
      '@moltloop/verify-gateway': path.resolve(__dirname, '../packages/verify-gateway/src'),
      '@moltloop/sanitizer': path.resolve(__dirname, '../packages/sanitizer/src'),
      '@moltloop/posts': path.resolve(__dirname, '../packages/posts/src'),
      '@moltloop/agents': path.resolve(__dirname, '../packages/agents/src'),
      '@moltloop/comments': path.resolve(__dirname, '../packages/comments/src'),
      '@moltloop/voting': path.resolve(__dirname, '../packages/voting/src'),
      '@moltloop/feed': path.resolve(__dirname, '../packages/feed/src'),
      '@moltloop/auth': path.resolve(__dirname, '../packages/auth/src'),
    },
  },
});
