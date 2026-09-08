// Text positions, ranges and edits as plain immutable values.
//
// One convention, everywhere: 0-based lines, 0-based byte columns, ranges are
// end-exclusive. Neovim's 1-based cursors and inclusive marks are translated at
// the edge (in Window and Buffer), never in user code.
//
//   const r = lineRange(3)                  // the whole 4th line
//   const e = replace(r, "hello")           // an edit, not yet applied
//   buffer.edit(e, insert(pos(0, 0), "// ")) // a deferred editing task

export interface Pos {
  readonly line: number
  readonly col: number
}
export interface Range {
  readonly start: Pos
  readonly end: Pos
}
export interface Edit {
  readonly range: Range
  readonly text: readonly string[]
}

export const pos = (line: number, col = 0): Pos => ({ line, col })
export const range = (start: Pos, end: Pos): Range => ({ start, end })
/** `count` whole lines starting at `line` (end is the start of the following line). */
export const lineRange = (line: number, count = 1): Range =>
  range(pos(line, 0), pos(line + count, 0))
/** A byte span within one line. */
export const span = (line: number, colStart: number, colEnd: number): Range =>
  range(pos(line, colStart), pos(line, colEnd))
export const emptyRange = (at: Pos): Range => range(at, at)

export const comparePos = (a: Pos, b: Pos): number =>
  a.line !== b.line ? a.line - b.line : a.col - b.col
export const minPos = (a: Pos, b: Pos): Pos => (comparePos(a, b) <= 0 ? a : b)
export const maxPos = (a: Pos, b: Pos): Pos => (comparePos(a, b) >= 0 ? a : b)
export const isEmpty = (r: Range): boolean => comparePos(r.start, r.end) === 0
export const contains = (r: Range, p: Pos): boolean =>
  comparePos(r.start, p) <= 0 && comparePos(p, r.end) < 0
export const union = (a: Range, b: Range): Range =>
  range(minPos(a.start, b.start), maxPos(a.end, b.end))
/** Normalise so that start <= end. */
export const ordered = (r: Range): Range =>
  comparePos(r.start, r.end) <= 0 ? r : range(r.end, r.start)
/** Does the range cover whole lines only? */
export const isLinewise = (r: Range): boolean => r.start.col === 0 && r.end.col === 0

const toLines = (text: string | readonly string[]): readonly string[] =>
  typeof text === "string" ? text.split("\n") : text

/** Replace `range` with `text`. */
export const replace = (r: Range, text: string | readonly string[]): Edit => ({
  range: r,
  text: toLines(text),
})
/** Insert at a position. */
export const insert = (at: Pos, text: string | readonly string[]): Edit =>
  replace(emptyRange(at), text)
/** Delete a range. */
export const remove = (r: Range): Edit => replace(r, [""])
/** Replace one whole line's content (keeps the line). */
export const setLine = (line: number, text: string): Edit => replace(lineRange(line), [text, ""])
/** Insert whole lines before `line`. */
export const insertLines = (line: number, lines: readonly string[]): Edit =>
  replace(lineRange(line, 0), [...lines, ""])
/** Delete whole lines. */
export const removeLines = (line: number, count = 1): Edit => replace(lineRange(line, count), [""])

/** Whole lines in, whole lines out: range on line boundaries, text ends with an empty tail. */
export const isLinewiseEdit = (e: Edit): boolean =>
  isLinewise(e.range) && e.text[e.text.length - 1] === ""

/** Apply edits to an array of lines, purely. Edits must not overlap. */
export const applyEdits = (lines: readonly string[], edits: readonly Edit[]): string[] => {
  const out = [...lines]
  const normalized = edits.map((edit) => ({ ...edit, range: ordered(edit.range) }))
  const ascending = [...normalized].sort((a, b) => comparePos(a.range.start, b.range.start))
  let previous: Edit | undefined
  for (const edit of ascending) {
    for (const point of [edit.range.start, edit.range.end]) {
      const eof = isLinewiseEdit(edit) && point.line === lines.length && point.col === 0
      if (
        point.line < 0 ||
        point.col < 0 ||
        point.line !== Math.floor(point.line) ||
        point.col !== Math.floor(point.col) ||
        (!eof && (point.line >= lines.length || point.col > (lines[point.line] ?? "").length))
      )
        throw new Error("Edit is outside the text")
    }
    if (edit.text.length === 0) throw new Error("An edit needs at least one text fragment")
    if (
      previous &&
      (comparePos(previous.range.end, edit.range.start) > 0 ||
        comparePos(previous.range.start, edit.range.start) === 0)
    )
      throw new Error("Edits overlap")
    previous = edit
  }
  const sorted = [...ascending].reverse()
  for (const e of sorted) {
    const { start, end } = ordered(e.range)
    if (isLinewiseEdit(e)) {
      out.splice(start.line, end.line - start.line, ...e.text.slice(0, -1))
      continue
    }
    const head = (out[start.line] ?? "").substring(0, start.col)
    const tail = (out[end.line] ?? "").substring(end.col)
    const middle = [...e.text]
    middle[0] = head + (middle[0] ?? "")
    middle[middle.length - 1] = (middle[middle.length - 1] ?? "") + tail
    out.splice(start.line, end.line - start.line + 1, ...middle)
  }
  return out.length === 0 ? [""] : out
}

/** Every match of a Lua pattern in the lines, as ranges. */
export const findAll = (lines: readonly string[], pattern: string): Range[] => {
  const out: Range[] = []
  lines.forEach((text, line) => {
    let init = 1
    for (;;) {
      const [s, e] = string.find(text, pattern, init)
      if (s === undefined) break
      out.push(span(line, s - 1, e))
      init = e + 1 > s ? e + 1 : s + 1
    }
  })
  return out
}
