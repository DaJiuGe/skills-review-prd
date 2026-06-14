import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import { chunkPrdByH2, loadExistingTerms, parseArgs, run } from '../lib/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('loadExistingTerms', () => {
  it('应从 CONTEXT.md 与 docs/adr 加载候选术语', async () => {
    const fixtureDir = path.resolve(__dirname, '../fixtures/project-with-context-prd');
    const terms = await loadExistingTerms({
      context: path.join(fixtureDir, 'CONTEXT.md'),
      adrDir: path.join(fixtureDir, 'docs/adr'),
      cwd: fixtureDir,
    });

    assert.ok(Array.isArray(terms));
    assert.ok(terms.length > 0);
    assert.ok(terms.some((t) => t.source === 'CONTEXT.md'));
    assert.ok(terms.some((t) => path.normalize(t.source).includes(path.normalize('docs/adr'))));
  });

  it('文件不存在时应返回空数组', async () => {
    const terms = await loadExistingTerms({
      context: path.resolve(__dirname, '../fixtures/non-existent-CONTEXT.md'),
      adrDir: path.resolve(__dirname, '../fixtures/non-existent-adr'),
      cwd: __dirname,
    });

    assert.deepStrictEqual(terms, []);
  });
});
describe('chunkPrdByH2', () => {
  it('应按 ## 分块并保留标题', () => {
    const content = '# 标题\n\n前言行\n\n## 第一章\n\n内容一\n\n## 第二章\n\n内容二\n';
    const result = chunkPrdByH2(content);

    assert.strictEqual(result.title, '标题');
    assert.strictEqual(result.estimatedLines, 12);
    assert.strictEqual(result.chunks.length, 3);

    assert.strictEqual(result.chunks[0].section_title, '（前言）');
    assert.strictEqual(result.chunks[1].section_title, '第一章');
    assert.strictEqual(result.chunks[2].section_title, '第二章');
  });

  it('approximate_line 应接近原文件行号', () => {
    const lines = ['# 标题', '', '前言', '', '## 第一节', '内容', '', '## 第二节', '内容'];
    const result = chunkPrdByH2(lines.join('\n'));

    // "## 第一节" 在原文件第 5 行
    assert.strictEqual(result.chunks[1].approximate_line, 5);
    // "## 第二节" 在原文件第 8 行
    assert.strictEqual(result.chunks[2].approximate_line, 8);
  });

  it('无一级标题时应返回“未命名 PRD”', () => {
    const result = chunkPrdByH2('## 章节\n内容');
    assert.strictEqual(result.title, '未命名 PRD');
  });
});

describe('parseArgs', () => {
  it('应解析全部 CLI 参数', () => {
    const argv = [
      '--mock',
      '--interactive',
      '--no-save',
      '--context',
      './ctx.md',
      '--adr-dir',
      './adrs',
      'path/to/prd.md',
    ];
    const opts = parseArgs(argv);

    assert.strictEqual(opts.mock, true);
    assert.strictEqual(opts.interactive, true);
    assert.strictEqual(opts.noSave, true);
    assert.strictEqual(opts.context, './ctx.md');
    assert.strictEqual(opts.adrDir, './adrs');
    assert.strictEqual(opts.prdPath, 'path/to/prd.md');
  });

  it('默认值应正确', () => {
    const opts = parseArgs([]);
    assert.strictEqual(opts.mock, false);
    assert.strictEqual(opts.interactive, false);
    assert.strictEqual(opts.noSave, false);
    assert.strictEqual(opts.context, './CONTEXT.md');
    assert.strictEqual(opts.adrDir, './docs/adr');
    assert.strictEqual(opts.prdPath, undefined);
  });

  it('应忽略未知参数并将第一个非 -- 参数作为 prdPath', () => {
    const opts = parseArgs(['--unknown', 'prd.md']);
    assert.strictEqual(opts.prdPath, 'prd.md');
  });
});

describe('run', () => {
  it('未提供 roundData 时应抛出包含 Agent 指引的错误', async () => {
    await assert.rejects(
      () =>
        run(
          {
            prdPath: path.resolve(__dirname, '../fixtures/project-with-context-prd/prd.md'),
            noSave: true,
          },
          {}
        ),
      /runAgentStep/
    );
  });
});
