const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let onChange, onMessage, releaseEdit, editStarted;
const started = new Promise(resolve => {editStarted = resolve;});
const applies = [], recovery = [], messages = [], errors = [];
let mode = 'delayed';
const uri = {toString:()=> 'file:///board.canvas', fsPath:'/board.canvas'};
const doc = {uri, version:1, text:'original', lineCount:1, getText(){return this.text;}};
class WorkspaceEdit {replace(_uri, _range, content) {this.content = content;}}
class Range {constructor() {}}
const vscode = {
  Uri:{joinPath:(_uri,...parts)=>({fsPath:parts.join('/'),toString:()=>parts.join('/')})},
  WorkspaceEdit, Range,
  workspace:{workspaceFolders:[], getWorkspaceFolder(){return undefined;},
    onDidChangeTextDocument(fn){onChange=fn;return {dispose(){}};},
    async applyEdit(edit){
      applies.push(edit.content);
      if (mode === 'false') {mode = 'success'; return false;}
      if (mode === 'throw') {mode = 'success'; throw new Error('test failure');}
      doc.text=edit.content; doc.version++;
      onChange({document:doc});
      if (mode === 'delayed') {
        editStarted();
        await new Promise(resolve=>{releaseEdit=resolve;});
      }
      return true;
    },
    async openTextDocument({content}) {recovery.push(content); return {content};}
  },
  window:{async showTextDocument(){}, showWarningMessage(){}, showErrorMessage(text){errors.push(text);}},
  commands:{async executeCommand(){}}
};
const context=vm.createContext({require:name=>name==='vscode'?vscode:require(name),exports:{},Buffer,console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8')+'\nglobalThis.Provider=CanvasEditorProvider;',context);
const panel={active:true,webview:{cspSource:'test',asWebviewUri:()=>'',postMessage(m){messages.push(m);},onDidReceiveMessage(fn){onMessage=fn;}},onDidDispose(){}};
(async()=>{
  const provider=new context.Provider({});
  await provider.resolveCustomTextEditor(doc,panel,{});
  onMessage({type:'save',content:'own',baseVersion:1});
  await started;
  onMessage({type:'save',content:'stale',baseVersion:1});
  doc.text='external'; doc.version++; onChange({document:doc});
  releaseEdit();
  for(let i=0;i<12;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(applies,['own']);
  assert.equal(doc.text,'external');
  assert.deepEqual(recovery,['stale']);
  assert.ok(messages.some(m=>m.type==='loadContent' && m.content==='external'));
  for (const failure of ['false', 'throw']) {
    mode = failure;
    const failed = `failed-${failure}`;
    onMessage({type:'save',content:failed,baseVersion:doc.version});
    onMessage({type:'save',content:`next-${failure}`,baseVersion:doc.version});
    for (let i=0;i<12;i++) await new Promise(resolve=>setImmediate(resolve));
    assert.ok(recovery.includes(failed));
    assert.equal(doc.text,`next-${failure}`);
  }
  assert.equal(errors.length,2);
  // Deliver actual host responses to the canvas after two saves were sent.
  const listeners = {};
  const web = vm.createContext({console:{log(){},error(){}}, setTimeout,clearTimeout,
    document:{readyState:'loading',addEventListener(){}},
    window:{vsCodeAPI:{postMessage: message => onMessage(message)},addEventListener(type,fn){listeners[type]=fn;}}});
  const main=fs.readFileSync(path.join(__dirname,'../webview/main.js'),'utf8')
    .replace("import { InfiniteCanvas } from './src/InfiniteCanvasSimple.js';",'')
    .replace(/\/\/ Initialize the app[\s\S]*$/, 'globalThis.App=VSCodeCanvasApp;');
  vm.runInContext(main,web);
  const app=new web.App(); let canvasData={nodes:[{id:'a',x:0}],edges:[]};
  app.canvas={canvas:{addEventListener(){}},canvasState:{onStateChange(){},
    exportCanvasData(){return canvasData;},loadCanvasData(data){canvasData=data;}},
    inputHandler:{handleMouseDown(){},handleMouseUp(){},resetDragState(){}},requestRender(){}};
  app.isInitialized=true; app.setupVSCodeIntegration(); web.window.canvasApp=app;
  doc.text=JSON.stringify(canvasData); doc.version++;
  app.loadCanvasContent(doc.text,doc.version);
  messages.length=0; mode='false';
  canvasData.nodes[0].x=1; app.canvas.canvasState.onStateChange(); app.flushSave();
  canvasData.nodes[0].x=2; app.canvas.canvasState.onStateChange(); app.flushSave();
  for(let i=0;i<12;i++) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.parse(doc.text).nodes[0].x,2);
  assert.ok(messages.some(m=>m.type==='loadContent' && m.afterSaveId===1));
  for(const message of messages) {
    if(message.type==='loadContent') app.loadCanvasContent(message.content,message.version,message.afterSaveId);
    else listeners.message({data:message});
  }
  assert.equal(canvasData.nodes[0].x,2);
  assert.equal(app.documentVersion,doc.version);
  console.log('Host conflict, recovery, and queued canvas synchronization checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
