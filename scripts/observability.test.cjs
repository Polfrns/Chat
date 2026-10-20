const test=require('node:test');
const assert=require('node:assert/strict');
const {context,trace,ROOT_CONTEXT}=require('@opentelemetry/api');
const {AsyncLocalStorageContextManager}=require('@opentelemetry/context-async-hooks');
const {createHmac}=require('node:crypto');
const {sessionIdentity,withContext,trustedHeaders}=require('../config/observability/context.cjs');
const privacy=require('../config/observability/privacy.cjs');
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
const key='k'.repeat(32),secret='t'.repeat(32);
const env={CLAUDE_BRIDGE_KEY:key,OBSERVABILITY_TRACE_SECRET:secret,OBSERVABILITY_TRACE_TARGETS:'http://bridge:4000/v1,http://filestore:8000/mcp'};

test('stable namespaced Sessions do not reuse request trace IDs',()=>{
  const a=sessionIdentity('user1','conv1',env);
  assert.equal(a.sessionId,sessionIdentity('user1','conv1',env).sessionId);
  assert.notEqual(a.sessionId,sessionIdentity('user2','conv1',env).sessionId);
  assert.notEqual(a.sessionId,sessionIdentity('user1','conv2',env).sessionId);
  assert.notEqual(a.sessionId,sessionIdentity('user1','conv1',env,'tenant2').sessionId);
  assert.equal(a.sessionId,createHmac('sha256',key).update(JSON.stringify(['telemetry-session','','user1','conv1'])).digest('hex'));
});
test('trusted context is request-local; external targets and supplied trace headers are stripped',async()=>{
  process.env.CLAUDE_BRIDGE_KEY=key;
  const spanContext={traceId:'1'.repeat(32),spanId:'2'.repeat(16),traceFlags:1};
  const ctx=trace.setSpanContext(ROOT_CONTEXT,spanContext);
  await Promise.all(['u1','u2'].map(userId=>withContext({userId,sessionId:'same'},()=>context.with(ctx,async()=>{
    await Promise.resolve();
    const h=trustedHeaders('http://filestore:8000/mcp',{'Authorization':'Bearer auth','traceparent':'forged','baggage':'private'},env);
    assert.equal(h.Authorization,'Bearer auth');assert.equal(h.baggage,undefined);
    const identity=JSON.parse(Buffer.from(h['X-Observability-Context'],'base64url'));
    assert.equal(identity.userId,sessionIdentity(userId,'same',env).userId);
    assert.equal(h['X-Observability-Signature'],createHmac('sha256',secret).update(h['X-Observability-Context']).digest('hex'));
    for(const url of ['https://external.example/mcp','http://filestore:8000/mcp-evil','http://filestore:9000/mcp']) {
      const external=trustedHeaders(url,h,env);
      assert.equal(external.traceparent,undefined);assert.equal(external['X-Observability-Context'],undefined);
    }
  }))));
});
test('export projection removes Base64 docs, PDF/code, auth and exception payloads without mutation',()=>{
  const source={name:'AgentRun',attributes:{'langfuse.observation.input':JSON.stringify({data:'UEsDBSECRET_DOCX',pdf:'JVBERSECRET_PDF',code:'SECRET_CODE',Authorization:'SECRET_AUTH'}),
    'session.id':'1'.repeat(64),'db.statement':'SECRET_SQL'},events:[{name:'SECRET_EVENT'}],status:{code:2,message:'SECRET_ERROR'}};
  const text=JSON.stringify(source);const safe=privacy.sanitizeSpan(source);
  assert.equal(JSON.stringify(source),text);assert.doesNotMatch(JSON.stringify(safe),/SECRET_|UEsDB|JVBER/);
  assert.equal(safe.attributes['session.id'],'1'.repeat(64));
});
