# Security Policy

Draw Party v1 is an ephemeral party game: no user accounts, no database, and no persistent room history. Rooms live in server memory and expire after participants disconnect and the room TTL passes.

## Reporting a vulnerability

Please report security issues through [GitHub Security Advisories](https://github.com/astraldrift/draw-party-game/security/advisories/new) for this repository when available. Do not open a public issue for exploitable vulnerabilities.

Include:

- A clear description of the issue and impact
- Steps to reproduce or a proof of concept
- Affected commit / deployment URL if known

## Scope notes

- The WebSocket game server and static asset serving are in scope.
- Misconfiguration of third-party hosts (for example open CORS on unrelated services) is generally out of scope unless it is caused by this project's defaults.
- Social engineering, physical attacks, and denial-of-service flood testing against production without prior coordination are out of scope.

We will acknowledge reports as quickly as practical and coordinate a fix before any public disclosure.
