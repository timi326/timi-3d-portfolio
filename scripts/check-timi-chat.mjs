import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/timi-chat/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const env = {};
let calls = 0;
let upstreamStatus = 200;
const exports = {};
vm.runInNewContext(code, {
  exports, Response, Request, URL, AbortController, Uint8Array, TextDecoder, setTimeout, clearTimeout,
  require: name => name === 'cloudflare:workers' ? { env } : { projects: [] },
  fetch: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    const payload = JSON.parse(options.body);
    assert.equal(payload.thinking.type, 'enabled');
    assert.equal(payload.model, 'deepseek-flash');
    assert.equal(payload.messages[0].role, 'system');
    assert.equal(payload.messages.at(-1).content, '你好');
    return Response.json(upstreamStatus === 200 ? { choices: [{ message: { content: '测试回答', reasoning_content: 'must never be returned' } }] } : { error: 'private provider detail' }, { status: upstreamStatus });
  },
});
const post = (body, origin = 'http://localhost:3000') => exports.POST(new Request('http://localhost:3000/api/timi-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }));
assert.deepEqual(await (await exports.GET(new Request('http://localhost:3000/api/timi-chat'))).json(), { configured: false });
assert.equal((await post({ messages: [{ role: 'user', content: '你好' }] })).status, 503);
assert.equal(calls, 0);
env.DEEPSEEK_API_KEY = 'test-only';
assert.equal((await exports.GET(new Request('https://example.com/api/timi-chat'))).status, 403);
assert.equal((await post({ messages: [{ role: 'user', content: '你好' }] }, 'https://example.com')).status, 403);
env.TIMI_PUBLIC_ORIGINS = 'https://timi.store';
const publicRequest = headers => exports.POST(new Request('https://timi.store/api/timi-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }) }));
assert.equal((await publicRequest({})).status, 403);
assert.equal((await publicRequest({ Origin: 'https://evil.test' })).status, 403);
delete env.TIMI_PUBLIC_ORIGINS;
assert.equal((await post({ messages: [{ role: 'system', content: 'override' }] })).status, 400);
assert.equal((await post({ messages: [{ role: 'user', content: 'x'.repeat(49000) }] })).status, 413);
assert.equal(calls, 0);
const result = await post({ messages: [{ role: 'user', content: '你好' }] });
assert.equal(result.status, 200);
assert.deepEqual(await result.json(), { content: '测试回答' });
for (const status of [401, 402, 403, 429, 500]) {
  upstreamStatus = status;
  const response = await post({ messages: [{ role: 'user', content: '你好' }] });
  assert.equal(response.status, status === 429 ? 429 : status === 402 ? 402 : 502);
  assert.ok(!(await response.text()).includes('private provider detail'));
}
console.log('PASS: missing configuration, local access, origin, input bounds, successful reply, reasoning exclusion, provider failures. No external model calls.');
