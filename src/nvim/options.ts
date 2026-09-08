// Typed Vim options.
//
//   opt.number = true
//   opt.clipboard = ["unnamedplus"]           // list options accept arrays
//   opt.shortmess.append("I")                 // list/flag operations
//   optLocal.shiftwidth = 2                   // buffer/window-local
//   opts({ number: true, relativenumber: true, tabstop: 4 })

/** Comma-separated list options can be assigned as arrays. */
export type ListOption = string | readonly string[]

export interface Options {
  // ---- ui
  number: boolean
  relativenumber: boolean
  numberwidth: number
  signcolumn: "auto" | "yes" | "no" | "number" | `auto:${number}` | `yes:${number}` | (string & {})
  cursorline: boolean
  cursorcolumn: boolean
  cursorlineopt: ListOption
  colorcolumn: ListOption
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
  winborder: "none" | "single" | "double" | "rounded" | "solid" | "shadow" | "bold"
  list: boolean
  listchars: ListOption
  fillchars: ListOption
  wrap: boolean
  linebreak: boolean
  breakindent: boolean
  showbreak: string
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
  guicursor: ListOption
  guifont: string
  mouse: string
  mousemoveevent: boolean
  shortmess: string
  lazyredraw: boolean
  redrawtime: number
  visualbell: boolean
  errorbells: boolean
  belloff: ListOption
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
  backspace: ListOption
  whichwrap: string
  virtualedit: ListOption
  startofline: boolean
  joinspaces: boolean
  nrformats: ListOption
  matchpairs: ListOption
  showmatch: boolean
  matchtime: number
  undofile: boolean
  undolevels: number
  undodir: ListOption
  swapfile: boolean
  backup: boolean
  writebackup: boolean
  backupdir: ListOption
  autoread: boolean
  autowrite: boolean
  autowriteall: boolean
  hidden: boolean
  confirm: boolean
  fileformat: "unix" | "dos" | "mac"
  fileformats: ListOption
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
  winhighlight: ListOption
  winfixheight: boolean
  winfixwidth: boolean
  scrollbind: boolean
  cursorbind: boolean
  previewwindow: boolean
  winfixbuf: boolean
  modifiable: boolean
  readonly: boolean
  filetype: string
  syntax: string
  commentstring: string
  comments: ListOption
  iskeyword: ListOption
  isfname: ListOption
  spell: boolean
  spelllang: ListOption
  spelloptions: ListOption
  clipboard: ListOption
  // ---- search
  ignorecase: boolean
  smartcase: boolean
  incsearch: boolean
  hlsearch: boolean
  wrapscan: boolean
  magic: boolean
  inccommand: "" | "nosplit" | "split"
  grepprg: string
  grepformat: ListOption
  // ---- completion
  completeopt: ListOption
  complete: ListOption
  wildmenu: boolean
  wildmode: ListOption
  wildoptions: ListOption
  wildignore: ListOption
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
  sessionoptions: ListOption
  viewoptions: ListOption
  diffopt: ListOption
  path: ListOption
  runtimepath: ListOption
  packpath: ListOption
  shell: string
  shellcmdflag: string
  keywordprg: string
  makeprg: string
  errorformat: ListOption
  jumpoptions: ListOption
  selection: "inclusive" | "exclusive" | "old"
  exrc: boolean
  secure: boolean
  scrollback: number
  // ---- statuscolumn / smoothscroll (0.9+)
  statuscolumn: string
  smoothscroll: boolean
  // ---- listchars-adjacent
  display: ListOption
  cpoptions: string
  more: boolean
  report: number
  helpheight: number
  previewheight: number
  tagfunc: string
  tags: ListOption
}

/** Names of options that take a comma-separated list. */
export type ListOptionName = { [K in keyof Options]: Options[K] extends ListOption ? K : never }[keyof Options]

/** Option values as Vim wants them: arrays become comma-separated strings. */
const encode = (v: unknown): string | number | boolean =>
  Array.isArray(v) ? (v as string[]).join(",") : (v as string | number | boolean)

/** Operations on list/flag options (`:h :set+=`, `^=`, `-=`). */
/** @noSelf */
export interface ListOps {
  append(value: ListOption): void
  prepend(value: ListOption): void
  remove(value: ListOption): void
  get(): string[]
}

const listOps = (source: LuaDict<vim.OptionObject>, name: string): ListOps => ({
  append: (v) => source[name]!.append(Array.isArray(v) ? [...v] : (v as string)),
  prepend: (v) => source[name]!.prepend(Array.isArray(v) ? [...v] : (v as string)),
  remove: (v) => source[name]!.remove(Array.isArray(v) ? [...v] : (v as string)),
  get: () => {
    const raw = source[name]!.get()
    if (Array.isArray(raw)) return raw as string[]
    if (typeof raw === "string") return raw === "" ? [] : raw.split(",")
    return [String(raw)]
  },
})

const makeOptions = (scope: "global" | "local"): Options => {
  const source = scope === "global" ? vim.opt : vim.opt_local
  const read = (name: string): unknown => {
    const raw = source[name]!.get()
    // reading a list option gives an array augmented with list operations
    if (typeof raw === "object" && raw !== null) {
      const arr = Array.isArray(raw) ? [...(raw as string[])] : Object.keys(raw as object)
      return Object.assign(arr, listOps(source, name))
    }
    // strings that contain commas are lists too; expose the ops on a String wrapper is unidiomatic,
    // so only arrays get the ops. Flag strings (like shortmess) are handled via `optList`.
    return raw
  }
  const write = (name: string, value: unknown): void => {
    if (scope === "global") vim.o[name] = encode(value)
    else vim.api.nvim_set_option_value(name, encode(value), { scope: "local" })
  }
  return setmetatable({} as unknown as Options, {
    __index: (_: unknown, name: string) => read(name),
    __newindex: (name: string, value: unknown) => write(name, value),
  })
}

/** Global options (`vim.o`): `opt.number = true` */
export const opt: Options = makeOptions("global")
/** Buffer/window-local options (`vim.opt_local`): `optLocal.shiftwidth = 2` */
export const optLocal: Options = makeOptions("local")

/** List / flag operations on any list-ish option, for both arrays and flag strings. */
export const optList = (name: ListOptionName | "shortmess" | "formatoptions" | "whichwrap" | "cpoptions" | "guicursor"): ListOps =>
  listOps(vim.opt, name)

/** Set many options at once. */
export const opts = (values: Partial<Options>): void => {
  for (const name in values) (opt as unknown as LuaDict)[name] = (values as LuaDict)[name]
}

/** Buffer-local option access for a specific buffer. */
export const bufOpt = (buf: number): Options =>
  setmetatable({} as unknown as Options, {
    __index: (_: unknown, name: string) => vim.api.nvim_get_option_value(name, { buf }),
    __newindex: (name: string, value: unknown) => vim.api.nvim_set_option_value(name, encode(value), { buf }),
  })

/** Window-local option access for a specific window. */
export const winOpt = (win: number): Options =>
  setmetatable({} as unknown as Options, {
    __index: (_: unknown, name: string) => vim.api.nvim_get_option_value(name, { win }),
    __newindex: (name: string, value: unknown) => vim.api.nvim_set_option_value(name, encode(value), { win }),
  })

/** Global variables (`vim.g`) with a typed shape you declare. */
export const globals = <T extends object>(): T =>
  setmetatable({} as T, {
    __index: (_: unknown, name: string) => vim.g[name],
    __newindex: (name: string, value: unknown) => { vim.g[name] = value },
  })
