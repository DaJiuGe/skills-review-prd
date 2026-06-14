# /review-prd — Reference

## 1. 使用说明

### 1.1 命令格式

```text
/review-prd [path/to/prd.md] [--interactive] [--no-save]
          [--mock]
          [--context path/to/CONTEXT.md] [--adr-dir path/to/docs/adr]
```

### 1.2 参数与选项

| 参数/选项       | 必填 | 默认值                                          | 说明                                                                                                    |
| --------------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `prd-path`      | 否   | 当前目录下第一个 `.md` 文件；若多个则报错并列出 | PRD Markdown 文件路径。                                                                                 |
| `--context`     | 否   | `./CONTEXT.md`（存在则读）                      | 项目上下文文件路径，用于识别已有术语。                                                                  |
| `--adr-dir`     | 否   | `./docs/adr/`（存在则读）                       | ADR 目录，读取所有 `.md` 提取已有术语。                                                                 |
| `--interactive` | 否   | false                                           | 所有轮次数据就绪后，在生成最终报告前询问一次 `是否生成报告? [Y/n]`；输入 `n` 跳过写盘但仍输出终端摘要。 |
| `--no-save`     | 否   | false                                           | 不写入本地文件，仅在终端输出摘要。                                                                      |
| `--mock`        | 否   | false                                           | 强制使用 `fixtures/mock-rounds/round-{1..4}.json` 内置 mock 数据运行；runner 本身不再调用 LLM。         |

### 1.3 典型用法

见 [EXAMPLES.md](./EXAMPLES.md)。

### 1.4 工作流程（详细）

默认流程由外部 Agent 提供 Round1、Round2、Round4 的 JSON 数据，runner 内部通过 `detectAnomalies` 计算 Round3，最后渲染报告。CLI 可通过 `--mock` 使用内置预计算数据。

#### 1.4.1 轮次总览

```text
Round 1: 术语表提取      → JSON schema: Round1_TerminologyExtraction  （Agent 调用 LLM）
Round 2: EventStorming 元素 → JSON schema: Round2_EventStormingElements  （Agent 调用 LLM）
Round 3: 一致性/异常检测  → JSON schema: Round3_ConsistencyCheck        （runner 本地规则）
Round 4: 报告生成        → JSON schema: Round4_ReportGeneration + Mermaid （Agent 调用 LLM）
```

#### 1.4.2 Round 1 — 领域术语表提取

- **做什么**: 扫描 PRD 全文，提取领域术语、别名、定义、来源位置；与 `--context` / `--adr-dir` 中的已有术语比对，标记新增项和冲突。
- **输出**: `Round1_TerminologyExtraction` JSON（见 ./schema-design.md §3）。
- **下一步依赖**: Round 2 使用 `term_ids` 校验元素命名一致性；Round 3 使用术语列表检测冲突；Round 4 使用 `summary` 和术语热力图数据。

#### 1.4.3 Round 2 — EventStorming 元素提取

- **做什么**: 基于 Round 1 术语，识别领域事件（DomainEvent）、命令（Command）、聚合（Aggregate）、策略（Policy）、读模型（ReadModel）、外部系统（ExternalSystem）以及粉色便利贴风险点（HotSpot）。只到大事件风暴/流程建模层级，不下到战术聚合内部字段。
- **输出**: `Round2_EventStormingElements` JSON（见 ./schema-design.md §4）。
- **下一步依赖**: Round 3 检查元素间一致性（孤儿事件、缺失命令、循环依赖、边界模糊）；Round 4 使用时序图/边界图数据。

#### 1.4.4 Round 3 — 一致性检查与异常检测

- **做什么**: 基于 Round 1 和 Round 2 输出，运行 7 类异常检测规则，计算健康指标（event_command_ratio、policy_density 等），复核 Round 2 的 HotSpot。
- **输出**: `Round3_ConsistencyCheck` JSON，内含统一结构 `Issue[]`（见 ./schema-design.md §5）。
- **检测类型**: 孤儿事件、缺失命令、术语冲突、聚合边界模糊、循环依赖、Saga / 长流程编排候选、缺失补偿事件、性能风险。
- **下一步依赖**: Round 4 使用 `Issue[]` 生成摘要、建议、风险评级和严重度统计。

