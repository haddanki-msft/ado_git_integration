# ADO Test Publisher

Development skeleton for a GitHub action that will publish test results to Azure DevOps.
It currently logs startup and the runner's OS/CPU only. It does not run tests,
authenticate to ADO, or publish results and attachments.

## Run the skeleton

1. Open **Actions** in this repository.
2. Select **Test publisher action**.
3. Select **Run workflow** on the default branch.
4. Open the `test-action` job and the **Execute this repository's action** step.

The logs should show `Publisher wrapper started` and `Runner platform: linux/x64`.
The workflow uses a GitHub-hosted Ubuntu runner; no self-hosted runner is required.

## Files

- `action.yml`: declares the Node.js entry point.
- `index.js`: publisher wrapper skeleton.
- `.github/workflows/test-action.yml`: manually triggered workflow that runs this local action after checkout.

## Remaining integration work

Package the cross-platform .NET publisher host and its approved dependencies,
implement file discovery and host invocation, and wire the federation login and
ADO target configuration. Add result generation and publication scenarios afterward.
Do not commit credentials or copy internal source into this repository.
