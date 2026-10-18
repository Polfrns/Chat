const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const {gunzipSync}=require('node:zlib');
const path=require('node:path');
test('actual patched agents exporter groups sessions and removes document/model payloads before OTLP',async()=>{
  const batches=[];
  const collector=createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);
    let body=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')body=gunzipSync(body);
    batches.push(JSON.parse(body.toString()));
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
  });
  await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
  const script=`
    const path=require('node:path');
    const base=path.dirname(require.resolve('@librechat/agents'));
    require(path.join(base,'instrumentation.cjs'));
    const {withLangfuseAttributes}=require(path.join(base,'langfuse.cjs'));
    const t=require('@langfuse/tracing');
    const {trustedHeaders}=require('./config/observability/context.cjs');
    (async()=>{
      for(let i=0;i<2;i++)await withLangfuseAttributes({userId:'user1',sessionId:'conversation1'},()=>
        t.startActiveObservation('AgentRun',async span=>{
          span.update({input:{messages:[{type:'file',data:'UEsDBSECRET_DOCX'}],pdf:'JVBERSECRET_PDF',code:'SECRET_CODE',Authorization:'SECRET_AUTH'},output:'SECRET_DOCUMENT'});
          const headers=trustedHeaders('http://filestore:8000/mcp');
          if(!headers.traceparent)throw Error('missing trusted W3C context');
        }));
      await t.getLangfuseTracerProvider().shutdown();
    })().catch(e=>{console.error(e);process.exitCode=1});
  `;
  const child=spawn(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),
    env:{...process.env,LANGFUSE_BASE_URL:`http://127.0.0.1:${collector.address().port}`,LANGFUSE_PUBLIC_KEY:'pk-test',LANGFUSE_SECRET_KEY:'sk-test',
      CLAUDE_BRIDGE_KEY:'k'.repeat(32),OBSERVABILITY_TRACE_SECRET:'t'.repeat(32),OBSERVABILITY_TRACE_TARGETS:'http://filestore:8000/mcp',OTEL_TRACES_SAMPLER:'always_on'},stdio:['ignore','pipe','pipe']});
  let err='';child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>err+=c);
  const code=await new Promise(resolve=>child.on('close',resolve));await new Promise(resolve=>collector.close(resolve));
  assert.equal(code,0,err);
  const spans=batches.flatMap(b=>b.resourceSpans??[]).flatMap(r=>r.scopeSpans??[]).flatMap(s=>s.spans??[]);
  assert.equal(spans.length,2,JSON.stringify(batches)+' '+err);
  assert.notEqual(spans[0].traceId,spans[1].traceId);
  const sessions=spans.map(s=>s.attributes.find(a=>a.key==='session.id').value.stringValue);
  assert.equal(sessions[0],sessions[1]);assert.match(sessions[0],/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(batches),/SECRET_|UEsDB|JVBER|conversation1|user1/);
});
