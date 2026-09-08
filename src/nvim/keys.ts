// Key notation and keymaps.
//
//   keymap.n("<leader>ff", pick.files, "Find files")
//   keymap.n("<C-s>", cmd("write"))
//   keymap.modes(["n", "v"]).set("<leader>y", '"+y', "Yank to clipboard")
//   keymap.leader({ f: { f: [pick.files, "Files"], g: [pick.grep, "Grep"] } })

// ---------------------------------------------------------------- key notation

export type Modifier = "C" | "M" | "A" | "S" | "D"
export type FKey = `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`
export type SpecialKey =
  | "CR" | "Enter" | "Esc" | "Tab" | "S-Tab" | "Space" | "BS" | "Del" | "Insert"
  | "Up" | "Down" | "Left" | "Right" | "Home" | "End" | "PageUp" | "PageDown"
  | "Nop" | "lt" | "Bar" | "Bslash" | "leader" | "localleader" | "Leader" | "LocalLeader"
  | "Cmd" | "Plug" | "Nul" | FKey
export type Chord = `<${SpecialKey}>` | `<${Modifier}-${string}>`

/** A left-hand side: gets completion for special keys yet accepts any string. */
export type Keys = `${Chord}${string}` | (string & {})

/** `<Cmd>…<CR>` – runs an Ex command without changing mode or the command line */
export const cmd = (command: string): `<Cmd>${string}<CR>` => `<Cmd>${command}<CR>`

/** `<Cmd>lua …<CR>` with a Lua expression */
export const luaCmd = (lua: string): `<Cmd>${string}<CR>` => `<Cmd>lua ${lua}<CR>`

/** Translate `<CR>`-style notation into the raw bytes Neovim expects for feedkeys. */
export const termcodes = (keys: string): string => vim.api.nvim_replace_termcodes(keys, true, true, true)

/** Feed keys as if typed (`mode` follows :h feedkeys, default "n" = noremap). */
export const feed = (keys: string, mode = "n"): void => vim.api.nvim_feedkeys(termcodes(keys), mode, false)

// ---------------------------------------------------------------- modes

export type Mode = "n" | "i" | "v" | "x" | "s" | "o" | "t" | "c" | "!" | "l" | ""
const ALL_MODES: readonly Mode[] = ["n", "v", "o"]

// ---------------------------------------------------------------- actions & options

/** A callback bound to a key. Return a string from an `expr` mapping. */
export type Callback = (this: void) => unknown
export type Action = string | Callback

export interface MapOptions {
  /** shown by which-key style plugins and `:map` */
  desc?: string
  silent?: boolean
  /** allow the rhs to be remapped (default: false, i.e. noremap) */
  remap?: boolean
  /** the rhs (or callback result) is evaluated as an expression */
  expr?: boolean
  nowait?: boolean
  /** buffer-local mapping (`true` = current buffer) */
  buffer?: number | true
  unique?: boolean
  replace_keycodes?: boolean
}

/** A description string is the most common option, so it can be passed bare. */
export type MapOpts = string | MapOptions

/** Handle to an installed mapping. */
/** @noSelf */
export interface Keymap {
  readonly modes: readonly Mode[]
  readonly lhs: string
  del(): void
}

const normalizeOpts = (opts: MapOpts | undefined): MapOptions =>
  typeof opts === "string" ? { desc: opts } : opts ?? {}

const install = (modes: readonly Mode[], lhs: string, action: Action, opts: MapOptions): Keymap => {
  const o: LuaDict = { silent: true, noremap: !opts.remap }
  if (opts.desc !== undefined) o.desc = opts.desc
  if (opts.silent !== undefined) o.silent = opts.silent
  if (opts.expr !== undefined) o.expr = opts.expr
  if (opts.nowait !== undefined) o.nowait = opts.nowait
  if (opts.unique !== undefined) o.unique = opts.unique
  if (opts.replace_keycodes !== undefined) o.replace_keycodes = opts.replace_keycodes
  if (opts.buffer !== undefined) o.buffer = opts.buffer === true ? 0 : opts.buffer
  const modeList = [...modes]
  vim.keymap.set(modeList, lhs, action, o)
  return {
    modes,
    lhs,
    del: () => vim.keymap.del(modeList, lhs, opts.buffer !== undefined ? { buffer: opts.buffer === true ? 0 : opts.buffer } : {}),
  }
}

// ---------------------------------------------------------------- the mapper

/** A mapper bound to a set of modes. */
/** @noSelf */
export interface ModeMapper {
  readonly modes: readonly Mode[]
  (lhs: Keys, action: Action, opts?: MapOpts): Keymap
  set: (lhs: Keys, action: Action, opts?: MapOpts) => Keymap
  /** many mappings at once: `{ "<C-s>": [cmd("write"), "Save"], "<Esc>": cmd("nohlsearch") }` */
  many: (table: MapTable) => Keymap[]
}

