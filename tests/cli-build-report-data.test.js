import { describe, it } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { buildReportDataInput } from './helpers/mock-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const cliPath = path.resolve(__dirname, '../lib/cli-build-report-data.js');
const tmpDir = path.resolve(__dirname, '../tmp/cli-report-test');

function buildRound3Data(overrides = {}) {
  return {
    version: '1.0',
    round: 3,
    dependencies: {
      round1_term_ids: [],
      round2_event_ids: [],
      round2_command_ids: [],
      round2_aggregate_ids: [],
      round2_policy_ids: [],
    },
    checks: {
      orphan_events: [],
      missing_commands: [],
      term_conflicts: [],
      boundary_ambiguities: [],
      circular_dependencies: [],
      hot_spot_reviews: [],
      saga_candidates: [],
      missing_compensations: [],
      performance_risks: [],
    },
    metrics: {
      event_command_ratio: 1,
      aggregate_count: 0,
      external_system_count: 0,
      policy_density: 0,
    },
    ...overrides,
  };
}

describe('cli-build-report-data', () => {
  it('应组装 report-data.json', async () => {
    const input = buildReportDataInput();
    await fs.mkdir(tmpDir, { recursive: true });
    const paths = {
      round1: path.join(tmpDir, 'round-1.json'),
      round2: path.join(tmpDir, 'round-2.json'),
      round3: path.join(tmpDir, 'round-3.json'),
      issues: path.join(tmpDir, 'issues.json'),
      round4: path.join(tmpDir, 'round-4.json'),
      out: path.join(tmpDir, 'report-data.json'),
    };

    await fs.writeFile(paths.round1, JSON.stringify(input.round1));
    await fs.writeFile(paths.round2, JSON.stringify(input.round2));
    await fs.writeFile(paths.round3, JSON.stringify(buildRound3Data()));
    await fs.writeFile(paths.issues, JSON.stringify(input.issues));
    await fs.writeFile(paths.round4, JSON.stringify(input.round4));

    await execFileAsync('node', [
      cliPath,
      paths.round1,
      paths.round2,
      paths.round3,
      paths.issues,
      paths.round4,
      paths.out,
    ]);

    const reportData = JSON.parse(await fs.readFile(paths.out, 'utf-8'));
    assert.strictEqual(reportData.prdTitle, input.prdTitle);
    assert.ok(Array.isArray(reportData.issues));
  });

  it('参数不足时应退出并打印用法', async () => {
    await assert.rejects(() => execFileAsync('node', [cliPath]), /用法/);
  });
});
