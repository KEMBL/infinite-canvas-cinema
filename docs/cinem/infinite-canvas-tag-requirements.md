# Infinite Canvas Cinema — reference-board requirements

## Purpose

Organise film and GenAI reference images on `.canvas` boards. Stable `@tags` connect images to Markdown descriptions and prompt scripts, while the images keep their original filenames and locations.

Fork: [KEMBL/infinite-canvas-cinema](https://github.com/KEMBL/infinite-canvas-cinema). Upstream: [lout33/infinite_canvas_vscode](https://github.com/lout33/infinite_canvas_vscode). Preserve upstream attribution and the MIT license.

## Baseline and status

Reviewed on 2026-10-10:

- Upstream baseline: `0.1.5`, commit `4f8cbabc02c072faeef8590b00d238ebca8ff087`.
- The public fork contains that code baseline and the cinema README. Its extension code does not yet include the local patch.
- Local patch: `0.1.6`, in `temp/infinite-canvas-patched`. The patched host is available as compiled `out/extension.js`; its original `src/extension.ts` is missing, and the source map contains no embedded source.
- Local statuses below come from code inspection and isolated execution checks. Full VS Code UI and reload acceptance remains pending.

| Requirement | Local patch status | Remaining work |
|---|---|---|
| R1: Original image references | Partial | Replace hard-coded workspace detection and lossy drop-path conversion. |
| R2: One tag per card | Implemented | Integrate and verify in VS Code. |
| R3: Visible captions | Implemented | Verify actual image rendering and captions in VS Code. |
| R4: On-board tag editing | Implemented | Verify double-click, context menu, T, and command behavior in VS Code. |
| R5: Filename suggestions | Implemented, optional | Integrate and verify in VS Code. |
| R6: JSON/YAML export | Partial | Protect outputs, validate imported tags, preserve all valid keys and string types. |
| R7: Copy @tag | Implemented | Verify real clipboard and untagged-node editing in VS Code. |
| R8: Safe round trips | Partial | Preserve zero coordinates and edges with missing endpoints; complete preservation checks. |

See the [roadmap](roadmap.md). “Implemented” describes available local code, not a released fork build.

## Scope

- Keep descriptions in Markdown; the canvas holds image references and tags.
- Do not rename, copy, or embed source images. Deleting a card must never delete its source file.
- Keep existing text/file canvases usable and preserve unsupported JSON Canvas data.
- Preserve existing upstream AI behavior. New AI features, collaboration, and a new node-graph engine are outside this work.
- Optional group conversion, jump-to-tag, and other future additions are listed in the roadmap, separately from MVP acceptance.

## Requirements

### R1 — Preserve original image references

Dropping `refs/characters/reference-still.png` creates a `file` node pointing to that image.

- Store workspace-relative paths with POSIX slashes and the full directory structure.
- Resolve paths using the canvas document's actual workspace folder. Do not infer workspaces from fixed project names or truncate paths to their last two components.
- Explain when a source cannot be represented relative to that workspace; leave the source untouched.
- Missing images show a placeholder while retaining their path and tag.

The local patch resolves image resources through the host and includes a broken-image placeholder. Its webview drop-path conversion still uses hard-coded workspace names and a lossy fallback.

### R2 — One optional tag per image card

Persist an optional `tag` on each file node:

```json
{
  "id": "reference-card",
  "type": "file",
  "file": "refs/characters/reference-still.png",
  "x": 200,
  "y": 80,
  "width": 280,
  "height": 360,
  "tag": "character_A_v1"
}
```

- Allowed characters: `A-Z a-z 0-9 _ -`. Store without a leading `@`; comparison is case-sensitive.
- Empty or missing tags are valid. Clearing a tag leaves its image reference intact.
- Tags must be unique within one canvas. Refuse duplicate assignments and allow correction.
- Cross-canvas uniqueness is not enforced in v1; scripts use the appropriate canvas catalog.
- Preserve other properties during tag edits and saves.

Assignment, clearing, character validation, and duplicate rejection are implemented locally. Export must independently validate tags loaded from canvas JSON (R6).

### R3 — Display the tag

Show each image with its `@tag` caption. Untagged cards display a muted `set tag`. Preserve the caption when an image is missing.

### R4 — Edit without leaving the board

Support caption editing, a **Set tag** context action, or `T` with a file node selected. Retain `infinite-canvas.setTag`. Update canvas JSON through the existing document-save flow.

The local patch includes caption/image double-click editing, a context menu, `T`, and a VS Code input-box command. Actual editor acceptance is still pending.

### R5 — Suggest a tag from the filename (optional)

Suggest the basename without its extension, sanitised to allowed characters. Do not overwrite existing tags or rename images. Avoid assigning a suggestion already used on the canvas.

### R6 — Export a reliable catalog

Retain `infinite-canvas.exportTags`, titled **Infinite Canvas: Export tags**. Export tagged `file` nodes with source paths; include `path`, `canvas`, and `nodeId` as strings:

```json
{
  "character_A_v2": {
    "path": "refs/characters/reference-still.png",
    "canvas": "boards/references.canvas",
    "nodeId": "reference-card"
  }
}
```

- JSON and YAML must represent the same data, including string keys and fields.
- Paths must be workspace-relative with POSIX slashes. Scripts consume the catalog rather than canvas coordinates.
- Target default filenames: `<canvas-basename>.tags.json` and `<canvas-basename>.tags.yaml`, beside the canvas. Example: `references.tags.json` and `references.tags.yaml`.
- Current local outputs are shared `tags.json` and `tags.yaml`. Retain these only as an explicit compatibility option, explaining that export replaces the previous folder catalog rather than merging canvases.
- Confirm replacement when either output exists. Cancelling leaves both unchanged. Report filesystem errors rather than treating them as missing files.
- Reject duplicate or invalid non-empty tags in imported JSON before writing. Do not silently overwrite catalog entries.
- Preserve every allowed tag, including `__proto__`, as a data key. Quote YAML strings as needed to preserve numeric-looking IDs and scalar-like tags.
- Report successful output locations; an empty catalog is valid.

Basic export is implemented locally. Gaps are shared output names, JSON-only overwrite detection, silent duplicate replacement, loss of the `__proto__` key, and numeric-looking node IDs becoming numbers in YAML.

### R7 — Copy @tag

Provide **Copy @tag**, including `infinite-canvas.copyTag`. Copy the tag with one leading `@`. For an untagged file node, open tag editing first.

### R8 — Preserve canvas data on save/load

- Existing text/file canvases without tags remain usable.
- Persist tags and preserve unsupported node, edge, and document fields, including group backgrounds and colors.
- Preserve valid zero coordinates and original source paths.
- Retain unsupported nodes and edges with missing endpoints. Preservation does not require rendering these features.
- Exclude runtime image/selection state without discarding source fields that happen to share runtime property names.

Common extra fields and group metadata survive local round-trip checks. However, `x: 0` / `y: 0` become `100`, and edges with missing endpoints are dropped. Full preservation is not complete.

## Integration approach

- Keep fork-specific documentation in `docs/cinem/`; leave upstream documents in place.
- Restore patched host logic into maintainable TypeScript. Compiled JavaScript alone is not the source of truth and would be overwritten by the next build.
- Add separate tag/catalog helpers where practical; keep existing editor and message-bridge changes small.
- Avoid unrelated refactoring, renaming, dependency upgrades, and whole-file formatting.
- Use focused commits for documentation, source recovery, feature integration, and bug fixes. Preserve upstream history, license, and an `upstream` remote.

## Acceptance checks

1. Drop `refs/characters/reference-still.png`; verify its saved relative path and unchanged image. Repeat with an unrelated workspace name and nested directories.
2. Set `character_A_v1`, save, and reload VS Code. JSON and caption retain the tag.
3. Change to `character_A_v2`; the source filename remains unchanged.
4. Export both catalogs. They contain v2, exclude the replaced v1 tag, and agree on string values for path, canvas, and node ID.
5. Export two canvases in one folder; default outputs remain distinct. Cancel replacement when only JSON exists, only YAML exists, and both exist; neither output changes.
6. Reject duplicate and invalid imported tags without writing outputs. Verify `__proto__`, scalar-like tags, and numeric-looking node IDs retain their string values through JSON/YAML parsing.
7. Copy a tag into Markdown; copying an untagged node opens editing.
8. Round-trip an old canvas, zero coordinates, extra fields, group metadata, and an edge with a missing endpoint. Preserve source data and exclude runtime image state.
9. Remove a card and simulate a missing image. Never delete the source; retain the missing image's node and tag.
10. Build and package from fork source, then repeat editor checks using that VSIX. Verify existing upstream text/file and AI behavior.
