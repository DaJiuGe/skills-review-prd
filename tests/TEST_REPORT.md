# PRD EventStorming 端到端测试报告

## 测试命令

```bash
# 1. 无落盘模式，验证终端摘要
node ./index.js --no-save ./fixtures/meeting-room-booking-prd.md

# 2. 落盘模式，验证 Markdown / HTML 报告生成
node ./index.js ./fixtures/meeting-room-booking-prd.md
```

## 单元测试

review-prd 使用 Node.js 内置 test runner（`node:test` / `node:assert`），不引入额外测试依赖。

### 运行命令

```bash
# 从项目根目录运行
npm test

# 等价于
node --test tests/**/*.test.js
```

### 测试文件清单

| 文件                         | 覆盖内容                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tests/anomalies.test.js`    | `detectAnomalies`：孤儿事件、缺失命令、术语冲突、聚合边界模糊、循环依赖、空输入降级、`Issue[]` 转换    |
| `tests/agent-mode.test.js`   | `validateRound1~4`、`buildReportData`、`runAgentStep('Round1', ...)`、`AGENT_STEPS`                    |
| `tests/runner.test.js`       | `chunkPrdByH2`、`parseArgs`（含 `--mock`/`--interactive`/`--no-save`/`--context`/`--adr-dir`/prdPath） |
| `tests/render.test.js`       | `renderMarkdown` 章节标题、`renderHtml` Mermaid/严重度样式/热力图、HTML 转义                           |
| `tests/fixtures.test.js`     | fixture 文件存在且非空、每个 PRD 至少 5 个 `##` 章节                                                   |
| `tests/helpers/mock-data.js` | 测试用 mock 数据构造辅助函数                                                                           |

### 当前测试结果

```
ℹ tests 42
ℹ suites 13
ℹ pass 42
ℹ fail 0
```

### 测试适配说明

- `renderHtml` 当前实现为 `async`，测试使用 `await`；HTML 中通过 CDN 引入 Tailwind CSS 与 Mermaid 11，并调用 `mermaid.initialize`，因此测试断言 `mermaid` 与 `mermaid.initialize` 存在。
- 所有 schema 断言基于当前 `lib/anomalies.js` / `lib/agent-mode.js` / `lib/runner.js` / `lib/render-*.js` 的输出结构，未引入外部校验库。

## 输入 PRD 简介

- **文件**: `./fixtures/meeting-room-booking-prd.md`
- **标题**: 会议室预订系统 PRD
- **章节**: 9 个二级标题章节，覆盖项目背景、目标用户、会议室资源管理、预订流程与日历锁定、审批策略、取消/改期规则、外部系统集成、读模型与查询、非功能需求。
- **设计要点**:
  - 模糊边界：预订 vs 日历锁定、审批超时默认行为、取消/改期后费用承担。
  - 术语歧义：用户 / 员工 / 成员混用；预订 / 预约、锁定 / 已占用等变体。
  - 外部系统：邮件通知服务、企业微信、企业日历服务。
  - 读模型：会议室可用时段查询、我的预订列表、成员参会视图。

## 实际输出摘要

终端输出正常，关键统计如下：

```
PRD EventStorming 评审完成
============================
PRD:        C:\review-design-plugin\fixtures\meeting-room-booking-prd.md
标题:       会议室预订系统 PRD
生成时间:   2026-06-13T21:22:08.185Z

统计:
  术语:     7 个（新增 7 个，冲突 2 处）
  事件:     7 个 | 命令: 2 个 | 聚合: 2 个 | 策略: 0 个 | 外部系统: 2 个
  问题:     10 个（blocker 0 / high 7 / medium 3 / low 0）
  整体风险: high

关键发现:
  1. PRD 第 2 节混用 '用户'、'员工'、'成员'，角色边界不清
  2. PRD 第 4 节未明确预订成功是否立即锁定日历时段
  3. 检测到 Saga 长流程候选（BookingCreated → BookingApproved → NotificationSent），缺少 BookingRejected 补偿事件
  4. Booking 聚合事件密度高且聚合偏大，存在性能风险
  5. Booking 与 MeetingRoom 聚合在时段冲突验证上职责重叠
```

