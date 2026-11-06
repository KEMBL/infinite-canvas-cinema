const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const vscode={Uri:{joinPath:()=>({})},workspace:{getWorkspaceFolder(){},workspaceFolders:[]}};
const host=vm.createContext({require:n=>n==='vscode'?vscode:n==='./dragDiagnostics'?require('../out/dragDiagnostics'):require(n),exports:{},console,Buffer});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8')+'\nglobalThis.Provider=CanvasEditorProvider;',host);
const panel={cspSource:'vscode-test:',asWebviewUri(){return 'test:';}};
const documentInfo={uri:{}};
function boot(diagnostics){
 const provider=new host.Provider({},diagnostics);const html=provider.getHtmlForWebview(panel,documentInfo);
 const script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
 const events=[], windowListeners={}, documentListeners={};
 const win={addEventListener(type,fn){(windowListeners[type] ||= []).push(fn);}};
 const document={addEventListener(type,fn){(documentListeners[type] ||= []).push(fn);},dispatchEvent(event){
   for(const fn of windowListeners[event.type] || []) fn(event);
   for(const fn of documentListeners[event.type] || []) fn(event);
 }};
 const api={postMessage(m){events.push(m);},setState(){},getState(){}};
 vm.runInNewContext(script,{window:win,document,acquireVsCodeApi:()=>api,WeakMap,Array,Boolean,Date,Event:class {constructor(type){this.type=type;}}});
 return {events,windowListeners,documentListeners,win};
}
const release=boot(undefined);assert.equal(release.win.canvasDiagnostics,undefined);assert.equal(release.windowListeners.dragenter,undefined);
const dev=boot({record(){}});assert.equal(dev.events[0].event,'webview.bootstrap');
assert.ok(dev.events.some(e=>e.event==='webview.capture_listeners_ready'));
assert.equal(dev.events.filter(e=>e.event==='webview.capture_entry' && e.fields.eventType==='diagnostic_probe').length,2);
assert.equal(dev.events.filter(e=>e.event==='webview.capture' && e.fields.eventType==='diagnostic_probe').length,2);
dev.events.length=0;
const payload='secret text that must not be logged';
const transfer={types:['text/plain','CodeEditors','application/vnd.code.resources'],files:[{name:'cat.png',size:42,type:'image/png'}],items:[{kind:'file',type:'image/png'}],getData(type){return type==='text/plain'?payload:'abc';},effectAllowed:'copyMove',dropEffect:'copy'};
const event={dataTransfer:transfer,target:{id:'canvas'},shiftKey:true,ctrlKey:false,altKey:false,metaKey:false,clientX:10,clientY:20};
dev.windowListeners.drop[0](event);dev.documentListeners.drop[0](event);
const captures=dev.events.filter(e=>e.event==='webview.capture');assert.equal(captures.length,2);assert.equal(captures[0].fields.eventId,captures[1].fields.eventId);
assert.ok(captures[0].fields.typeLengths.includes('text/plain:'+payload.length));assert.ok(captures[0].fields.typeLengths.includes('CodeEditors:3'));
assert.equal(JSON.stringify(captures).includes(payload),false);assert.equal(JSON.stringify(captures).includes('cat.png'),false);
const throwing={get dataTransfer(){throw new TypeError('metadata unavailable');}};
dev.windowListeners.dragenter[0](throwing);
assert.ok(dev.events.some(e=>e.event==='webview.capture_entry'&&e.fields.eventType==='dragenter'));
assert.ok(dev.events.some(e=>e.event==='webview.capture_error'&&e.fields.errorName==='TypeError'));
dev.windowListeners.error[0]({target:{tagName:'SCRIPT'},filename:'vscode://app/main.js',lineno:12,colno:4,message:'Uncaught TypeError: Cannot read properties of secret text'});assert.equal(dev.events.at(-1).event,'webview.script_error');assert.equal(dev.events.at(-1).fields.source,'main.js');assert.equal(dev.events.at(-1).fields.line,12);assert.equal(dev.events.at(-1).fields.errorMessage,'Cannot read properties');
console.log('Development-only bootstrap and capture metadata checks passed');
