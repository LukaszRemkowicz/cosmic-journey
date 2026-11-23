# Release and CI scripts

`release-tag.mjs` checks the version in `package.json`: it must use `MAJOR.MINOR.PATCH` format and match both version entries in `package-lock.json`.

Run these commands from the repository root:

- `npm run check:version` checks the format and version consistency. It does not create a tag.
- `npm run release:tag` is the release operation used by CI. It creates an annotated `vX.Y.Z` tag pointing to the current `HEAD` and pushes it to `origin`. If the tag already exists, it leaves it unchanged.

CI runs the version check and the quality and test jobs on pull requests. The release workflow runs only after a push to `main`. To set the next version, run `npm version patch --no-git-tag-version`; use `minor` or `major` instead of `patch` when needed. CI creates the tag after the change is pushed to `main`.
