# Contributing to Strutvane UI

Thanks for your interest! Strutvane UI is part of [Strutvane](https://github.com/vishwajit-vm/strutvane) and is currently in the **design phase**.

## Right now, the most useful contributions are
- Design feedback on the [package spec](https://github.com/vishwajit-vm/strutvane/blob/main/docs/08-package-ui.md) and the [blueprint](https://github.com/vishwajit-vm/strutvane/tree/main/docs), via issues or discussions
- Real-world use cases and requirements from teams building B2B apps
- Pointers to prior art we should learn from

## Ground rules
- Be kind and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
- Public API and contract changes go through an RFC before code.
- Every change ships with tests, docs and a changeset.
- Sign off your commits (Developer Certificate of Origin): `git commit -s`.

## Development
Requirements: Node 24.3+ and npm 11.19+. Docker is optional and for local services only (never committed).

```bash
npm install
npm run ci
```
