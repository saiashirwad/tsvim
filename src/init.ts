import { searches } from "./plugins/searches"
import { workspace } from "./plugins/workspace"
import { selectionUI, notifications } from "./plugins/ui"
import { quickfix } from "./plugins/quickfix"
import { issues } from "./plugins/issues"
import { completion } from "./plugins/completion"
import { shellLint } from "./plugins/lint"
import { formatting } from "./plugins/formatting"
import { explorer } from "./plugins/explorer"
import { projectMarks } from "./plugins/marks"
import { guessIndent, comments, nodeSelection, bigFiles } from "./plugins/editing"
import { autoPairs } from "./plugins/pairs"
import { surround } from "./plugins/surround"
import { flash } from "./plugins/flash"
import {
  action,
  add,
  command,
  component,
  diagnostics,
  editing,
  editor,
  filetypes,
  forBuffers,
  highlights,
  keys,
  language,
  leaders,
  native,
  on,
  options,
  packages,
  palette,
  pipe,
  plugin,
  reload,
  run,
  search,
  syntax,
  Task,
  updatePackages,
  when,
  exec,
} from "./nvim"
import * as nv from "./nvim"
import { statusline } from "./plugins/statusline"
import { gitPanel } from "./plugins/git"
import { pickers } from "./plugins/pickers"

const colors = palette({
  base: "#1e1e2e",
  mantle: "#181825",
  surface: "#313244",
  overlay: "#6c7086",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  blue: "#89b4fa",
  lavender: "#b4befe",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  peach: "#fab387",
  red: "#f38ba8",
  mauve: "#cba6f7",
  teal: "#94e2d5",
})

const ex = (label: string, command: string) => action(label, editor.ex(command))
const feed = (label: string, notation: string) => action(label, keys.feed(notation))

