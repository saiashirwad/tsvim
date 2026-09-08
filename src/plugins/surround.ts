import {
  action,
  component,
  editor,
  keys,
  pipe,
  Task,
  Text,
  buffer,
  type Range,
  type Pos,
} from "../nvim"
import { operator, readKey } from "../nvim/input"
const pairs: Readonly<Record<string, readonly [string, string]>> = {
  "(": ["( ", " )"],
  ")": ["(", ")"],
  "[": ["[ ", " ]"],
  "]": ["[", "]"],
  "{": ["{ ", " }"],
  "}": ["{", "}"],
  "<": ["<", ">"],
  ">": ["<", ">"],
  b: ["(", ")"],
  B: ["{", "}"],
  '"': ['"', '"'],
  "'": ["'", "'"],
  "`": ["`", "`"],
}
export const offset = (lines: readonly string[], position: Pos): number =>
  lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0) + position.col
export const position = (lines: readonly string[], index: number): Pos => {
  for (let line = 0; line < lines.length; line++) {
    if (index <= lines[line]!.length) return Text.pos(line, index)
    index -= lines[line]!.length + 1
  }
  return Text.pos(Math.max(0, lines.length - 1), (lines[lines.length - 1] ?? "").length)
}
export const enclosing = (
  lines: readonly string[],
  cursor: Pos,
  key: string,
): readonly [Pos, Pos] | undefined => {
  const pair = pairs[key]
  if (!pair) return undefined
  const open = pair[0].trim(),
    close = pair[1].trim()
  const input = lines.join("\n"),
    at = offset(lines, cursor)
  const stack: number[] = []
  let best: readonly [number, number] | undefined
  let escaped = false
  let quote: string | undefined
  for (let i = 0; i < input.length; i++) {
    const ch = input.substring(i, i + 1)
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (open !== close && (ch === '"' || ch === "'" || ch === "`")) {
      if (quote === ch) quote = undefined
      else if (quote === undefined) quote = ch
      continue
    }
    if (quote !== undefined) continue
    if (ch === open && (open !== close || stack.length === 0)) stack.push(i)
    else if (ch === close && stack.length > 0) {
      const start = stack.pop()!
      if (start <= at && at <= i && (!best || i - start < best[1] - best[0])) best = [start, i]
    }
  }
  return best ? [position(lines, best[0]), position(lines, best[1])] : undefined
}
export const wrapEdits = (range: Range, key: string): readonly Text.Edit[] => {
  const pair = pairs[key]
  if (!pair) throw new Error(`Unknown surround: ${key}`)
  return [Text.insert(range.start, pair[0]), Text.insert(range.end, pair[1])]
}
const wrap = (range: Range) =>
  Task.defer(() => {
    const key = readKey("Surround with › ")
    return key === undefined ? Task.unit : buffer.edit(...wrapEdits(range, key))
  })
const change = (replace: boolean) =>
  Task.defer(() => {
    const key = readKey(replace ? "Change surround › " : "Delete surround › ")
    if (!key) return Task.unit
    const next = replace ? readKey("Replace with › ") : undefined
    if (replace && !next) return Task.unit
    return pipe(
      buffer.read,
      Task.flatMap((snapshot) =>
        pipe(
          editor.cursor,
          Task.flatMap((cursor) => {
            const found = enclosing(snapshot.lines, cursor, key)
            if (!found) return editor.notify("No enclosing pair", "info")
            const pair = next ? pairs[next] : ["", ""]
            if (!pair) return Task.fail(`Unknown surround: ${next}`)
            return buffer.edit(
              Text.replace(Text.span(found[0].line, found[0].col, found[0].col + 1), pair[0]!),
              Text.replace(Text.span(found[1].line, found[1].col, found[1].col + 1), pair[1]!),
            )
          }),
        ),
      ),
    )
  })
export const surround = () =>
  component("surround", () => [
    operator("Add surround", { ys: "", yss: "_" }, (range) => wrap(range)),
    keys.normal({
      ds: action("Delete surround", change(false)),
      cs: action("Change surround", change(true)),
    }),
    keys.in(["x"], {
      gS: action("Surround selection", pipe(editor.selection, Task.flatMap(wrap))),
    }),
  ])
