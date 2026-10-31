import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.TEST_DATABASE_PATH ||= join(tmpdir(), `trailtalk-test-${Date.now()}.sqlite`);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://127.0.0.1:3100',
    timeout: 120000,
    reuseExistingServer: false,
    env: { DATABASE_PATH: process.env.TEST_DATABASE_PATH },
  },
});
