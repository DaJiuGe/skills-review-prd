---
name: review-prd
description: This skill reviews a Markdown PRD using EventStorming to extract domain terminology, events, commands, aggregates, policies, read models, and external systems, detects anomalies such as orphan events, missing commands, term conflicts, boundary ambiguities, and circular dependencies, and generates a local HTML/Markdown report with Mermaid diagrams. Use when the user wants to review a PRD, check requirements, or ask questions about PRD ambiguity, including invocations of /review-prd, "review this PRD", and similar trigger phrases.
---

# /review-prd

**Skill 名称**: PRD EventStorming 评审
**一句话描述**: 读取当前工作目录的 Markdown PRD，用 EventStorming 思路抽取领域术语、事件、命令、聚合、策略、读模型与外部系统，检测异常并生成本地 HTML/Markdown 可视化报告。
**触发方式**:

- **CLI 模式**: `node ./index.js [prd-path] [options]`
- **Agent 模式**: 在 OpenCode / Claude Code 中输入 `/review-prd [prd-path]`

---

## 1. Quick start

```text
/review-prd [path/to/prd.md] [--interactive] [--no-save]
          [--mock]
          [--context path/to/CONTEXT.md] [--adr-dir path/to/docs/adr]
```

典型用法：

```text
/review-prd --mock
/review-prd docs/prd/order-system.md --interactive --mock
/review-prd README.md --no-save --mock
```

> 说明：`review-prd` runner 本身不再调用 LLM。CLI 必须通过 `--mock` 使用内置的预计算数据；Agent 模式由调用 agent 负责逐轮调用 LLM 并提供 round1~round4 数据。

完整参数表、Prompt 模板、异常检测规则与失败处理见 [REFERENCE.md](./REFERENCE.md)。

---

## 2. Workflows overview

评审流程分为 4 轮结构化抽取，最终生成报告。

```text
Round 1: 术语表提取      → JSON schema: Round1_TerminologyExtraction
Round 2: EventStorming 元素 → JSON schema: Round2_EventStormingElements
Round 3: 一致性/异常检测  → JSON schema: Round3_ConsistencyCheck
Round 4: 报告生成        → JSON schema: Round4_ReportGeneration + Mermaid
```

- **Agent 模式**：调用 agent 依次调用 LLM 完成 Round1、Round2、Round4；Round3 由 runner 的本地规则（`anomalies.js`）自动计算。每轮结果保存为 `round-1.json` ~ `round-4.json`。
- **CLI `--mock` 模式**：直接加载 `fixtures/mock-rounds/round-{1..4}.json` 作为预计算数据，不调用 LLM，用于本地快速验证与演示。

### 2.1 Interactive mode (`--interactive`)

所有轮次数据准备就绪后，runner 会在生成最终报告前询问一次 `是否生成报告? [Y/n]`；输入 `n` 仅跳过写盘，仍输出终端摘要。不再在每轮结束后暂停。

---

## 3. Agent mode workflow

1. 读取 PRD（参数或当前目录唯一 `.md`）。
2. 可选读取 `./CONTEXT.md` 与 `./docs/adr/`。
3. **Round 1**: Agent 调用 LLM，使用 `runAgentStep('Round1', ctx).prompt`，输出 `Round1_TerminologyExtraction` JSON 并保存为 `round-1.json`。
4. **Round 2**: Agent 调用 LLM，使用 `runAgentStep('Round2', ctx).prompt`，输出 `Round2_EventStormingElements` JSON 并保存为 `round-2.json`。
5. **Round 3**: runner 内部调用 `detectAnomalies(round1, round2)` 生成 `round-3.json` 与 `issues.json`。
6. **Round 4**: Agent 调用 LLM，使用 `runAgentStep('Round4', ctx).prompt`，输出 `Round4_ReportGeneration` JSON 并保存为 `round-4.json`。
7. runner 组装报告数据并渲染 Markdown / HTML 报告。
8. 输出终端摘要。

Agent 可通过以下方式获取任意步骤的完整指令：

```javascript
import { runAgentStep } from './lib/runner.js';

const instructions = runAgentStep('Round1', {
  prdTitle: '会议室预订系统 PRD',
  prdChunks: [...],
  existingTerms: [],
});

console.log(instructions.prompt);
console.log(instructions.schema);
console.log(instructions.outputFile);
```

与 CLI 模式的区别、每轮指令来源、中间结果保存路径及约束见 REFERENCE.md。

---

## 4. Links

- [REFERENCE.md](./REFERENCE.md) — 完整参数、输出规范、Prompt 模板、异常检测规则、失败处理、附录。
- [EXAMPLES.md](./EXAMPLES.md) — 典型 CLI 调用、fixtures 说明、终端摘要示例。
- [schema-design.md](./docs/schema-design.md) — 四轮 JSON Schema 定义。
