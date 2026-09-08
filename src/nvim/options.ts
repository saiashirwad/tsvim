// Options as a declaration.
//
//   options({ number: true, clipboard: ["unnamedplus"], shortmess: add("I") })
//
// Globally that is `:set`; inside a buffer context it is `:setlocal` for that
// buffer (and the window showing it). Unmounting restores the previous values,
// so removing a line from the config and reloading really removes it.

import { behavior, type Node } from "./spec"
import { lease } from "./lease"
import { events } from "./events"

/** Comma-separated list options accept arrays. */
export type List = string | readonly string[]

export interface Options {
  // ---- ui
  number: boolean
  relativenumber: boolean
  numberwidth: number
  signcolumn: "auto" | "yes" | "no" | "number" | `auto:${number}` | `yes:${number}` | (string & {})
  cursorline: boolean
  cursorcolumn: boolean
  cursorlineopt: List
  colorcolumn: List
  termguicolors: boolean
  background: "dark" | "light"
  laststatus: 0 | 1 | 2 | 3
  showtabline: 0 | 1 | 2
  cmdheight: number
  showmode: boolean
  showcmd: boolean
  ruler: boolean
  title: boolean
  titlestring: string
  statusline: string
  tabline: string
  winbar: string
  statuscolumn: string
  winborder: "none" | "single" | "double" | "rounded" | "solid" | "shadow" | "bold"
  list: boolean
  listchars: List
  fillchars: List
  wrap: boolean
  linebreak: boolean
  breakindent: boolean
  showbreak: string
  smoothscroll: boolean
  scrolloff: number
  sidescrolloff: number
  sidescroll: number
  conceallevel: 0 | 1 | 2 | 3
  concealcursor: string
  pumheight: number
  pumblend: number
  winblend: number
  splitbelow: boolean
  splitright: boolean
  splitkeep: "cursor" | "screen" | "topline"
  equalalways: boolean
  winminheight: number
  winminwidth: number
  winfixheight: boolean
  winfixwidth: boolean
  winfixbuf: boolean
  guicursor: List
  guifont: string
  mouse: string
  mousemoveevent: boolean
  shortmess: string
  lazyredraw: boolean
  redrawtime: number
  visualbell: boolean
  errorbells: boolean
  belloff: List
  // ---- editing
  tabstop: number
  shiftwidth: number
  softtabstop: number
  expandtab: boolean
  smarttab: boolean
  autoindent: boolean
  smartindent: boolean
  cindent: boolean
  shiftround: boolean
  textwidth: number
  wrapmargin: number
  formatoptions: string
  formatexpr: string
  formatprg: string
  backspace: List
  whichwrap: string
  virtualedit: List
  startofline: boolean
  joinspaces: boolean
  nrformats: List
  matchpairs: List
  showmatch: boolean
  matchtime: number
  undofile: boolean
  undolevels: number
  undodir: List
  swapfile: boolean
  backup: boolean
  writebackup: boolean
  backupdir: List
  autoread: boolean
  autowrite: boolean
  autowriteall: boolean
  hidden: boolean
  confirm: boolean
  fileformat: "unix" | "dos" | "mac"
  fileformats: List
  fileencoding: string
  encoding: string
  bomb: boolean
  fixendofline: boolean
  endofline: boolean
  binary: boolean
  modeline: boolean
  modified: boolean
  buftype: "" | "acwrite" | "help" | "nofile" | "nowrite" | "quickfix" | "terminal" | "prompt"
  bufhidden: "" | "hide" | "unload" | "delete" | "wipe"
  buflisted: boolean
  winhighlight: List
  scrollbind: boolean
  cursorbind: boolean
  previewwindow: boolean
  modifiable: boolean
  readonly: boolean
  filetype: string
  syntax: string
  commentstring: string
  comments: List
  iskeyword: List
  isfname: List
  spell: boolean
  spelllang: List
  spelloptions: List
  clipboard: List
  // ---- search
  ignorecase: boolean
  smartcase: boolean
  incsearch: boolean
  hlsearch: boolean
  wrapscan: boolean
  magic: boolean
  inccommand: "" | "nosplit" | "split"
  grepprg: string
  grepformat: List
  // ---- completion
  completeopt: List
  complete: List
  wildmenu: boolean
  wildmode: List
  wildoptions: List
  wildignore: List
  wildignorecase: boolean
  omnifunc: string
  completefunc: string
  infercase: boolean
  // ---- folding
  foldenable: boolean
  foldmethod: "manual" | "indent" | "expr" | "marker" | "syntax" | "diff"
  foldexpr: string
  foldlevel: number
  foldlevelstart: number
  foldcolumn: "0" | "1" | "2" | "3" | "auto" | (string & {})
  foldtext: string
  foldminlines: number
  foldnestmax: number
  // ---- timing / misc
  timeout: boolean
  timeoutlen: number
  ttimeout: boolean
  ttimeoutlen: number
  updatetime: number
  history: number
  shada: string
  sessionoptions: List
  viewoptions: List
  diffopt: List
  path: List
  runtimepath: List
  packpath: List
  shell: string
  shellcmdflag: string
  keywordprg: string
  makeprg: string
  errorformat: List
  jumpoptions: List
  selection: "inclusive" | "exclusive" | "old"
  exrc: boolean
  secure: boolean
  scrollback: number
  display: List
  cpoptions: string
  more: boolean
  report: number
  helpheight: number
  previewheight: number
  tagfunc: string
  tags: List
}

