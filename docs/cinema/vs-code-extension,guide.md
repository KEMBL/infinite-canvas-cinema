# Install Infinite Canvas Cinema in VS Code

Install the extension once in a VS Code profile, then use it in any project opened with that profile. Each project keeps its own canvas files and image references.

## 1. Install VS Code

Install [Visual Studio Code](https://code.visualstudio.com/download). On Windows, enable the installer option to add Code to PATH, then open a new PowerShell terminal and check `code --version`.

## 2. Install the fork's VSIX

Download `infinite-canvas-cinema-0.1.9.vsix` from the [v0.1.9 release](https://github.com/KEMBL/infinite-canvas-cinema/releases/tag/v0.1.9). No build tools or GitHub login are needed to install the package.

Open Extensions (**Ctrl+Shift+X**), select **... → Install from VSIX...**, and choose the file. Reload VS Code when prompted. Alternatively, in PowerShell from the download folder:

```powershell
code --install-extension .\infinite-canvas-cinema-0.1.9.vsix --force
```

Use a quoted absolute path if the package is elsewhere. For a named profile, add `--profile "Your Profile"`; for Insiders, use `code-insiders`.

The display name is **Infinite Canvas Cinema**, version **0.1.9**, publisher **kembl**, ID `kembl.infinite-canvas-cinema`. It installs separately from upstream `LuisFernando.infinite-canvas`; either can be enabled or disabled independently. Disable upstream Infinite Canvas when using this fork. Do not enable both together.

Versions through 0.1.7 used the upstream ID. To migrate, leave that installation disabled and install the 0.1.9 VSIX. If the new fork was previously disabled, click **Enable** on its own Extensions page; reinstalling does not reset enablement. Rename existing custom setting keys from `infinite-canvas.*` to `infinite-canvas-cinema.*`. Canvas files and tags require no conversion.

[VS Code supports UI and CLI VSIX installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix). Keep auto-update disabled for this extension so a Marketplace version cannot replace the fork. VSIX installs disable auto-update by default.

## 3. Open a canvas in another project

Open the project in the same profile and confirm the extension is enabled. Create `references.canvas` containing:

```json
{
  "nodes": [],
  "edges": []
}
```

Open the file. If it appears as JSON, use **Reopen Editor With... → Infinite Canvas Cinema**. For a project-specific default, merge this into `.vscode/settings.json`, preserving existing settings:

```json
{
  "workbench.editorAssociations": {
    "*.canvas": "infinite-canvas-cinema.canvasEditor"
  }
}
```

In a `.code-workspace` file, place the entry inside `settings`. Use User Settings for an association across projects.

Keep images inside the canvas's workspace folder, such as `refs/characters/reference.svg`. References retain their nested relative paths; outside-workspace sources are rejected. Copy referenced images along with a canvas when moving it to another project.

## 4. Verify the installation

```powershell
code --list-extensions --show-versions | Select-String 'infinite-canvas'
```

Expect `kembl.infinite-canvas-cinema@0.1.9`. Then:

- Drop a project image; verify the original image and its suggested tag caption.
- Select its card and press `T`, double-click its caption, or use **Set tag** to enter `character_A_v1`.
- Use `Copy @tag` and paste into Markdown; expect `@character_A_v1`.
- Run **Infinite Canvas Cinema: Export tags**. A canvas named `references.canvas` produces `references.tags.json` and `references.tags.yaml` beside it.
- Save, close, and reopen the canvas; verify the tag and image reference remain.

Existing export files require overwrite confirmation. The optional `infinite-canvas-cinema.useLegacyTagExportNames` setting restores shared `tags.json`/`tags.yaml` filenames; different canvases in the same folder then share those outputs.

## 5. Build from a fresh checkout

Install [Git](https://git-scm.com/downloads) and [Node.js LTS](https://nodejs.org/) version 22 or newer. The pinned packaging tool requires Node.js 22+. From PowerShell:

```powershell
git clone https://github.com/KEMBL/infinite-canvas-cinema.git
Set-Location infinite-canvas-cinema
npm.cmd ci
npm.cmd test
npx.cmd --yes --package @vscode/vsce@4.0.0 vsce package --no-dependencies --out infinite-canvas-cinema-0.1.9.vsix --baseContentUrl https://github.com/KEMBL/infinite-canvas-cinema/blob/main --baseImagesUrl https://github.com/KEMBL/infinite-canvas-cinema/raw/main
code --install-extension .\infinite-canvas-cinema-0.1.9.vsix --force
```

Package only after the tests pass. The prepublish script compiles the TypeScript host; no external compiled patch is needed. `--no-dependencies` applies because the extension has no runtime npm dependencies; revisit it if dependencies are added. A VSIX can be copied and installed on another computer without cloning or build tools. [Packaging does not require Marketplace publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions).

## Troubleshooting

- **Old editor or JSON still showing:** disable the upstream extension, enable `kembl.infinite-canvas-cinema`, then use Reopen Editor With → Infinite Canvas Cinema. Replace old `infinite-canvas.canvasEditor` associations with `infinite-canvas-cinema.canvasEditor`. Reload the window if prompted.
- **Canvas opens as text:** use Reopen Editor With and check the editor association.
- **Missing image:** inspect the node's `file` path relative to the actual workspace folder. The node and tag are retained even when the file is absent.
- **Works in another window only:** check the active profile and workspace enablement.
- **PowerShell blocks npm scripts:** use `npm.cmd` and `npx.cmd`; no execution-policy change is needed.

See the [requirements](infinite-canvas-tag-requirements.md), [roadmap](roadmap.md), and [integration issue #2](https://github.com/KEMBL/infinite-canvas-cinema/issues/2). Upstream: [Infinite Canvas for VS Code](https://github.com/lout33/infinite_canvas_vscode), MIT license.
