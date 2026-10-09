# Infinite Canvas Cinema

A fork of [Infinite Canvas for VS Code](https://github.com/lout33/infinite_canvas_vscode) for organising film and GenAI reference images on `.canvas` boards. Stable `@tags` connect visual references to Markdown descriptions and prompt scripts while images keep their original filenames and locations.

## Cinema features

These features are implemented in the local patched extension; integration into this fork is pending.

- Image cards display the original workspace images without copying or renaming them.
- One visible, editable tag per image, with filename suggestions and duplicate-tag validation.
- **Copy @tag** for use in Markdown and prompts.
- **Export tags** to `tags.json` and `tags.yaml`, mapping tags to source paths, canvas files, and node IDs.
- Preserve tags and existing JSON Canvas fields through save and reload.

Based on the work of [lout33 and the Infinite Canvas contributors](https://github.com/lout33/infinite_canvas_vscode). Upstream copyright and [MIT license](LICENSE) retained.

Documentation: [Requirements](docs/cinem/infinite-canvas-tag-requirements.md) | [Roadmap](docs/cinem/roadmap.md).
