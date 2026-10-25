# Releasing MsgLab

## Version and tag

- The version lives in `package.json` (and `package-lock.json`, lines 3 and 9). The last digit goes up once per commit that gets a commit message, not with every edit.
- A release is a git tag named `v` plus that version, for example `v0.1.29`.
- The tag must match `package.json` exactly. Installer file names are taken from `package.json`.

## Checklist

1. `npm test` and `npm run test:all` pass. Sonar has no open findings.
2. `package.json` has the version to release, and it is committed and pushed.
3. Build on each system, or let CI do it:
   - macOS: `npm run dist:mac` (ad-hoc signed by `scripts/adhoc-sign.js`)
   - Windows: `npm run dist:win`
   - Linux: `npm run dist:linux` (needs `rpm` tooling and `libcrypt.so.1`, for example `libxcrypt-compat` on Fedora-like systems)
4. Start each installer once: it opens, shows the right name and icon, and Save and Open work.
5. Tag and push: `git tag v0.1.29 && git push origin v0.1.29`.
6. On GitHub, create a release from the tag, paste the notes below and attach the installers.

## Files to attach

- `MsgLab-<version>-arm64.dmg`, `MsgLab-<version>.dmg`
- `MsgLab-Setup-<version>.exe`
- `MsgLab-<version>.AppImage`, `msglab_<version>_amd64.deb`, `msglab-<version>.x86_64.rpm`

Do not attach `builder-*.yml`, `*.blockmap` or `latest-*.yml` unless automatic updates are added later.

## Release notes template

```markdown
## MsgLab <version>

### New
- 

### Improved
- 

### Fixed
- 

### Install
Download the file for your system below. macOS and Windows warn on first start because the app is not signed yet. See the [README](../README.md#download-and-install) for the steps.

**Known issues**
- 
```
