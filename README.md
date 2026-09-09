# ADO Test Publisher

GitHub Actions authentication scaffold: GitHub OIDC -> Microsoft Entra ->
Azure DevOps bearer token -> read-only ADO project access check.

No client secret or PAT is used. This does **not** publish tests or prove test
publishing permissions; the .NET publisher remains unimplemented.

## One-time setup

1. Create or use an approved single-tenant Entra application and its service
   principal in the tenant connected to your ADO organization.
2. Configure a federated identity credential:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Audience: `api://AzureADTokenExchange`
   - Subject: match this repository's actual OIDC subject, restricted to `main`.
     For GitHub's default subject format:
     `repo:<owner>/<repository>:ref:refs/heads/main`.
3. If your organization uses a customized subject with `repository_owner_id`,
   `repository_id` and `ref`, configure/opt in to that GitHub subject template and
   match it in the Entra credential instead. A flexible claims-matching expression
   must match the subject actually emitted. Do not assume numeric repository IDs
   appear in GitHub's default subject. Keep trust scoped to the approved repository
   and branch; this workflow does not create or modify federation.
4. An ADO administrator must add the service principal to the target organization
   and grant access to the target project. Grant test publishing permissions
   separately when publication is implemented.
5. Under **Settings -> Secrets and variables -> Actions**, configure:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `ENTRA_CLIENT_ID` | Application (client) ID, not object ID |
   | Secret | `ENTRA_TENANT_ID` | Entra directory (tenant) ID |
   | Variable | `ADO_ORGANIZATION` | Organization name only, not a URL |
   | Variable | `ADO_PROJECT` | Project name or ID |

No Azure subscription is required for this ADO-only workflow.

## Run

Open **Actions -> Test publisher action -> Run workflow**, selecting `main`.
The authentication job is restricted to `main`; other branches only run unit tests.

The workflow:

1. Runs Node.js unit tests without credentials.
2. Checks the required configuration is present.
3. Uses `azure/login@v2` with `id-token: write` and `allow-no-subscriptions: true`.
4. Requests a token using
   `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798`.
5. Masks the token and passes it to the local action as an input in the same job.
6. Calls `GET https://dev.azure.com/{org}/_apis/projects/{project}?api-version=7.1`.

The action accepts `organization`, `project`, and `access-token`. It never prints
the bearer token or API response body, rejects redirects, and times out after
30 seconds. Azure Login performs its normal post-job credential cleanup.

Success means the configured project is readable with the supplied bearer token,
not that run/result/attachment creation has been authorized.

## Troubleshooting

- Missing configuration: add the four settings listed above.
- Entra login failure: check tenant/client ID and exact issuer/audience/subject match.
- ADO 401: check token audience/expiry and service-principal registration.
- ADO 403/404: check project access and organization/project names.

## Local tests

Run `node --test` with Node.js 24. Tests mock HTTP and require no credentials.

## Remaining integration

Package the approved cross-platform .NET host and Ta dependencies, implement file
discovery and host invocation, then add test execution and publication scenarios.
Do not commit credentials or internal source/document content to this repository.

## Public references

- [Azure Login](https://github.com/Azure/login)
- [GitHub OIDC subject configuration](https://docs.github.com/en/actions/reference/security/oidc)
- [Entra flexible federated credentials](https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-flexible-federated-identity-credentials)
- [ADO service principals](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity)
