const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { readInputs, checkAdoAccess, run, escapeCommand } = require('../index');

const env = {
  INPUT_ORGANIZATION: 'example-org',
  INPUT_PROJECT: 'Example project',
  'INPUT_ACCESS-TOKEN': 'fake-token-for-tests',
};
const project = { id: '12345678-1234-1234-1234-123456789abc', name: 'Example project' };
const jsonResponse = (body = project, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

test('validates required configuration and rejects unsafe organization or token input', () => {
  assert.equal(readInputs(env).project, 'Example project');
  for (const invalid of [
    { INPUT_ORGANIZATION: '' },
    { INPUT_ORGANIZATION: 'https://untrusted.example' },
    { INPUT_ORGANIZATION: 'example/other' },
    { INPUT_PROJECT: '' },
    { INPUT_PROJECT: '..' },
    { INPUT_PROJECT: 'project\ninjected' },
    { 'INPUT_ACCESS-TOKEN': '' },
    { 'INPUT_ACCESS-TOKEN': 'token\nheader' },
  ]) {
    assert.throws(() => readInputs({ ...env, ...invalid }));
  }
});

test('only calls the fixed ADO host, encodes project, and disables redirects', async () => {
  let calls = 0;
  await checkAdoAccess(readInputs({ ...env, INPUT_PROJECT: 'project/#?' }), async (url, options) => {
    calls++;
    assert.equal(url, 'https://dev.azure.com/example-org/_apis/projects/project%2F%23%3F?api-version=7.1');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer fake-token-for-tests');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return jsonResponse();
  });
  assert.equal(calls, 1);
});

for (const status of [401, 403, 404, 429, 500]) {
  test(`HTTP ${status} fails without leaking the response body`, async () => {
    await assert.rejects(checkAdoAccess(readInputs(env), async () =>
      jsonResponse({ error: env['INPUT_ACCESS-TOKEN'] }, status)), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.ok(!error.message.includes(env['INPUT_ACCESS-TOKEN']));
      return true;
    });
  });
}

test('network exceptions do not leak raw exception details', async () => {
  await assert.rejects(checkAdoAccess(readInputs(env), async () => {
    throw new Error(env['INPUT_ACCESS-TOKEN']);
  }), (error) => {
    assert.match(error.message, /network error/);
    assert.ok(!error.message.includes(env['INPUT_ACCESS-TOKEN']));
    return true;
  });
});

test('HTML, invalid JSON and incomplete responses never count as success', async () => {
  const responses = [
    new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    jsonResponse({}),
    jsonResponse(null),
    jsonResponse({ id: 'invalid', name: 'project' }),
  ];
  for (const response of responses) {
    await assert.rejects(checkAdoAccess(readInputs(env), async () => response));
  }
});

test('masks token before request; logs and summary contain no token or API body', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ado-auth-'));
  const summary = join(directory, 'summary.md');
  const logs = [];
  try {
    await run({ ...env, GITHUB_STEP_SUMMARY: summary }, async () => {
      assert.equal(logs[0], '::add-mask::fake-token-for-tests');
      return jsonResponse();
    }, (message) => logs.push(message));
    assert.ok(logs.slice(1).every((message) => !message.includes(env['INPUT_ACCESS-TOKEN'])));
    assert.match(logs.join('\n'), /No test runs/);
    const content = readFileSync(summary, 'utf8');
    assert.match(content, /not verified/);
    assert.ok(!content.includes(env['INPUT_ACCESS-TOKEN']));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('escapes workflow-command data', () => {
  assert.equal(escapeCommand('a%b\r\nc'), 'a%25b%0D%0Ac');
});