#### 1.4.5 Round 4 — 报告生成

- **做什么**: 汇总前三轮结果，生成终端摘要、Mermaid 事件流时序图、聚合边界图、术语一致性热力图数据，写入 Markdown 报告和 HTML 报告。
- **输出**:
  - 终端摘要
  - `docs/reviews/prd-review-{timestamp}.md`
  - `docs/reviews/prd-review-{timestamp}/index.html`
- **下一步依赖**: 无。

#### 1.4.6 交互模式（`--interactive`）

由于所有轮次数据均由外部提供，runner 不再在每轮结束后暂停。启用 `--interactive` 后，仅在所有数据校验通过之后、生成报告之前询问一次：

```text
是否生成报告? [Y/n]
```

- 输入 `y`、`Y`、`yes` 或**直接回车** → 继续生成 Markdown / HTML 报告。
- 输入 `n` → 跳过写盘，但仍输出终端摘要。
- 交互等待期间按 `Ctrl+C`，程序关闭 readline 并退出，不保存报告。

交互模式适用于需要人工确认是否落盘的场景。

---

## 2. Agent 模式工作流

当本 skill 被 OpenCode / Claude Code 触发时，按以下步骤执行：

1. 读取 PRD 文件（由用户指定或自动查找当前目录唯一 `.md`）
2. 可选读取 `CONTEXT.md` 和 `docs/adr/` 目录
3. **Round 1**: Agent 调用 LLM，使用 `runAgentStep('Round1', ctx).prompt`，输出 `Round1_TerminologyExtraction` JSON
4. **Round 2**: Agent 调用 LLM，使用 `runAgentStep('Round2', ctx).prompt`，输出 `Round2_EventStormingElements` JSON
5. **Round 3**: runner 调用 `detectAnomalies` 检测异常（Agent 也可通过 `node ./lib/cli-detect-anomalies.js round-1.json round-2.json` 子进程执行）
6. **Round 4**: Agent 调用 LLM，使用 `runAgentStep('Round4', ctx).prompt`，输出 `Round4_ReportGeneration` JSON
7. 调用 render 脚本生成 Markdown 和 HTML 报告
8. 输出终端摘要

CLI 模式现在仅作为本地演示入口：使用 `--mock` 时加载 `fixtures/mock-rounds/` 中的预计算数据；不使用 `--mock` 时 runner 会报错并提示需要提供 round1~round4 数据。

### 2.1 与 CLI 模式的区别

| 维度        | CLI 模式（`--mock`）                | Agent 模式                                                                            |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| 触发方式    | `node ./index.js --mock`            | OpenCode / Claude Code `/review-prd`                                                  |
| LLM 调用者  | 不调用 LLM，使用内置 fixtures       | Agent 自身逐步调用 LLM                                                                |
| Round3 执行 | runner 内直接调用 `detectAnomalies` | runner 内 `detectAnomalies` 或 `cli-detect-anomalies.js` 子进程                       |
| Render 执行 | `writeReports` 直接写文件           | `writeReports` 直接写文件，或通过 `cli-build-report-data.js` + `cli-render-report.js` |
| 中间 JSON   | 从 `fixtures/mock-rounds/` 加载     | Agent 显式保存 `round-1.json` ~ `round-4.json`                                        |
| 失败处理    | runner 校验失败即报错               | Agent 根据每轮指令自行重试或暂停                                                      |

### 2.2 每轮指令来源

Agent 可通过 `node -e` 或代码导入获取某一步的完整指令：

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

也可用 `node -e` 快速查看：

```bash
node -e "import('./lib/runner.js').then(m=>console.log(JSON.stringify(m.runAgentStep('Round1',{prdTitle:'T',prdChunks:[],existingTerms:[]}),null,2)))"
```

### 2.3 中间结果保存路径

Agent 模式下建议将每轮输出保存到：

