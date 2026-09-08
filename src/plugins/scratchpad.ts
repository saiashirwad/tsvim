import { action, component, document, floating, keys } from "../nvim"
export const scratchpad = (path: string) =>
  component("scratchpad", () => {
    const notes = document(path, { filetype: "markdown", initial: ["# scratchpad", ""] })
    const panel = floating(notes, {
      title: "Scratchpad",
      size: { width: 0.7, height: 0.7 },
      options: { wrap: true, spell: true, number: false },
    })
    return [
      panel,
      notes.bind(
        keys.normal({
          "<C-s>": action("Save notes", notes.save),
          q: action("Close notes", panel.close),
        }),
      ),
      keys.leader({ n: action("Scratchpad", panel.toggle) }),
    ]
  })
