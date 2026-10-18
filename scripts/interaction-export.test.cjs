const test = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {spawn} = require('node:child_process');
const {gunzipSync} = require('node:zlib');
const path = require('node:path');
const {createHash} = require('node:crypto');

for (const mode of ['redacted', 'debug']) {
  test(`real LangChain callbacks share one interaction trace; ${mode} content is sanitized`, async () => {
    const batches = [];
    const collector = createServer(async (req,res) => {
      const chunks=[]; for await (const chunk of req) chunks.push(chunk);
      let body=Buffer.concat(chunks); if(req.headers['content-encoding']==='gzip')body=gunzipSync(body);
      batches.push(JSON.parse(body)); res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
    });
    await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
    const script = `
      const path=require('node:path');
      const base=path.dirname(require.resolve('@librechat/agents'));
      const {runWithTraceIdSeed}=require(path.join(base,'instrumentation.cjs'));
      const {withLangfuseAttributes,createLangfuseHandler}=require(path.join(base,'langfuse.cjs'));
      const {Run}=require(path.join(base,'run.cjs'));
      const {RunnableLambda,RunnableSequence}=require('@langchain/core/runnables');
      const {HumanMessage,AIMessage}=require('@langchain/core/messages');
      const tracing=require('@langfuse/tracing');
      const {trustedHeaders}=require('./config/observability/context.cjs');
      (async()=>{
        for(let i=0;i<4;i++) {
          const controller=new AbortController();
          let executions=0;
          const user=i===2?'another-user':'test-user';
          const handler=createLangfuseHandler({userId:user,sessionId:'conversation'});
          const message=new HumanMessage({content:[{type:'text',text:'VISIBLE_QUESTION password=DO_NOT_EXPORT'},
            {type:'file',source_type:'base64',mime_type:'application/pdf',data:'JVBERi0_DO_NOT_EXPORT'}]});
          const sequence=RunnableSequence.from([
            RunnableLambda.from(async value=>value).withConfig({runName:'prompt'}),
            RunnableLambda.from(async()=>{
              executions++;
              const headers=trustedHeaders('http://cli-bridge:4000/v1/chat/completions');
              if(!headers.traceparent)throw Error('missing signed trace context');
              const payload=JSON.parse(Buffer.from(headers['X-Observability-Context'],'base64url'));
              const {trace,context}=require('@opentelemetry/api');
              const active=trace.getSpan(context.active()).spanContext();
              if(payload.traceparent.split('-')[1]!==active.traceId)throw Error('context split');
              await tracing.startActiveObservation('bridge.request',async span=>{
                await tracing.startActiveObservation('model.codex',async model=>{
                  const tool=model.startObservation('workspace.read',{}, {asType:'tool'});tool.end();
                },{asType:'generation'});
              });
              if(i===2)throw Error('DO_NOT_EXPORT_ERROR');
              if(i===3){controller.abort();throw Error('DO_NOT_EXPORT_CANCEL');}
              return new AIMessage('VISIBLE_ANSWER');
            }).withConfig({runName:'lambda'})
          ]).withConfig({runName:'AgentRun'});
          try {
            const run=Object.create(Run.prototype);
            Object.assign(run,{id:'response-'+i,langfuse:{deterministicTraceId:true},skipCleanup:true,
              graphRunnable:sequence,Graph:{defaultAgentId:'agent',agentContexts:new Map([['agent',{name:'agent'}]]),
                resetValues(){},getRunMessages(){return [message,new AIMessage('VISIBLE_ANSWER')];},getCalibrationRatio(){return 1;}}});
            await run.processStream({messages:[message]}, {runName:'AgentRun',version:'v2',configurable:{user_id:user,thread_id:'conversation',user:{id:user}},signal:controller.signal});
            // Title chains may execute after the response, outside its async scope.
            await withLangfuseAttributes({userId:user,sessionId:'conversation',parentContext:run.rokoInteractionContext},
              ()=>RunnableLambda.from(async()=> 'VISIBLE_TITLE').withConfig({runName:'TitleRun'}).invoke('title',{callbacks:[createLangfuseHandler({userId:user,sessionId:'conversation'})]}));
          } catch(error) {if(i<2)throw error;}
          if(executions!==1)throw Error('model executed more than once');
        }
        await tracing.getLangfuseTracerProvider().shutdown();
      })().catch(error=>{console.error(error);process.exitCode=1});
    `;
    const child=spawn(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),env:{...process.env,
      LANGFUSE_TRACING_ENABLED:'true',LANGFUSE_BASE_URL:`http://127.0.0.1:${collector.address().port}`,
      LANGFUSE_PUBLIC_KEY:'pk-test',LANGFUSE_SECRET_KEY:'sk-test',CLAUDE_BRIDGE_KEY:'k'.repeat(32),
      OBSERVABILITY_TRACE_SECRET:'t'.repeat(32),ROKO_BRIDGE_BASE_URL:'http://cli-bridge:4000/v1',
      OBSERVABILITY_TRACE_TARGETS:'',OBSERVABILITY_CONTENT_MODE:mode,OTEL_TRACES_SAMPLER:'always_on'},stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
    const code=await new Promise(resolve=>child.on('close',resolve));
    await new Promise(resolve=>collector.close(resolve));assert.equal(code,0,output);
    const spans=batches.flatMap(b=>b.resourceSpans??[]).flatMap(r=>r.scopeSpans??[]).flatMap(s=>s.spans??[]);
    const roots=spans.filter(s=>s.name==='roko.interaction');assert.equal(roots.length,4,JSON.stringify(spans));
    const attr=(span,key)=>span.attributes.find(a=>a.key===key)?.value.stringValue;
    for(const root of roots)assert.equal(attr(root,'langfuse.observation.metadata.contentMode'),mode);
    assert.equal(new Set(roots.map(s=>s.traceId)).size,4);
    assert.equal(attr(roots[0],'session.id'),attr(roots[1],'session.id'));
    assert.notEqual(attr(roots[0],'session.id'),attr(roots[2],'session.id'));
    for(let i=0;i<4;i++) {
      const id=createHash('sha256').update('response-'+i).digest('hex').slice(0,32);
      const group=spans.filter(s=>s.traceId===id);
      assert.ok(group.some(s=>s.name==='AgentRun'),JSON.stringify(spans));
      assert.ok(group.some(s=>s.name==='bridge.request'));
      for(const span of group.filter(s=>s.name!=='roko.interaction'))assert.ok(group.some(p=>p.spanId===span.parentSpanId),JSON.stringify(span));
    }
    assert.equal(new Set(spans.map(s=>s.traceId)).size,4,JSON.stringify(spans));
    assert.ok(roots.some(s=>attr(s,'langfuse.observation.metadata.state')==='cancelled'));
    const exported=JSON.stringify(batches);
    assert.doesNotMatch(exported,/DO_NOT_EXPORT|JVBERi0|test-user|another-user|conversation/);
    if(mode==='debug'){assert.match(exported,/VISIBLE_QUESTION/);assert.match(exported,/VISIBLE_ANSWER/);}
    else assert.doesNotMatch(exported,/VISIBLE_QUESTION|VISIBLE_ANSWER/);
  });
}
