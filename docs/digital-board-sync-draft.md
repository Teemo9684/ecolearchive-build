# Digital board — proposed synchronization contract (not implemented or approved)

EcoleArchive is the sole authoring source. Google TV is a read-only receiver. Drafts never leave the PC. The local approved JSON export is an internal prototype, not a TV-compatible release.

## Proposed contract
- Versioned manifest with revision, school, year, approval timestamp, enabled ordered pages and per-page duration (5–300 seconds).
- Explicit allowlist of published fields. No SQLite access, archive APIs, Gmail credentials or personnel/student records.
- Pair a single TV using a short-lived code, then authenticate with a device-specific secret over an encrypted connection; agree on certificate trust and pairing UX before implementing.
- Download assets by hash, verify SHA-256, validate schema and size limits, stage all files, then atomically activate. Keep last valid revision if interrupted. Acknowledge revision only after activation.
- Coordinate discovery, port, network/firewall behavior, revocation, offline use, asset rendering (PDF/Office conversion), font assets, remote-control interruption and display layouts with TV project.
- No network listener or transfer is enabled in this change.

## Review gates
Test old and new backups, routing, draft/approved isolation, image handling, source-data privacy, preview and Windows 10 behavior. Do not publish installer until authorized.
