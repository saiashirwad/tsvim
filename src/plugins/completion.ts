import { component, forBuffers, language, native, options, keys, action, editor } from "../nvim"
import { expression } from "../nvim/input"
/** Use Neovim's native completion/snippet engines; no external completion plugin. */
export const completion = () =>
  component("completion", () => [
    options({
      completeopt: ["menu", "menuone", "noselect", "fuzzy"],
      complete: [".", "w", "b", "u"],
      wildmenu: true,
      wildmode: ["longest:full", "full"],
      wildoptions: ["pum", "fuzzy"],
    }),
    language.attached(({ buffer, clients }) =>
      native((scope) => {
        if (vim.api.nvim_get_option_value("filetype", { buf: buffer }) === "markdown") return
        for (const client of clients)
          if (client.supports_method("textDocument/completion", buffer)) {
            vim.lsp.completion.enable(true, client.id, buffer, { autotrigger: true })
            scope.own(() => {
              if (vim.api.nvim_buf_is_valid(buffer))
                vim.lsp.completion.enable(false, client.id, buffer)
            })
          }
      }),
    ),
    forBuffers(
      (id) =>
        vim.api.nvim_get_option_value("filetype", { buf: id }) !== "markdown" &&
        vim.api.nvim_get_option_value("buftype", { buf: id }) === "",
      () => [
        expression(["i"], {
          "<Tab>": {
            label: "Next completion / indent",
            read: () => (vim.fn.pumvisible() === 1 ? "<C-n>" : "<Tab>"),
          },
          "<S-Tab>": {
            label: "Previous completion",
            read: () => (vim.fn.pumvisible() === 1 ? "<C-p>" : "<S-Tab>"),
          },
          "<C-Space>": {
            label: "Complete",
            read: () =>
              vim.lsp
                .get_clients({ bufnr: 0 })
                .some((client) => client.supports_method("textDocument/completion", 0))
                ? "<C-x><C-o>"
                : "<C-n>",
          },
          "<C-f>": { label: "Complete path", read: () => "<C-x><C-f>" },
        }),
        keys.insert({
          "<C-l>": action(
            "Next snippet field",
            editor.native(() => {
              if (vim.snippet.active({ direction: 1 })) vim.snippet.jump(1)
            }),
          ),
          "<C-h>": action(
            "Previous snippet field",
            editor.native(() => {
              if (vim.snippet.active({ direction: -1 })) vim.snippet.jump(-1)
            }),
          ),
        }),
      ],
    ),
  ])
