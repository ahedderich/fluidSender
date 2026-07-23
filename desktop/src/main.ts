import { app, BrowserWindow, dialog, shell } from 'electron'
import { startServer } from './server.js'

async function createWindow(): Promise<void> {
  const { url } = await startServer()

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'FluidSender',
  })

  // Copy-and-open-style links (e.g. the LAN address shown in Settings) should
  // open in the user's system browser, not a second Electron window pointed
  // at the same in-process server.
  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl)
    return { action: 'deny' }
  })

  await window.loadURL(url)
}

app.whenReady().then(async () => {
  console.log('userData:', app.getPath('userData'))
  try {
    await createWindow()
  } catch (err) {
    dialog.showErrorBox('FluidSender failed to start', String(err))
    app.quit()
  }
})

// Single-window app — the server runs in this same process, so quitting here
// tears it down too; there's no separate process or handle to close.
app.on('window-all-closed', () => {
  app.quit()
})
