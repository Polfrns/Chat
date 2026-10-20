'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {createHmac}=require('node:crypto');
const {context,trace}=require('@opentelemetry/api');
const {sanitizeContent}=require('./privacy.cjs');
// Native SDK and bundled API must share the same request-local store.
const key=Symbol.for('roko.observability.context.v071');
const storage=globalThis[key] ??= new AsyncLocalStorage();
function sessionIdentity(userId,conversationId,env=process.env,tenantId='') {
  const key=env.CLAUDE_BRIDGE_KEY || env.OBSERVABILITY_SESSION_SECRET;
  if(!key || key.length<32 || !userId || !conversationId)return {};
  const hash=parts=>createHmac('sha256',key).update(JSON.stringify(parts)).digest('hex');
  return {sessionId:hash(['telemetry-session',tenantId,userId,conversationId]),userId:hash(['telemetry-user',tenantId,userId])};
}
function withContext(params,action) {
  const identity=sessionIdentity(params.userId,params.sessionId,process.env,params.tenantId ?? '');
  return storage.run(identity,()=>action(identity));
}
function messageContent(messages, role) {
  if (!Array.isArray(messages)) return undefined;
  const message = [...messages].reverse().find(item => {
    const type = item?.getType?.() ?? item?._getType?.() ?? item?.role ?? item?.type;
    return role === 'user' ? ['user','human'].includes(type) : ['assistant','ai'].includes(type);
  });
  return message?.content;
}
async function interaction(params, action) {
  if (!params.interaction) return action();
  const details = params.interaction;
  let execution;
  const once = () => execution ??= Promise.resolve().then(action);
  try {
    const tracing = require('@langfuse/tracing');
    // Keep propagated attributes, but never inherit an arbitrary HTTP/client span.
    return await context.with(trace.deleteSpan(context.active()), () =>
      tracing.startActiveObservation('roko.interaction', async root => {
        try { details.onContext?.(context.active()); } catch {}
        try { root.update({input: sanitizeContent(messageContent(details.messages, 'user')), metadata:{provider:'roko',state:'started'}}); } catch {}
        try {
          const result = await once();
          try { root.update({output:sanitizeContent(messageContent(details.output?.(), 'assistant')),
            metadata:{provider:'roko',state:details.signal?.aborted ? 'cancelled' : 'completed'}}); } catch {}
          return result;
        } catch (error) {
          try { root.update({level:'ERROR',metadata:{provider:'roko',state:details.signal?.aborted ? 'cancelled' : 'failed'}}); } catch {}
          throw error;
        }
      }));
  } catch (error) {
    // An exporter failure must never cause the model or tool to execute twice.
    if (execution) return execution;
    return once();
  }
}
function withParent(params, action) {
  return params.parentContext ? context.with(params.parentContext, action) : action();
}
function trustedHeaders(url,headers={},env=process.env) {
  const safe=Object.fromEntries(Object.entries(headers).filter(([k])=>!['traceparent','tracestate','baggage','x-observability-context','x-observability-signature'].includes(k.toLowerCase())));
  let target; try {target=new URL(url);}catch{return safe;}
  const allowed=[env.ROKO_BRIDGE_BASE_URL, ...(env.OBSERVABILITY_TRACE_TARGETS || '').split(',')].filter(Boolean).some(raw=>{
    try {const u=new URL(raw.trim()); const p=u.pathname.replace(/\/$/,''); return target.origin===u.origin && (target.pathname===p || target.pathname.startsWith(p+'/'));}catch{return false;}
  });
  const key=env.OBSERVABILITY_TRACE_SECRET;
  try {
  const span=trace.getSpan(context.active())?.spanContext();
  const identity=storage.getStore();
  if(!allowed || !key || key.length<32 || !span || !identity?.sessionId)return safe;
  const traceparent=`00-${span.traceId}-${span.spanId}-${(span.traceFlags & 1).toString(16).padStart(2,'0')}`;
  const payload=Buffer.from(JSON.stringify({...identity,traceparent,tracestate:span.traceState?.serialize() || '',timestamp:Date.now()})).toString('base64url');
  return {...safe,traceparent,...(span.traceState?{tracestate:span.traceState.serialize()}:{}),
    'X-Observability-Context':payload,'X-Observability-Signature':createHmac('sha256',key).update(payload).digest('hex')};
  }catch{return safe;}
}
module.exports={sessionIdentity,withContext,interaction,withParent,messageContent,trustedHeaders};
