const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const root='C:\\workspace'; const makeUri=relative=>({fsPath:path.join(root,relative),scheme:'file',authority:'',path:'/' + relative.replace(/\\/g,'/'),toString(){return this.fsPath;}});
const records=new Map();const add=(name,content)=>{const uri=makeUri(name);records.set(uri.fsPath,Buffer.from(content));return uri;};
const a=add('refs/a/cat.png','image'),b=add('refs/b/cat.png','image'),different=add('refs/c/cat.png','different');
const messages=[],warnings=[];let pickMode='last',itemsShown=[];
const vscode={Uri:{joinPath(){}},FileType:{File:1},RelativePattern:class {constructor(folder,pattern){this.folder=folder;this.pattern=pattern;}},
  workspace:{workspaceFolders:[],asRelativePath(uri){return uri.name || 'board';},getWorkspaceFolder(){return {uri:{fsPath:root,scheme:'file',authority:''}};},async findFiles(){return [a,b,different];},fs:{
    async stat(uri){return {size:records.get(uri.fsPath).length,type:1};},async readFile(uri){return records.get(uri.fsPath);}}},
  window:{async showQuickPick(items){itemsShown=items;return pickMode==='cancel'?undefined:items.at(-1);},showWarningMessage(text){warnings.push(text);}}};
const host=vm.createContext({require:n=>n==='vscode'?vscode:n==='./dragDiagnostics'?require('../out/dragDiagnostics'):require(n),exports:{},Buffer,console:{log(){},error(){}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../out/extension.js'),'utf8')+'\nglobalThis.Provider=CanvasEditorProvider;',host);
const provider=new host.Provider({}); const panel={webview:{postMessage(m){messages.push(m);}}};
const doc={uri:{}};
(async()=>{
  const request={name:'cat.png',size:5,sha256:crypto.createHash('sha256').update('image').digest('hex'),x:30,y:40,revision:2};
  await provider.resolveDroppedImage(panel,doc,request);
  assert.deepEqual(Array.from(itemsShown,x=>x.label),['refs/a/cat.png','refs/b/cat.png']);
  assert.equal(messages[0].filePath,'refs/b/cat.png');assert.equal(messages[0].revision,2);
  pickMode='cancel';await provider.resolveDroppedImage(panel,doc,request);assert.equal(messages.length,1);
  await provider.resolveDroppedImage(panel,doc,{...request,sha256:'0'.repeat(64)});
  assert.equal(messages.length,1);assert.ok(warnings.at(-1).includes('No matching image'));
  // Explorer selection uses its actual URIs and targets only an active/selected canvas.
  const sent=[];
  provider.webviews.set('board',{document:doc,panel:{active:true,webview:{async postMessage(m){sent.push(m);return true;}}}});
  await provider.addImagesToCanvas([a,b]);
  assert.deepEqual(Array.from(sent[0].paths),['refs/a/cat.png','refs/b/cat.png']);
  assert.equal(sent[0].type,'addImagesToCanvas');
  const outside={scheme:'file',authority:'',path:'/other/cat.png',fsPath:'C:\\outside\\cat.png'};
  await provider.addImagesToCanvas([outside]);assert.equal(sent.length,1);
  assert.ok(warnings.at(-1).includes('workspace'));
  let revealed=0;
  const hiddenPanel={active:false,viewColumn:2,reveal(column,preserveFocus){revealed++;assert.equal(column,2);assert.equal(preserveFocus,false);},webview:{async postMessage(m){sent.push(m);return true;}}};
  provider.webviews.clear();provider.webviews.set('hidden',{document:doc,panel:hiddenPanel});
  await provider.addImagesToCanvas([a]);assert.equal(revealed,1);assert.deepEqual(Array.from(sent.at(-1).paths),['refs/a/cat.png']);
  const firstPanel={...hiddenPanel,reveal(){throw new Error('Wrong canvas selected');}};
  provider.webviews.clear();provider.webviews.set('first',{document:{uri:{name:'first'}},panel:firstPanel});
  provider.webviews.set('second',{document:{uri:{name:'second'}},panel:hiddenPanel});
  pickMode='last'; await provider.addImagesToCanvas([b]);
  assert.equal(revealed,2);assert.deepEqual(Array.from(sent.at(-1).paths),['refs/b/cat.png']);
  console.log('Workspace image matching and Explorer selection checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
