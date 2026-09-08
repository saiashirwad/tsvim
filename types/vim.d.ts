// Hand-written declarations for the parts of Neovim's Lua API this config uses.
// Everything is `@noSelf`: Neovim functions are plain Lua functions.

/** A Lua table used as a dictionary */
type LuaDict<V = unknown> = Record<string, V>

/** @noSelf */
declare namespace vim {
  const NIL: unknown

  // ---------------------------------------------------------------- api
  /** @noSelf */
  namespace api {
    // buffers
    function nvim_get_current_buf(): number
    function nvim_set_current_buf(buf: number): void
    function nvim_create_buf(listed: boolean, scratch: boolean): number
    function nvim_buf_is_valid(buf: number): boolean
    function nvim_buf_is_loaded(buf: number): boolean
    function nvim_buf_delete(buf: number, opts: { force?: boolean; unload?: boolean }): void
    function nvim_buf_get_lines(buf: number, start: number, end_: number, strict: boolean): string[]
    function nvim_buf_set_lines(buf: number, start: number, end_: number, strict: boolean, lines: string[]): void
    function nvim_buf_get_text(buf: number, sr: number, sc: number, er: number, ec: number, opts: {}): string[]
    function nvim_buf_set_text(buf: number, sr: number, sc: number, er: number, ec: number, lines: string[]): void
    function nvim_buf_line_count(buf: number): number
    function nvim_buf_get_name(buf: number): string
    function nvim_buf_set_name(buf: number, name: string): void
    function nvim_buf_get_var(buf: number, name: string): unknown
    function nvim_buf_set_var(buf: number, name: string, value: unknown): void
    function nvim_buf_set_keymap(buf: number, mode: string, lhs: string, rhs: string, opts: LuaDict): void
    function nvim_buf_del_keymap(buf: number, mode: string, lhs: string): void
    function nvim_buf_attach(buf: number, send_buffer: boolean, opts: LuaDict): boolean
    function nvim_buf_call<T>(buf: number, fn: () => T): T
    function nvim_buf_set_extmark(buf: number, ns: number, line: number, col: number, opts: LuaDict): number
    function nvim_buf_clear_namespace(buf: number, ns: number, start: number, end_: number): void
    function nvim_buf_add_highlight(buf: number, ns: number, group: string, line: number, cs: number, ce: number): number
    function nvim_list_bufs(): number[]
    function nvim_buf_get_mark(buf: number, name: string): [number, number]
    function nvim_buf_set_mark(buf: number, name: string, line: number, col: number, opts: {}): boolean

    // windows
    function nvim_get_current_win(): number
    function nvim_set_current_win(win: number): void
    function nvim_win_is_valid(win: number): boolean
    function nvim_win_close(win: number, force: boolean): void
    function nvim_win_hide(win: number): void
    function nvim_win_get_buf(win: number): number
    function nvim_win_set_buf(win: number, buf: number): void
    function nvim_win_get_cursor(win: number): LuaMultiReturn<[number, number]> & [number, number]
    function nvim_win_set_cursor(win: number, pos: [number, number]): void
    function nvim_win_get_height(win: number): number
    function nvim_win_set_height(win: number, h: number): void
    function nvim_win_get_width(win: number): number
    function nvim_win_set_width(win: number, w: number): void
    function nvim_win_get_config(win: number): LuaDict
    function nvim_win_set_config(win: number, config: LuaDict): void
    function nvim_win_call<T>(win: number, fn: () => T): T
    function nvim_open_win(buf: number, enter: boolean, config: LuaDict): number
    function nvim_list_wins(): number[]
    function nvim_tabpage_list_wins(tab: number): number[]
    function nvim_get_current_tabpage(): number

    // options / vars
    function nvim_get_option_value(name: string, opts: { buf?: number; win?: number; scope?: "global" | "local" }): unknown
    function nvim_set_option_value(name: string, value: unknown, opts: { buf?: number; win?: number; scope?: "global" | "local" }): void
    function nvim_get_var(name: string): unknown
    function nvim_set_var(name: string, value: unknown): void

