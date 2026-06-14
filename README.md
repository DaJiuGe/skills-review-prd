<p align="center">
  <b>English</b> | <a href="README.zh_CN.md">简体中文</a>
</p>

# review-design-plugin

Review Markdown PRDs with an EventStorming lens: extract domain terminology, events, commands, aggregates, policies, read models, and external systems; detect anomalies; and generate HTML/Markdown reports.

## Quick start

```bash
npm install
npm test

# Run demo with built-in mock data (no LLM calls)
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md
```

## What it does

- **Terminology extraction**: scan PRDs, build a domain glossary, detect alias conflicts and inconsistent definitions.
- **EventStorming elements**: extract domain events, commands, aggregates, policies, read models, and external systems.
- **Anomaly detection**: find orphan events, missing commands, boundary ambiguities, circular dependencies, saga candidates, missing compensations, and performance risks.
- **Visual reports**: generate Markdown and single-file HTML reports with Mermaid sequence/boundary diagrams and a term-consistency heatmap.

## Usage

### CLI mode

This skill **does not call an LLM itself**. The CLI supports two modes:

1. **`--mock` demo mode**: load built-in mock data to quickly verify the report rendering pipeline.
2. **Agent-driven mode**: the calling agent invokes an LLM round by round to produce `round-1.json` ~ `round-4.json`, then calls this skill's runner or CLI sub-scripts to render the report.

```bash
# Demo mode
node ./index.js --mock --no-save ./fixtures/meeting-room-booking-prd.md

# Interactive demo
node ./index.js --interactive --mock --no-save ./fixtures/meeting-room-booking-prd.md

# With context and ADRs
node ./index.js --mock --no-save ./fixtures/project-with-context-prd/prd.md \
  --context ./fixtures/project-with-context-prd/CONTEXT.md \
  --adr-dir ./fixtures/project-with-context-prd/docs/adr
```

### CLI options

| Option          | Description                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------- |
| `prd-path`      | Path to the PRD Markdown file; if omitted, use the only `.md` file in the current directory. |
| `--mock`        | Use built-in mock data.                                                                      |
| `--interactive` | Ask once before generating the report.                                                       |
| `--no-save`     | Do not write files; only print the terminal summary.                                         |
| `--context`     | Path to project context file, default `./CONTEXT.md`.                                        |
| `--adr-dir`     | ADR directory, default `./docs/adr/`.                                                        |

### Agent mode

Trigger in OpenCode / Claude Code:

```text
/review-prd [path/to/prd.md]
```

The agent workflow:

1. Read the PRD, optional `CONTEXT.md` and `docs/adr/`.
2. Call `runAgentStep('Round1', ctx)` for the prompt, then have the LLM produce `round-1.json`.
3. Call `runAgentStep('Round2', ctx)` for the prompt, then have the LLM produce `round-2.json`.
4. Run `node lib/cli-detect-anomalies.js round-1.json round-2.json ./` to produce `round-3.json` and `issues.json`.
5. Call `runAgentStep('Round4', ctx)` for the prompt, then have the LLM produce `round-4.json`.
6. Render the Markdown / HTML report.

Example:

```javascript
import { runAgentStep, loadExistingTerms } from './lib/runner.js';

const existingTerms = await loadExistingTerms({ context: './CONTEXT.md', adrDir: './docs/adr' });
const r1 = runAgentStep('Round1', { prdTitle, prdChunks, existingTerms });
console.log(r1.prompt);
console.log(r1.schema);
```

## Output

By default outputs go to `docs/reviews/`:

- `prd-review-{timestamp}.md`: Markdown report
- `prd-review-{timestamp}/index.html`: single-file HTML report
- `prd-review-{timestamp}/round-{1..4}.json`: raw round data

## Docs

- [`SKILL.md`](./SKILL.md) — Trigger methods and agent workflow
- [`REFERENCE.md`](./REFERENCE.md) — Full parameters, prompt templates, anomaly rules
- [`EXAMPLES.md`](./EXAMPLES.md) — More CLI examples
- [`schema-design.md`](./docs/schema-design.md) — Four-round JSON schema definitions

## License

MIT
