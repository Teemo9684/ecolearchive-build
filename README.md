# EcoleArchive — Windows build

Public clean-history build workspace for **منظومة التسيير الإداري والأرشيف الرقمي**.

This repository contains a reviewed snapshot of the Windows application from the private main repository. It is not the source of school records.

## Windows build

Open [GitHub Actions](https://github.com/Teemo9684/ecolearchive-build/actions/workflows/windows-build.yml). The preview build runs on Windows 2022 for source changes, and can also be triggered manually with `release_candidate=true`.

The workflow restores the three binary image assets from checked-in `.b64` text sources, installs dependencies with Bun, compiles the offline frontend and builds an unsigned NSIS installer. Review the workflow run before treating an artifact as working.

## Signed automatic updates

The `Publish signed Windows update` workflow is intentionally manual. It requires:

- GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`: the existing Tauri signer key corresponding to `desktop/src-tauri/tauri.conf.json` pubkey.
- GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: password for that key.
- GitHub Actions secret `GH_RELEASE_TOKEN`: token authorized to create Releases in `Teemo9684/ecolearchive-updates`.
- Confirm the update version in `desktop/src-tauri/tauri.conf.json` exceeds the installed version and the update tag does not exist.
- Create and, if desired, protect the GitHub environment `windows-updates`.

Enter `PUBLISH` only when you are ready to build, sign, and publish to the update feed. **Never paste private keys into source files, issues, or chat.** Do not assume unsigned preview installers can be updated in place without compatibility testing.

## Security

The source was screened for common secret patterns, but this is not an exhaustive security audit. Do not commit actual school documents, staff/student records, private keys, personal information, tokens, or backup databases. Keep the development source repository `Teemo9684/ecolearchive` private.

The clean public repository intentionally excludes the old `.circleci` configuration, private project's prior workflows, and other development-only files. The old private repository remains untouched; delete it only after explicit verification and approval.