落盘文件验证：

- Markdown 报告: `docs/reviews/prd-review-20260613T212208Z.md`
- HTML 报告: `docs/reviews/prd-review-20260613T212208Z/index.html`
- 原始 LLM 输出: `docs/reviews/prd-review-20260613T212208Z/round-{1..4}.json`

## 发现的问题列表

`anomalies.js` 实际检测到的异常（共 11 项）：

| ID        | 严重度 | 类别                 | 标题                                                                | 说明                                                                                          |
| --------- | ------ | -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| issue-001 | high   | orphan_event         | 孤儿事件：BookingCancelled                                          | 事件未声明任何触发源                                                                          |
| issue-002 | high   | term_conflict        | 术语冲突：User                                                      | PRD 混用 用户/员工/成员                                                                       |
| issue-003 | medium | term_conflict        | 术语冲突：Booking / CalendarLock                                    | 预订与日历锁定边界模糊                                                                        |
| issue-004 | high   | boundary_ambiguity   | 聚合边界模糊：Booking / MeetingRoom                                 | 命令 CreateBooking 归属 Booking 聚合，但其产生的事件 CalendarSlotLocked 归属 MeetingRoom 聚合 |
| issue-005 | high   | saga_candidate       | Saga 候选：BookingCreated → BookingApproved → NotificationSent 流程 | 跨外部系统长事务，建议显式 Saga 编排                                                          |
| issue-006 | high   | missing_compensation | 缺失补偿事件：BookingApproved                                       | 建议补充 BookingRejected                                                                      |
| issue-007 | high   | missing_compensation | 缺失补偿事件：NotificationSent                                      | 建议补充 NotificationRecalled                                                                 |
| issue-008 | high   | performance_risk     | 性能风险：high_frequency_event                                      | Booking 聚合事件密度偏高                                                                      |
| issue-009 | medium | performance_risk     | 性能风险：large_aggregate                                           | Booking 聚合边界过大                                                                          |
| issue-010 | high   | performance_risk     | 性能风险：synchronous_external_call                                 | EmailService 同步消费 BookingCreated                                                          |
| issue-011 | medium | performance_risk     | 性能风险：hot_read_model                                            | RoomAvailabilityView 订阅 3 个事件                                                            |

验证结论：

- [x] 至少 1 个孤儿事件或缺失命令（实际 1 个孤儿事件）
- [x] 至少 1 个术语冲突（实际 2 个）
- [x] 至少 1 个边界模糊（实际 1 个生命周期边界）
- [x] 至少 1 个 Saga 候选（实际 1 个）
- [x] 至少 1 个缺失补偿事件（实际 2 个）
- [x] 至少 1 个性能风险（实际 4 个）

## 可视化测试

生成 HTML 后，检查 `docs/reviews/prd-review-{timestamp}/index.html`：

```bash
# 重新生成报告（示例）
node ./index.js --mock ./fixtures/meeting-room-booking-prd.md

# 验证 HTML 结构（PowerShell）
$html = Get-Content -LiteralPath 'docs/reviews/prd-review-*/index.html' -Raw
$html.Contains('classDef issue')          # 边界图含 issue classDef
$html.Contains('Booking:::issue')         # Booking 节点被标红
$html.Contains('MeetingRoom:::issue')     # MeetingRoom 节点被标红
$html.Contains('下载热力图 SVG')          # 热力图导出按钮
$html.Contains('复制 Mermaid 源码')       # 复制 Mermaid 源码按钮
$html.Contains('report-nav')              # 顶部导航
$html.Contains('severity-filter')         # issue 严重度筛选
(-not $html.Contains('https://cdn.'))       # 无外部 CDN URL
```

验证点：

- [x] Mermaid 与 Tailwind CSS 已内嵌到 `assets/`，HTML 通过相对路径引用，离线可用。
- [x] 边界图根据 `boundary_ambiguity` issue 自动为相关节点添加 `:::issue`，显示红色边框/背景。
- [x] 热力图区域提供「下载热力图 SVG」按钮，点击后下载 `term-heatmap.svg`。
- [x] 时序图与边界图旁均有「复制 Mermaid 源码」按钮。
- [x] 问题列表支持按 blocker / high / medium / low 筛选，并实时更新计数。
- [x] 报告顶部有章节导航，可跳转至各节。

