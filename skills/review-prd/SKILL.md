---
name: review-prd
description: Review a Markdown PRD using EventStorming to extract domain terminology, events, commands, aggregates, policies, read models, and external systems. Detect anomalies such as orphan events, missing commands, term conflicts, boundary ambiguities, and circular dependencies, then generate a local HTML/Markdown report with Mermaid diagrams. Use when the user wants to review a PRD, check requirements, or ask questions about PRD ambiguity. Trigger: /review-prd, "review this PRD", "review-prd".
---

# /review-prd

用 EventStorming 思路评审 Markdown PRD，抽取领域术语、事件、命令、聚合、策略、读模型与外部系统，检测异常并生成本地 HTML/Markdown 报告。

Review Markdown PRDs with an EventStorming lens: extract domain terminology, events, commands, aggregates, policies, read models, and external systems; detect anomalies; and generate HTML/Markdown reports.

## Trigger

- **Agent mode**: Type `/review-prd [path/to/prd.md]` in OpenCode / Claude Code
- **CLI mode**: `node ./index.js [prd-path] [options]`

## Quick start

```
/review-prd [path/to/prd.md] [--interactive] [--no-save]
          [--mock]
          [--context path/to/CONTEXT.md] [--adr-dir path/to/docs/adr]
```

Common usage:

```
/review-prd --mock
/review-prd docs/prd/order-system.md --interactive --mock
/review-prd README.md --no-save --mock
```

> Note: The `review-prd` runner does not call an LLM itself. CLI must use `--mock` for built-in pre-computed data. In agent mode, the calling agent invokes the LLM round by round and provides round1~round4 data.

See [REFERENCE.md](./references/REFERENCE.md) for the full parameter table, prompt templates, anomaly detection rules, and failure handling.

## Workflow

The review runs in 4 rounds of structured extraction, producing a final report:

```
Round 1: Terminology extraction      → JSON schema: Round1_TerminologyExtraction
Round 2: EventStorming elements      → JSON schema: Round2_EventStormingElements
Round 3: Consistency/anomaly check   → JSON schema: Round3_ConsistencyCheck
Round 4: Report generation           → JSON schema: Round4_ReportGeneration + Mermaid
```

- **Agent mode**: The calling agent invokes the LLM for Rounds 1, 2, and 4. Round 3 is computed automatically by the runner's local rules (`anomalies.js`). Each round saves as `round-1.json` ~ `round-4.json`.
- **CLI `--mock` mode**: Loads `fixtures/mock-rounds/round-{1..4}.json` as pre-computed data; no LLM calls. Used for local verification and demos.

### Interactive mode (`--interactive`)

After all round data is ready, the runner asks once before generating the final report: `Generate report? [Y/n]`. Entering `n` skips only file writing; terminal summary is still printed.

## Agent mode workflow

1. Read the PRD (argument or the only `.md` in the current directory).
2. Optionally read `./CONTEXT.md` and `./docs/adr/`.
3. **Round 1**: Agent calls LLM using `runAgentStep('Round1', ctx).prompt`, outputs `Round1_TerminologyExtraction` JSON, saves as `round-1.json`.
4. **Round 2**: Agent calls LLM using `runAgentStep('Round2', ctx).prompt`, outputs `Round2_EventStormingElements` JSON, saves as `round-2.json`.
5. **Round 3**: Runner internally calls `detectAnomalies(round1, round2)` to produce `round-3.json` and `issues.json`.
6. **Round 4**: Agent calls LLM using `runAgentStep('Round4', ctx).prompt`, outputs `Round4_ReportGeneration` JSON, saves as `round-4.json`.
7. Runner assembles report data and renders Markdown / HTML reports.
8. Terminal summary is printed.

Agents can get full instructions for any step via:

```javascript
import { runAgentStep } from './lib/runner.js';

const instructions = runAgentStep('Round1', {
  prdTitle: 'Meeting Room Booking System PRD',
  prdChunks: [...],
  existingTerms: [],
});

console.log(instructions.prompt);
console.log(instructions.schema);
console.log(instructions.outputFile);
```

## CLI mode

```bash
# Demo mode
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md

# Interactive demo
node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md

# With CONTEXT.md and ADRs
node ./index.js --mock --no-save ./fixtures/project-with-context-prd/prd.md \
  --context ./fixtures/project-with-context-prd/CONTEXT.md \
  --adr-dir ./fixtures/project-with-context-prd/docs/adr
```

## Output

Defaults to `docs/reviews/`:

- `prd-review-{timestamp}.md`: Markdown report
- `prd-review-{timestamp}/index.html`: single-file HTML report
- `prd-review-{timestamp}/round-{1..4}.json`: raw round data

## Links

- [REFERENCE.md](./references/REFERENCE.md) — Full parameters, output specs, prompt templates, anomaly detection rules, failure handling
- [EXAMPLES.md](./references/EXAMPLES.md) — Typical CLI usage, fixtures description, terminal summary examples
- [schema-design.md](../docs/schema-design.md) — Four-round JSON schema definitions
