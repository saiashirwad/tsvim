import { action, component, editor, keys, picker, pipe, Task, text, line } from "../nvim"
import { quickfixItems, type Issue } from "./issues"
const openIssue = (entry: Issue) =>
  pipe(
    entry.path === ""
      ? editor.native((scope) => vim.api.nvim_win_set_buf(scope.window ?? 0, entry.buffer))
      : editor.openFile(entry.path),
    Task.andThen(editor.move({ line: entry.line, col: entry.col })),
  )
export const searches = () =>
  component("searches", () => {
    const lines = (all: boolean) =>
      Task.sync(() => {
        const ids = all
          ? vim.api
              .nvim_list_bufs()
              .filter(
                (id) =>
                  vim.api.nvim_buf_is_loaded(id) &&
                  vim.api.nvim_get_option_value("buflisted", { buf: id }),
              )
          : [vim.api.nvim_get_current_buf()]
        const entries: Issue[] = []
        for (const buffer of ids)
          vim.api
            .nvim_buf_get_lines(buffer, 0, -1, false)
            .forEach((text, row) =>
              entries.push({
                id: `${buffer}:${row}`,
                buffer,
                path: vim.api.nvim_buf_get_name(buffer),
                line: row,
                col: 0,
                message: text,
              }),
            )
        return entries
      })
    const createLocations = (title: string, source: Task.Task<readonly Issue[]>) =>
      picker({
        title,
        items: source,
        key: (item) => item.id,
        label: (item) =>
          `${vim.fn.fnamemodify(item.path, ":~:.")}:${item.line + 1}  ${item.message}`,
        accept: openIssue,
      })
    const currentLines = createLocations("Buffer lines", lines(false)),
      allLines = createLocations("Open buffer lines", lines(true)),
      quickfix = createLocations(
        "Quickfix",
        Task.sync(() => quickfixItems()),
      )
    const jumps = createLocations(
      "Jump list",
      Task.sync(() =>
        (vim.fn.getjumplist()[0] as LuaDict[])
          .filter((entry) => vim.api.nvim_buf_is_valid(entry.bufnr as number))
          .map((entry, index) => ({
            id: tostring(index),
            buffer: entry.bufnr as number,
            path: vim.api.nvim_buf_get_name(entry.bufnr as number),
            line: Math.max(0, (entry.lnum as number) - 1),
            col: entry.col as number,
            message: "",
          })),
      ),
    )
    const maps = picker({
      title: "Keymaps",
      items: Task.sync(() =>
        [...vim.api.nvim_get_keymap("n"), ...vim.api.nvim_buf_get_keymap(0, "n")].map(
          (map, index) => ({ ...map, index }) as LuaDict,
        ),
      ),
      key: (item) => tostring(item.index),
      label: (item) => `${item.lhs}  ${item.desc ?? item.rhs ?? ""}`,
      accept: (item) => keys.feed(item.lhs as string, true),
    })
    const groups = picker({
      title: "Highlights",
      items: Task.sync(() => vim.fn.getcompletion("", "highlight")),
      key: (group) => group,
      label: (group) => group,
      preview: (group) => Task.succeed([line(text(group, group))]),
      accept: (group) => editor.notify(vim.inspect(vim.api.nvim_get_hl(0, { name: group }))),
    })
    const commands = picker({
      title: "Command history",
      items: Task.sync(() =>
        Array.from({ length: Math.max(0, vim.fn.histnr(":")) }, (_, index) => ({
          index,
          value: vim.fn.histget(":", -(index + 1)),
        })).filter((entry) => entry.value !== ""),
      ),
      key: (entry) => tostring(entry.index),
      label: (entry) => entry.value,
      accept: (entry) => editor.ex(entry.value),
    })
    const history = picker({
      title: "Search history",
      items: Task.sync(() =>
        Array.from({ length: Math.max(0, vim.fn.histnr("/")) }, (_, index) => ({
          index,
          value: vim.fn.histget("/", -(index + 1)),
        })).filter((entry) => entry.value !== ""),
      ),
      key: (entry) => tostring(entry.index),
      label: (entry) => entry.value,
      accept: (entry) =>
        editor.native(() => {
          vim.fn.setreg("/", entry.value)
          vim.cmd("normal! n")
        }),
    })
    const registers = picker({
      title: "Registers",
      items: Task.sync(() =>
        '"0123456789abcdefghijklmnopqrstuvwxyz+-*/'
          .split("")
          .map((name) => ({ name, value: vim.fn.getreg(name) })),
      ),
      key: (entry) => entry.name,
      label: (entry) => `${entry.name}  ${entry.value}`,
      preview: (entry) => Task.succeed(entry.value.split("\n").map((value) => line(text(value)))),
      accept: (entry) =>
        editor.native(() => vim.cmd({ cmd: "normal", bang: true, args: [`"${entry.name}p`] })),
    })
    const autocmds = picker({
      title: "Autocommands",
      items: Task.sync(() =>
        vim.api.nvim_get_autocmds({}).map((entry, index) => ({ entry, index })),
      ),
      key: (item) => tostring(item.index),
      label: (item) =>
        `${item.entry.event} ${item.entry.pattern}  ${item.entry.desc ?? item.entry.command ?? ""}`,
      accept: (item) => editor.notify(vim.inspect(item.entry)),
    })
    const colors = picker({
      title: "Colorschemes",
      items: Task.sync(() => vim.fn.getcompletion("", "color")),
      key: (value) => value,
      label: (value) => value,
      accept: (name) => editor.native(() => vim.cmd({ cmd: "colorscheme", args: [name] })),
    })
    return [
      currentLines,
      allLines,
      quickfix,
      jumps,
      maps,
      groups,
      commands,
      history,
      registers,
      autocmds,
      colors,
      keys.leader({
        fl: action("Buffer lines", currentLines.open),
        fL: action("Open buffer lines", allLines.open),
        fq: action("Quickfix picker", quickfix.open),
        fj: action("Jumps", jumps.open),
        fk: action("Keymaps", maps.open),
        fH: action("Highlights", groups.open),
        ":": action("Command history", commands.open),
        "f/": action("Search history", history.open),
        'f"': action("Registers", registers.open),
        fa: action("Autocommands", autocmds.open),
        uC: action("Colorschemes", colors.open),
      }),
    ]
  })