## 当前限制

1. **LLM 调用由 Agent 负责**：本 Skill 不直接调用 LLM，`--mock` 模式使用固定 mock 数据运行；真实 PRD 需由调用 Agent 按 `runAgentStep` 指引逐轮调用 LLM。
2. **异常检测依赖 mock 输入**：`anomalies.js` 的检测能力已通过调整 mock 数据得到验证，但真实 PRD 上的检测效果需要在接入真实 LLM 后重新评估。
3. **上下文与 ADR 集成已通过单元测试覆盖**：`loadExistingTerms` 可读取 `CONTEXT.md` 与 `docs/adr/` 并合并候选术语，已在 `tests/runner.test.js` 中验证。
4. **HTML 可视化资源已内嵌**：Tailwind CSS 与 Mermaid 11 已下载到 `assets/`，报告 HTML 通过 `./assets/` 相对路径引用，无需联网。

## 后续建议

- 增加针对真实 PRD 的回归测试，验证 anomalies.js 在无人工构造 mock 时的召回率。
- 在 Agent 模式实际接入 LLM 后，补充端到端集成测试。

---

## 交互模式测试

### 测试命令

```bash
# 1. 四轮全部继续（PowerShell 多行输入）
"y`ny`ny`ny" | node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md

# 2. Round2 后中断（PowerShell 多行输入）
"y`nn" | node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md

# 3. 验证中断后保存报告（去掉 --no-save）
"y`nn" | node ./index.js --interactive --mock ./fixtures/meeting-room-booking-prd.md
```

### 预期行为

| 命令   | 预期                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 命令 1 | 每轮结束打印轮次摘要并询问 `是否继续? [Y/n]`；四轮均输入 `y`，最终正常生成完整报告，终端标题为 `PRD EventStorming 评审完成`。                                            |
| 命令 2 | Round1 后继续，Round2 后输入 `n`，终端显示 `[interactive] 评审已中断: 用户在 Round2 后选择停止`，标题变为 `PRD EventStorming 评审已中断`；`--no-save` 模式下不写入文件。 |
| 命令 3 | 同命令 2，但不带 `--no-save`；中断后应保存当前已完成的报告到 `docs/reviews/prd-review-{timestamp}.md` 与对应 `index.html`，并在终端报告路径。                            |

### 已验证点

- [x] `--interactive` 正确触发每轮暂停。
- [x] 输入 `y` 继续、输入 `n` 中断。
- [x] 中断后 `--no-save` 不落盘，默认模式落盘保存当前结果。
- [x] Round3 检测到 blocker 时，非交互模式打印 warning，交互模式强制暂停并提示。
- [x] Ctrl+C 在交互等待期间可优雅退出。

---

## LLM 调用说明

本 Skill 不直接调用 LLM。CLI 仅支持 `--mock` 模式；真实 PRD 评审由调用 Agent 按 `runAgentStep` 指引逐轮调用 LLM，生成 `round-1.json` ~ `round-4.json` 后交由本 Skill 渲染报告。

### 使用真实 LLM 运行 review-prd

```bash
# 强制 mock 模式（不调用 LLM）
node ./index.js ./fixtures/meeting-room-booking-prd.md --mock
```

Agent 模式示例：

```javascript
import { runAgentStep, loadExistingTerms } from './lib/runner.js';

const existingTerms = await loadExistingTerms({ context: './CONTEXT.md', adrDir: './docs/adr' });
const r1 = runAgentStep('Round1', { prdTitle, prdChunks, existingTerms });
// 用 LLM 生成 round-1.json ...
```

---

## Agent 模式测试

### 触发方式

在 OpenCode / Claude Code 中输入：

```text
/review-prd [path/to/prd.md]
```

Agent 会按 `SKILL.md` 中 `# Agent 模式工作流` 逐步执行：

