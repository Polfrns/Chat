const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const base=path.resolve(path.dirname(require.resolve('@librechat/agents')),'../..');
const version=JSON.parse(fs.readFileSync(path.join(base,'package.json'))).version;
if(version!=='3.2.35')throw new Error('Review observability exporter patch for @librechat/agents '+version);
for(const [dir,ext] of [['cjs','cjs'],['esm','mjs']]) {
  const privacyPath=JSON.stringify(path.join(root,'config/observability/privacy.cjs'));
  const contextPath=JSON.stringify(path.join(root,'config/observability/context.cjs'));
  function patch(name, transform) {
    const file=path.join(base,'dist',dir,name+'.'+ext);
    const source=fs.readFileSync(file,'utf8');
    if(source.includes('ROKO_OBSERVABILITY_V072'))return;
    if(source.includes('ROKO_OBSERVABILITY_V071'))throw new Error('Run npm ci before upgrading the observability package patch');
    const output=transform(source);
    if(output===source)throw new Error('Observability patch target changed: '+file);
    fs.writeFileSync(file,'// ROKO_OBSERVABILITY_V072\n'+output);
  }
  patch('langfuseToolOutputTracing',source=>{
    const constructor=dir==='cjs' ? 'new _langfuse_otel.LangfuseSpanProcessor(params)' : 'new LangfuseSpanProcessor(params)';
    // The CJS package uses a different generated import identifier; locate it exactly.
    const pattern=/new [\w.]*LangfuseSpanProcessor\(params\)/;
    if(!pattern.test(source))throw new Error('Langfuse constructor not found');
    const prefix=dir==='esm' ? `import rokoPrivacy from ${privacyPath};\n` : `const rokoPrivacy=require(${privacyPath});\n`;
    return prefix+source.replace(pattern,match=>`rokoPrivacy.protectProcessor(${match.replace('(params)','({...params,mediaUploadEnabled:false,mask:({data})=>rokoPrivacy.maskData(data)})')},{provider:'roko'})`);
  });
  patch('run',source=>{
    const stream='langfuse: streamLangfuseConfig,';
    const title='langfuse: titleLangfuseConfig,';
    if(source.split(stream).length!==3 || source.split(title).length!==3)throw new Error('Langfuse run callsites changed');
    const streamAction='}, consumeStream)';
    if(!source.includes(streamAction))throw new Error('Interaction stream boundary changed');
    return source.replaceAll(stream,stream+"tenantId: config.configurable?.user?.tenantId ?? '',")
      .replace(streamAction,",interaction: {messages:stateInputs?.messages,output:()=>graph.getRunMessages(),signal:config.signal,onContext:ctx=>{this.rokoInteractionContext=ctx;}},"+streamAction)
      .replaceAll(title,title+"parentContext:this.rokoInteractionContext,tenantId: chainOptions?.configurable?.user?.tenantId ?? '',");
  });
  patch('langfuse',source=>{
    const prefix=dir==='esm' ? `import rokoContext from ${contextPath};\n` : `const rokoContext=require(${contextPath});\n`;
    source=source.replace('function createLangfuseHandler({ langfuse, userId, sessionId, traceMetadata, tags })','function createLangfuseHandler({ langfuse, userId, sessionId, traceMetadata, tags, tenantId })');
    source=source.replace(/(sessionId,\n\t\ttraceMetadata,)/,'$1\n\t\t...rokoContext.sessionIdentity(userId,sessionId,process.env,tenantId ?? ""),');
    const expression=dir==='esm' ? 'propagateAttributes' : '(0, _langfuse_tracing.propagateAttributes)';
    const target=`return ${expression}(createPropagateAttributeParams(params), action);`;
    if(!source.includes(target))throw new Error('Langfuse propagation changed');
    source=source.replace(target,`return rokoContext.withParent(params, () => rokoContext.withContext(params, identity => ${expression}({...createPropagateAttributeParams(params),...identity, ...(params.interaction || params.parentContext ? {traceName:'roko.interaction'} : {})}, () => rokoContext.interaction(params, action))));`);
    return prefix+source;
  });
}
console.log('Observability export privacy and session context installed for agents '+version);
