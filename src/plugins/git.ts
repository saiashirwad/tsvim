import {
  action,
  component,
  editor,
  events,
  floating,
  keys,
  line,
  list,
  pipe,
  resource,
  serial,
  State,
  Task,
  text,
  type TaskValue,
} from "../nvim"
import { repository, type Repository, type Entry } from "./git-repository"
const colorOf = (entry: Entry): string =>
  entry.status.includes("?")
    ? "DiagnosticHint"
    : entry.status[0] !== " "
      ? "DiagnosticInfo"
      : "DiagnosticWarn"
const displayPath = (path: string): string =>
  path.split("\n").join("\\n").split("\r").join("\\r").split("\t").join("\\t")
export const gitPanel = (repo: Repository = repository()) =>
  component("git-status", () => {
    const status = resource(repo.status, {
      initial: [],
      refresh: events(["FocusGained", "DirChanged"]),
      concurrency: "latest",
    })
    const files = list(status.value, {
      name: "git-status",
      filetype: "gitstatus",
      key: (entry) => `${entry.root}/${entry.path}`,
      empty: line(text("Working tree clean", "Comment")),
      row: (entry) =>
        line(text(entry.status, colorOf(entry)), text(`  ${displayPath(entry.path)}`)),
    })
    const panel = floating(files, {
      title: "Git status",
      size: { width: 0.5, height: 0.4 },
      footer: "s stage · u unstage · Enter open · r refresh",
      caption: State.derive(() => {
        const state = status.state.get()
        return state.tag === "failed"
          ? "Git failed — press r to retry"
          : state.tag === "loading" || state.tag === "refreshing"
            ? "Loading…"
            : ""
      }),
    })
    const index = serial()
    const change = (label: string, write: (entry: Entry) => TaskValue<unknown>) =>
      action(
        label,
        files.withSelection((entry) => pipe(index(write(entry)), Task.andThen(status.refresh))),
      )
    const open = files.withSelection((entry) =>
      pipe(
        panel.close,
        Task.andThen(panel.inOrigin(editor.openFile(vim.fs.joinpath(entry.root, entry.path)))),
      ),
    )
    const refresh = action("Refresh", status.refresh)
    return [
      panel,
      files.bind(
        keys.normal({
          r: refresh,
          s: change("Stage file", repo.stage),
          u: change("Unstage file", repo.unstage),
          "<CR>": action("Open file", open),
          q: action("Close", panel.close),
          "<Esc>": action("Close", panel.close),
        }),
      ),
      keys.leader({ gg: action("Git status", panel.toggle) }),
    ]
  })
