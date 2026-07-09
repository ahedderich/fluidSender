export type CamMode = '3d' | 'split' | 'cam' | 'pip'

export type WebcamStreamType = 'hls' | 'native'

export interface WebcamConfig {
  enabled: boolean
  /** URL of an already browser-playable stream (HLS .m3u8, or a direct video src) — produced by external infra (e.g. MediaMTX/go2rtc). FluidSender never transcodes. */
  streamUrl: string
  streamType: WebcamStreamType
  defaultMode: CamMode
}
