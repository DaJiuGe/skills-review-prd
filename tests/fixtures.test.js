import { describe, it } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '..', 'fixtures');

const FIXTURES = [
  'sample-prd.md',
  'meeting-room-booking-prd.md',
  'ecommerce-aftersales-prd.md',
  'saas-rbac-prd.md',
  'project-with-context-prd/prd.md',
];

const MOCK_ROUNDS = [
  'mock-rounds/round-1.json',
  'mock-rounds/round-2.json',
  'mock-rounds/round-3.json',
  'mock-rounds/round-4.json',
];

describe('fixtures', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture} 应存在且不为空`, async () => {
      const p = path.join(fixturesDir, fixture);
      const stat = await fs.stat(p);
      assert.ok(stat.isFile(), '应为文件');
      assert.ok(stat.size > 0, '文件不应为空');
    });

    it(`${fixture} 应至少包含 5 个 ## 章节`, async () => {
      const p = path.join(fixturesDir, fixture);
      const text = await fs.readFile(p, 'utf-8');
      const h2Count = (text.match(/^##\s+/gm) || []).length;
      assert.ok(h2Count >= 5, `实际只有 ${h2Count} 个 ## 章节`);
    });
  }
});

describe('mock-rounds fixtures', () => {
  for (const fixture of MOCK_ROUNDS) {
    it(`${fixture} 应存在且不为空`, async () => {
      const p = path.join(fixturesDir, fixture);
      const stat = await fs.stat(p);
      assert.ok(stat.isFile(), '应为文件');
      assert.ok(stat.size > 0, '文件不应为空');
    });

    it(`${fixture} 应为合法 JSON`, async () => {
      const p = path.join(fixturesDir, fixture);
      const text = await fs.readFile(p, 'utf-8');
      const parsed = JSON.parse(text);
      assert.ok(parsed && typeof parsed === 'object');
    });
  }
});
