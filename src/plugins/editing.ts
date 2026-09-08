import {
  action,
  component,
  editor,
  forBuffers,
  keys,
  native,
  options,
  pipe,
  Task,
  Text,
  buffer,
} from "../nvim"
import { operator } from "../nvim/input"
export const inferIndent = (
  lines: readonly string[],
): { readonly width: number; readonly tabs: boolean } | undefined => {
  let tabLines = 0,
    spaceLines = 0
  const widths: number[] = []
  let previous = 0
  for (const line of lines.slice(0, 500)) {
    if (line.trim() === "") continue
    if (line.startsWith("\t")) tabLines++
    const indent = string.match(line, "^( +)")[0]
    const width = (indent ?? "").length
    if (width > 0) spaceLines++
    const delta = Math.abs(width - previous)
    if (delta > 1 && delta <= 8) widths.push(delta)
    previous = width
  }
  if (tabLines > spaceLines) return { tabs: true, width: 4 }
  if (widths.length === 0) return undefined
  let best = 2,
    score = -1
  for (const candidate of [2, 3, 4, 8]) {
    const current =
      widths.filter((width) => width % candidate === 0).length +
      widths.filter((width) => width === candidate).length * 2
    if (current > score) {
      best = candidate
      score = current
    }
  }
  return { tabs: false, width: best }
}
export const guessIndent = () =>
  forBuffers(
    (id) =>
      vim.api.nvim_get_option_value("buftype", { buf: id }) === "" &&
      vim.api.nvim_buf_get_name(id) !== "",
    (id) => {
      const indent = inferIndent(vim.api.nvim_buf_get_lines(id, 0, 500, false))
      return (
        indent &&
        options({
          expandtab: !indent.tabs,
          shiftwidth: indent.width,
          tabstop: indent.width,
          softtabstop: indent.width,
        })
      )
    },
  )
export const toggleComments = (lines: readonly string[], template: string): readonly string[] => {
  const parts = template.split("%s")
  if (parts.length !== 2) throw new Error("No comment syntax for this filetype")
  const left = parts[0]!.trimEnd(),
    right = parts[1]!.trimStart()
  if (left === "") throw new Error("Empty comment prefix")
  const nonempty = lines.filter((line) => line.trim() !== "")
  const commented =
    nonempty.length > 0 &&
    nonempty.every(
      (line) =>
        line.trimStart().startsWith(left) && (right === "" || line.trimEnd().endsWith(right)),
    )
  const minIndent = nonempty.reduce(
    (width, line) => Math.min(width, line.length - line.trimStart().length),
    Infinity,
  )
  return lines.map((line) => {
    if (line.trim() === "") return line
    if (commented) {
      const indent = line.substring(0, line.length - line.trimStart().length)
      let value = line.trimStart().substring(left.length)
      if (value.startsWith(" ")) value = value.substring(1)
      if (right !== "") {
        value = value.trimEnd().slice(0, -right.length)
        if (value.endsWith(" ")) value = value.slice(0, -1)
      }
      return indent + value
    }
    return (
      line.substring(0, minIndent) +
      left +
      " " +
      line.substring(minIndent) +
      (right === "" ? "" : " " + right)
    )
  })
}
const comment = (first: number, last: number) =>
  pipe(
    buffer.read,
    Task.flatMap((snapshot) => {
      let template = vim.api.nvim_get_option_value("commentstring", { buf: snapshot.id }) as string
      const [ok, language] = pcall(() =>
        vim.treesitter.get_parser(snapshot.id).language_for_range([first, 0, last, 0]).lang(),
      )
      if (ok)
        template =
          (
            {
              javascript: "// %s",
              typescript: "// %s",
              tsx: "// %s",
              css: "/* %s */",
              html: "<!-- %s -->",
              lua: "-- %s",
              python: "# %s",
              bash: "# %s",
              sql: "-- %s",
            } as Record<string, string>
          )[language as string] ?? template
      const changed = toggleComments(snapshot.lines.slice(first, last + 1), template)
      return buffer.edit(...changed.map((line, i) => Text.setLine(first + i, line)))
    }),
  )
export const comments = () =>
  component("comments", () => [
    operator("Toggle comment", { gc: "", gcc: "_" }, (range) =>
      comment(range.start.line, range.end.line),
    ),
    keys.normal({
      "<leader>/": action(
        "Comment line",
        pipe(
          editor.cursor,
          Task.flatMap((cursor) => comment(cursor.line, cursor.line)),
        ),
      ),
    }),
    keys.in(["x"], {
      "<leader>/": action(
        "Comment selection",
        pipe(
          editor.selection,
          Task.flatMap((range) =>
            comment(
              range.start.line,
              Math.max(range.start.line, range.end.line - (range.end.col === 0 ? 1 : 0)),
            ),
          ),
        ),
      ),
      gc: action(
        "Comment selection",
        pipe(
          editor.selection,
          Task.flatMap((range) =>
            comment(
              range.start.line,
              Math.max(range.start.line, range.end.line - (range.end.col === 0 ? 1 : 0)),
            ),
          ),
        ),
      ),
    }),
  ])
/** Native Neovim 0.12 supplies incremental syntax-node selection. */
export const nodeSelection = () => [
  keys.normal({
    "<CR>": action("Select syntax node", keys.feed("van", true)),
    "<BS>": action("Select inner syntax node", keys.feed("vin", true)),
  }),
  keys.in(["x"], {
    "<CR>": action("Expand syntax selection", keys.feed("an", true)),
    "<BS>": action("Shrink syntax selection", keys.feed("in", true)),
  }),
]
export const bigFiles = (bytes = 1_000_000) =>
  forBuffers(
    (id) => {
      const name = vim.api.nvim_buf_get_name(id)
      return name !== "" && ((vim.uv.fs_stat(name)?.size as number) ?? 0) > bytes
    },
    (id) => [
      options({ syntax: "", foldmethod: "manual", undolevels: 100 }),
      native(() => {
        pcall(() => vim.treesitter.stop(id))
      }),
    ],
  )
