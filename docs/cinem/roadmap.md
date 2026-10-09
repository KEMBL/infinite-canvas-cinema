# Infinite Canvas Cinema roadmap

Reviewed on 2026-10-10 against the local patched extension `0.1.6` and the public fork's upstream baseline `0.1.5`.

Crossed-out items are implemented in the **local patch**, based on code inspection and isolated checks. They are not yet integrated or released in the GitHub fork. Uncrossed items remain open; partial requirements are split into completed and outstanding work. Full VS Code UI acceptance is still pending.

Requirements: [reference-board requirements](infinite-canvas-tag-requirements.md). Upstream: [lout33/infinite_canvas_vscode](https://github.com/lout33/infinite_canvas_vscode). Fork: [KEMBL/infinite-canvas-cinema](https://github.com/KEMBL/infinite-canvas-cinema).

## Core reference-board features

- ~~R1: Load original image resources without creating image copies; deleting a card removes its node only.~~
- ~~R1: Show a missing-image placeholder and preserve its source path and tag.~~
- R1: Replace hard-coded workspace detection with actual workspace-relative resolution; preserve nested directories in arbitrary workspaces and explain unsupported external paths.
- ~~R2: Store one optional tag per file node; validate characters, normalise the leading @, clear tags, and reject duplicate assignments within a canvas.~~
- ~~R3: Display @tag captions and the untagged “set tag” placeholder.~~
- ~~R4: Edit tags through double-click, context menu, T, and Set tag; send updates through the existing save flow.~~
- ~~R5, optional: Suggest a sanitised tag from the filename without duplicating an existing tag.~~
- ~~R6: Export tagged file-node catalogs as JSON and YAML with source path, canvas path, and node ID.~~
- R6: Use canvas-specific default filenames; retain shared tags.json/tags.yaml only as an explicit compatibility option.
- R6: Protect both outputs when either exists; confirm replacement, preserve both on cancellation, and report filesystem failures.
- R6: Reject invalid and duplicate tags from imported canvas JSON before writing; avoid silent replacement.
- R6: Export every allowed key, including __proto__, and preserve YAML string types, including numeric-looking node IDs.
- ~~R7: Copy @tag through the host clipboard bridge; open tag editing for untagged file nodes.~~
- ~~R8: Retain tags and common extra node/edge/document fields, including group background metadata.~~
- R8: Preserve zero coordinates rather than substituting 100.
- R8: Retain edges with missing endpoints and preserve unsupported source fields that overlap runtime property names.

## Fork integration and verification

- Restore the patched host as maintainable TypeScript; the local package has only compiled host JavaScript and a source map without embedded source.
- Import local features through focused commits and small integration changes.
- Verify actual image drops, captions, editing, clipboard, save/reload, and missing-image behavior in VS Code.
- Build and package from fork source, then repeat acceptance checks using its VSIX.
- Check existing upstream text/file and AI behavior after integration.

## Optional future features

- Convert a file node into a tagged group with an image background; implement group rendering and group-aware export together.
- Jump to a tag using a picker and pan/select its card.
- ~~Show a file node's tag and source path on hover (canvas title tooltip).~~
- Show an explicit warning when an image reference is missing. The placeholder is implemented; a user notification is not.

## Outside the current scope

- Multiple tags per image or workspace-wide tag uniqueness.
- Automatic tag/Markdown filename synchronisation or moved-file tracking.
- External prompt-editor @tag autocomplete.
- New AI features, collaboration, ratings, palettes, or semantic search.
- Marketplace publication.

## Review evidence

Reviewed `out/extension.js`, `webview/main.js`, `webview/src/InfiniteCanvasSimple.js`, and `package.json` in the local patch.

- Tag assignment, duplicate rejection, copying, suggestions, basic export, missing-image state, captions, and ordinary extra-field preservation passed isolated checks.
- Reproduced gaps: zero coordinates become 100; edges with missing endpoints disappear; absolute drops can lose parent directories; YAML-only outputs are overwritten without confirmation; duplicate imported tags overwrite entries; __proto__ is omitted from JSON export; numeric-looking IDs become numbers in YAML.
- Source inspection found no group-background renderer/conversion command, jump-to-tag command, or explicit missing-image user notification.
- The reviewed fork code baseline is upstream commit `4f8cbabc02c072faeef8590b00d238ebca8ff087`. Documentation updates do not integrate local features.