    // keymaps / commands / autocmds
    function nvim_set_keymap(mode: string, lhs: string, rhs: string, opts: LuaDict): void
    function nvim_del_keymap(mode: string, lhs: string): void
    function nvim_create_user_command(name: string, command: string | ((opts: LuaDict) => void), opts: LuaDict): void
    function nvim_del_user_command(name: string): void
    function nvim_buf_create_user_command(buf: number, name: string, command: string | ((opts: LuaDict) => void), opts: LuaDict): void
    function nvim_create_augroup(name: string, opts: { clear?: boolean }): number
    function nvim_del_augroup_by_id(id: number): void
    function nvim_del_augroup_by_name(name: string): void
    function nvim_create_autocmd(event: string | string[], opts: LuaDict): number
    function nvim_del_autocmd(id: number): void
    function nvim_clear_autocmds(opts: LuaDict): void
    function nvim_exec_autocmds(event: string | string[], opts: LuaDict): void

    // misc
    function nvim_set_hl(ns: number, name: string, val: LuaDict): void
    function nvim_get_hl(ns: number, opts: { name?: string; link?: boolean }): LuaDict
    function nvim_create_namespace(name: string): number
    function nvim_echo(chunks: Array<[string] | [string, string]>, history: boolean, opts: LuaDict): void
    function nvim_err_writeln(msg: string): void
    function nvim_feedkeys(keys: string, mode: string, escape_ks: boolean): void
    function nvim_input(keys: string): number
    function nvim_replace_termcodes(str: string, from_part: boolean, do_lt: boolean, special: boolean): string
    function nvim_get_mode(): { mode: string; blocking: boolean }
    function nvim_exec2(src: string, opts: { output?: boolean }): { output?: string }
    function nvim_command(cmd: string): void
    function nvim_get_runtime_file(name: string, all: boolean): string[]
    function nvim_list_runtime_paths(): string[]
    function nvim_strwidth(text: string): number
    function nvim_open_term(buf: number, opts: LuaDict): number
    function nvim_chan_send(chan: number, data: string): void
  }

  // ---------------------------------------------------------------- fn (vimscript functions)
  /** @noSelf */
  interface Fn {
    expand(expr: string, nosuf?: boolean, list?: boolean): string
    fnamemodify(fname: string, mods: string): string
    getcwd(): string
    line(expr: string): number
    col(expr: string): number
    mode(): string
    has(feature: string): 0 | 1
    exists(expr: string): 0 | 1
    executable(name: string): 0 | 1
    stdpath(what: "config" | "data" | "cache" | "state" | "log" | "run"): string
    getreg(reg: string): string
    setreg(reg: string, value: string): void
    input(prompt: string, def?: string, completion?: string): string
    confirm(msg: string, choices?: string, def?: number): number
    winsaveview(): LuaDict
    winrestview(view: LuaDict): void
    bufnr(expr?: string): number
    bufname(expr?: string | number): string
    getline(lnum: number | string, end_?: number | string): string
    setline(lnum: number | string, text: string | string[]): number
    cursor(lnum: number, col: number): number
    search(pattern: string, flags?: string): number
    getpos(expr: string): [number, number, number, number]
    setpos(expr: string, pos: [number, number, number, number]): number
    visualmode(): string
    filereadable(path: string): 0 | 1
    isdirectory(path: string): 0 | 1
    mkdir(path: string, flags?: string): number
    readfile(path: string): string[]
    writefile(lines: string[], path: string, flags?: string): number
    delete(path: string, flags?: string): number
    systemlist(cmd: string | string[]): string[]
    system(cmd: string | string[]): string
    jobstart(cmd: string | string[], opts: LuaDict): number
    termopen(cmd: string | string[], opts?: LuaDict): number
    strftime(format: string, time?: number): string
    localtime(): number
    reltime(): number[]
    reltimefloat(t: number[]): number
    escape(str: string, chars: string): string
    shellescape(str: string, special?: boolean): string
    tolower(str: string): string
    toupper(str: string): string
    trim(str: string): string
    printf(fmt: string, ...args: unknown[]): string
    getcompletion(pat: string, type: string): string[]
    indent(lnum: number): number
    foldclosed(lnum: number): number
    screenpos(win: number, lnum: number, col: number): { row: number; col: number }
    wordcount(): { words: number; chars: number; bytes: number }
  }
  const fn: Fn

