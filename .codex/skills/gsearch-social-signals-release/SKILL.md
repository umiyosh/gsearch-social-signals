---
name: gsearch-social-signals-release
description: Prepare and publish versioned releases for the GSearch With Social Signals Chrome extension. Use when bumping package or manifest versions, preparing a release pull request, creating or pushing a v* tag, packaging for Chrome Web Store, editing GitHub Release notes, or repairing a release whose CHANGELOG.md or public release notes are missing. Require the repository changelog and GitHub Release notes to describe the same user-visible changes.
---

# GSearch With Social Signals Release

Prepare a release from observed repository changes, keep version files aligned, and publish matching changelog and GitHub Release notes.

## Sources of Truth

- Read `docs/release-management.md` before changing release state.
- Treat `CHANGELOG.md` as the version-by-version public history.
- Treat `package.json`, `package-lock.json`, and `public/manifest.json` as a single version set.
- Derive release content from the previous release tag comparison, merged pull requests, and verified behavior. Do not invent benefits from commit titles alone.

## Workflow

### 1. Observe the Release Delta

1. Resolve the default branch and fetch `origin` according to `AGENTS.md`.
2. Identify the candidate version, previous release tag, candidate commit, and merged pull requests in the comparison range.
3. Separate user-visible additions, improvements, and fixes from internal-only work.
4. Record observed facts, inferences, and unresolved items before writing release content.

### 2. Prepare the Release Pull Request

1. Set the same version in `package.json`, `package-lock.json`, and `public/manifest.json`.
2. Update the current release candidate and relevant behavior in `docs/release-management.md`.
3. Add the release entry to `CHANGELOG.md` in the same pull request. Do not defer it until after tagging.
4. Use the heading `## [X.Y.Z] - YYYY-MM-DD` and only the applicable `Added`, `Changed`, and `Fixed` sections.
5. Describe behavior in user-facing terms. Link relevant pull requests where useful; do not paste a raw commit list.
6. Backfill any missing released version discovered between the existing changelog and the candidate version instead of leaving a silent version gap.

The release pull request is incomplete while its `CHANGELOG.md` entry is missing.

### 3. Validate Before Merge

Run the repository release gates for the candidate version:

```bash
make check
make package
make release-check VERSION=X.Y.Z
```

Confirm that the package contains `manifest.json` at its root and no forbidden files. Include the changelog update and validation results in the pull request description.

### 4. Publish After Merge

1. Confirm the release pull request is merged and the candidate commit is on the default branch.
2. Create the version tag from that merged commit. Never move or reuse a published tag.
3. Wait for the release workflow to create the GitHub Release and attach the Chrome Web Store package.
4. Replace the workflow's placeholder body with release notes derived from the matching `CHANGELOG.md` entry.
5. Preserve the package artifact and build commit information, and add a full comparison link in the form `previous-tag...current-tag`.
6. Verify the public Release body, tag, asset name, asset size, and workflow result.

The published release is incomplete while its public notes contain only the workflow placeholder or disagree with `CHANGELOG.md`.

### 5. Repair an Already Published Release

1. Do not rewrite or move the tag.
2. Update the GitHub Release body from observed changes and add the full comparison link.
3. Open a follow-up pull request that backfills the same version in `CHANGELOG.md` if the file is missing it.
4. Report the repair separately from the immutable package and tag.

## Completion Report

Report the version, release pull request, merged commit, tag, GitHub Release URL, package artifact, changelog entry, validation commands, workflow result, and any unverified Chrome Web Store state.
