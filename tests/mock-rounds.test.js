import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateRound1,
  validateRound2,
  validateRound3,
  validateRound4,
} from '../lib/agent-mode.js';
import { loadMockRounds } from '../fixtures/mock-rounds/index.js';

describe('loadMockRounds', () => {
  it('应加载 round1~round4 四个对象', async () => {
    const data = await loadMockRounds();
    assert.ok(data.round1 && typeof data.round1 === 'object');
    assert.ok(data.round2 && typeof data.round2 === 'object');
    assert.ok(data.round3 && typeof data.round3 === 'object');
    assert.ok(data.round4 && typeof data.round4 === 'object');
  });

  it('加载的各轮数据应通过对应 schema 校验', async () => {
    const { round1, round2, round3, round4 } = await loadMockRounds();

    const v1 = validateRound1(round1);
    const v2 = validateRound2(round2);
    const v3 = validateRound3(round3);
    const v4 = validateRound4(round4);

    assert.strictEqual(v1.ok, true, `Round1 校验失败: ${v1.errors.join('; ')}`);
    assert.strictEqual(v2.ok, true, `Round2 校验失败: ${v2.errors.join('; ')}`);
    assert.strictEqual(v3.ok, true, `Round3 校验失败: ${v3.errors.join('; ')}`);
    assert.strictEqual(v4.ok, true, `Round4 校验失败: ${v4.errors.join('; ')}`);
  });
});
