# pureluanvim

A Neovim configuration written in TypeScript, compiled to Lua with
[TypeScriptToLua](https://typescripttolua.github.io/), on top of a small typed API
layer (`src/nvim/`) that makes the common things pleasant and type-checked.

```sh
npm install      # once
./nvim.sh        # build + launch Neovim with this config (isolated from ~/.config/nvim)
npm run build    # just compile to dist/init.lua
npm run watch    # recompile on change
```

`nvim.sh` points `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` and
`XDG_CACHE_HOME` at `./.nvim/`, so plugins, shada and caches stay inside this
project and your global config is never touched. Requires Neovim 0.12+ (plugins
are managed by the built-in `vim.pack`).

## The API

Everything is exported from `./nvim`.

### Options – `opt`, `optLocal`, `optList`

```ts
opt.number = true                    // typed: boolean
opt.signcolumn = "yes"               // union of valid values
opt.clipboard = ["unnamedplus"]      // list options take arrays
optList("shortmess").append("I")     // += / ^= / -= on list and flag options
optLocal.shiftwidth = 2
```

### Keymaps – `keymap`

```ts
keymap.n("<C-s>", cmd("write"), "Save")               // desc as a bare string
keymap.v("J", ":m '>+1<CR>gv=gv", { silent: true })
keymap.modes(["n", "v"])("<leader>y", '"+y')
keymap.n.many({ "<S-h>": [cmd("bprevious"), "Prev buffer"], "<Esc>": cmd("nohlsearch") })
keymap.leader({                                        // nested tree → <leader>ff, <leader>fg …
  f: { f: [pickFiles, "Files"], g: [pickGrep, "Grep"] },
  q: [cmd("quit"), "Quit"],
})
keymap.buffer(bufnr).n("q", cmd("close"))              // buffer-local mapper
```

`Keys` gives completion for `<leader>`, `<C-…>`, `<F1>` … while accepting any string.

### Autocommands – `on`, `once`, `augroup`, `emit`/`onUser`

```ts
augroup("me.core", (on) => {
  on("TextYankPost", () => vim.highlight.on_yank())
  on("BufWritePre", "*.ts", (ev) => format(ev.buf))    // ev.buf, ev.match, ev.file, ev.data
  on("LspAttach", (ev) => ev.data.client_id)            // data is typed per event
})
```

### Commands – `command`, `ex`, `normal`

```ts
command("Rename", { nargs: "1", complete: "file" }, ({ fargs: [name] }) => …)  // fargs: [string]
command("Branch", async () => { const { lines } = await sh(["git", "branch", "--show-current"]) … })
ex`wincmd =`
```

### Highlights – `hl`, `palette`, `mix`

```ts
const colors = palette({ base: "#1e1e2e", blue: "#89b4fa" })
hl("Normal", { fg: colors.text, bg: colors.base })
hl.many({ Comment: { fg: colors.overlay, italic: true }, Todo: { link: "DiagnosticWarn" } })
```

### Buffers & windows – `Buffer`, `Window`, `float`

```ts
const buf = Buffer.scratch({ filetype: "markdown", lines: ["# notes"] })
buf.transform((l) => l.trimEnd())
buf.map.n("q", () => win.close())
buf.on("BufWriteCmd", save)
const win = float({ buffer: buf, title: " notes ", width: 0.6, height: 0.5, border: "rounded" })
win.cursor = { row: 1, col: 0 }
```

### LSP – `lsp.setup`

```ts
lsp.setup({
  servers: { lua_ls: {}, ts_ls: {}, rust_analyzer: { settings: {…} } },
  formatOnSave: true,
  onAttach: ({ map, supports }) => map.n("gd", vim.lsp.buf.definition, "Definition"),
})
```

### Plugins – `plugins`

```ts
plugins([
  "nvim-lua/plenary.nvim",
  { src: "stevearc/oil.nvim", setup: (oil) => oil.setup() },        // module auto-derived, run after add
  { src: "echasnovski/mini.pairs", module: "mini.pairs", setup: (m) => m.setup() },
])
```

### Async & utilities

`sh([...])` returns a promise (`await` works, TSTL compiles it to coroutines),
plus `notify`, `defer`, `every`, `debounce`, `throttle`, `sleep`, `select`,
`input`, `safely`.

## Layout

```
src/init.ts            the config itself
src/nvim/              the typed API layer
src/plugins/           custom "plugins" written in TS (scratchpad, git panel, statusline)
types/vim.d.ts         hand-written declarations for the Neovim Lua API subset used here
dist/init.lua          compiled bundle (generated)
```

## Notes on TypeScriptToLua

* No regular-expression literals: use Lua patterns via `string.gsub` / `string.match`.
* `noImplicitSelf` is on, so functions are plain Lua functions; interfaces that
  describe our own objects are `@noSelf`, class methods keep `self`.
* Arrays are 1-based on the Lua side but 0-based in TypeScript – TSTL handles it.