  // ---------------------------------------------------------------- options & variables
  const o: LuaDict<string | number | boolean>
  const go: LuaDict<string | number | boolean>
  const bo: LuaDict<string | number | boolean> & Record<number, LuaDict<string | number | boolean>>
  const wo: LuaDict<string | number | boolean> & Record<number, LuaDict<string | number | boolean>>
  const g: LuaDict
  const b: LuaDict & Record<number, LuaDict>
  const w: LuaDict & Record<number, LuaDict>
  const env: LuaDict<string>
  const v: LuaDict

  interface OptionObject {
    get(): unknown
    append(v: string | string[]): void
    prepend(v: string | string[]): void
    remove(v: string | string[]): void
  }
  const opt: LuaDict<OptionObject>
  const opt_local: LuaDict<OptionObject>
  const opt_global: LuaDict<OptionObject>

  // ---------------------------------------------------------------- misc runtime
  /** @noSelf */
  interface CmdApi {
    (command: string | LuaDict): void
    [name: string]: (args?: string | string[] | LuaDict) => void
  }
  const cmd: CmdApi
  function notify(msg: string, level?: number, opts?: LuaDict): void
  function notify_once(msg: string, level?: number, opts?: LuaDict): void
  function schedule(fn: () => void): void
  function schedule_wrap<F extends (...args: any[]) => any>(fn: F): F
  function defer_fn(fn: () => void, ms: number): unknown
  function inspect(v: unknown, opts?: LuaDict): string
  function print(...args: unknown[]): void
  function split(s: string, sep: string, opts?: { plain?: boolean; trimempty?: boolean }): string[]
  function trim(s: string): string
  function startswith(s: string, prefix: string): boolean
  function endswith(s: string, suffix: string): boolean
  function pesc(s: string): string
  function tbl_extend(behavior: "error" | "keep" | "force", ...tables: LuaDict[]): LuaDict
  function tbl_deep_extend(behavior: "error" | "keep" | "force", ...tables: LuaDict[]): LuaDict
  function tbl_keys(t: LuaDict): string[]
  function tbl_values<V>(t: LuaDict<V>): V[]
  function tbl_contains(t: unknown[], v: unknown): boolean
  function tbl_isempty(t: object): boolean
  function tbl_count(t: object): number
  function list_extend<T>(dst: T[], src: T[]): T[]
  function deepcopy<T>(t: T): T
  function keycode(s: string): string
  function wait(ms: number, cond?: () => boolean, interval?: number): boolean
  function system(cmd: string[], opts?: LuaDict, on_exit?: (out: SystemCompleted) => void): SystemObj
  interface SystemCompleted { code: number; signal: number; stdout?: string; stderr?: string }
  interface SystemObj { wait(timeout?: number): SystemCompleted; kill(sig: number): void }
  function paste(lines: string[], phase: number): boolean
  function on_key(fn: ((key: string, typed: string) => void) | undefined, ns?: number): number
  function region(buf: number, pos1: unknown, pos2: unknown, regtype: string, inclusive: boolean): LuaDict

  /** @noSelf */
  namespace log {
    const levels: { TRACE: 0; DEBUG: 1; INFO: 2; WARN: 3; ERROR: 4; OFF: 5 }
  }

  /** @noSelf */
  namespace keymap {
    function set(mode: string | string[], lhs: string, rhs: string | ((this: void) => unknown), opts?: LuaDict): void
    function del(mode: string | string[], lhs: string, opts?: LuaDict): void
  }

