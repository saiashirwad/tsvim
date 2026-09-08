import {
  action,
  component,
  editor,
  floating,
  keys,
  line,
  list,
  pipe,
  State,
  Task,
  text,
} from "../nvim"
export const projectMarks = (storage = `${vim.fn.stdpath("data")}/neots-marks.json`) =>
  component("project-marks", () => {
    let projects: Record<string, string[]> = {}
    if (vim.fn.filereadable(storage) === 1) {
      const [ok, value] = pcall(() => vim.json.decode(vim.fn.readfile(storage).join("\n")))
      if (ok && typeof value === "object") projects = value as Record<string, string[]>
    }
    const root = () => vim.fs.root(0, ".git") ?? vim.fn.getcwd()
    let project = root()
    const entries = State.cell<readonly string[]>([])
    const save = () => {
      projects[project] = [...entries.get()]
      vim.fn.mkdir(vim.fs.dirname(storage), "p")
      if (vim.fn.writefile([vim.json.encode(projects)], storage) !== 0)
        throw new Error("Could not save marked files")
    }
    const sync = Task.sync(() => {
      project = root()
      entries.set(projects[project] ?? [])
    })
    const content = list(entries, {
      name: "marks",
      filetype: "neots-marks",
      key: (path) => path,
      row: (path) =>
        line(
          text(`${entries.get().indexOf(path) + 1}  `, "DiagnosticInfo"),
          text(vim.fn.fnamemodify(path, ":~:.")),
        ),
      empty: line(text("No marked files — press m in a file", "Comment")),
    })
    const panel = floating(content, {
      title: "Marked files",
      size: { width: 0.6, height: 0.4 },
      footer: "Enter open · d remove · J/K reorder · q close",
    })
    const open = content.withSelection((path) =>
      pipe(panel.close, Task.andThen(panel.inOrigin(editor.openFile(path)))),
    )
    const reorder = (delta: number) =>
      content.withSelection((path) =>
        Task.sync(() => {
          const values = [...entries.get()]
          const at = values.indexOf(path),
            to = Math.max(0, Math.min(values.length - 1, at + delta))
          values.splice(at, 1)
          values.splice(to, 0, path)
          entries.set(values)
          save()
        }),
      )
    const mark = Task.sync(() => {
      const path = vim.api.nvim_buf_get_name(0)
      if (path === "" || vim.bo.buftype !== "") return
      project = root()
      const values = projects[project] ?? []
      entries.set(values.includes(path) ? values : [...values, path])
      save()
    })
    return [
      panel,
      content.bind(
        keys.normal({
          "<CR>": action("Open mark", open),
          d: action(
            "Remove mark",
            content.withSelection((path) =>
              Task.sync(() => {
                entries.set(entries.get().filter((item) => item !== path))
                save()
              }),
            ),
          ),
          J: action("Move mark down", reorder(1)),
          K: action("Move mark up", reorder(-1)),
          q: action("Close marks", panel.close),
        }),
      ),
      keys.normal({
        m: action("Mark file", mark),
        M: action("Marked files", pipe(sync, Task.andThen(panel.toggle))),
      }),
    ]
  })
