import { behavior, mount, type Node } from "./spec"
import { effect } from "./state"
import { events } from "./events"
import { options } from "./options"
import type { Chunk } from "./view"
export interface StatusLayout {
  readonly left: readonly Chunk[]
  readonly right?: readonly Chunk[]
}
let nextId = 0
/** Dynamic text is escaped; native statusline expressions are an explicit separate value. */
export interface StatusCode extends Chunk {
  readonly code: true
}
export const statusCode = (value: string, highlight?: string): StatusCode =>
  highlight === undefined ? { text: value, code: true } : { text: value, highlight, code: true }
const format = (chunk: Chunk): string => {
  const value = "code" in chunk ? chunk.text : chunk.text.split("%").join("%%")
  return chunk.highlight ? `%#${chunk.highlight}#${value}%*` : value
}
export const statusbar = (render: () => StatusLayout): Node =>
  behavior((scope) => {
    const name = `pureluanvim_statusline_${++nextId}`
    const globals = _G as LuaDict
    globals[name] = () => {
      const content = render()
      return (
        content.left.map((chunk) => format(chunk)).join("") +
        "%=" +
        (content.right ?? []).map((chunk) => format(chunk)).join("")
      )
    }
    scope.own(() => {
      globals[name] = undefined
    })
    mount(options({ statusline: `%!v:lua.${name}()` }), scope)
    effect(() => {
      render()
      vim.cmd("redrawstatus")
    }, scope)
    scope.own(
      events([
        "ModeChanged",
        "BufEnter",
        "BufModifiedSet",
        "DiagnosticChanged",
        "LspAttach",
        "LspDetach",
        "DirChanged",
      ]).subscribe(() => vim.cmd("redrawstatus")),
    )
  })
