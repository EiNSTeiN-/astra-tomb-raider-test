# Development and playable milestones

Use Node.js 22.12 or newer and install the locked dependencies with `npm ci`.
Run `npm run dev` to play locally, `npm test` for the automated checks, and
`npm run build` to produce the static site in `dist/`.

Keep temporary scripts, test results, browser profiles, captures and other
project staging files in `local/staging/` inside this checkout. This directory is
covered by the `/local/` exclusion in `.gitignore`. Do not use `/tmp` for project
staging: it may be cleared during a reboot. Keep reusable public verification
helpers in `scripts/` and intentional documentation images in `docs/images/`.

The public repository is https://github.com/EiNSTeiN-/astra-tomb-raider-test.
The project owner has requested that every playable milestone be committed and
pushed here. Finish the relevant checks, record the resulting behavior and any
remaining limitations, then commit and push the milestone. Keep unrelated local
work out of those commits.

Track application code, tests, build scripts, the dependency lockfile, required
runtime assets, intentional documentation images, asset credits and provenance.
Do not commit credentials, private data, exported player saves, browser profiles,
agent state, installed dependencies, build output, logs or temporary test output.
Raw downloadable assets and conversion intermediates in `asset-sources/` are
ignored; source manifests, licenses and original edited character artwork are
retained. The playable delivery files in `public/assets/` are checked in so a
clone does not need the optional asset conversion pipeline.

Review `git status`, the staged diff and the staged file list before publishing.
When introducing external assets, keep their attribution and license records in
`docs/asset-credits.md`. Report measured evidence accurately: automated or
assisted browser checks do not establish human playthrough duration, subjective
sound quality, consumer hardware performance or AAA graphics.