/** An edit to a list/flag option instead of a replacement. */
export interface ListOp {
  readonly op: "append" | "prepend" | "remove"
  readonly value: List
}

/** `shortmess: add("I")` — `:set+=` */
export const add = (value: List): ListOp => ({ op: "append", value })
/** `:set^=` */
export const prepend = (value: List): ListOp => ({ op: "prepend", value })
/** `:set-=` */
export const drop = (value: List): ListOp => ({ op: "remove", value })

export type OptionValues = { readonly [K in keyof Options]?: Options[K] | ListOp }

const isOp = (v: unknown): v is ListOp =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "op" in (v as object)

const encode = (v: unknown): string | number | boolean =>
  Array.isArray(v) ? (v as string[]).join(",") : (v as string | number | boolean)

const items = (v: List): string[] =>
  Array.isArray(v) ? [...(v as string[])] : (v as string).split(",")

/** Apply a `+=`/`^=`/`-=` edit to the current string value, honouring flag vs comma-list semantics. */
const applyOp = (name: string, current: string, op: ListOp): string => {
  const info = vim.api.nvim_get_option_info2(name, {})
  if (info.flaglist) {
    const flags = typeof op.value === "string" ? op.value : (op.value as readonly string[]).join("")
    let out = current
    for (const f of flags.split("")) {
      if (op.op === "remove") out = out.split(f).join("")
      else if (!out.includes(f)) out = op.op === "prepend" ? f + out : out + f
    }
    return out
  }
  const have = current === "" ? [] : current.split(",")
  const incoming = items(op.value)
  if (op.op === "remove") return have.filter((x) => !incoming.includes(x)).join(",")
  const fresh = incoming.filter((x) => !have.includes(x))
  return (op.op === "prepend" ? [...fresh, ...have] : [...have, ...fresh]).join(",")
}

type Location = { buf?: number; win?: number; scope?: "global" | "local" }
const claim = (name: string, value: unknown, location: Location): (() => void) => {
  const old = vim.api.nvim_get_option_value(name, location)
  const valid = () =>
    (location.buf === undefined || vim.api.nvim_buf_is_valid(location.buf)) &&
    (location.win === undefined || vim.api.nvim_win_is_valid(location.win))
  const next = isOp(value)
    ? applyOp(name, typeof old === "string" ? old : "", value)
    : encode(value)
  return lease(
    `option:${name}:${location.buf ?? ""}:${location.win ?? ""}:${location.scope ?? ""}`,
    () => {
      if (valid()) vim.api.nvim_set_option_value(name, old, location)
    },
    () => {
      if (valid()) vim.api.nvim_set_option_value(name, next, location)
    },
  )
}
/** Typed native options remain available alongside opinionated editing policies. */
export const options = (values: OptionValues): Node =>
  behavior((scope) => {
    for (const name in values) {
      const value = (values as LuaDict)[name]
      const kind = vim.api.nvim_get_option_info2(name, {}).scope
      if (scope.buffer === undefined && scope.window === undefined) {
        scope.own(claim(name, value, { scope: "global" }))
        if (kind === "buf") scope.own(claim(name, value, { buf: vim.api.nvim_get_current_buf() }))
        if (kind === "win")
          scope.own(claim(name, value, { win: vim.api.nvim_get_current_win(), scope: "local" }))
      } else if (kind === "global") {
        throw new Error(`Option ${name} is global; declare it outside a buffer/window scope`)
      } else if (kind === "buf") {
        scope.own(
          claim(name, value, { buf: scope.buffer ?? vim.api.nvim_win_get_buf(scope.window!) }),
        )
      } else if (scope.window !== undefined) {
        scope.own(claim(name, value, { win: scope.window, scope: "local" }))
      } else {
        const windows = new Map<number, () => void>()
        const reconcile = () => {
          for (const [win, close] of windows) {
            if (!vim.api.nvim_win_is_valid(win) || vim.api.nvim_win_get_buf(win) !== scope.buffer) {
              close()
              windows.delete(win)
            }
          }
          for (const win of vim.api.nvim_list_wins()) {
            if (vim.api.nvim_win_get_buf(win) === scope.buffer && !windows.has(win))
              windows.set(win, claim(name, value, { win, scope: "local" }))
          }
        }
        scope.own(() => {
          for (const close of windows.values()) close()
        })
        scope.own(events(["BufWinEnter", "WinEnter", "WinClosed"]).subscribe(reconcile))
        reconcile()
      }
    }
  })
