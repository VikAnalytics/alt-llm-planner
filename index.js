import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildContext } from './src/context.js';
import { runPlannerSession } from './src/terminal.js';
import { loadConfig, resolveApiKey, resolveModel } from './src/config.js';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const timeoutMs = Number(process.env.PLANNER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

const config = await loadConfig();

const server = new McpServer({
  name: 'alt-llm-planner',
  version: '0.3.0',
});

server.tool(
  'interactive_plan',
  'Pause Claude and start an interactive Gemini-powered planning session in the terminal.',
  {
    initial_prompt: z
      .string()
      .trim()
      .min(1, 'initial_prompt must not be empty')
      .describe('The planning task or feature to architect.'),
    model: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Override the configured Gemini model for this session.'),
  },
  async ({ initial_prompt, model }) => {
    const apiKey = resolveApiKey(config);
    if (!apiKey) {
      throw new Error(
        'Gemini API key not set. Run `npx alt-llm-planner setup` or export GEMINI_API_KEY.'
      );
    }

    const context = buildContext(process.cwd());
    const plan = await runPlannerSession({
      prompt: initial_prompt,
      context,
      apiKey,
      model: resolveModel(config, model),
      timeoutMs,
    });

    return { content: [{ type: 'text', text: plan }] };
  }
);

await server.connect(new StdioServerTransport());
