<p align="center">
  <a href="README.md">English</a> | <b>简体中文</b>
</p>

# review-design-plugin

用 EventStorming 思路评审 Markdown PRD，抽取领域术语、事件、命令、聚合、策略、读模型与外部系统，检测异常并生成 HTML/Markdown 报告。

## 快速开始

```bash
npm install
npm test

# 使用内置 mock 数据运行演示（不调用 LLM）
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md
```

## 功能

- **术语提取**：扫描 PRD，建立领域术语表，识别别名冲突与定义不一致。
- **EventStorming 元素**：提取领域事件、命令、聚合、策略、读模型、外部系统。
- **异常检测**：发现孤儿事件、缺失命令、聚合边界模糊、循环依赖、Saga 候选、缺失补偿事件、性能风险。
- **可视化报告**：生成 Markdown 报告与单文件 HTML 报告（含 Mermaid 时序图、聚合边界图、术语一致性热力图）。

## 使用方式

### CLI 模式

本 Skill **不直接调用 LLM**。CLI 仅支持两种模式：

1. **`--mock` 演示模式**：加载内置 mock 数据，快速验证报告渲染链路。
2. **Agent 驱动模式**：由调用 Agent 按轮次调用 LLM 生成 `round-1.json` ~ `round-4.json`，再调用本 Skill 的 runner 或 CLI 子脚本完成报告。

```bash
# 演示模式
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md

# 交互式演示
node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md

# 使用 CONTEXT.md 与 ADR
node ./index.js --mock --no-save ./fixtures/project-with-context-prd/prd.md \
  --context ./fixtures/project-with-context-prd/CONTEXT.md \
  --adr-dir ./fixtures/project-with-context-prd/docs/adr
```

### CLI 选项

| 选项            | 说明                                                       |
| --------------- | ---------------------------------------------------------- |
| `prd-path`      | PRD Markdown 文件路径；省略时使用当前目录唯一 `.md` 文件。 |
| `--mock`        | 使用内置 mock 数据。                                       |
| `--interactive` | 生成报告前询问一次确认。                                   |
| `--no-save`     | 不写入文件，仅输出终端摘要。                               |
| `--context`     | 项目上下文文件路径，默认 `./CONTEXT.md`。                  |
| `--adr-dir`     | ADR 目录，默认 `./docs/adr/`。                             |

### Agent 模式

在 OpenCode / Claude Code 中触发：

```text
/review-prd [path/to/prd.md]
```

Agent 会按以下步骤执行：

1. 读取 PRD、可选的 `CONTEXT.md` 与 `docs/adr/`。
2. 调用 `runAgentStep('Round1', ctx)` 获取 prompt，让 LLM 生成 `round-1.json`。
3. 调用 `runAgentStep('Round2', ctx)` 获取 prompt，让 LLM 生成 `round-2.json`。
4. 运行 `node lib/cli-detect-anomalies.js round-1.json round-2.json ./` 生成 `round-3.json` 与 `issues.json`。
5. 调用 `runAgentStep('Round4', ctx)` 获取 prompt，让 LLM 生成 `round-4.json`。
6. 渲染 Markdown / HTML 报告。

示例代码：

```javascript
import { runAgentStep, loadExistingTerms } from './lib/runner.js';

const existingTerms = await loadExistingTerms({ context: './CONTEXT.md', adrDir: './docs/adr' });
const r1 = runAgentStep('Round1', { prdTitle, prdChunks, existingTerms });
console.log(r1.prompt);
console.log(r1.schema);
```

## 输出

默认写入 `docs/reviews/`：

- `prd-review-{timestamp}.md`：Markdown 报告
- `prd-review-{timestamp}/index.html`：单文件 HTML 报告
- `prd-review-{timestamp}/round-{1..4}.json`：原始轮次数据

## 文档

- [`SKILL.md`](./SKILL.md) — 触发方式与 Agent 工作流
- [`REFERENCE.md`](./REFERENCE.md) — 完整参数、prompt 模板、异常规则
- [`EXAMPLES.md`](./EXAMPLES.md) — 更多 CLI 示例
- [`schema-design.md`](./docs/schema-design.md) — 四轮 JSON Schema 定义

## 许可

MIT
