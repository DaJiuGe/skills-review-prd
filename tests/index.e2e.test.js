import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../index.js');
const fixturePath = path.resolve(__dirname, '../fixtures/meeting-room-booking-prd.md');

function runIndex(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [indexPath, ...args], {
      cwd: path.resolve(__dirname, '..'),
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

describe('index e2e', () => {
  it('--mock --no-save 应输出完整终端摘要', async () => {
    const { code, stdout } = await runIndex(['--mock', '--no-save', fixturePath]);

    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('PRD EventStorming 评审完成'));
    assert.ok(stdout.includes('会议室预订系统 PRD'));
    assert.ok(stdout.includes('统计:'));
    assert.ok(stdout.includes('问题:'));
    assert.ok(stdout.includes('关键发现:'));
  });

  it('非 mock 模式无 round 数据时应打印 Agent 指引并退出码 1', async () => {
    const { code, stdout } = await runIndex(['--no-save', fixturePath]);

    assert.strictEqual(code, 1);
    assert.ok(stdout.includes('Agent 驱动'));
    assert.ok(stdout.includes('runAgentStep'));
  });
});
