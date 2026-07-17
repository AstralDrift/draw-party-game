## Summary

<!-- What changed and why -->

## Test plan

- [ ] Matched validation to blast radius (see `AGENTS.md` / `docs/contributing.md`)
- [ ] Engine / scoring: `cargo test --manifest-path server/Cargo.toml` (if touched)
- [ ] WebSocket / reconnect / health / static: Rust tests including `main.rs` (if touched)
- [ ] Client logic / protocol: `npm --prefix client test -- --run` + typecheck (if touched)
- [ ] UI / layout / touch: relevant Playwright e2e, including mobile phone contexts (if touched)
- [ ] Protocol changes updated both `server/src/protocol.rs` and `client/src/protocol.ts` (+ `docs/protocol.md`)
- [ ] Docs updated when architecture, design, or deploy behavior changed

## Notes

<!-- Screenshots, deploy smoke, or follow-ups -->
