import { parseMacro, MacroParseError } from '../../utils/macro/macroParser'

export default defineEventHandler(async (event) => {
  const { gcode } = (await readBody(event)) as { gcode: string }
  try {
    const result = parseMacro(gcode)
    return { ok: true, requiresToolChange: result.requiresToolChange }
  } catch (err) {
    if (err instanceof MacroParseError) {
      return { ok: false, error: `Line ${err.lineNum}: ${err.message}` }
    }
    return { ok: false, error: (err as Error).message }
  }
})