```text
docs/reviews/prd-review-{timestamp}/
  round-1.json
  round-2.json
  round-3.json
  issues.json
  round-4.json
  report-data.json
  index.html
prd-review-{timestamp}.md
```

### 2.4 约束

- 每轮 LLM 输出必须是合法 JSON，不要解释文本。
- 每轮结束后检查 schema 关键字段：
  - Round1: `terms`, `prd_metadata.title`, `summary`
  - Round2: `events`, `commands`, `aggregates`
  - Round4: `mermaid_sequence_diagram`, `mermaid_boundary_diagram`, `review_summary`, `report_metadata`
- Round3 不调用 LLM，直接运行本地规则检测。
- 保存 `round-1.json` ~ `round-4.json` 到 `docs/reviews/prd-review-{timestamp}/`，便于追溯。

---

## 3. 文件操作

### 3.1 读 PRD

- 定位 PRD 文件：优先使用命令行参数；未指定时在当前工作目录查找唯一 `.md`；找到多个时报错并列出候选。
- 读取文件内容到内存，按 Markdown 二级标题（`##`）分块，保留原文行号映射用于 `source_location`。

### 3.2 读 CONTEXT.md

- 默认路径 `./CONTEXT.md`。存在则读取，用于构建“已有术语库”。
- 不存在则跳过，不报错。

### 3.3 读 docs/adr/

- 默认路径 `./docs/adr/`。递归读取所有 `.md` 文件，提取标题和正文中的候选术语。
- 不存在则跳过，不报错。

### 3.4 创建输出目录

- 确保目录存在：`docs/reviews/prd-review-{timestamp}/`
- 该目录下保存：`index.html`、原始 JSON 文件 `round-1.json` ~ `round-4.json`（可选但建议保留以便追溯）。

### 3.5 写报告文件

- Markdown 报告：`docs/reviews/prd-review-{timestamp}.md`
- HTML 报告：`docs/reviews/prd-review-{timestamp}/index.html`
- 若 `--no-save` 为 true，跳过所有写盘操作。

---

## 4. 输出规范

### 4.1 终端摘要格式

```text
PRD EventStorming 评审完成
============================
PRD:        docs/prd/order-system.md
标题:       在线订餐系统 PRD
生成时间:   2026-06-14T10:00:00Z

统计:
  术语:     24 个（新增 18 个，冲突 2 处）
  事件:     12 个 | 命令: 8 个 | 聚合: 4 个 | 策略: 2 个 | 外部系统: 3 个
  问题:     7 个（blocker 1 / high 2 / medium 3 / low 1）
  整体风险: medium

关键发现:
  1. [high] PaymentConfirmed 为孤儿事件，建议补充 ConfirmPayment 命令或明确外部回调。
  2. [medium] 术语“订单”在 3.1/3.2 节存在歧义。

报告:
  Markdown: docs/reviews/prd-review-20260614T100000Z.md
  HTML:     docs/reviews/prd-review-20260614T100000Z/index.html
```

### 4.2 Markdown 报告结构

`docs/reviews/prd-review-{timestamp}.md` 必须包含以下章节：

````markdown
# PRD EventStorming 评审报告 — {prd_title}

- 生成时间: {generated_at}
- PRD 路径: {prd_path}
- 整体风险: {overall_risk}

## 1. 执行摘要

{executive_summary}

## 2. 关键发现

{key_findings 列表}

## 3. 术语表

| ID  | 术语 | 别名 | 分类 | 定义 | 来源 |
| --- | ---- | ---- | ---- | ---- | ---- |
| ... | ...  | ...  | ...  | ...  | ...  |

## 4. EventStorming 元素清单

### 4.1 聚合

### 4.2 命令

### 4.3 事件

### 4.4 策略

### 4.5 读模型

### 4.6 外部系统

## 5. 异常与问题

### 5.1 问题列表

| ID  | 严重度 | 类别 | 标题 | 建议行动 |
| --- | ------ | ---- | ---- | -------- |
| ... | ...    | ...  | ...  | ...      |

### 5.2 Saga 流程

