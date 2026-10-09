const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const patch = root;
const quiet = {log() {}, warn() {}, error() {}};
const messages = [];
const ui = vm.createContext({URL, console: quiet, window: {workspaceRoot: 'C:/projects/example-project', vsCodeAPI: {postMessage: m => messages.push(m)}}, setTimeout() {}});
vm.runInContext(fs.readFileSync(path.join(patch, 'webview/src/InfiniteCanvasSimple.js'), 'utf8').replace('export class InfiniteCanvas', 'class InfiniteCanvas') + '\nglobalThis.audit = {CanvasState, InputHandler, CanvasRenderer};', ui);
const {CanvasState, InputHandler, CanvasRenderer} = ui.audit;
const results = [];
function check(name, run) {try {run(); results.push({name, passed: true});} catch (error) {results.push({name, passed: false, detail: error.message});}}
const plain = value => JSON.parse(JSON.stringify(value));
check('Tag suggestion, normalization, invalid-character rejection and duplicate rejection', () => {
  const state = new CanvasState();
  const first = state.createFileNode('refs/characters/Reference still.png');
  const second = state.createFileNode('refs/characters/Reference still.png');
  assert.equal(first.tag, 'Reference_still');
  assert.equal(second.tag, undefined);
  assert.equal(state.applyTag(first, '@character_A_v1').ok, true);
  assert.equal(first.tag, 'character_A_v1');
  assert.equal(state.applyTag(second, 'character_A_v1').ok, false);
  assert.equal(state.applyTag(second, 'bad tag').ok, false);
  assert.equal(state.applyTag(first, '').ok, true);
  assert.equal(first.tag, undefined);
});
check('Copy tag posts clipboard message; an untagged node opens tag editing', () => {
  const handler = Object.create(InputHandler.prototype);
  let editing = false;
  handler.editNodeTag = () => {editing = true;};
  messages.length = 0;
  handler.copyNodeTag({type: 'file', tag: 'character_A_v1'});
  assert.deepEqual(plain(messages.pop()), {type: 'copyToClipboard', text: '@character_A_v1'});
  handler.copyNodeTag({type: 'file'});
  assert.equal(editing, true);
});
check('Tagged file, group background, extra node/edge/document fields survive a normal round trip', () => {
  const state = new CanvasState();
  const data = {customRoot: {version: 1}, nodes: [
    {id: 'a', type: 'file', file: 'refs/a.png', tag: 'character_A_v1', x: 20, y: 30, width: 280, height: 360, color: '1', custom: {kept: true}},
    {id: 'g', type: 'group', label: 'References', background: 'refs/a.png', backgroundStyle: 'ratio', x: 10, y: 10, width: 500, height: 500}
  ], edges: [{id: 'e', fromNode: 'a', toNode: 'g', fromSide: 'right', toSide: 'left', custom: 'kept'}]};
  state.loadCanvasData(data);
  const out = plain(state.exportCanvasData());
  assert.equal(out.nodes[0].tag, 'character_A_v1');
  assert.deepEqual(out.nodes[0].custom, {kept: true});
  assert.equal(out.nodes[1].background, 'refs/a.png');
  assert.equal(out.edges[0].custom, 'kept');
  assert.deepEqual(out.customRoot, {version: 1});
});
check('Zero-valued canvas coordinates survive load/save', () => {
  const state = new CanvasState();
  state.loadCanvasData({nodes: [{id: 'a', type: 'text', text: 'old canvas', x: 0, y: 0, width: 250, height: 120}], edges: []});
  assert.equal(state.exportCanvasData().nodes[0].x, 0);
  assert.equal(state.exportCanvasData().nodes[0].y, 0);
});
check('An edge referencing a missing node is retained on save', () => {
  const state = new CanvasState();
  state.loadCanvasData({nodes: [{id: 'a', type: 'text', text: 'a'}], edges: [{id: 'e', fromNode: 'a', toNode: 'missing'}]});
  assert.equal(state.exportCanvasData().edges.length, 1);
});
check('Missing-image state retains the source path and tag', () => {
  const state = new CanvasState();
  const node = state.createFileNode('refs/a.png');
  state.applyTag(node, 'character_A_v1');
  state.setImageUri(node.id, undefined, true);
  assert.equal(node._imageBroken, true);
  const out = state.exportCanvasData().nodes[0];
  assert.equal(out.file, 'refs/a.png');
  assert.equal(out.tag, 'character_A_v1');
});
check('Deleting a card emits no file-delete operation', () => {
  const state = new CanvasState();
  const node = state.createFileNode('refs/a.png');
  messages.length = 0;
  state.deleteNode(node);
  assert.equal(state.nodes.length, 0);
  assert.equal(messages.some(m => /delete|remove/i.test(m.type)), false);
});
check('Absolute image drops retain nested paths in an arbitrary workspace', () => {
  const handler = Object.create(InputHandler.prototype);
  assert.equal(handler.convertToRelativePath('C:/projects/example-project/refs/characters/a.png'), 'refs/characters/a.png');
});
check('Image rendering includes tag caption and missing-file placeholder', () => {
  const renderer = new CanvasRenderer();
  const labels = [];
  const ctx = new Proxy({}, {get(target, key) {if (key === 'fillText') return text => labels.push(text); return () => {};}, set() {return true;}});
  renderer.drawImageFileNode(ctx, {id:'a', file:'refs/a.png', tag:'character_A_v1', x:20, y:20, width:280, height:360, _imageBroken:true});
  assert.ok(labels.includes('broken image'));
  assert.ok(labels.includes('@character_A_v1'));
});

