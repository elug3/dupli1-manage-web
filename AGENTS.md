# AGENTS.md

This file provides concise instructions for AI coding agents working in this repository.

Status
- Repository state: empty (no source files or build config present).

What agents should do first
- Inventory the repo root for common manifests: `package.json`, `pyproject.toml`, `requirements.txt`, `Pipfile`, `go.mod`, `Cargo.toml`, `Dockerfile`, `Makefile`.
- If a manifest is found, report the detected stack and the exact commands you plan to run before running them.
- If no manifests are found, ask the user whether to scaffold a project or add specific files.

Agent interaction rules
- Keep changes minimal and scoped. When creating or updating customization files, explain why each change is needed.
- Link to existing docs rather than duplicating content.
- Do not run or store secrets. If a task requires credentials or sensitive input, request them from the user and do not persist them.

Where to find more info
- Use the repository files and any `docs/`, `README.md`, `CONTRIBUTING.md`, or `ARCHITECTURE.md` that may appear later. Prefer linking to those files.

Suggested next actions
- Create targeted instruction files when the project has a clear stack: e.g., `/create-agent frontend` or `/create-agent backend` to add focused guidance and CI hooks.
- Add a minimal `.github/copilot-instructions.md` only when there are stable build/test commands to document.

Contact
- If unsure, ask the repository owner for the preferred stack and dev commands.
            