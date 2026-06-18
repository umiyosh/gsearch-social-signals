# Release Management

## Versioning

`package.json`, `package-lock.json`, and `public/manifest.json` must always use the same version.

- `0.1.0`: Unlisted beta.
- `0.2.0`: Public beta.
- `1.0.0`: Public stable.

The current release candidate is `0.1.0`. This matches the first Chrome Web Store submission target, so this PR does not move the project to `0.2.0`.

Before creating a release tag, run:

```bash
make release-check VERSION=0.1.0
```

`make release-tag VERSION=0.1.0` runs the same check before creating and pushing `v0.1.0`.

## GitHub Release

GitHub Releases are created by `.github/workflows/release.yml` when a `v*` tag is pushed.

The workflow:

- verifies that the pushed tag matches `package.json`, `package-lock.json`, and `public/manifest.json`;
- builds the Chrome Web Store package with `npm run package:store`;
- verifies that the zip root contains `manifest.json`;
- rejects forbidden entries such as `.git`, `.env`, `node_modules`, `src`, `tests`, `coverage`, `.DS_Store`, `__MACOSX`, and source maps;
- attaches the store zip to the GitHub Release.

Decision: keep the Chrome Web Store submission zip as a GitHub Release artifact. It gives each submitted package a durable, reviewable build record.

## Chrome Web Store Rollout

Official Chrome documentation describes staged release options for extensions:

- Unlisted distribution can be used for direct-link beta testing.
- Deferred publishing can submit a package for review without publishing it immediately after approval.
- Percentage rollout is available only for updates to already-published extensions with more than 10,000 seven-day active users.
- Percentage rollout affects existing users only; new users receive the new version.

Decision for this project:

- `0.1.0`: publish as Unlisted beta.
- Use deferred publishing when timing matters.
- Do not rely on percentage rollout until the extension has more than 10,000 seven-day active users.
- For early releases, rollback by using Chrome Web Store rollback if available, or by uploading a fixed higher patch version.

References:

- https://developer.chrome.com/docs/extensions/develop/migrate/publish-mv3
- https://developer.chrome.com/docs/webstore/update

## Rollback

Preferred rollback sequence:

1. If the broken version has not been published, cancel review or cancel publish in the Chrome Web Store dashboard.
2. If the broken version has passed review but is not ready to publish, keep it deferred or revert it to draft where the dashboard allows.
3. If the broken version has already been published, use Chrome Web Store rollback when available.
4. If rollback is not available or insufficient, ship a new higher patch version with the fix.

Never reuse an already uploaded version number. Chrome Web Store updates require a larger version number for a new package.

## Support

Public support path:

- GitHub repository: https://github.com/umiyosh/GSPlusHatebu
- GitHub issues: https://github.com/umiyosh/GSPlusHatebu/issues

Use the GitHub issues URL as the Chrome Web Store Support tab URL for the initial Unlisted beta.
