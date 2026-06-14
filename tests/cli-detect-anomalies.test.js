import { describe, it } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  buildRound1,
  buildTerm,
  buildRound2,
  buildEvent,
  buildCommand,
} from './helpers/mock-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const cliPath = path.resolve(__dirname, '../lib/cli-detect-anomalies.js');
const tmpDir = path.resolve(__dirname, '../tmp/cli-test');

describe('cli-detect-anomalies', () => {
  it('应生成 round-3.json 与 issues.json', async () => {
    const round1 = buildRound1({
      terms: [buildTerm({ id: 'term-001', term: 'Order', aliases: ['订单'] })],
    });
    const round2 = buildRound2({
      events: [
        buildEvent({
          id: 'evt-001',
          name: 'OrderPlaced',
          trigger: { type: 'command', source_id: 'missing-cmd' },
        }),
      ],
      commands: [buildCommand({ id: 'cmd-001', name: 'PlaceOrder' })],
    });

    await fs.mkdir(tmpDir, { recursive: true });
    const r1Path = path.join(tmpDir, 'round-1.json');
    const r2Path = path.join(tmpDir, 'round-2.json');
    await fs.writeFile(r1Path, JSON.stringify(round1));
    await fs.writeFile(r2Path, JSON.stringify(round2));

    await execFileAsync('node', [cliPath, r1Path, r2Path, tmpDir]);

    const round3 = JSON.parse(await fs.readFile(path.join(tmpDir, 'round-3.json'), 'utf-8'));
    const issues = JSON.parse(await fs.readFile(path.join(tmpDir, 'issues.json'), 'utf-8'));

    assert.strictEqual(round3.round, 3);
    assert.ok(Array.isArray(round3.checks.orphan_events));
    assert.ok(issues.length > 0);
  });

  it('参数不足时应退出并打印用法', async () => {
    await assert.rejects(() => execFileAsync('node', [cliPath]), /用法/);
  });
});