run(
  component("personal-config", () => [
    native((scope) => {
      const previous = (_G as LuaDict).nv
      ;(_G as LuaDict).nv = nv
      scope.own(() => {
        ;(_G as LuaDict).nv = previous
      })
    }),
    leaders(" ", ","),
    editing.indent(2),
    search({ case: "smart", preview: true }),
    editing.trimWhitespace({ except: ["markdown"] }),
    editing.rememberPosition(),
    editing.highlightYank("YankFlash"),
    options({
      number: true,
      relativenumber: true,
      signcolumn: "yes",
      cursorline: true,
      termguicolors: true,
      scrolloff: 8,
      sidescrolloff: 8,
      wrap: false,
      splitbelow: true,
      splitright: true,
      winborder: "rounded",
      laststatus: 3,
      showmode: false,
      cmdheight: 1,
      pumheight: 12,
      updatetime: 200,
      timeoutlen: 400,
      mouse: "a",
      clipboard: ["unnamedplus"],
      completeopt: ["menu", "menuone", "noselect", "fuzzy"],
      undofile: true,
      swapfile: false,
      list: true,
      listchars: ["tab:» ", "trail:·", "nbsp:␣"],
      fillchars: ["eob: ", "fold: "],
      foldmethod: "expr",
      foldexpr: "v:lua.vim.treesitter.foldexpr()",
      foldlevelstart: 99,
      shortmess: add("I"),
      background: "dark",
    }),

    highlights({
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
      YankFlash: { fg: colors.base, bg: colors.mauve },
    }),

    packages([
      plugin("neovim/nvim-lspconfig"),
      plugin({ src: "nvim-treesitter/nvim-treesitter", version: "main" }),
      plugin("lewis6991/gitsigns.nvim", { current_line_blame: true }),
    ]),

    syntax(),
    keys.normal({
      "<Esc>": ex("Clear search", "nohlsearch"),
      "<C-s>": action("Save", editor.save),
      "<C-h>": ex("Window left", "wincmd h"),
      "<C-j>": ex("Window down", "wincmd j"),
      "<C-k>": ex("Window up", "wincmd k"),
      "<C-l>": ex("Window right", "wincmd l"),
      "<S-h>": ex("Previous buffer", "bprevious"),
      "<S-l>": ex("Next buffer", "bnext"),
      "-": ex("File explorer", "Oil"),
      n: feed("Next match, centered", "nzzzv"),
      N: feed("Previous match, centered", "Nzzzv"),
      "<C-d>": feed("Half page down, centered", "<C-d>zz"),
      "<C-u>": feed("Half page up, centered", "<C-u>zz"),
      "[d": action("Previous diagnostic", diagnostics.previous),
      "]d": action("Next diagnostic", diagnostics.next),
    }),
    keys.visual({
      "<": feed("Dedent selection", "<gv"),
      ">": feed("Indent selection", ">gv"),
      J: feed("Move selection down", ":m '>+1<CR>gv=gv"),
      K: feed("Move selection up", ":m '<-2<CR>gv=gv"),
    }),
    keys.insert({ jk: feed("Leave insert mode", "<Esc>") }),
    keys.terminal({ "<Esc><Esc>": feed("Leave terminal mode", "<C-\\><C-n>") }),
    keys.leader({
      g: {
        b: ex("Blame line", "Gitsigns blame_line"),
        p: ex("Preview hunk", "Gitsigns preview_hunk"),
        "]": ex("Next hunk", "Gitsigns next_hunk"),
        "[": ex("Previous hunk", "Gitsigns prev_hunk"),
      },
      q: ex("Quit window", "quit"),
      Q: ex("Quit all", "qall!"),
      w: action("Write", editor.save),
      e: action("Line diagnostics", diagnostics.show),
      x: ex("Close buffer", "bdelete"),
      t: ex("Terminal", "botright 12split | terminal"),
      r: action("Reload config", reload),
    }),
    on(["FocusGained", "TermClose", "TermLeave"], editor.ex("checktime")),
    on("VimResized", editor.ex("wincmd =")),
    on("TermOpen", editor.ex("startinsert")),
    forBuffers(
      (id) => vim.api.nvim_get_option_value("buftype", { buf: id }) === "terminal",
      () => options({ number: false, relativenumber: false }),
    ),
    filetypes(
      ["help", "qf", "man", "checkhealth"],
      keys.normal({ q: action("Close", editor.close) }),
    ),
    filetypes(["markdown", "gitcommit", "text"], options({ wrap: true, spell: true })),

    command("PluginsUpdate", action("Update packages", updatePackages)),
    command("Reload", action("Reload config", reload)),
    command("ToggleInlayHints", action("Toggle inlay hints", language.toggleInlayHints)),
    command(
      "Sha",
      action(
        "Show commit",
        pipe(
          exec(["git", "rev-parse", "--short", "HEAD"]),
          Task.flatMap((output) => editor.notify(output.trim())),
        ),
      ),
    ),
    command("Rename", { nargs: 1, complete: "file" }, ({ fargs: [path] }) =>
      editor.native(() => {
        const old = vim.api.nvim_buf_get_name(0)
        vim.cmd({ cmd: "saveas", args: [path] })
        if (old && old !== vim.api.nvim_buf_get_name(0) && vim.fn.delete(old) !== 0)
          throw new Error(`Saved new file, but could not remove ${old}`)
      }),
    ),

    language.servers({
      lua_ls: {
        settings: { Lua: { workspace: { checkThirdParty: false }, telemetry: { enable: false } } },
      },
      ts_ls: {},
      rust_analyzer: {},
      gopls: {},
      pyright: {},
    }),
    language.attached(({ supports }) => [
      keys.normal({
        gd: action("Definition", language.definition),
        gD: action("Declaration", language.declaration),
        gr: action("References", language.references),
        gi: action("Implementation", language.implementation),
        K: action("Hover", language.hover),
        "<leader>rn": action("Rename symbol", language.rename),
        "<leader>ca": action("Code action", language.codeAction),
        "<leader>cf": action("Format", language.format()),
      }),
      keys.insert({ "<C-k>": action("Signature help", language.signature) }),
      when(supports("textDocument/inlayHint"), language.inlayHints()),
    ]),
    flash(),
    surround(),
    comments(),
    guessIndent(),
    nodeSelection(),
    completion(),
    autoPairs(),
    formatting(),
    shellLint(),
    explorer(),
    projectMarks(),
    issues(),
    quickfix(),
    workspace(),
    searches(),
    bigFiles(),
    selectionUI(),
    pickers(),
    gitPanel(),
    statusline(colors),
    notifications(),
  ]),
)
