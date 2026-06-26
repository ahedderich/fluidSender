export default defineEventHandler(() => {
  const app = useNitroApp()
  return {
    hasH3App: !!app.h3App,
    hasWebsocketConfig: !!(app.h3App as any)?.websocket,
    websocketKeys: Object.keys((app.h3App as any)?.websocket ?? {}),
    experimentalWebsocket: import.meta._websocket,
    nodeVersion: process.version,
    platform: process.platform,
    isBun: !!(process.versions as Record<string, string>).bun,
    bunVersion: (process.versions as Record<string, string>).bun ?? null,
    execPath: process.execPath,
  }
})