- 展示 SagaCandidate 列表与事件链 Mermaid 图。
- 缺失补偿的事件在图中标记为红色。

### 5.3 性能风险

| ID  | 类别 | 严重度 | 描述 | 建议行动 | 关联元素 |
| --- | ---- | ------ | ---- | -------- | -------- |
| ... | ...  | ...    | ...  | ...      | ...      |

## 6. 可视化

### 6.1 事件流时序图

```mermaid
{mermaid_sequence_diagram}
```
````

### 6.2 聚合边界图

```mermaid
{mermaid_boundary_diagram}
```

### 6.3 术语一致性热力图

{ASCII / 表格热力图，章节 × 术语，单元格为 consistency_score}

## 7. 建议行动

{按 priority 分组}

## 8. 附录

- 原始 LLM 输出路径: `prd-review-{timestamp}/round-{1..4}.json`
- Schema 版本: 1.0

````

### 4.3 HTML 报告结构

`docs/reviews/prd-review-{timestamp}/index.html` 要求：

- 单文件 HTML：CSS（Tailwind CSS）与 Mermaid 11 均通过 CDN 引入，图表在线渲染；报告内容本身仍为一个独立 `.html` 文件。
- 通过 `<div class="mermaid">{mermaid_sequence_diagram}</div>` 嵌入时序图。
- 通过 `<div class="mermaid">{mermaid_boundary_diagram}</div>` 嵌入边界图。
- 边界图自动按 `boundary_ambiguity` issue 标红：渲染前解析 diagram，为相关聚合/外部系统节点注入 `classDef issue` 与 `:::issue` class，使问题边界显示为红色边框/背景。
- 术语热力图使用 CSS Grid 渲染，数据源来自 `term_heatmap_data`；提供「下载热力图 SVG」按钮，可把当前热力图导出为 SVG 文件。
- 每个 Mermaid 图旁提供「复制 Mermaid 源码」按钮，便于粘贴到支持 Mermaid 的文档。
- 问题列表支持按严重度筛选表格行。
- 报告顶部提供章节导航，可快速跳转到执行摘要、关键发现、术语表、EventStorming 元素、异常与问题、可视化、建议行动、元数据。
- 包含以下区块：执行摘要、关键发现、术语表、EventStorming 元素、问题列表、可视化图表、建议行动、元数据。
- 严重度颜色统一：`blocker` 深红、`high` 红、`medium` 橙、`low` 蓝灰。

HTML Mermaid 嵌入示例：

```html
<script src="https://cdn.tailwindcss.com"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
</script>

<h2 id="visualization">可视化</h2>
<h3>事件流时序图</h3>
<div class="mermaid" id="mermaid-sequence">
sequenceDiagram
    actor Customer
    Customer->>Order: PlaceOrder
    Order->>PaymentGateway: 请求支付
    PaymentGateway-->>Order: PaymentConfirmed
    Order->>Delivery: 分配配送
</div>
<button onclick="copyMermaid('mermaid-sequence')">复制 Mermaid 源码</button>

<h3>聚合边界图</h3>
<div class="mermaid" id="mermaid-boundary">
graph TB
    classDef issue fill:#ffcccc,stroke:#cc0000,stroke-width:2px
    subgraph 核心域
        Order[Order 聚合]
        Delivery[Delivery 聚合]
    end
    Order:::issue
    Delivery:::issue
</div>
<button onclick="copyMermaid('mermaid-boundary')">复制 Mermaid 源码</button>
````

---

## 5. Prompt 模板

每轮调用 LLM 时，使用当前 agent 默认模型，传入结构化 prompt。输出必须为 JSON，不附加解释文本。

### 5.1 Round 1 Prompt — 术语表提取

```text
你是一名资深领域驱动设计（DDD）架构师，擅长从 PRD 中提取并规范化领域术语。

任务：阅读以下 Markdown PRD，提取所有领域术语，输出符合 Round1_TerminologyExtraction schema 的 JSON。

输入：
- PRD 标题: {prd_title}
- PRD 内容（按章节分块）:
{prd_chunks}

