// Entry point: the whole Neovim config, in TypeScript.
//
// Build + launch with ./nvim.sh (isolated from ~/.config/nvim).

import { augroup, cmd, command, ex, hl, keymap, lsp, notify, opt, optList, palette, plugins, sh, tryReq, Buffer } from "./nvim"
import { scratchpad } from "./plugins/scratchpad"
import { gitPanel } from "./plugins/git"
import { statusline } from "./plugins/statusline"

// ---------------------------------------------------------------- options

vim.g.mapleader = " "
vim.g.maplocalleader = ","

opt.number = true
opt.relativenumber = true
opt.signcolumn = "yes"
opt.cursorline = true
opt.termguicolors = true
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.wrap = false
opt.splitbelow = true
opt.splitright = true
opt.winborder = "rounded"
opt.laststatus = 3
opt.showmode = false
opt.cmdheight = 1
opt.pumheight = 12
opt.updatetime = 200
opt.timeoutlen = 400
opt.mouse = "a"
opt.clipboard = ["unnamedplus"]
opt.completeopt = ["menu", "menuone", "noselect", "fuzzy"]
opt.ignorecase = true
opt.smartcase = true
opt.inccommand = "split"
opt.expandtab = true
opt.shiftwidth = 2
opt.tabstop = 2
opt.smartindent = true
opt.undofile = true
opt.swapfile = false
opt.list = true
opt.listchars = ["tab:» ", "trail:·", "nbsp:␣"]
opt.fillchars = ["eob: ", "fold: "]
opt.foldmethod = "expr"
opt.foldexpr = "v:lua.vim.treesitter.foldexpr()"
opt.foldlevelstart = 99
optList("shortmess").append("I")

// ---------------------------------------------------------------- colors

const colors = palette({
  base: "#1e1e2e", mantle: "#181825", surface: "#313244", overlay: "#6c7086",
  text: "#cdd6f4", subtext: "#a6adc8", blue: "#89b4fa", lavender: "#b4befe",
  green: "#a6e3a1", yellow: "#f9e2af", peach: "#fab387", red: "#f38ba8", mauve: "#cba6f7", teal: "#94e2d5",
})

ex("colorscheme default")
opt.background = "dark"
hl.many({
  Normal: { fg: colors.text, bg: colors.base },
  NormalFloat: { fg: colors.text, bg: colors.mantle },
  FloatBorder: { fg: colors.lavender, bg: colors.mantle },
  FloatTitle: { fg: colors.mauve, bg: colors.mantle, bold: true },
  CursorLine: { bg: colors.surface },
  LineNr: { fg: colors.overlay },
  CursorLineNr: { fg: colors.lavender, bold: true },
  Comment: { fg: colors.overlay, italic: true },
  Visual: { bg: colors.surface },
  Search: { fg: colors.base, bg: colors.yellow },
  IncSearch: { fg: colors.base, bg: colors.peach },
  StatusLine: { fg: colors.subtext, bg: colors.mantle },
  StatusLineNC: { fg: colors.overlay, bg: colors.mantle },
  WinSeparator: { fg: colors.surface },
  Pmenu: { fg: colors.text, bg: colors.mantle },
  PmenuSel: { fg: colors.base, bg: colors.blue, bold: true },
  DiagnosticError: { fg: colors.red },
  DiagnosticWarn: { fg: colors.yellow },
  DiagnosticInfo: { fg: colors.blue },
  DiagnosticHint: { fg: colors.teal },
  Todo: { fg: colors.base, bg: colors.yellow, bold: true },
  YankFlash: { bg: colors.mauve, fg: colors.base },
})

// ---------------------------------------------------------------- plugins (vim.pack, Neovim 0.12+)

