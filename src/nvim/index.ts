// pureluanvim — a typed, composable Neovim configuration API for TypeScriptToLua.
//
// Everything is re-exported here so a config only needs `import { … } from "./nvim"`.

export { keymap, cmd, luaCmd, termcodes, feed } from "./keys"
export type { Keys, Chord, Mode, Action, Callback, MapOptions, MapOpts, MapTable, KeyTree, Keymap, ModeMapper, KeymapApi } from "./keys"

export { opt, optLocal, optList, opts, bufOpt, winOpt, globals } from "./options"
export type { Options, ListOption, ListOptionName, ListOps } from "./options"

export { on, once, augroup, emit, onUser } from "./events"
export type { Event, EventData, AutocmdArgs, Handler, AutocmdOptions, Disposable, Augroup, On, Pattern } from "./events"

export { command, ex, exOutput, normal } from "./command"
export type { Nargs, CommandArgs, CommandOptions, CommandHandler, Command, CompleteKind } from "./command"

export { hl, palette, mix } from "./highlight"
export type { Color, HexColor, NamedColor, HighlightStyle, HighlightTable } from "./highlight"

export { Buffer } from "./buffer"
export type { ScratchOptions } from "./buffer"

export { Window, Float, float, split } from "./window"
export type { Cursor, Border, FloatSpec, Size } from "./window"

export { lsp } from "./lsp"
export type { LspSetup, ServerConfig, ServerName, AttachContext } from "./lsp"

export { plugins, req, tryReq } from "./pack"
export type { Plugin, PluginSpec, Plugins } from "./pack"

export { notify, log, schedule, defer, every, debounce, throttle, sleep, sh, shSync, select, input, safely, hasExecutable, gitRoot, entries } from "./util"
export type { LogLevel, Timer, ShellResult, ShellOptions } from "./util"
