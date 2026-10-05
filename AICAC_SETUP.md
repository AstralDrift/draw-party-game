# AICaC Setup for Draw Party

This repository uses **AI Context as Code (AICaC) v2.0** for structured, selective context loading by AI assistants.

## Quick Start

AI assistants that support AICaC (Grok Bot, Cursor, Claude Code) should:

1. Read `AGENTS.md` first (the router)
2. Load ONLY the relevant `.ai/*.yaml` file based on query intent
3. Never load all `.ai/` files at once

## For Grok Bot / Cursor Users

The shim at `.grok/rules/aicac.md` teaches Grok to follow the router pattern. No additional setup needed when using Grok in Cursor.

## Optional: Global AICaC Skill

To get the full AICaC skill (bootstrap, validate, sync) available in all projects:

```bash
# Clone the AICaC repo with Grok support
git clone https://github.com/AstralDrift/AICaC.git /tmp/AICaC
cd /tmp/AICaC
git checkout cursor/add-grok-support-aa38

# Symlink the Grok skill globally (recommended)
ln -s /tmp/AICaC/.grok/skills/aicac ~/.grok/skills/aicac

# Or copy it (frozen snapshot)
cp -r /tmp/AICaC/.grok/skills/aicac ~/.grok/skills/aicac
```

After symlinking/copying, the skill is available in any project.

## Validation

To validate `.ai/` files after changes:

```bash
pip install jsonschema pyyaml

# From the AICaC repo
python3 /path/to/AICaC/.github/actions/aicac-adoption/scripts/validate.py .
```

Expected output: `Compliance Level: Comprehensive`

## File Structure

```
.ai/
├── context.yaml       # Project overview, setup, dependencies
├── architecture.yaml  # Components, data flow, deployment
├── workflows.yaml     # Common tasks with exact commands
├── decisions.yaml     # ADRs (why decisions were made)
└── errors.yaml        # Troubleshooting scenarios

AGENTS.md              # Router (intent → .ai/ file)
.grok/rules/aicac.md   # Grok Bot shim
.cursor/rules/aicac.mdc # Cursor shim
```

## Example Queries

- **"How do I run tests?"** → `AGENTS.md` → `.ai/workflows.yaml` → `run_tests`
- **"Why is the server authoritative?"** → `AGENTS.md` → `.ai/decisions.yaml` → `ADR-001`
- **"Fix port in use error"** → `AGENTS.md` → `.ai/errors.yaml` → `err_port_in_use`
- **"What components exist?"** → `AGENTS.md` → `.ai/architecture.yaml` → `components`

## References

- **AICaC spec:** https://github.com/eFAILution/AICaC
- **Grok support branch:** https://github.com/AstralDrift/AICaC/tree/cursor/add-grok-support-aa38
- **This PR:** https://github.com/AstralDrift/draw-party-game/pull/93