plugins([
  { src: "nvim-treesitter/nvim-treesitter", version: "main" },
  { src: "nvim-lua/plenary.nvim" },
  {
    src: "nvim-telescope/telescope.nvim",
    setup: (telescope) => telescope.setup({ defaults: { layout_strategy: "flex", sorting_strategy: "ascending", layout_config: { prompt_position: "top" } } }),
  },
  { src: "stevearc/oil.nvim", setup: (oil) => oil.setup({ view_options: { show_hidden: true } }) },
  { src: "lewis6991/gitsigns.nvim", setup: (gitsigns) => gitsigns.setup({ current_line_blame: true }) },
  { src: "folke/which-key.nvim", setup: (wk) => wk.setup({ preset: "helix" }) },
  { src: "echasnovski/mini.pairs", module: "mini.pairs", setup: (pairs) => pairs.setup() },
  { src: "echasnovski/mini.surround", module: "mini.surround", setup: (surround) => surround.setup() },
])

// treesitter (main branch API): install a few parsers and start highlighting
const ts = tryReq("nvim-treesitter")
if (ts) {
  const langs = ["lua", "typescript", "tsx", "javascript", "json", "markdown", "markdown_inline", "bash", "vim", "vimdoc", "query"]
  pcall(() => ts.install(langs))
  augroup("pureluanvim.treesitter", (on) => {
    on("FileType", (ev) => {
      const [ok] = pcall(() => vim.treesitter.start(ev.buf))
      if (ok) vim.wo[0]!.foldexpr = "v:lua.vim.treesitter.foldexpr()"
    })
  })
}

// ---------------------------------------------------------------- keymaps

const telescope = (picker: string) => cmd(`Telescope ${picker}`)

keymap.n.many({
  "<Esc>": [cmd("nohlsearch"), "Clear search highlight"],
  "<C-s>": [cmd("write"), "Save"],
  "<C-h>": [cmd("wincmd h"), "Window left"],
  "<C-j>": [cmd("wincmd j"), "Window down"],
  "<C-k>": [cmd("wincmd k"), "Window up"],
  "<C-l>": [cmd("wincmd l"), "Window right"],
  "<S-h>": [cmd("bprevious"), "Previous buffer"],
  "<S-l>": [cmd("bnext"), "Next buffer"],
  "-": [cmd("Oil"), "File explorer"],
  "n": ["nzzzv", "Next match (centered)"],
  "N": ["Nzzzv", "Previous match (centered)"],
  "<C-d>": ["<C-d>zz", "Half page down (centered)"],
  "<C-u>": ["<C-u>zz", "Half page up (centered)"],
  "[d": [() => vim.diagnostic.jump({ count: -1, float: true }), "Previous diagnostic"],
  "]d": [() => vim.diagnostic.jump({ count: 1, float: true }), "Next diagnostic"],
})

keymap.v.many({
  "<": ["<gv", "Dedent and reselect"],
  ">": [">gv", "Indent and reselect"],
  "J": [":m '>+1<CR>gv=gv", "Move selection down"],
  "K": [":m '<-2<CR>gv=gv", "Move selection up"],
})

keymap.i("jk", "<Esc>", "Leave insert mode")
keymap.t("<Esc><Esc>", "<C-\\><C-n>", "Leave terminal mode")

keymap.leader({
  f: {
    f: [telescope("find_files"), "Files"],
    g: [telescope("live_grep"), "Grep"],
    b: [telescope("buffers"), "Buffers"],
    h: [telescope("help_tags"), "Help"],
    r: [telescope("oldfiles"), "Recent"],
    s: [telescope("lsp_document_symbols"), "Symbols"],
  },
  g: {
    g: [gitPanel.toggle, "Git status panel"],
    b: [cmd("Gitsigns blame_line"), "Blame line"],
    p: [cmd("Gitsigns preview_hunk"), "Preview hunk"],
    "]": [cmd("Gitsigns next_hunk"), "Next hunk"],
    "[": [cmd("Gitsigns prev_hunk"), "Previous hunk"],
  },
  n: [scratchpad.toggle, "Scratchpad"],
  q: [cmd("quit"), "Quit window"],
  Q: [cmd("qall!"), "Quit all"],
  w: [cmd("write"), "Write"],
  e: [() => vim.diagnostic.open_float(), "Line diagnostics"],
  x: [cmd("bdelete"), "Close buffer"],
  t: [cmd("botright 12split | terminal"), "Terminal"],
  u: [() => notify("updating plugins…"), "Plugins (see :PluginsUpdate)"],
})

