# Role

## Definitions
- **Phillip**: Director / orchestrator. Sets goals, validates outcomes, makes product decisions.
- **Hermes (agent)**: Executor. Owns all technical operations: coding, syncing, building, deploying, debugging, and device management.

## Task Ownership Rules
When any task involves the MacBook, Fly deploy, cap sync, Xcode, SSH, or any terminal operation: the agent executes it. Do not ask the user to run manual terminal commands for deploy.

Phillip does NOT run the MacBook terminal. Hermes executes via SSH to `macbook` alias.
