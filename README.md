# alt-llm-planner

[![npm version](https://img.shields.io/npm/v/alt-llm-planner.svg)](https://www.npmjs.com/package/alt-llm-planner)
[![license](https://img.shields.io/npm/l/alt-llm-planner.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/alt-llm-planner.svg)](https://nodejs.org)

**Turn a multi-hour architectural planning session with Claude into a one-shot tool call.**

An MCP tool for Claude Code and Cursor that offloads the "ask clarifying questions, iterate, refine the design" loop to Gemini in a side terminal. When you type `!finish`, a dense markdown blueprint returns to Claude — ready to implement.

Your main Claude conversation stays clean. Your token bill stays low. Your context window stays open for the part that actually matters: shipping the code.

```
 Claude Code                  MCP tool call               Gemini terminal
 ───────────                  ────────────                ───────────────
  "plan X"  ─────────►  interactive_plan() ─────────►  ◇ Q1: scope?
                                                        ◇ Q2: storage?
                                                        ◇ Q3: failure mode?
                                                        ▶ !finish
            ◄─────────  dense md blueprint  ◄─────────  
  resumes implementation with the plan in context
```

---

## The problem

Architectural planning with Claude is expensive:

- A thorough design discussion is 10-20 turns of Q&A
- Each turn re-hydrates project context — 5-20K tokens per round trip
- Your main conversation window fills up **before implementation even starts**
- Running planning iterations on Opus adds up fast

You want Opus focused on writing production code, not burning tokens asking "should this be a queue or a pub/sub?"

## The fix

`interactive_plan` delegates the planning loop to Gemini, entirely outside your main Claude context.

1. Claude pauses and calls the MCP tool
2. A **separate terminal** opens in your IDE with a Gemini chat session
3. Gemini asks one clarifying question at a time, iterating with you until the design is clear
4. You type `!finish`
5. Only the **final blueprint** (a dense markdown spec) returns to Claude as tool output

Claude gets a complete, structured plan in ~2-5K tokens — then gets to work.

---

## What you save

Typical 15-turn planning session, ~5K tokens of context per turn.

|                          | Planning inside main Claude | With `interactive_plan`        |
| ------------------------ | --------------------------- | ------------------------------ |
| Tokens into main context | ~75K                        | ~5K (blueprint only)           |
| Main-window consumed     | ~40% of Opus's 200K         | ~3%                            |
| Rough cost on Opus 4.7   | ~$1.50-$2.50                | ~$0.10-$0.15                   |
| Rough cost on free Gemma | —                           | $0 (stays within free tier)    |

Illustrative. Actual savings scale with turn count and context size. Disclaimer on pricing in the matrix below.

---

## Install

```bash
# 1. Wire the MCP server into Claude Code (user scope = works in every project)
claude mcp add alt-llm-planner -s user -- npx -y alt-llm-planner

# 2. Configure: API key → tier → default model
npx alt-llm-planner setup

# 3. Install the Cursor / VS Code companion extension
npx alt-llm-planner install
```

Then **reload your IDE window**.

Get a Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). The free tier is generous and works great for planning.

---

## Usage

In Claude Code:

> Plan out a rate limiter middleware for this service using Redis.

Claude invokes `interactive_plan`. A Gemini terminal opens in your IDE. Chat through the design. When you have what you need:

```
> !finish
```

The blueprint returns to Claude. Keep going — now with a plan in context and your main window intact.

### Override the model per call

> Plan the auth redesign using `gemini-2.5-pro` — this one needs deep reasoning.

### Cancel a session

```
> !cancel
```

---

## Model comparison

### Gemini — use these for planning

| Model                    | Tier | Context | Best for                              | Input / Output (per 1M) |
| ------------------------ | ---- | ------- | ------------------------------------- | ----------------------- |
| `gemma-3-27b-it`         | Free | 128K    | Default. Fast, capable, zero cost     | Free                    |
| `gemma-3-12b-it`         | Free | 128K    | Faster, lighter questions             | Free                    |
| `gemini-2.5-flash-lite`  | Paid | 1M      | Cheapest paid option, long codebases  | ~$0.05 / ~$0.20         |
| `gemini-2.5-flash`       | Paid | 1M      | Balanced speed / quality              | ~$0.15 / ~$0.60         |
| `gemini-2.5-pro`         | Paid | 2M      | Deepest reasoning, massive context    | ~$1.25 / ~$10           |
| `gemini-3-*-preview`     | Paid | varies  | Preview models (setup shows live list)| preview pricing         |

### Claude — what you're already using in Claude Code

| Model             | Context   | Best for                      | Input / Output (per 1M) |
| ----------------- | --------- | ----------------------------- | ----------------------- |
| Claude Haiku 4.5  | 200K      | Fast, cheap, batch work       | ~$0.80 / ~$4            |
| Claude Sonnet 4.6 | 200K      | Balanced default              | ~$3 / ~$15              |
| Claude Opus 4.7   | 200K      | Deep reasoning, complex code  | ~$15 / ~$75             |

*Pricing is approximate as of early 2026. Always check the provider's current rates: [Google AI pricing](https://ai.google.dev/pricing), [Anthropic pricing](https://www.anthropic.com/pricing).*

### Why this split is worth it

| Axis             | Gemini (for planning)                  | Claude (for coding)                |
| ---------------- | -------------------------------------- | ---------------------------------- |
| Context window   | Up to 2M (Pro)                         | 200K                               |
| Free tier        | Yes (Gemma, Flash Lite quota)          | No                                 |
| Cheapest option  | $0                                     | ~$0.80 / ~$4 per 1M                |
| Planning Q&A     | Covered by free tier                   | Burns Opus tokens fast             |
| Writing code     | Solid — but not Claude                 | Best-in-class                      |

You end up with **Gemini burning its free-tier budget on the exploratory part** and **Claude's paid tokens focused on writing production code**. Different tool for each job.

---

## Commands

```
alt-llm-planner serve     # MCP stdio server (default — what Claude Code runs)
alt-llm-planner setup     # configure key, tier, model
alt-llm-planner install   # install Cursor / VS Code extension
alt-llm-planner status    # show config + install state
alt-llm-planner help
```

## Config

Stored at `~/.alt-llm-planner/config.json` (mode `0600`).

Env var overrides (useful in CI or multi-user setups):

- `GEMINI_API_KEY` — API key
- `GEMINI_MODEL` — default model name
- `PLANNER_TIMEOUT_MS` — session timeout in ms (default 30 minutes)

## How it works

1. Claude Code calls the `interactive_plan` MCP tool over stdio.
2. The server writes an atomic session file to `os.tmpdir()` and waits.
3. The IDE extension watches `tmpdir`, sees the session file, and launches a new terminal running the Gemini chat companion.
4. You interact with Gemini. `!finish` writes an atomic result file containing the blueprint; `!cancel` writes an error result.
5. The server reads the result and returns it to Claude as tool output.

All IPC uses write-then-rename so readers never see partial files. Secrets live only in the user's own tmp dir with `0600` permissions. Stale session files (>1h) are swept on startup.

## Requirements

- Node.js 20+
- Cursor or VS Code (for the companion terminal)
- Claude Code (or any MCP-compatible client)
- Gemini API key — [get one free](https://aistudio.google.com/apikey)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `interactive_plan` not visible to Claude | Reload IDE window. Confirm with `claude mcp list`. |
| No terminal opens on tool call | Run `npx alt-llm-planner install`, then reload IDE. |
| `GEMINI_API_KEY not set` | Re-run `npx alt-llm-planner setup`, or export the env var. |
| Session hangs past 30 min | Bump `PLANNER_TIMEOUT_MS`. Session files in `os.tmpdir()` auto-sweep after 1h. |
| Want to change default model | `npx alt-llm-planner setup` re-prompts the model picker. |

## Security

- `GEMINI_API_KEY` is stored at `~/.alt-llm-planner/config.json` with mode `0600`.
- Session IPC files live only in the user's `os.tmpdir()` and are deleted after the tool returns.
- No telemetry. No network calls outside the Gemini API.
- Never commit a `.env` containing a real key — `.gitignore` ships configured.

## Contributing

Issues and PRs welcome. For substantial changes, open an issue first to discuss scope.

## License

[MIT](./LICENSE) © Vikrant Indi
