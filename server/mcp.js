// Minimal Model Context Protocol server over stdio: newline-delimited JSON-RPC
// 2.0 with the tools and prompts capabilities.

import { createInterface } from 'node:readline';
import { InputError } from './search.js';
import { validate } from './validate.js';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * @param {object} server
 * @param {{ name: string, title: string, version: string }} server.info
 * @param {string} server.instructions
 * @param {Array<{ name: string, handler: (args: any) => Promise<object>, inputSchema: any }>} server.tools
 * @param {Array<{ name: string, render: (args: any) => string, arguments: any[] }>} server.prompts
 * @param {NodeJS.ReadableStream} [input]
 * @param {NodeJS.WritableStream} [output]
 * @returns {Promise<void>} resolves when the input stream ends
 */
export function serve({ info, instructions, tools, prompts }, input = process.stdin, output = process.stdout) {
  const send = (message) => output.write(`${JSON.stringify(message)}\n`);
  const toolList = tools.map(({ handler, ...definition }) => definition);
  const promptList = prompts.map(({ render, ...definition }) => definition);

  const methods = {
    initialize: (params) => ({
      protocolVersion: PROTOCOL_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
      capabilities: { tools: {}, prompts: {} },
      serverInfo: info,
      instructions,
    }),
    ping: () => ({}),
    'tools/list': () => ({ tools: toolList }),
    'tools/call': async (params) => {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) throw new RpcError(-32602, `Unknown tool: ${params?.name}`);
      try {
        const result = await tool.handler(validate(tool.inputSchema, params.arguments));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        if (!(err instanceof InputError)) console.error(`[northbid] ${tool.name} failed:`, err);
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    },
    'prompts/list': () => ({ prompts: promptList }),
    'prompts/get': (params) => {
      const prompt = prompts.find((p) => p.name === params?.name);
      if (!prompt) throw new RpcError(-32602, `Unknown prompt: ${params?.name}`);
      const args = params.arguments ?? {};
      for (const a of prompt.arguments) {
        if (a.required && !args[a.name]) throw new RpcError(-32602, `Missing prompt argument: ${a.name}`);
      }
      return { messages: [{ role: 'user', content: { type: 'text', text: prompt.render(args) } }] };
    },
  };

  async function handle(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    if (message === null || typeof message !== 'object') return;
    const isRequest = message.id !== undefined && message.id !== null && typeof message.method === 'string';
    if (!isRequest) return; // notifications and responses need no reply
    const method = Object.hasOwn(methods, message.method) ? methods[message.method] : undefined;
    if (!method) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
      return;
    }
    try {
      send({ jsonrpc: '2.0', id: message.id, result: await method(message.params) });
    } catch (err) {
      const code = err instanceof RpcError ? err.code : -32603;
      if (code === -32603) console.error('[northbid] internal error:', err);
      send({ jsonrpc: '2.0', id: message.id, error: { code, message: err.message } });
    }
  }

  return new Promise((resolve) => {
    const pending = new Set();
    const rl = createInterface({ input, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      const job = handle(line).finally(() => pending.delete(job));
      pending.add(job);
    });
    rl.on('close', () => Promise.all(pending).then(() => resolve()));
  });
}
