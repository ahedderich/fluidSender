#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { cp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const uiRoot = path.resolve(desktopRoot, '../ui')
const vendorDir = path.join(desktopRoot, 'vendor', 'ui-output')

function run(cmd, args, opts) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

console.log('[1/3] Building ui/ ...')
run('bun', ['install', '--frozen-lockfile'], { cwd: uiRoot })
run('bun', ['run', 'build'], { cwd: uiRoot })

console.log('[2/3] Copying ui/.output -> desktop/vendor/ui-output ...')
await rm(vendorDir, { recursive: true, force: true })
// dereference: true is required — Nitro's node_modules contains symlinks with
// absolute, build-machine-specific paths (e.g. into .nitro/<pkg>@<version>),
// so copying them as symlinks leaves the vendored tree silently dependent on
// ui/.output still existing at that exact original path. Resolving them to
// real files here makes vendor/ui-output fully self-contained.
await cp(path.join(uiRoot, '.output'), vendorDir, { recursive: true, dereference: true })

const entry = path.join(vendorDir, 'server', 'index.mjs')
const bindingsDir = path.join(vendorDir, 'server', 'node_modules', '@serialport', 'bindings-cpp')
if (!existsSync(entry)) {
  throw new Error(`Expected build output missing: ${entry}`)
}
if (!existsSync(bindingsDir)) {
  throw new Error(
    `Expected native addon missing: ${bindingsDir} (check ui/nuxt.config.ts nitro.externals)`,
  )
}

console.log('[3/3] Rebuilding native addon for Electron ABI ...')
const require = createRequire(import.meta.url)
const { rebuild } = await import('@electron/rebuild')
const electronVersion = require('electron/package.json').version
await rebuild({
  buildPath: path.join(vendorDir, 'server'),
  electronVersion,
  onlyModules: ['@serialport/bindings-cpp'],
  force: true,
})

console.log(`Done. Vendored ui/.output rebuilt for Electron ${electronVersion}.`)
