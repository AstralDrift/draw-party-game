# AICaC Router for Grok Bot / Cursor

This rule teaches Grok Bot and Grok-in-Cursor to use AGENTS.md + `.ai/*.yaml`
for selective context loading. Read AGENTS.md at the repository root for the
router table, then load ONLY the one `.ai/` file relevant to the current intent.

# AICaC adopter

Before answering any question about this project, read `AGENTS.md` at
the repository root. It is the router for `.ai/*.yaml` — AICaC structured
context files. Load only the `.ai/` file relevant to the current intent;
do not load them all at once.

Intent → load:
- Project overview, dev commands → `.ai/context.yaml`
- Components, dependencies, data flow → `.ai/architecture.yaml`
- How-to, adding features → `.ai/workflows.yaml`
- Why a decision was made → `.ai/decisions.yaml`
- Errors, troubleshooting → `.ai/errors.yaml`

Before loading any full file, check its `summary:` field or `.ai/index.yaml`
to confirm the routing target.