// ---------------------------------------------------------------- autocommands

augroup("pureluanvim.core", (on) => {
  on("TextYankPost", () => vim.highlight.on_yank({ higroup: "YankFlash", timeout: 120 }))

  on("BufWritePre", (ev) => {
    // trim trailing whitespace, keep the view
    const buf = Buffer.get(ev.buf)
    if (buf.opt.filetype === "markdown") return
    const view = vim.fn.winsaveview()
    buf.transform((line) => string.gsub(line, "%s+$", "")[0])
    vim.fn.winrestview(view)
  })

  on("BufReadPost", (ev) => {
    // jump to the last cursor position
    const [row] = vim.api.nvim_buf_get_mark(ev.buf, '"')
    if (row > 0 && row <= vim.api.nvim_buf_line_count(ev.buf)) pcall(() => vim.api.nvim_win_set_cursor(0, [row, 0]))
  })

  on(["FocusGained", "TermClose", "TermLeave"], () => ex("checktime"))
  on("VimResized", () => ex("wincmd ="))
  on("TermOpen", () => { vim.wo[0]!.number = false; vim.wo[0]!.relativenumber = false; ex("startinsert") })
  on("FileType", ["help", "qf", "man", "checkhealth"], (ev) => { keymap.buffer(ev.buf).n("q", cmd("close"), "Close") })
  on("FileType", ["markdown", "gitcommit", "text"], () => { vim.wo[0]!.wrap = true; vim.wo[0]!.spell = true })
})

// ---------------------------------------------------------------- commands

command("PluginsUpdate", () => vim.pack.update(), { desc: "Update all plugins" })

command("Rename", { nargs: "1", complete: "file" }, ({ fargs: [newName] }) => {
  const old = vim.fn.expand("%")
  ex(`saveas ${newName}`)
  vim.fn.delete(old)
  ex("bdelete #")
  notify(`renamed ${old} → ${newName}`)
})

command("Branch", async () => {
  const { ok, lines } = await sh(["git", "branch", "--show-current"])
  notify(ok ? `on branch ${lines[0] ?? "?"}` : "not a git repository", ok ? "info" : "warn")
})

command("ToggleInlayHints", () => lsp.toggleInlayHints(), { desc: "Toggle LSP inlay hints" })

// ---------------------------------------------------------------- lsp

lsp.setup({
  servers: {
    lua_ls: { settings: { Lua: { workspace: { checkThirdParty: false }, telemetry: { enable: false } } } },
    ts_ls: {},
    rust_analyzer: {},
    gopls: {},
    pyright: {},
  },
  diagnostics: { virtual_text: { spacing: 2, prefix: "●" }, severity_sort: true, float: { border: "rounded" } },
  formatOnSave: { timeout: 2000 },
  onAttach: ({ map, supports, buffer }) => {
    map.n.many({
      gd: [vim.lsp.buf.definition, "Definition"],
      gD: [vim.lsp.buf.declaration, "Declaration"],
      gr: [vim.lsp.buf.references, "References"],
      gi: [vim.lsp.buf.implementation, "Implementation"],
      K: [vim.lsp.buf.hover, "Hover"],
      "<leader>rn": [vim.lsp.buf.rename, "Rename symbol"],
      "<leader>ca": [vim.lsp.buf.code_action, "Code action"],
      "<leader>cf": [() => vim.lsp.buf.format({ bufnr: buffer }), "Format"],
    })
    map.i("<C-k>", vim.lsp.buf.signature_help, "Signature help")
    if (supports("textDocument/inlayHint")) vim.lsp.inlay_hint.enable(true, { bufnr: buffer })
  },
})

// ---------------------------------------------------------------- custom plugins written in TS

statusline.setup({ colors })
scratchpad.setup({ path: `${vim.fn.stdpath("data")}/scratchpad.md` })
