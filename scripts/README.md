# Release and CI scripts

`release-tag.mjs` checks the version in `package.json`: it must use `MAJOR.MINOR.PATCH` format and match both version entries in `package-lock.json`.

Run these commands from the repository root:

- `npm run check:version` checks the format and version consistency. It does not create a tag.
- `npm run release:tag` is the release operation used by CI. It creates an annotated `vX.Y.Z` tag pointing to the current `HEAD` and pushes it to `origin`. If the tag already exists, it leaves it unchanged.

CI runs the version check in the quality job. The release job runs only after quality checks, tests, and the container gate pass, and only after a push to `main`. To set the next version, run `npm version patch --no-git-tag-version`; use `minor` or `major` instead of `patch` when needed. CI creates the tag after the change is pushed to `main`.

## Deploy to a VPS

From the project directory on the VPS, run:

```sh
export DOMAIN=comsicjourney.lukaszremkowicz.com
./scripts/release/release.sh
```

See the root README's [VPS deployment section](../README.md#deploy-to-your-own-vps) for operational details.

You need Docker Compose v2.24.4 or newer, the existing `traefik_proxy` network, and `DOMAIN` set to a hostname without `https://` or a path. Use the same value when building and deploying the image. You can also run `./scripts/release/build.sh` or `./scripts/release/deploy.sh` separately. Run releases one at a time because they share the `latest` tag.

Production Compose derives `SITE_URL` from the exported `DOMAIN`; you do not need to export `SITE_URL` separately for a release.

The script builds `cosmic-journey:latest` first, then stops the previous container and starts the new one, so there is a brief outage. It waits up to 60 seconds for an nginx HTTP response, then removes unused images labeled `com.cosmic-journey.release=true`. The running image is kept. Previous Docker image versions are not retained; restoring an older version requires building it again. CI remains responsible for Git tags.
