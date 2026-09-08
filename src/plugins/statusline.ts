// A statusline assembled from typed segments, rendered through a global Lua function.

import { augroup, hl, opt, type HexColor } from "../nvim"

type Segment = () => string

interface StatuslineConfig {
  colors: { base: HexColor; mantle: HexColor; surface: HexColor; text: HexColor; subtext: HexColor; blue: HexColor; green: HexColor; yellow: HexColor; red: HexColor; mauve: HexColor }
}

const MODES: Record<string, [string, string]> = {
  n: ["NORMAL", "StModeNormal"], i: ["INSERT", "StModeInsert"], v: ["VISUAL", "StModeVisual"], V: ["V-LINE", "StModeVisual"],
  "": ["V-BLOCK", "StModeVisual"], c: ["COMMAND", "StModeCommand"], R: ["REPLACE", "StModeReplace"], t: ["TERMINAL", "StModeInsert"],
  s: ["SELECT", "StModeVisual"], S: ["S-LINE", "StModeVisual"],
}

const group = (name: string, text: string): string => `%#${name}#${text}%*`

const mode: Segment = () => {
  const m = vim.api.nvim_get_mode().mode
  const [label, hlGroup] = MODES[m.substring(0, 1)] ?? [m.toUpperCase(), "StModeNormal"]
  return group(hlGroup, ` ${label} `)
}

const file: Segment = () => {
  const name = vim.fn.expand("%:~:.")
  const flags = `${vim.bo.modified ? " ●" : ""}${vim.bo.readonly ? " " : ""}`
  return group("StFile", ` ${name === "" ? "[No Name]" : name}${flags} `)
}

const git: Segment = () => {
  const head = (vim.b.gitsigns_head as string | undefined) ?? ""
  return head === "" ? "" : group("StGit", `  ${head} `)
}

const diagnostics: Segment = () => {
  const counts = vim.diagnostic.count(0)
  const parts: string[] = []
  const err = counts[vim.diagnostic.severity.ERROR] ?? 0
  const warn = counts[vim.diagnostic.severity.WARN] ?? 0
  if (err > 0) parts.push(group("StError", ` ${err}`))
  if (warn > 0) parts.push(group("StWarn", ` ${warn}`))
  return parts.length === 0 ? "" : ` ${parts.join(" ")} `
}

const lspClients: Segment = () => {
  const names = vim.lsp.get_clients({ bufnr: 0 }).map((c) => c.name)
  return names.length === 0 ? "" : group("StLsp", ` ${names.join(",")} `)
}

const position: Segment = () => group("StPos", " %l:%c  %P ")
const filetype: Segment = () => {
  const ft = vim.bo.filetype as string
  return ft === "" ? "" : group("StFt", ` ${ft} `)
}

const left: Segment[] = [mode, git, file, diagnostics]
const right: Segment[] = [lspClients, filetype, position]

const render = (): string => `${left.map((s) => s()).join("")}%=${right.map((s) => s()).join("")}`

export const statusline = {
  setup: ({ colors }: StatuslineConfig): void => {
    hl.many({
      StModeNormal: { fg: colors.base, bg: colors.blue, bold: true },
      StModeInsert: { fg: colors.base, bg: colors.green, bold: true },
      StModeVisual: { fg: colors.base, bg: colors.mauve, bold: true },
      StModeCommand: { fg: colors.base, bg: colors.yellow, bold: true },
      StModeReplace: { fg: colors.base, bg: colors.red, bold: true },
      StFile: { fg: colors.text, bg: colors.surface },
      StGit: { fg: colors.mauve, bg: colors.mantle },
      StError: { fg: colors.red, bg: colors.mantle },
      StWarn: { fg: colors.yellow, bg: colors.mantle },
      StLsp: { fg: colors.green, bg: colors.mantle },
      StFt: { fg: colors.subtext, bg: colors.surface },
      StPos: { fg: colors.base, bg: colors.blue, bold: true },
    })
    // expose the renderer to the statusline expression
    ;(_G as LuaDict).pureluanvim_statusline = render
    opt.statusline = "%!v:lua.pureluanvim_statusline()"
    augroup("pureluanvim.statusline", (on) => {
      on(["ModeChanged", "DiagnosticChanged", "LspAttach", "LspDetach", "BufEnter"], () => vim.cmd("redrawstatus"))
    })
  },
}
