const { appendFileSync } = require('node:fs');

class ActionError extends Error {}

function escapeCommand(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function readInputs(env) {
  const organization = (env.INPUT_ORGANIZATION || '').trim();
  const project = (env.INPUT_PROJECT || '').trim();
  const accessToken = (env['INPUT_ACCESS-TOKEN'] || '').trim();

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(organization)) {
    throw new ActionError('Set organization to an ADO organization name, not a URL.');
  }
  if (!project || project === '.' || project === '..' || /[\u0000-\u001f\u007f]/.test(project)) {
    throw new ActionError('Set project to a valid ADO project name or ID.');
  }
  if (!accessToken || /\s/.test(accessToken)) {
    throw new ActionError('A nonempty, single-line Azure DevOps access token is required.');
  }
  return { organization, project, accessToken };
}

async function checkAdoAccess({ organization, project, accessToken }, fetchImpl = fetch) {
  const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      // Never forward credentials to a redirected endpoint.
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new ActionError('ADO request failed: network error, redirect, or 30-second timeout. Check connectivity and organization configuration.');
  }

  if (!response.ok) {
    const hints = {
      401: 'Check token audience, expiry, tenant, and ADO service-principal registration.',
      403: 'Grant the service principal access to the target ADO project.',
      404: 'Check organization/project names and project visibility for the service principal.',
    };
    throw new ActionError(`ADO project access check failed (HTTP ${response.status}). ${hints[response.status] || 'Check ADO service availability and permissions.'}`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ActionError('ADO returned a non-JSON response; project access was not confirmed.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ActionError('ADO returned invalid JSON; project access was not confirmed.');
  }
  if (!body || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)
      || typeof body.name !== 'string' || !body.name.trim()) {
    throw new ActionError('ADO response did not contain a valid project; project access was not confirmed.');
  }
}

async function run(env = process.env, fetchImpl = fetch, log = console.log) {
  const token = env['INPUT_ACCESS-TOKEN'];
  if (token) {
    log(`::add-mask::${escapeCommand(token)}`);
  }
  const inputs = readInputs(env);
  await checkAdoAccess(inputs, fetchImpl);
  log('ADO project access check succeeded using the supplied bearer token.');
  log('This checks project read access only; test publishing permissions are not verified.');
  log('No test runs, results, or attachments were created.');
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY,
      '## ADO connection\n\nProject read access succeeded using the supplied bearer token. '
      + 'Test publishing permissions are not verified. No test data was published.\n');
  }
}

if (require.main === module) {
  run().catch((error) => {
    // Do not print raw response bodies or exception details that could contain credentials.
    const message = error instanceof ActionError ? error.message : 'Action failed unexpectedly; no authentication success is assumed.';
    console.error(`::error::${escapeCommand(message)}`);
    process.exitCode = 1;
  });
}

module.exports = { ActionError, escapeCommand, readInputs, checkAdoAccess, run };