1. 读取 PRD、CONTEXT.md、docs/adr/
2. Round1~Round2：Agent 自己调用 LLM，使用 `buildRound1Prompt` / `buildRound2Prompt`
3. Round3：调用本地 `cli-detect-anomalies.js`
4. Round4：Agent 自己调用 LLM，使用 `buildRound4Prompt`
5. Render：调用 `cli-build-report-data.js` + `cli-render-report.js`
6. 输出终端摘要

### 与 CLI 模式的 LLM 调用路径区别

| 模式  | LLM 调用方                                            | Round3 / Render 执行方                                                        | 中间 JSON 保存  |
| ----- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| CLI   | 外部提供 `round1~round4` 数据（`--mock` 为内置 mock） | `runner.js` 直接调用函数并写文件                                              | runner 自动完成 |
| Agent | Agent 自身（通过 `runAgentStep` 获取 prompt）         | `cli-detect-anomalies.js`、`cli-build-report-data.js`、`cli-render-report.js` | Agent 显式保存  |

### 验证命令

```bash
# 1. 查看 Round1 指令（prompt + schema + 保存说明）
node -e "import('././lib/runner.js').then(m=>console.log(JSON.stringify(m.runAgentStep('Round1',{prdTitle:'会议室预订系统 PRD',prdChunks:[],existingTerms:[]}),null,2)))"

# 2. 生成 mock round1/round2（可先用 CLI mock 模式落盘）
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md

# 3. 用 mock round1/round2 测试 Round3 CLI
node ./lib/cli-detect-anomalies.js \
  docs/reviews/prd-review-{timestamp}/round-1.json \
  docs/reviews/prd-review-{timestamp}/round-2.json \
  docs/reviews/prd-review-{timestamp}/

# 4. 测试 report-data 组装与渲染
node ./lib/cli-build-report-data.js \
  docs/reviews/prd-review-{timestamp}/round-1.json \
  docs/reviews/prd-review-{timestamp}/round-2.json \
  docs/reviews/prd-review-{timestamp}/round-3.json \
  docs/reviews/prd-review-{timestamp}/issues.json \
  docs/reviews/prd-review-{timestamp}/round-4.json \
  docs/reviews/prd-review-{timestamp}/report-data.json

node ./lib/cli-render-report.js \
  docs/reviews/prd-review-{timestamp}/report-data.json \
  docs/reviews/prd-review-{timestamp}-agent.md \
  docs/reviews/prd-review-{timestamp}-agent/index.html
```

### 验证点

- [ ] OpenCode 中输入 `/review-prd` 后，Agent 能按步骤执行。
- [ ] 每轮 LLM 输出为合法 JSON，无解释文本。
- [ ] `round-1.json` ~ `round-4.json` 落盘到 `docs/reviews/prd-review-{timestamp}/`。
- [ ] `cli-detect-anomalies.js` 正确读取 round1/round2 并输出 `round-3.json` + `issues.json`。
- [ ] `cli-build-report-data.js` + `cli-render-report.js` 正确生成 `.md` 与 `index.html`。
- [ ] CLI 模式 `node ./index.js --mock` 仍然可用。

### 当前限制

1. **Agent 模式下 LLM 调用由 Agent 自身负责**：本 skill 不直接调用 LLM，Agent 需要自行处理输出不合 schema 的情况。
2. **CLI 直连 API 受限**：当前 CLI 需要外部提供 `round1~round4` 数据，或添加 `--mock` 使用内置 mock。
3. **中间文件路径由 Agent 管理**：若 Agent 未按约定保存 `round-1.json` ~ `round-4.json`，后续 CLI 脚本会找不到输入。
4. **上下文与 ADR 读取逻辑复用 CLI**：Agent 模式可调用 `loadExistingTerms` 读取 `CONTEXT.md` 和 `docs/adr/`，与 CLI 读取逻辑一致。

---

## Fixtures 测试矩阵

