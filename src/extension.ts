import * as vscode from 'vscode';
import * as path from 'path';

interface CanvasFileNode {
    id?: unknown;
    type?: string;
    file?: string;
    tag?: unknown;
    [key: string]: unknown;
}
type TagCatalog = Record<string, { path: string; canvas: string; nodeId: string }>;
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const TAG_CHAR_RE = /^[A-Za-z0-9_-]+$/;
export function activate(context: vscode.ExtensionContext): void {
    console.log('Infinite Canvas Cinema extension is now active!');
    const provider = new CanvasEditorProvider(context.extensionUri);
    const registration = vscode.window.registerCustomEditorProvider('infinite-canvas-cinema.canvasEditor', provider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
    });
    const newCanvasCommand = vscode.commands.registerCommand('infinite-canvas-cinema.newCanvas', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Please open a workspace to create a new canvas');
            return;
        }
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter canvas file name',
            value: 'untitled.canvas',
            validateInput: (value) => {
                if (!value.endsWith('.canvas')) {
                    return 'File must have .canvas extension';
                }
                return null;
            }
        });
        if (fileName) {
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
            const initialContent = JSON.stringify({
                nodes: [],
                edges: []
            }, null, 2);
            await vscode.workspace.fs.writeFile(filePath, Buffer.from(initialContent));
            await vscode.commands.executeCommand('vscode.open', filePath);
        }
    });
    const setTagCommand = vscode.commands.registerCommand('infinite-canvas-cinema.setTag', async () => {
        const tag = await vscode.window.showInputBox({
            prompt: 'Tag for the selected file node (stored without @)',
            placeHolder: 'character_A_v1',
            validateInput: (value) => {
                const normalized = normalizeTag(value);
                if (!normalized) {
                    return null;
                }
                if (!TAG_CHAR_RE.test(normalized)) {
                    return 'Use only letters, numbers, underscore and hyphen';
                }
                return null;
            }
        });
        if (tag === undefined) {
            return;
        }
        if (!provider.postToActiveWebview({ type: 'setTag', tag: normalizeTag(tag) })) {
            vscode.window.showWarningMessage('Open a canvas to set a tag');
        }
    });
    const copyTagCommand = vscode.commands.registerCommand('infinite-canvas-cinema.copyTag', async () => {
        if (!provider.postToActiveWebview({ type: 'copyTag' })) {
            vscode.window.showWarningMessage('Open a canvas to copy a tag');
        }
    });
    const exportTagsCommand = vscode.commands.registerCommand('infinite-canvas-cinema.exportTags', async () => {
        const document = provider.getActiveDocument() || getActiveCanvasTextDocument();
        if (!document) {
            vscode.window.showWarningMessage('Open a .canvas file to export tags');
            return;
        }
        await exportTagsForDocument(document);
    });
    context.subscriptions.push(registration, newCanvasCommand, setTagCommand, copyTagCommand, exportTagsCommand);
}
export function deactivate(): void { }
function normalizeTag(raw: unknown): string {
    if (!raw) {
        return '';
    }
    return String(raw).replace(/^@+/, '').trim();
}
function toPosixPath(filePath: unknown): string {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
function getActiveCanvasTextDocument(): vscode.TextDocument | undefined {
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.fileName.toLowerCase().endsWith('.canvas')) {
        return active;
    }
    return vscode.workspace.textDocuments.find(doc => doc.fileName.toLowerCase().endsWith('.canvas'));
}
function yamlQuote(value: string): string {
    // JSON string quoting is valid YAML and preserves string types.
    return JSON.stringify(value);
}
function catalogToYaml(catalog: TagCatalog): string {
    const tags = Object.keys(catalog);
    if (tags.length === 0) {
        return '{}\n';
    }
    const lines = [];
    for (const tag of tags) {
        const info = catalog[tag];
        lines.push(`${yamlQuote(tag)}:`);
        lines.push(`  path: ${yamlQuote(info.path)}`);
        lines.push(`  canvas: ${yamlQuote(info.canvas)}`);
        lines.push(`  nodeId: ${yamlQuote(info.nodeId)}`);
    }
    return lines.join('\n') + '\n';
}
async function exportTagsForDocument(document: vscode.TextDocument): Promise<void> {
    let data: { nodes?: CanvasFileNode[] };
    try { data = JSON.parse(document.getText() || '{"nodes":[],"edges":[]}'); }
    catch { vscode.window.showErrorMessage('Canvas JSON is invalid; cannot export tags'); return; }
    const catalog: TagCatalog = Object.create(null);
    const canvasRel = toPosixPath(vscode.workspace.asRelativePath(document.uri));
    for (const node of Array.isArray(data?.nodes) ? data.nodes : []) {
        if (node?.type !== 'file') continue;
        const tag = normalizeTag(node.tag);
        if (!tag) continue;
        if (!TAG_CHAR_RE.test(tag) || Object.prototype.hasOwnProperty.call(catalog, tag)) {
            vscode.window.showWarningMessage('Cannot export invalid or duplicate tag: ' + tag);
            return;
        }
        if (typeof node.file !== 'string' || !node.file || typeof node.id !== 'string') {
            vscode.window.showWarningMessage('Tagged file nodes must have a source path and string node ID');
            return;
        }
        catalog[tag] = {path: toPosixPath(node.file), canvas: canvasRel, nodeId: node.id};
    }
    const dir = vscode.Uri.joinPath(document.uri, '..');
    const basename = path.basename(document.uri.fsPath).replace(/\.canvas$/i, '');
    const legacy = vscode.workspace.getConfiguration('infinite-canvas-cinema').get<boolean>('useLegacyTagExportNames', false);
    const exportBase = legacy ? 'tags' : basename + '.tags';
    const jsonUri = vscode.Uri.joinPath(dir, exportBase + '.json');
    const yamlUri = vscode.Uri.joinPath(dir, exportBase + '.yaml');
    let exists = false;
    for (const uri of [jsonUri, yamlUri]) {
        try { await vscode.workspace.fs.stat(uri); exists = true; }
        catch (error) {
            if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
                vscode.window.showErrorMessage('Cannot check tag export destination: ' + String(error));
                return;
            }
        }
    }
    if (exists) {
        const choice = await vscode.window.showWarningMessage('Tag export files already exist. Overwrite both JSON and YAML outputs?', {modal: true}, 'Overwrite');
        if (choice !== 'Overwrite') return;
    }
    try {
        await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8'));
        await vscode.workspace.fs.writeFile(yamlUri, Buffer.from(catalogToYaml(catalog), 'utf8'));
    } catch (error) {
        vscode.window.showErrorMessage('Tag export failed: ' + String(error)); return;
    }
    vscode.window.showInformationMessage('Exported ' + Object.keys(catalog).length + ' tags to ' + vscode.workspace.asRelativePath(jsonUri));
}
class CanvasEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'infinite-canvas-cinema.canvasEditor';
    private readonly extensionUri: vscode.Uri;
    private isSaving: boolean;
    private webviews: Map<string, { panel: vscode.WebviewPanel; document: vscode.TextDocument }>;
    private lastDocument?: vscode.TextDocument;
    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.isSaving = false;
        this.webviews = new Map();
    }
    getActiveDocument(): vscode.TextDocument | undefined {
        for (const entry of this.webviews.values()) {
            if (entry.panel.active) {
                return entry.document;
            }
        }
        return this.lastDocument;
    }
    postToActiveWebview(message: Record<string, unknown>): boolean {
        for (const entry of this.webviews.values()) {
            if (entry.panel.active) {
                entry.panel.webview.postMessage(message);
                return true;
            }
        }
        const first = this.webviews.values().next().value;
        if (first) {
            first.panel.webview.postMessage(message);
            return true;
        }
        return false;
    }
    async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        this.lastDocument = document;
        this.webviews.set(document.uri.toString(), { panel: webviewPanel, document });
        const localResourceRoots = [
            vscode.Uri.joinPath(this.extensionUri, 'webview'),
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'src'),
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'public')
        ];
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder) {
            localResourceRoots.push(folder.uri);
        }
        for (const ws of vscode.workspace.workspaceFolders || []) {
            if (!localResourceRoots.some(root => root.toString() === ws.uri.toString())) {
                localResourceRoots.push(ws.uri);
            }
        }
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'save':
                    this.isSaving = true;
                    await this.saveDocument(document, message.content);
                    setTimeout(() => {
                        this.isSaving = false;
                    }, 200);
                    break;
                case 'ready':
                    webviewPanel.webview.postMessage({
                        type: 'loadContent',
                        content: document.getText()
                    });
                    break;
                case 'loadFile':
                    await this.loadFileContent(webviewPanel, message.filePath, message.nodeId, document);
                    break;
                case 'resolveResourceUri':
                    await this.resolveResourceUri(webviewPanel, message.filePath, message.nodeId, document);
                    break;
                case 'saveFile':
                    await this.saveFileContent(message.filePath, message.content, webviewPanel, message.nodeId, document);
                    break;
                case 'createFile':
                    await this.createFile(message.filePath, message.content, webviewPanel, document);
                    break;
                case 'copyToClipboard':
                    await vscode.env.clipboard.writeText(message.text || '');
                    if (message.text) {
                        vscode.window.showInformationMessage(`Copied ${message.text}`);
                    }
                    break;
                case 'showWarning':
                    vscode.window.showWarningMessage(String(message.text || 'Warning'));
                    break;
                case 'showInfo':
                    vscode.window.showInformationMessage(String(message.text || ''));
                    break;
                case 'getGroqApiKey': {
                    const groqApiKey = await this.getGroqApiKey();
                    if (groqApiKey) {
                        webviewPanel.webview.postMessage({
                            type: 'groqApiKey',
                            apiKey: groqApiKey
                        });
                    }
                    break;
                }
            }
        });
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                if (!this.isSaving) {
                    webviewPanel.webview.postMessage({
                        type: 'loadContent',
                        content: document.getText()
                    });
                }
                else {
                    console.log('Skipping reload during save operation');
                }
            }
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            this.webviews.delete(document.uri.toString());
        });
    }
    private async saveDocument(document: vscode.TextDocument, content: string): Promise<void> {
        if (document.getText() === content) return;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
        await vscode.workspace.applyEdit(edit);
    }
    private workspaceFolderFor(document: vscode.TextDocument): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(document.uri) || vscode.workspace.workspaceFolders?.[0];
    }
    private async loadFileContent(webviewPanel: vscode.WebviewPanel, filePath: string, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            if (IMAGE_FILE_RE.test(filePath || '')) {
                await this.resolveResourceUri(webviewPanel, filePath, nodeId, document);
                return;
            }
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileContent).toString('utf8');
            webviewPanel.webview.postMessage({
                type: 'fileContentLoaded',
                nodeId: nodeId,
                content: content,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error loading file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId: nodeId,
                error: `Failed to load file: ${filePath}`
            });
        }
    }
    private async resolveResourceUri(webviewPanel: vscode.WebviewPanel, filePath: string, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            await vscode.workspace.fs.stat(fileUri);
            const uri = webviewPanel.webview.asWebviewUri(fileUri).toString();
            webviewPanel.webview.postMessage({
                type: 'resourceUriResolved',
                nodeId,
                uri,
                filePath: normalizedPath
            });
        }
        catch (error) {
            console.error('Error resolving resource URI:', error);
            webviewPanel.webview.postMessage({
                type: 'resourceUriResolved',
                nodeId,
                missing: true,
                filePath
            });
        }
    }
    private normalizeToRelativePath(filePath: string, workspacePath: string): string {
        const input = filePath.startsWith('file:') ? vscode.Uri.parse(filePath).fsPath : filePath;
        const absolute = path.resolve(workspacePath, input);
        const relative = path.relative(workspacePath, absolute);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            throw new Error('Image and file references must be inside the canvas workspace folder');
        }
        return toPosixPath(relative);
    }
    private async saveFileContent(filePath: string, content: string, webviewPanel: vscode.WebviewPanel, nodeId: string, document: vscode.TextDocument): Promise<void> {
        try {
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const fileContent = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, fileContent);
            const fileStats = await vscode.workspace.fs.stat(fileUri);
            webviewPanel.webview.postMessage({
                type: 'fileContentSaved',
                nodeId: nodeId,
                lastModified: fileStats.mtime
            });
        }
        catch (error) {
            console.error('Error saving file content:', error);
            webviewPanel.webview.postMessage({
                type: 'fileContentError',
                nodeId: nodeId,
                error: `Failed to save file: ${filePath}`
            });
        }
    }
    private async createFile(filePath: string, content: string, webviewPanel: vscode.WebviewPanel, document: vscode.TextDocument): Promise<void> {
        try {
            // Image drops must never copy/rename the source file.
            if (IMAGE_FILE_RE.test(filePath || '')) {
                console.log('Skipping createFile for image path (R1):', filePath);
                return;
            }
            const workspaceFolder = this.workspaceFolderFor(document);
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }
            const normalizedPath = this.normalizeToRelativePath(filePath, workspaceFolder.uri.fsPath);
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try {
                await vscode.workspace.fs.stat(dirUri);
            }
            catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
            const fileContent = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, fileContent);
            console.log('✅ File created successfully:', normalizedPath);
        }
        catch (error) {
            console.error('Error creating file:', error);
            vscode.window.showErrorMessage(`Failed to create file: ${filePath}`);
        }
    }
    private getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        const webviewUri = vscode.Uri.joinPath(this.extensionUri, 'webview');
        const mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewUri, 'style.css'));
        const nonce = this.getNonce();
        const workspaceRoot = JSON.stringify(this.workspaceFolderFor(document)?.uri.fsPath || '').replace(/</g, '\\u003c');
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline'; connect-src https:; img-src ${webview.cspSource} https: data: vscode-file: vscode-webview:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Infinite Canvas</title>
    
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            background: #1e1e1e;
        }
        
        #canvas-container {
            width: 100%;
            height: 100%;
            position: relative;
        }
        
        canvas {
            display: block;
            cursor: grab;
            background: #1e1e1e;
        }
        
        canvas:active {
            cursor: grabbing;
        }
    </style>
</head>
<body>
    <div id="canvas-container">
        <canvas id="canvas"></canvas>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        window.workspaceRoot = ${workspaceRoot};
        
        window.vsCodeAPI = {
            postMessage: (message) => vscode.postMessage(message),
            setState: (state) => vscode.setState(state),
            getState: () => vscode.getState()
        };
        
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'loadContent':
                    if (window.loadCanvasContent) {
                        window.loadCanvasContent(message.content);
                    }
                    break;
            }
        });
        
        vscode.postMessage({ type: 'ready' });
    </script>
    
    <script nonce="${nonce}" type="module" src="${mainScriptUri}"></script>
</body>
</html>`;
    }
    private async getGroqApiKey(): Promise<string | null> {
        try {
            const config = vscode.workspace.getConfiguration('infinite-canvas-cinema');
            const configApiKey = config.get<string>('groqApiKey');
            if (configApiKey && configApiKey.trim()) {
                return configApiKey.trim();
            }
            const envApiKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
            if (envApiKey && envApiKey.trim()) {
                return envApiKey.trim();
            }
            return null;
        }
        catch (error) {
            console.error('Error getting Groq API key:', error);
            return null;
        }
    }
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
