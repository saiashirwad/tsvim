import {
  action,
  component,
  floating,
  keys,
  line,
  native,
  picker,
  State,
  Task,
  text,
  view,
} from "../nvim"
import { mount } from "../nvim/spec"
/** Adapt native selection dialogs to the same general-purpose picker. */
export const selectionUI = () =>
  native((scope) => {
    const previous = vim.ui.select
    vim.ui.select = <A>(
      items: A[],
      options: { prompt?: string; format_item?: (item: A) => string },
      receive: (item: A | undefined, index: number | undefined) => void,
    ) => {
      const owner = scope.child("select-dialog")
      let settled = false
      owner.own(() => {
        if (!settled) {
          settled = true
          receive(undefined, undefined)
        }
      })
      const entries = items.map((item, index) => ({ item, index }))
      const menu = picker({
        title: options.prompt ?? "Select",
        items: entries,
        key: (entry) => tostring(entry.index),
        label: (entry) =>
          options.format_item ? options.format_item(entry.item) : tostring(entry.item),
        accept: (entry) =>
          Task.sync(() => {
            settled = true
            receive(entry.item, entry.index + 1)
            owner.close()
          }),
      })
      mount(menu, owner)
      owner.own(
        menu.closed.subscribe((accepted) => {
          if (!accepted) owner.close()
        }),
      )
      Task.run(owner, menu.open)
    }
    scope.own(() => {
      vim.ui.select = previous
    })
  })
export interface Notice {
  readonly id: number
  readonly message: string
  readonly level: number
}
export const notifications = () =>
  component("notifications", () => {
    const notices = State.cell<readonly Notice[]>([])
    const latest = State.cell("")
    const popup = floating(
      view(() =>
        latest
          .get()
          .split("\n")
          .slice(0, 5)
          .map((row) => line(text(row))),
      ),
      { title: "Notification", size: { width: 0.5, height: 5 }, enter: false },
    )
    const history = picker({
      title: "Notifications",
      items: Task.sync(() => [...notices.get()].reverse()),
      key: (notice) => tostring(notice.id),
      label: (notice) => notice.message,
      preview: (notice) => Task.succeed(notice.message.split("\n").map((row) => line(text(row)))),
      accept: (notice) => Task.sync(() => vim.api.nvim_echo([[notice.message]], true, {})),
    })
    return [
      popup,
      history,
      native((scope) => {
        const previous = vim.notify
        let index = 0
        let cancel = () => {}
        vim.notify = (message, level = 2) => {
          const show = () => {
            if (!scope.alive()) return
            notices.set([...notices.get().slice(-99), { id: ++index, message, level }])
            latest.set(message)
            cancel()
            const [ok] = pcall(() => {
              Task.run(scope, popup.open)
              cancel = Task.run(
                scope,
                Task.andThen(popup.close)(Task.sleep(level >= 4 ? 6000 : 3000)),
              )
            })
            if (!ok) previous(message, level)
          }
          if (vim.in_fast_event()) vim.schedule(show)
          else show()
        }
        scope.own(() => {
          vim.notify = previous
        })
      }),
      keys.leader({
        un: action("Dismiss notifications", popup.close),
        fn: action("Notification history", history.open),
      }),
    ]
  })