已有术语库（可能为空）:
{existing_terms}

要求：
1. term 使用单数、首字母大写的英文名词；中文 PRD 可同时给出中文标准名与英文别名。
2. aliases 收录 PRD 中出现的同义词、缩写、大小写变体。
3. 每个术语必须附带至少一个 source_location，包含 section_title、paragraph_index、approximate_line、quote。
4. domain_category 仅允许 core / supporting / generic / unknown。
5. 标记术语冲突：alias_overlap（别名重叠）、homonym（一词多义）、inconsistent_definition（定义不一致）、external_conflict（与已有术语库冲突）。
6. 输出必须是合法 JSON，不要 Markdown 代码块，不要解释。

输出 schema: Round1_TerminologyExtraction（见 ./schema-design.md §3）。

示例片段：
{
  "version": "1.0",
  "round": 1,
  "prd_metadata": { "title": "...", "total_sections": 5, "estimated_lines": 320 },
  "terms": [...],
  "conflicts": [...],
  "summary": { "total_terms": 24, "new_terms": 18, "conflict_count": 2 }
}
```

### 5.2 Round 2 Prompt — EventStorming 元素提取

```text
你是一名 EventStorming  facilitator 和 DDD 架构师。

任务：基于以下 PRD 和 Round 1 术语表，提取事件、命令、聚合、策略、读模型、外部系统、热点风险。

输入：
- PRD 内容: {prd_content}
- Round 1 术语表: {round1_terms}

要求：
1. 事件名必须是“过去时 + 名词”，如 OrderPlaced、PaymentConfirmed。
2. 命令名必须是动词开头，如 PlaceOrder、ConfirmPayment。
3. 聚合只描述高层次职责与不变量，不要展开字段/方法。
4. 每个元素通过 term_ids 引用 Round 1 的术语 ID。
5. trigger / outcome 必须显式建立事件-命令-策略因果链。
6. HotSpot 标记 PRD 中模糊、缺失、冲突或技术风险点。
7. 输出合法 JSON，不要解释。

输出 schema: Round2_EventStormingElements（见 ./schema-design.md §4）。
```

### 5.3 Round 3 Prompt — 一致性检查与异常检测

```text
你是一名软件架构评审师。

任务：基于 Round 1 术语表和 Round 2 EventStorming 元素，运行一致性检查，识别异常并输出统一问题列表。

输入：
- Round 1 术语: {round1_terms}
- Round 2 元素: {round2_elements}

检查项：
1. 孤儿事件：没有明确触发源（command/policy/external_system/time/event）的事件。
2. 缺失命令：PRD 描述用户/系统可操作行为，但未提取到对应命令。
3. 术语冲突：别名重叠、一词多义、定义不一致。
4. 聚合边界模糊：职责/数据/生命周期/团队归属重叠。
5. 循环依赖：事件-策略-命令-事件形成闭环。
6. Saga / 长流程编排：事件链长度 >= 3 且跨聚合或跨外部系统的长事务候选，检查关键事件是否缺失补偿事件。
7. 性能风险：高频事件聚合、同步外部 API 调用、热读模型、过大聚合。

输出要求：
- 计算 metrics: event_command_ratio、aggregate_count、external_system_count、policy_density。
- checks 必须包含 saga_candidates、missing_compensations、performance_risks 字段。
- 每个问题使用统一 Issue 结构（id, severity, category, title, description, related_element_ids, suggested_action）。
- 复核 Round 2 的 HotSpot，给出 confirmed / mitigated / false_positive。
- 输出合法 JSON，不要解释。

输出 schema: Round3_ConsistencyCheck（见 ./schema-design.md §5）。
```

### 5.4 Round 4 Prompt — 报告生成

```text
你是一名技术负责人，需要把 EventStorming 评审结果整理为面向架构师的报告输入。

任务：基于前三轮输出，生成终端摘要、Mermaid 图、术语热力图数据和执行摘要。

输入：
- Round 1 summary: {round1_summary}
- Round 2 元素: {round2_elements}
- Round 3 问题列表: {round3_issues}

