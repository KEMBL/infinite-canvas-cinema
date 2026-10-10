# Infinite Canvas Cinema roadmap

Integrated in **0.1.7** under [issue #2](https://github.com/KEMBL/infinite-canvas-cinema/issues/2). Crossed-out bullets record completed implementation; editor checks are listed separately.

Requirements: [reference-board requirements](infinite-canvas-tag-requirements.md). Upstream: [lout33/infinite_canvas_vscode](https://github.com/lout33/infinite_canvas_vscode).

## Implemented

- ~~0.1.9: Great Bear / Big Dipper icon styled as connected flowchart star nodes, with editable SVG and packaged PNG.~~

- ~~0.1.8: Separate extension ID `kembl.infinite-canvas-cinema`, with independent editor, command, language, and setting identifiers.~~

- ~~R1: Original image resources, missing-image placeholders, and card deletion without deleting source files.~~
- ~~R1: Resolve against the actual workspace root, preserve nested drop paths, and reject unsupported external references.~~
- ~~R2: One optional tag per file node; normalisation, clearing, character validation, and duplicate rejection.~~
- ~~R3: Visible @tag captions and untagged placeholders.~~
- ~~R4: Tag editing through double-click, context menu, T, and Set tag.~~
- ~~R5: Filename suggestions without renaming images or assigning duplicate tags.~~
- ~~R6: Canvas-specific JSON/YAML catalogs with source path, canvas path, and string node ID.~~
- ~~R6: Explicit compatibility option for shared tags.json/tags.yaml names.~~
- ~~R6: Confirm replacement if either output exists; preserve outputs on cancellation and report filesystem errors.~~
- ~~R6: Reject imported invalid/duplicate tags; retain __proto__ and YAML string keys/values.~~
- ~~R7: Copy @tag through the VS Code clipboard bridge; open editing for untagged cards.~~
- ~~R8: Preserve tags, zero coordinates, extra source fields, group background metadata, and dangling edges.~~
- ~~Restore the host as TypeScript and integrate the patched webview and commands.~~
- ~~Build and package a VSIX from fork source.~~
- ~~Fix webview startup content loading and redundant save updates.~~
- ~~Verify the packaged editor: drop/render an image, edit its caption, copy its tag, export catalogs, save, close, and reopen.~~
- ~~Show a file node's tag and source path on hover.~~

## Further acceptance checks

- Exercise each editing entry point individually: double-click, context menu, T, and the input-box command.
- Verify missing-image and deletion behavior in the packaged editor; regression checks already cover the state and message bridge.
- Verify two canvases in one folder, compatibility export names, and modal cancellation in the UI; regression checks cover overwrite cancellation and validation.
- Exercise multi-root workspaces and additional operating systems.
- Check external AI-provider calls. The upstream AI modules are unchanged; no paid/provider requests were made during deployment testing.

## Optional future features

- Convert a file node into a tagged group with an image background; implement group rendering and group-aware export together.
- Jump to a tag using a picker and pan/select its card.
- Show an explicit notification when an image reference is missing.

## Outside the current scope

- Multiple tags per image, workspace-wide uniqueness, moved-file tracking, and tag/Markdown filename synchronisation.
- External prompt-editor autocomplete, new AI features, collaboration, ratings, palettes, and semantic search.
- Marketplace publication.
