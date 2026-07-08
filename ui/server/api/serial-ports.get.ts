import { SerialPort } from 'serialport'

export default defineEventHandler(async () => {
  const ports = await SerialPort.list()
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer ?? null,
    serialNumber: p.serialNumber ?? null,
    pnpId: p.pnpId ?? null,
    vendorId: p.vendorId ?? null,
    productId: p.productId ?? null,
  }))
})
