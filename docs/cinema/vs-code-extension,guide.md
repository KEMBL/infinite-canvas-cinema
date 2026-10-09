# Install Infinite Canvas Cinema in VS Code

This guide uses Windows and PowerShell. Install the extension once in your VS Code profile, then use it in other project folders. Each project keeps its own canvas files and image references.

## Which version to install

As of 2026-10-10:

- A development patch (`0.1.6`) includes image captions, tag editing, copying, suggestions, and basic JSON/YAML export. It is not yet integrated or published in this repository.
- The [GitHub fork](https://github.com/KEMBL/infinite-canvas-cinema) still contains upstream extension code `0.1.5`. Building it today does **not** include the local tag patch.
- No VSIX release is currently published in the fork. If you already have a patched VSIX, you can install it using section 2. Otherwise, section 5 explains how to build the current upstream baseline. After source integration and a release, use the matching fork release package.

See the [requirements](https://github.com/KEMBL/infinite-canvas-cinema/blob/main/docs/cinema/infinite-canvas-tag-requirements.md) and [roadmap](roadmap.md) for status and known gaps.

## 1. Install VS Code

Install [Visual Studio Code](https://code.visualstudio.com/download). On Windows, select its installer option to add Code to PATH, then open a new PowerShell terminal.

If VS Code is already installed, keep that installation. Check the command:

```powershell
code --version
```

If `code` is unavailable, use the VS Code installation interface in the next section; the CLI is optional.

## 2. Install a packaged VSIX

If you already have `infinite-canvas-0.1.6.vsix`, copy it to the target computer if needed. This development package is not currently available from the fork's releases. You do not need Node.js, Git, GitHub login, or an API key to install a VSIX.

In VS Code:

1. Open Extensions with **Ctrl+Shift+X**.
2. Select **... → Install from VSIX...**, or run **Extensions: Install from VSIX...** from **Ctrl+Shift+P**.
3. Select the VSIX and reload VS Code if prompted.

Alternatively, from PowerShell in the folder containing the package:

```powershell
code --install-extension .\infinite-canvas-0.1.6.vsix
```

Use a quoted absolute path to the VSIX when installing from another folder.

To target a named profile, add `--profile "Your Profile"`. For VS Code Insiders, use `code-insiders` instead of `code`.

The current package appears as **Infinite Canvas**, publisher **Luis Fernando**, ID `LuisFernando.infinite-canvas`. The fork repository name does not change this extension identity. This package shares the upstream ID, so it replaces that extension in the target profile rather than installing a second independently named editor.

[VS Code supports both UI and CLI VSIX installation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#_install-from-a-vsix). VSIX installs disable extension auto-update by default; keep it disabled for this patched package so a Marketplace update does not replace it with upstream code.

## 3. Use it in another project

1. Open the target project folder in the same VS Code profile.
2. Confirm Infinite Canvas is enabled in Extensions. You do not need to copy the extension source into the project or reinstall it for each folder.
3. Create `references.canvas` containing:

```json
{
  "nodes": [],
  "edges": []
}
```

Open the file. If VS Code shows JSON text, right-click its editor tab, choose **Reopen Editor With... → Infinite Canvas**, and set it as the default for `.canvas` files.

For an explicit project setting, merge this entry into `.vscode/settings.json`; preserve other settings already in the file:

```json
{
  "workbench.editorAssociations": {
    "*.canvas": "infinite-canvas.canvasEditor"
  }
}
```

In a `.code-workspace` file, put the same entry inside its `settings` object. Use User Settings instead if you want this association across all projects.

Keep reference images inside the project, for example `refs/characters/reference-still.png`. A canvas file node stores a workspace-relative path; copying only the canvas into another project does not copy its referenced images.

## 4. Verify the patched features

Check the installed version:

```powershell
code --list-extensions --show-versions | Select-String 'infinite-canvas'
```

For the local patch, expect `luisfernando.infinite-canvas@0.1.6`. In Extensions, you can also search `@installed Infinite Canvas` and inspect its version.

With a canvas open:

- Drop a project image and confirm it renders with a caption.
- Select its card and press `T`, double-click its caption, or use **Set tag** to enter `character_A_v1`.
- Use **Copy @tag** and paste into Markdown; expect `@character_A_v1`.
- Run **Infinite Canvas: Export tags**. The current local patch writes `tags.json` and `tags.yaml` beside the canvas.
- Save and reload; check that the image reference and tag remain.

Current limitations matter in other projects: absolute drops can lose parent directories because workspace detection is hard-coded. If an image is missing, reopen the canvas with the text editor, inspect its node's `file`, and correct it to the actual workspace-relative path before reopening Infinite Canvas. Other round-trip and export gaps are listed in the roadmap.

Current exports use shared filenames: two canvases in one folder replace the same catalog. Export into separate board folders when keeping both catalogs. Canvas-specific output names are planned, not implemented in `0.1.6`.

## 5. Build a VSIX from a fresh fork checkout

Use this route for source development, or after the local features have been integrated. **Building the current fork produces upstream `0.1.5` behavior. Installing that build over your patched package removes the tag additions.**

Install [Git](https://git-scm.com/downloads) and a supported [Node.js LTS](https://nodejs.org/) version, then reopen PowerShell. The pinned packaging tool below requires Node.js 22 or newer. Check:

```powershell
git --version
node --version
npm.cmd --version
```

Clone into a standalone development folder, outside any project where you use the extension:

```powershell
git clone https://github.com/KEMBL/infinite-canvas-cinema.git
Set-Location infinite-canvas-cinema
npm.cmd ci
npm.cmd run compile
```

Cloning this public repository does not require GitHub login. Stop if dependency installation or compilation fails; package only after they succeed.

From the extension repository root, package a local installer:

```powershell
npx.cmd --yes --package @vscode/vsce@4.0.0 vsce package --no-dependencies --out infinite-canvas-cinema.vsix --baseContentUrl https://github.com/KEMBL/infinite-canvas-cinema/blob/main --baseImagesUrl https://github.com/KEMBL/infinite-canvas-cinema/raw/main
```

`--no-dependencies` is appropriate for the current manifest, which has no runtime npm dependencies. Revisit this flag if runtime dependencies are added. The base URLs keep packaged README links pointing to this fork while the manifest still names upstream.

Install the result using section 2, selecting `infinite-canvas-cinema.vsix`, or run:

```powershell
code --install-extension .\infinite-canvas-cinema.vsix
```

The VSIX filename does not change the extension ID or version; those come from `package.json`. A VSIX can be installed on other computers without cloning or installing build tools. [Packaging a VSIX does not require Marketplace publication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions).

## Troubleshooting

- **Wrong version or missing tag commands:** check the installed version and which VSIX was selected. A current fork build and the upstream Marketplace extension do not contain the tag patch.
- **Canvas opens as text:** use Reopen Editor With and check the editor association above.
- **Works in one project but not another:** check the active profile, workspace enablement, image paths, and settings in that project's `.code-workspace` or `.vscode/settings.json`.
- **`npm` script execution is blocked in PowerShell:** use `npm.cmd` and `npx.cmd` as shown; do not change system execution policy just to run the build.
- **Need to reinstall the same package:** use Install from VSIX again. If the CLI requires replacement, rerun it with `--force` after confirming the package is the intended version.

Upstream: [Infinite Canvas for VS Code](https://github.com/lout33/infinite_canvas_vscode), MIT license. Repository setup and the initial audit are recorded in [completed issue #1](https://github.com/KEMBL/infinite-canvas-cinema/issues/1).