| 文件 / 目录                              | 主题                                    | 预期检测到的异常类型                                                                                           | 测试命令                                                                  |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `./fixtures/sample-prd.md`               | 在线订餐系统                            | 基本 EventStorming 元素抽取                                                                                    | `node ./index.js --mock --no-save ./fixtures/sample-prd.md`               |
| `./fixtures/meeting-room-booking-prd.md` | 会议室预订系统                          | 术语冲突、孤儿事件、缺失命令、聚合边界模糊                                                                     | `node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md` |
| `./fixtures/ecommerce-aftersales-prd.md` | 电商订单售后系统                        | 术语冲突、孤儿事件（RefundCompleted）、缺失命令（RevokeAftersalesOrder）、聚合边界模糊、外部系统、读模型、策略 | `node ./index.js --mock --no-save ./fixtures/ecommerce-aftersales-prd.md` |
| `./fixtures/saas-rbac-prd.md`            | SaaS 权限管理系统                       | 术语冲突、循环依赖风险、聚合边界模糊（User / Organization）、缺失命令（RevokeRole）、读模型、外部系统          | `node ./index.js --mock --no-save ./fixtures/saas-rbac-prd.md`            |
| `./fixtures/project-with-context-prd/`   | 仓库库存管理系统（含 CONTEXT.md / ADR） | 外部术语冲突、既有聚合边界冲突、集成方式冲突                                                                   | 见下方专用命令                                                            |

### project-with-context-prd 专用命令

```bash
# 方式 1：进入项目目录后运行（推荐，与 README 一致）
cd ./fixtures/project-with-context-prd
node ../../index.js --mock --no-save prd.md --context CONTEXT.md --adr-dir docs/adr

# 方式 2：从仓库根目录通过绝对/相对路径运行
node ./index.js --mock --no-save ./fixtures/project-with-context-prd/prd.md --context ./fixtures/project-with-context-prd/CONTEXT.md --adr-dir ./fixtures/project-with-context-prd/docs/adr
```

### 当前 mock 数据适配情况

- `--mock` 模式下，`fixtures/mock-rounds/` 返回固定的会议室预订系统 mock 数据，与 fixture 内容无关。因此终端摘要中的术语、事件、命令、聚合数量以及检测出的 issue 仍显示会议室预订系统的结果。
- 上述命令可以验证 CLI 文件读取、参数解析、终端摘要渲染、上下文/ADR 读取路径是否正常，但**无法验证各 fixture 真实埋入的问题是否被正确召回**。
- 完整验证需要在接入真实 LLM 后重新运行，并检查 Round1~Round4 输出是否与当前 fixture 语义一致。

---

## 扩展评审深度测试

新增检测维度：**Saga / 长流程编排候选**、**缺失补偿事件**、**性能风险**。

### 测试命令

```bash
# 无落盘模式，验证终端摘要包含 Saga 与性能风险关键发现
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md
```

### 预期输出

终端关键发现应包含：

- 检测到 Saga 长流程候选（如 `BookingCreated → BookingApproved → NotificationSent`）。
- 检测到缺失补偿事件（如 `BookingApproved` 缺少 `BookingRejected`）。
- 检测到性能风险（如 `Booking` 聚合高频事件、`EmailService` 同步外部调用、`RoomAvailabilityView` 热读模型、过大聚合）。

### 报告验证

生成报告后检查：

```bash
# 重新生成并落盘
node ./index.js --mock ./fixtures/meeting-room-booking-prd.md

# 验证 Markdown 报告
$md = Get-Content -LiteralPath 'docs/reviews/prd-review-*.md' -Raw
$md.Contains('### 5.2 Saga 流程')
$md.Contains('### 5.3 性能风险')
$md.Contains('graph LR')

# 验证 HTML 报告
$html = Get-Content -LiteralPath 'docs/reviews/prd-review-*/index.html' -Raw
$html.Contains('5.2 Saga 流程')
$html.Contains('5.3 性能风险')
$html.Contains('classDef missing')
```

### 已验证点

- [x] `node --test tests/anomalies.test.js` 中新增 Saga、缺失补偿、性能风险检测用例。
- [x] `--mock` 终端输出包含 Saga 与性能风险关键发现。
- [x] Markdown / HTML 报告新增 `5.2 Saga 流程` 与 `5.3 性能风险` 子章节。
- [x] Saga 流程图使用 Mermaid `graph LR` 渲染，缺失补偿事件节点标红。

---
