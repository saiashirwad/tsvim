// Highlight groups and colors.
//
//   hl("Normal", { fg: "#cdd6f4", bg: "#1e1e2e" })
//   hl.link("MyBorder", "FloatBorder")
//   hl.many({ Comment: { fg: palette.overlay, italic: true }, Todo: { link: "DiagnosticWarn" } })

/** A `#rrggbb` hex color or a named terminal color. */
export type HexColor = `#${string}`
export type NamedColor =
  | "NONE" | "bg" | "fg" | "Black" | "DarkBlue" | "DarkGreen" | "DarkCyan" | "DarkRed" | "DarkMagenta" | "Brown" | "DarkYellow"
  | "LightGray" | "LightGrey" | "Gray" | "Grey" | "DarkGray" | "DarkGrey" | "Blue" | "LightBlue" | "Green" | "LightGreen"
  | "Cyan" | "LightCyan" | "Red" | "LightRed" | "Magenta" | "LightMagenta" | "Yellow" | "LightYellow" | "White"
export type Color = HexColor | NamedColor

export interface HighlightStyle {
  fg?: Color
  bg?: Color
  sp?: Color
  bold?: boolean
  italic?: boolean
  underline?: boolean
  undercurl?: boolean
  underdouble?: boolean
  underdotted?: boolean
  underdashed?: boolean
  strikethrough?: boolean
  reverse?: boolean
  standout?: boolean
  nocombine?: boolean
  /** 0–100 */
  blend?: number
  /** link to another group (other attributes are ignored) */
  link?: string
  /** keep existing attributes not mentioned here */
  default?: boolean
  ctermfg?: number | string
  ctermbg?: number | string
}

export type HighlightTable = { readonly [group: string]: HighlightStyle }

const set = (group: string, style: HighlightStyle, ns = 0): void => {
  vim.api.nvim_set_hl(ns, group, { ...style })
}

/** @noSelf */
export interface HighlightApi {
  (group: string, style: HighlightStyle): void
  set(group: string, style: HighlightStyle, ns?: number): void
  link(group: string, target: string): void
  many(table: HighlightTable, ns?: number): void
  /** read a group's resolved attributes */
  get(group: string): HighlightStyle
  /** a namespace id for scoped highlights (`nvim_create_namespace`) */
  namespace(name: string): number
}

export const hl: HighlightApi = setmetatable(
  {
    set,
    link: (group: string, target: string) => set(group, { link: target }),
    many: (table: HighlightTable, ns = 0) => {
      for (const group in table) set(group, table[group]!, ns)
    },
    get: (group: string) => vim.api.nvim_get_hl(0, { name: group, link: false }) as HighlightStyle,
    namespace: (name: string) => vim.api.nvim_create_namespace(name),
  } as unknown as HighlightApi,
  { __call: (group: string, style: HighlightStyle) => set(group, style) },
)

/** Build a palette object with literal hex types preserved for completion. */
export const palette = <const T extends Record<string, HexColor>>(colors: T): T => colors

/** Blend two hex colors: `mix("#ff0000", "#0000ff", 0.5)` */
export const mix = (a: HexColor, b: HexColor, t: number): HexColor => {
  const ch = (c: HexColor, i: number) => tonumber(c.substring(1 + i * 2, 3 + i * 2), 16) ?? 0
  const lerp = (x: number, y: number) => Math.floor(x + (y - x) * t + 0.5)
  const hex = (n: number) => string.format("%02x", n)
  return `#${hex(lerp(ch(a, 0), ch(b, 0)))}${hex(lerp(ch(a, 1), ch(b, 1)))}${hex(lerp(ch(a, 2), ch(b, 2)))}`
}
