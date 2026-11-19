# AGENTS.md

Entry point for coding agents that read a root `AGENTS.md` (for example, OpenAI Codex). The project's instructions live in other files. Read them before acting:

- `docs/agent/AGENTS.md`: project goals, tech stack, boundaries (always / ask first / never), and permissions.
- `CLAUDE.md`: commands, workflow rules, and the list of project docs to consult. It's written for Claude but applies to every agent.

## Skills

| When | Read and follow |
|---|---|
| A researcher wants to add a new topic dataset, or refresh an existing topic from a new link, file, or release | `.claude/skills/add-topic-dataset/SKILL.md` and the reference files it points to |

Skills live under `.claude/skills/` in the `SKILL.md` format. Load a skill's reference files only when its `SKILL.md` says to.