/** `Action` alone or `[Action, description]` or `[Action, options]` */
export type Binding = Action | readonly [Action, MapOpts?]
export type MapTable = { readonly [lhs: string]: Binding }

/** A nested tree keyed by key fragments; leaves are bindings. */
export type KeyTree = { readonly [key: string]: Binding | KeyTree }

const isTree = (v: Binding | KeyTree): v is KeyTree =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const bindingParts = (b: Binding): [Action, MapOptions] =>
  Array.isArray(b) ? [b[0], normalizeOpts(b[1])] : [b as Action, {}]

const mapper = (modes: readonly Mode[]): ModeMapper => {
  const set = (lhs: Keys, action: Action, opts?: MapOpts) => install(modes, lhs, action, normalizeOpts(opts))
  const many = (table: MapTable): Keymap[] => {
    const out: Keymap[] = []
    for (const lhs in table) {
      const [action, opts] = bindingParts(table[lhs]!)
      out.push(install(modes, lhs, action, opts))
    }
    return out
  }
  // A callable table: `setmetatable` gives us `keymap.n(lhs, rhs)` and `keymap.n.set(...)`
  const self = setmetatable({ modes, set, many } as unknown as ModeMapper, {
    __call: (lhs: Keys, action: Action, opts?: MapOpts) => set(lhs, action, opts),
  })
  return self
}

const walkTree = (modes: readonly Mode[], prefix: string, tree: KeyTree, sink: Keymap[], extra: MapOptions): void => {
  for (const key in tree) {
    const node = tree[key]!
    if (isTree(node)) walkTree(modes, prefix + key, node, sink, extra)
    else {
      const [action, opts] = bindingParts(node)
      sink.push(install(modes, prefix + key, action, { ...extra, ...opts }))
    }
  }
}

/** @noSelf */
export interface KeymapApi {
  n: ModeMapper
  i: ModeMapper
  v: ModeMapper
  x: ModeMapper
  s: ModeMapper
  o: ModeMapper
  t: ModeMapper
  c: ModeMapper
  /** normal + visual + operator-pending (the `:map` default) */
  all: ModeMapper
  /** normal + visual */
  nv: ModeMapper
  /** insert + command-line */
  ic: ModeMapper
  /** a mapper for an arbitrary set of modes */
  modes: (modes: readonly Mode[]) => ModeMapper
  /** `<leader>`-prefixed tree of mappings, e.g. `{ f: { f: [find, "Files"] } }` → `<leader>ff` */
  leader: (tree: KeyTree, modes?: readonly Mode[], opts?: MapOptions) => Keymap[]
  /** any prefix tree: `keymap.tree("g", { d: [gotoDef, "Definition"] })` → `gd` */
  tree: (prefix: Keys, tree: KeyTree, modes?: readonly Mode[], opts?: MapOptions) => Keymap[]
  /** a mapper whose mappings are local to `buffer` (default: current) */
  buffer: (buffer?: number) => KeymapApi
  del: (modes: Mode | readonly Mode[], lhs: Keys, buffer?: number) => void
}

const makeApi = (extra: MapOptions): KeymapApi => {
  const bound = (modes: readonly Mode[]): ModeMapper => {
    const m = mapper(modes)
    if (Object.keys(extra).length === 0) return m
    const set = (lhs: Keys, action: Action, opts?: MapOpts) => install(modes, lhs, action, { ...extra, ...normalizeOpts(opts) })
    const many = (table: MapTable) => {
      const out: Keymap[] = []
      for (const lhs in table) {
        const [action, opts] = bindingParts(table[lhs]!)
        out.push(install(modes, lhs, action, { ...extra, ...opts }))
      }
      return out
    }
    return setmetatable({ modes, set, many } as unknown as ModeMapper, {
      __call: (lhs: Keys, action: Action, opts?: MapOpts) => set(lhs, action, opts),
    })
  }
  return {
    n: bound(["n"]),
    i: bound(["i"]),
    v: bound(["v"]),
    x: bound(["x"]),
    s: bound(["s"]),
    o: bound(["o"]),
    t: bound(["t"]),
    c: bound(["c"]),
    all: bound(ALL_MODES),
    nv: bound(["n", "v"]),
    ic: bound(["i", "c"]),
    modes: (m) => bound(m),
    leader: (tree, modes = ["n"], opts = {}) => {
      const out: Keymap[] = []
      walkTree(modes, "<leader>", tree, out, { ...extra, ...opts })
      return out
    },
    tree: (prefix, tree, modes = ["n"], opts = {}) => {
      const out: Keymap[] = []
      walkTree(modes, prefix, tree, out, { ...extra, ...opts })
      return out
    },
    buffer: (buffer = 0) => makeApi({ ...extra, buffer: buffer === 0 ? true : buffer }),
    del: (modes, lhs, buffer) =>
      vim.keymap.del(typeof modes === "string" ? modes : [...modes], lhs, buffer !== undefined ? { buffer } : {}),
  }
}

export const keymap: KeymapApi = makeApi({})