输出要求：
1. mermaid_sequence_diagram: 使用 sequenceDiagram 语法，优先展示高 business_value 事件，低价值事件可折叠注释。
2. mermaid_boundary_diagram: 使用 graph TB 语法，按 core / supporting / generic / external 分组子图。
3. term_heatmap_data: 以章节为行、术语为列，给出 consistency_score（0.0~1.0）和 variant_used。
4. review_summary: 3 句话执行摘要、≤5 条关键发现、按优先级分组的建议行动、overall_risk（low/medium/high/critical）。
5. report_metadata: generated_at（ISO 8601）、prd_title、total_issues、各严重度计数。
6. 输出合法 JSON，不要解释。

输出 schema: Round4_ReportGeneration（见 ./schema-design.md §6）。
```

---

## 6. 异常检测规则

### 6.1 孤儿事件（Orphan Event）

- **定义**: 领域事件没有明确的触发源，或 trigger.type 为 event 但 source_id 指向的事件不存在。
- **严重度判定**:
  - blocker: 核心业务事件（business_value=high）无触发源。
  - high: 重要事件（business_value=medium）无触发源，或 LLM 无法给出合理假设。
  - medium: 低价值事件无触发源，但可推测为外部系统/定时任务触发。
  - low: 事件源在 PRD 其他章节有间接说明，仅需补充文档。

### 6.2 缺失命令（Missing Command）

- **定义**: PRD 描述用户/系统“可以做什么”，但未提取到对应的 Command。
- **严重度判定**:
  - blocker: 缺少影响核心流程的命令（如“用户可取消订单”但无 CancelOrder）。
  - high: 缺少重要管理/配置命令。
  - medium: 缺少读模型刷新/同步类命令。
  - low: 缺少边缘操作命令，不影响主流程。

### 6.3 术语冲突（Term Conflict）

- **定义**: 同一别名指代多个术语、同一术语在不同位置定义不一致、或 PRD 术语与已有术语库冲突。
- **严重度判定**:
  - blocker: 核心域术语定义完全矛盾，会导致聚合边界错误。
  - high: 高频术语存在明显歧义，影响多个事件/命令。
  - medium: 别名重叠但上下文可区分，建议统一命名。
  - low: 拼写/大小写不一致，仅影响文档可读性。

### 6.4 聚合边界模糊（Boundary Ambiguity）

- **定义**: 两个聚合在职责、数据所有权、生命周期或团队归属上重叠，边界不清晰。
- **严重度判定**:
  - blocker: 核心聚合与另一聚合存在循环依赖或数据所有权冲突。
  - high: 生命周期强耦合，一个聚合的状态转换严重依赖另一个聚合内部状态。
  - medium: 职责部分重叠，可通过重构命令/事件解耦。
  - low: 团队归属描述模糊，但职责清晰。

### 6.5 循环依赖（Circular Dependency）

- **定义**: 事件 → 策略 → 命令 → 事件 形成闭环，或聚合间存在相互触发的命令/事件链。
- **严重度判定**:
  - blocker: 循环涉及核心业务流程且无法在业务上打破。
  - high: 循环存在，但可通过引入读模型或外部系统打破。
  - medium: 循环由策略判断条件导致，业务上可接受但需记录。
  - low: 循环为补偿/审计事件，不影响主流程。

### 6.6 Saga / 长流程编排候选（Saga Candidate）

- **定义**: 事件链长度 >= 3，且跨越 >= 2 个聚合或 >= 1 个外部系统的长事务流程。
- **严重度判定**:
  - high: 跨聚合或跨外部系统，需要显式 Saga 编排。
- **处理建议**: 为 Saga 命名，梳理每个关键事件的补偿事件，避免隐式长事务。

### 6.7 缺失补偿事件（Missing Compensation）

- **定义**: Saga 候选链中的关键事件（如 Placed/Confirmed/Paid/Shipped/Approved/Created）缺少对应的补偿事件（如 Cancelled/Refunded/Returned/Rejected/Deleted）。
- **严重度判定**:
  - high: 核心流程事件缺少补偿，长事务失败时难以回滚。
  - medium: 非核心事件缺少补偿，但影响可接受。
- **处理建议**: 补充补偿事件并纳入 Saga 编排。

### 6.8 性能风险（Performance Risk）

- **定义**: 设计点可能导致性能瓶颈，包括：
  - `high_frequency_event`: 单个聚合上事件数显著超过命令数（> 命令数 × 1.5）。
  - `synchronous_external_call`: 外部系统 `integration_type='api'` 同步消费命令直接触发的事件。
  - `hot_read_model`: 读模型订阅 >= 3 个事件，或数据来源涉及 >= 2 个聚合。
  - `large_aggregate`: 单个聚合上 >= 5 个事件或 >= 4 个命令。
- **严重度判定**:
  - high: 高频事件密度过高、同步外部调用阻塞主流程、热读模型订阅事件过多。
  - medium: 聚合偏大、读模型依赖略复杂。
- **处理建议**: 引入异步事件总线/削峰队列、拆分聚合、为读模型建立独立投影/缓存、将同步外部调用改为异步。

---

## 7. 失败处理

### 7.1 PRD 文件不存在

- 报错：`PRD 文件未找到: {path}`
- 若未指定路径且当前目录无 `.md`，列出当前目录 Markdown 文件供用户选择。
- 终止流程，不调用 LLM。

### 7.2 CONTEXT.md / ADR 读取失败

- 若文件/目录不存在：跳过，记录 info 日志。
- 若读取权限不足：记录 warning 日志，继续使用空已有术语库。

### 7.3 API key 与 LLM 调用

- runner 自身不再调用 LLM，因此不再检查 API key。
- CLI 模式必须通过 `--mock` 运行，否则 runner 会提示缺少 round1~round4 数据。
- Agent 模式由外部 Agent 负责配置 LLM API key、选择模型并调用 LLM；runner 仅提供 prompt、schema 与校验支持。

### 7.4 轮次数据校验失败

1. runner 在收到外部提供的 round1~round4 数据后，会调用 `validateRound1~4` 进行轻量校验。
2. 若校验失败，runner 立即抛出错误并列出具体失败字段；调用方（Agent）需根据 schema 说明修复对应 JSON 后重新提交。
3. 不再执行自动 LLM 重试或降级。

### 7.5 中间轮次缺少依赖

- 若 Round 2 引用不存在的 `term_id`，记录 warning 并将该 `term_id` 标记为 `unresolved`。
- 若 Round 3 引用不存在的元素 ID，忽略该引用并继续检查。
- 若 Round 4 依赖缺失，降级生成报告：缺失图显示占位说明，问题列表留空并标注“上游数据不完整”。

### 7.6 输出目录写入失败

- 报错：`无法创建输出目录: {path}`
- 若 `--no-save` 为 false 但写入失败，向终端输出完整摘要和 Mermaid 文本，告知用户可手动保存。

---

## 8. 附录

### 8.1 Schema 版本

- 当前版本: `1.0`
- 完整 schema 定义见: `./schema-design.md`

### 8.2 依赖工具

- Markdown 解析: 任意标准 Markdown parser（保留标题/段落/行号）。
- JSON 校验: 每轮输出必须进行 schema 校验；校验失败按 §8.3 处理。
- Mermaid: HTML 报告使用 Mermaid.js 在浏览器端渲染。

### 8.3 命名约定

- ID 格式: `{type}-{seq}`，如 `term-001`、`evt-005`、`issue-012`。
- 时间戳格式: `YYYYMMDDTHHmmssZ`（UTC），用于文件名。
- 输出路径:
  - Markdown: `docs/reviews/prd-review-{timestamp}.md`
  - HTML: `docs/reviews/prd-review-{timestamp}/index.html`

### 8.4 首版限制

- 仅支持中文/英文 PRD。
- 默认复用当前 agent 模型，不额外配置专用模型。
- 不处理 PDF、Word 等非 Markdown 输入。

(End of REFERENCE.md)