check('Unknown source fields that overlap runtime properties survive round trips', () => {
  const state = new CanvasState();
  state.loadCanvasData({nodes:[{id:'a',type:'file',file:'refs/a.png',content:'custom source',backgroundColor:'custom',x:0,y:0}],edges:[{id:'e',fromNode:'a',toNode:'missing',from:'custom-from',to:'custom-to'}]});
  const data = plain(state.exportCanvasData());
  assert.equal(data.nodes[0].content,'custom source');
  assert.equal(data.nodes[0].backgroundColor,'custom');
  assert.equal(data.edges[0].from,'custom-from');
  assert.equal(data.edges[0].to,'custom-to');
});
check('File URI drops preserve nested paths and external/traversal paths are rejected', () => {
  const handler=Object.create(InputHandler.prototype);
  assert.equal(handler.convertToRelativePath('file:///C:/projects/example-project/refs/characters/a.png'),'refs/characters/a.png');
  assert.throws(()=>handler.convertToRelativePath('C:/outside/a.png'));
  assert.throws(()=>handler.convertToRelativePath('../outside/a.png'));
});
const files = new Map();
const warnings = [];
let warningChoice = "Overwrite";
let writeError;
const errors = [];
class FileSystemError extends Error { constructor() {super('missing'); this.code='FileNotFound';} }
const vscode = {
  FileSystemError,
  Uri: {joinPath: (uri, ...parts) => ({path: path.posix.join(uri.path, ...parts)})},
  workspace: {getConfiguration: () => ({get: () => false}), asRelativePath: () => 'boards/references.canvas', fs: {
    async stat(uri) {if (!files.has(uri.path)) throw new FileSystemError(); return {};},
    async writeFile(uri, data) {if(writeError) throw writeError; files.set(uri.path, data.toString('utf8'));}
  }},
  window: {showErrorMessage(text) {errors.push(text);}, showInformationMessage() {}, async showWarningMessage(text) {warnings.push(text); return warningChoice;}}
};
const host = vm.createContext({require: name => name === 'vscode' ? vscode : require(name), exports: {}, Buffer, console: quiet});
vm.runInContext(fs.readFileSync(path.join(patch, 'out/extension.js'), 'utf8') + '\nglobalThis.audit = {exportTagsForDocument, catalogToYaml};', host);
const document = nodes => ({uri: {path: '/workspace/boards/references.canvas', fsPath:'/workspace/boards/references.canvas'}, getText: () => JSON.stringify({nodes, edges: []})});
awaitMain();
async function awaitMain() {
  const node = {id: 'a', type: 'file', file: 'refs/characters/a.png', tag: 'character_A_v1'};
  await host.audit.exportTagsForDocument(document([node, {id:'b', type:'file', file:'refs/b.png'}, {id:'t', type:'text', tag:'ignore'}]));
  check('JSON/YAML export contains tagged file nodes with path, canvas and node ID', () => {
    assert.deepEqual(JSON.parse(files.get('/workspace/boards/references.tags.json')), {character_A_v1: {path:'refs/characters/a.png', canvas:'boards/references.canvas', nodeId:'a'}});
    assert.ok(files.get('/workspace/boards/references.tags.yaml').includes('\"character_A_v1\":'));
  });
  files.clear(); warnings.length = 0;
  files.set('/workspace/boards/references.tags.yaml', 'old YAML');
  await host.audit.exportTagsForDocument(document([node]));
  check('Overwrite confirmation protects an existing YAML-only export', () => {assert.ok(warnings.length > 0);});
  files.clear(); warnings.length = 0;
  await host.audit.exportTagsForDocument(document([node, {...node, id:'b', file:'refs/b.png'}]));
  check('Export refuses duplicate tags already present in canvas JSON', () => {assert.ok(warnings.length > 0);});
  files.clear(); warnings.length = 0;
  await host.audit.exportTagsForDocument(document([{...node, tag:'__proto__'}]));
  check('All allowed tag strings are retained as exported object keys', () => {assert.ok(Object.hasOwn(JSON.parse(files.get('/workspace/boards/references.tags.json')), '__proto__'));});
  files.clear(); warnings.length=0;
  files.set('/workspace/boards/references.tags.yaml','original'); warningChoice=undefined;
  await host.audit.exportTagsForDocument(document([node]));
  check('Cancelling overwrite preserves YAML and creates no JSON',()=>{
    assert.equal(files.get('/workspace/boards/references.tags.yaml'),'original');
    assert.equal(files.has('/workspace/boards/references.tags.json'),false);
  });
  warningChoice='Overwrite';files.clear();errors.length=0;
  writeError=new Error('permission denied');
  await host.audit.exportTagsForDocument(document([node]));
  check('Filesystem export failures are reported',()=>assert.ok(errors.some(error=>error.includes('permission denied'))));
  writeError=undefined;files.clear();warnings.length=0;
  await host.audit.exportTagsForDocument(document([{...node,tag:'invalid tag'}]));
  check('Imported invalid tags are rejected before writing',()=>{
    assert.ok(warnings.length);assert.equal(files.size,0);
  });
  try {
    const YAML = require('yaml');
    check('YAML and JSON preserve string tag keys and string node IDs', () => {
      const catalog = {'true': {path:'refs/a.png', canvas:'boards/references.canvas', nodeId:'123'}};
      assert.deepEqual(YAML.parse(host.audit.catalogToYaml(catalog)), catalog);
    });
  } catch (error) {results.push({name:'YAML parser verification', skipped: true, detail:error.message});}
  const failures = results.filter(result => !result.passed);
  if (failures.length) process.exitCode = 1;
  console.log(JSON.stringify(results, null, 2));
}