  /** @noSelf */
  namespace fs {
    function normalize(path: string): string
    function basename(path: string): string
    function dirname(path: string): string
    function joinpath(...parts: string[]): string
    function find(names: string | string[], opts: LuaDict): string[]
    function root(source: number | string, marker: string | string[]): string | undefined
    function dir(path: string): LuaIterable<LuaMultiReturn<[string, string]>>
  }

  /** @noSelf */
  namespace ui {
    function select<T>(items: T[], opts: { prompt?: string; format_item?: (item: T) => string; kind?: string }, on_choice: (item: T | undefined, idx: number | undefined) => void): void
    function input(opts: { prompt?: string; default?: string; completion?: string }, on_confirm: (input: string | undefined) => void): void
    function open(path: string): void
  }

  /** @noSelf */
  namespace uv {
    function hrtime(): number
    function now(): number
    function new_timer(): UvTimer
    function fs_stat(path: string): LuaDict | undefined
    function cwd(): string
    function os_homedir(): string
  }
  interface UvTimer {
    start(timeout: number, repeat: number, cb: () => void): void
    stop(): void
    close(): void
    is_closing(): boolean
  }

  /** @noSelf */
  namespace lsp {
    function enable(name: string | string[], enable?: boolean): void
    function config(name: string, cfg: LuaDict): void
    function get_client_by_id(id: number): LspClient | undefined
    function get_clients(filter?: { bufnr?: number; name?: string; id?: number }): LspClient[]
    /** @noSelf */
    namespace buf {
      function hover(): void
      function definition(): void
      function declaration(): void
      function references(): void
      function implementation(): void
      function type_definition(): void
      function rename(new_name?: string): void
      function code_action(opts?: LuaDict): void
      function format(opts?: LuaDict): void
      function signature_help(): void
      function document_symbol(): void
      function workspace_symbol(query?: string): void
    }
    /** @noSelf */
    namespace inlay_hint {
      function enable(enable?: boolean, filter?: { bufnr?: number }): void
      function is_enabled(filter?: { bufnr?: number }): boolean
    }
    /** @noSelf */
    namespace codelens { function refresh(): void }
  }
  interface LspClient {
    id: number
    name: string
    server_capabilities: LuaDict
    supports_method(method: string, opts?: { bufnr?: number }): boolean
  }

  /** @noSelf */
  namespace diagnostic {
    function config(opts: LuaDict): void
    function open_float(opts?: LuaDict): void
    function setloclist(opts?: LuaDict): void
    function setqflist(opts?: LuaDict): void
    function get(buf?: number, opts?: LuaDict): LuaDict[]
    function count(buf?: number, opts?: LuaDict): LuaDict<number>
    function goto_next(opts?: LuaDict): void
    function goto_prev(opts?: LuaDict): void
    function jump(opts: { count: number; float?: boolean; severity?: number }): void
    const severity: { ERROR: 1; WARN: 2; INFO: 3; HINT: 4 }
  }

  /** @noSelf */
  namespace pack {
    interface Spec { src: string; name?: string; version?: string; data?: unknown }
    function add(specs: Array<string | Spec>, opts?: { confirm?: boolean; load?: boolean | ((data: { spec: Spec; path: string }) => void) }): void
    function update(names?: string[], opts?: { force?: boolean }): void
    function del(names: string[], opts?: { force?: boolean }): void
    function get(names?: string[], opts?: { info?: boolean }): Array<{ active: boolean; path: string; rev: string; spec: Spec }>
  }

  /** @noSelf */
  namespace treesitter {
    function start(buf?: number, lang?: string): void
    function stop(buf?: number): void
    function get_parser(buf?: number, lang?: string): unknown
  }

  /** @noSelf */
  namespace json {
    function encode(v: unknown): string
    function decode(s: string): unknown
  }

  /** @noSelf */
  namespace highlight {
    function on_yank(opts?: { higroup?: string; timeout?: number; on_visual?: boolean }): void
  }

  /** @noSelf */
  namespace loop {
    function hrtime(): number
  }
}

/** Lua's `unpack` (LuaJIT / 5.1) */
declare function unpack<T extends unknown[]>(t: T): LuaMultiReturn<T>
