export default defineEventHandler(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = useNitroApp() as any
  return {
    hasH3App: !!app.h3App,
    hasWebsocketConfig: !!app.h3App?.websocket,
    websocketKeys: Object.keys(app.h3App?.websocket ?? {}),
    experimentalWebsocket: import.meta._websocket,
    nodeVersion: process.version,
    platform: process.platform,
    isBun: !!(process.versions as Record<string, string>).bun,
    bunVersion: (process.versions as Record<string, string>).bun ?? null,
    execPath: process.execPath,
  }
})
