# Infinite Canvas Cinema

A fork of [Infinite Canvas for VS Code](https://github.com/lout33/infinite_canvas_vscode) for organising film and GenAI reference images on `.canvas` boards. Stable `@tags` connect visual references to Markdown descriptions and prompt scripts while images keep their original filenames and locations.

## Added features

- Original-image cards with editable tag captions, filename suggestions, validation, and duplicate-tag rejection.
- `Copy @tag`, tag editing through double-click, context menu, `T`, and VS Code commands, plus hover details.
- Canvas-specific JSON/YAML tag catalogs with overwrite confirmation and safe string/key handling.
- Workspace-relative image paths, missing-image placeholders, and preservation of tags, extra fields, zero coordinates, and dangling edges through save/reload.

Install the **0.1.8 VSIX** from [Releases](https://github.com/KEMBL/infinite-canvas-cinema/releases). It appears as **Infinite Canvas Cinema**, extension ID `kembl.infinite-canvas-cinema`, and installs separately from upstream Infinite Canvas.

**Enable only one canvas extension at a time:** disable upstream Infinite Canvas (`LuisFernando.infinite-canvas`) when using this fork. The two extensions can now be enabled or disabled independently.

Documentation: [Requirements](docs/cinema/infinite-canvas-tag-requirements.md) | [Roadmap](docs/cinema/roadmap.md) | [Installation guide](docs/cinema/vs-code-extension,guide.md).

Based on the work of [lout33 and the Infinite Canvas contributors](https://github.com/lout33/infinite_canvas_vscode). Upstream copyright and [MIT license](LICENSE) retained.
