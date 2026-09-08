// Highlight groups as a declaration; colors as values.
//
//   const c = palette({ base: "#1e1e2e", blue: "#89b4fa" })
//   highlights({ Normal: { fg: c.text, bg: c.base }, Todo: { link: "DiagnosticWarn" } })

import { behavior, type Node } from "./spec"
import { lease } from "./lease"
import { events } from "./events"

export type Hex = `#${string}`
export type NamedColor =
  | "NONE"
  | "bg"
  | "fg"
  | "Black"
  | "DarkBlue"
  | "DarkGreen"
  | "DarkCyan"
  | "DarkRed"
  | "DarkMagenta"
  | "Brown"
  | "DarkYellow"
  | "LightGray"
  | "LightGrey"
  | "Gray"
  | "Grey"
  | "DarkGray"
  | "DarkGrey"
  | "Blue"
  | "LightBlue"
  | "Green"
  | "LightGreen"
  | "Cyan"
  | "LightCyan"
  | "Red"
  | "LightRed"
  | "Magenta"
  | "LightMagenta"
  | "Yellow"
  | "LightYellow"
  | "White"
export type Color = Hex | NamedColor

export interface Style {
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
  /** link to another group (other attributes ignored) */
  link?: string
}

export type Highlights = { readonly [group: string]: Style }

/** Declare highlight groups. Unmounting restores what each group was before. */
export const highlights = (table: Highlights, ns = 0): Node =>
  behavior((scope) => {
    const apply = () => {
      for (const group in table) vim.api.nvim_set_hl(ns, group, { ...table[group]! })
    }
    for (const group in table) {
      const previous = vim.api.nvim_get_hl(ns, { name: group, link: true })
      scope.own(
        lease(
          `highlight:${ns}:${group}`,
          () => vim.api.nvim_set_hl(ns, group, previous),
          () => vim.api.nvim_set_hl(ns, group, { ...table[group]! }),
        ),
      )
    }
    scope.own(events("ColorScheme").subscribe(apply))
  })

/** A palette keeps literal hex types for completion. */
export const palette = <const T extends Record<string, Hex>>(colors: T): T => colors

/** Blend two hex colors: `mix("#ff0000", "#0000ff", 0.5)`. */
export const mix = (a: Hex, b: Hex, t: number): Hex => {
  const ch = (c: Hex, i: number) => tonumber(c.substring(1 + i * 2, 3 + i * 2), 16) ?? 0
  const lerp = (x: number, y: number) => Math.floor(x + (y - x) * t + 0.5)
  const hex = (n: number) => string.format("%02x", n)
  return `#${hex(lerp(ch(a, 0), ch(b, 0)))}${hex(lerp(ch(a, 1), ch(b, 1)))}${hex(lerp(ch(a, 2), ch(b, 2)))}`
}

/** Darken/lighten toward black/white. */
export const darken = (c: Hex, t: number): Hex => mix(c, "#000000", t)
export const lighten = (c: Hex, t: number): Hex => mix(c, "#ffffff", t)
