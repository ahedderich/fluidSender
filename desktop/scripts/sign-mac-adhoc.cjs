// electron-builder afterPack hook. Ad-hoc (free, no Apple Developer account)
// code signing. Without this, unsigned arm64 macOS builds fail to launch at
// all ("app is damaged and can't be opened") -- Apple Silicon's kernel
// requires every executable to carry at least a valid signature, even a
// locally-generated one, before it will run it. x64 builds don't hit this
// (Rosetta enforces it more leniently), which is why only arm64 needs this.
// This does NOT replace real notarization (still deferred) -- it only clears
// the hard "damaged" block; the softer "unidentified developer" prompt (same
// one the x64 build already shows) is still expected and still needs the
// user to right-click -> Open once.
const { execFileSync } = require('node:child_process')
const { readdirSync } = require('node:fs')
const path = require('node:path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks')

  // Sign nested frameworks/helpers first -- macOS code signing is
  // hierarchical, so the outer .app's signature isn't valid unless
  // everything nested inside it is already signed.
  for (const entry of readdirSync(frameworksPath)) {
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', path.join(frameworksPath, entry)])
  }
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])
}
