'use client';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { isAliasOpen, type AliasKind } from '@/lib/alias';

type Alias = {
  id: string; address: string; kind: AliasKind; label: string;
  is_active: boolean; created_at: string; expires_at: string | null;
};
type Mail = {
  id: string; from_address: string; subject: string; body_text: string;
  otp_code: string | null; received_at: string;
};
type JsonResponse<T> = T & { error?: string };
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const client: SupabaseClient | null = publicUrl && publicKey ? createClient(publicUrl, publicKey) : null;

const duration = [{v:15,t:'15 minutos'},{v:60,t:'1 hora'},{v:1440,t:'24 horas'},{v:10080,t:'7 dias'}];
const niceDate = (iso:string) => new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});

export default function Home() {
  const [session,setSession] = useState<Session|null>(null);
  const [ready,setReady] = useState(false);
  const [loginEmail,setLoginEmail] = useState('');
  const [loginPassword,setLoginPassword] = useState('');
  const [isRegister,setIsRegister] = useState(false);
  const [aliases,setAliases] = useState<Alias[]>([]);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [messages,setMessages] = useState<Mail[]>([]);
  const [selectedMessageId,setSelectedMessageId] = useState<string|null>(null);
  const [kind,setKind] = useState<AliasKind>('temporary');
  const [ttl,setTtl] = useState(60);
  const [label,setLabel] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [loadingMsgs,setLoadingMsgs] = useState(false);
  const chosen = useMemo(()=>aliases.find(a=>a.id===selectedId),[aliases,selectedId]);
  const selectedMail = useMemo(()=>messages.find(m=>m.id===selectedMessageId),[messages,selectedMessageId]);
  const activeCount = aliases.filter(a=>isAliasOpen(a)).length;

  useEffect(()=>{
    if (!client) { setReady(true); return; }
    client.auth.getSession().then(({data})=>{setSession(data.session);setReady(true);});
    const {data:sub} = client.auth.onAuthStateChange((_event,s)=>{setSession(s);setReady(true);});
    return ()=>sub.subscription.unsubscribe();
  },[]);

  const call = useCallback(async <T,>(path:string,options:RequestInit={}):Promise<JsonResponse<T>>=>{
    if (!client) throw new Error('Supabase não configurado.');
    const {data:{session:current}} = await client.auth.getSession();
    if (!current?.access_token) throw new Error('Faça login novamente.');
    const res = await fetch(path, { ...options, cache:'no-store',
      headers:{'Authorization':`Bearer ${current.access_token}`,'Content-Type':'application/json',...(options.headers ?? {})}});
    const value = await res.json();
    if (!res.ok) throw new Error(value.error || `Erro HTTP ${res.status}`);
    return value as JsonResponse<T>;
  },[]);

  const loadAliases = useCallback(async()=>{
    try {
      const data = await call<{aliases: Alias[]}>('/api/aliases');
      setAliases(data.aliases);
      setSelectedId(old=>old && data.aliases.some(a=>a.id===old) ? old : (data.aliases[0]?.id ?? null));
    } catch (err) {setNotice((err as Error).message);}
  },[call]);

  const loadMessages = useCallback(async(id:string,quiet=false)=>{
    if (!quiet) setLoadingMsgs(true);
    try {
      const data = await call<{messages:Mail[]}>(`/api/aliases/${id}/messages`);
      setMessages(data.messages);
      setSelectedMessageId(old=>old && data.messages.some(m=>m.id===old) ? old : (data.messages[0]?.id ?? null));
    } catch (err) {if (!quiet) setNotice((err as Error).message);}
    finally {if(!quiet) setLoadingMsgs(false);}
  },[call]);

  useEffect(()=>{
    if (session) void loadAliases();
    else {setAliases([]);setSelectedId(null);setMessages([]);setSelectedMessageId(null);}
  },[session?.user.id,loadAliases]);
  useEffect(()=>{
    if (!selectedId || !session) {setMessages([]);setSelectedMessageId(null);return;}
    setMessages([]);setSelectedMessageId(null);
    void loadMessages(selectedId);
    const timer = setInterval(()=>{
      if (document.visibilityState==='visible') void loadMessages(selectedId,true);
    },15000);
    return ()=>clearInterval(timer);
  },[selectedId,session?.user.id,loadMessages]);

  async function login(event:FormEvent) {
    event.preventDefault(); if (!client) return;
    setBusy(true);setNotice('');
    try {
      const result = isRegister ? await client.auth.signUp({email:loginEmail,password:loginPassword})
        : await client.auth.signInWithPassword({email:loginEmail,password:loginPassword});
      if (result.error) throw result.error;
      if (isRegister) setNotice('Cadastro recebido. Confirme seu e-mail de login antes de entrar.');
    } catch(err) {setNotice((err as Error).message);} finally {setBusy(false);}
  }
  async function createAlias(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('');
    try {
      const data = await call<{alias:Alias}>('/api/aliases',{method:'POST',body:JSON.stringify({kind,ttlMinutes:kind==='temporary'?ttl:undefined,label})});
      await loadAliases();setSelectedId(data.alias.id);setLabel('');setNotice('Endereço criado com sucesso.');
    } catch(err) {setNotice((err as Error).message);} finally {setBusy(false);}
  }
  async function deactivate() {
    if (!chosen || !window.confirm(`Desativar ${chosen.address}? Novas mensagens serão descartadas.`)) return;
    setBusy(true);
    try {await call(`/api/aliases/${chosen.id}`,{method:'PATCH'});await loadAliases();setNotice('Endereço desativado.');}
    catch(err){setNotice((err as Error).message);} finally{setBusy(false);}
  }
  async function copy(value:string) {
    try {await navigator.clipboard.writeText(value);setNotice('Copiado para a área de transferência.');}
    catch {setNotice('Não foi possível copiar. Selecione o texto manualmente.');}
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo">✦</div><div><strong>AuthMail<span> Agent</span></strong><small>Caixa de autenticação</small></div></div>
      <div className="side-divider"/>
      <div className="section-label">WORKSPACE</div>
      <div className="sidebar-item selected"><span>▦</span> Painel de controle</div>
      <div className="sidebar-item"><span>✉</span> Meus endereços</div>
      <div className="side-bottom"><div className="side-avatar">A</div><div><strong>Área protegida</strong><small>Autenticação Supabase</small></div></div>
    </aside>
    <section className="main">
      <header className="topbar"><div className="topbrand">✦ AuthMail Agent</div><div className="topbar-right"><span className="live-dot"/> Ambiente privado {session && <button className="text-button" onClick={()=>client?.auth.signOut()}>Sair ↗</button>}</div></header>
      <div className="content">
        <div className="eyebrow">WORKSPACE / E-MAILS</div>
        <div className="titleline"><div><h1>Gerencie seus e-mails<span>.</span></h1><p>Endereços inteligentes, mensagens organizadas e códigos em um só lugar.</p></div>{session && <button className="btn-secondary" onClick={()=>{void loadAliases();if(selectedId)void loadMessages(selectedId);}}>↻ Atualizar</button>}</div>
        {!!notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Fechar aviso" onClick={()=>setNotice('')}>×</button></div>}
        {!client ? <div className="empty major"><h2>Configuração inicial necessária</h2><p>Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY conforme o README.</p></div> : !ready ? <div className="empty major">Carregando sessão...</div> : !session ?
          <div className="auth-wrap"><div className="auth-card"><div className="auth-icon">✉</div><h2>{isRegister?'Criar acesso':'Entre no AuthMail'}</h2><p>Seu painel pessoal de endereços de e-mail.</p><form onSubmit={login} className="form-stack"><label>E-mail principal<input type="email" autoComplete="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="voce@exemplo.com" /></label><label>Senha<input type="password" required minLength={6} autoComplete={isRegister?'new-password':'current-password'} value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="••••••••" /></label><button className="btn-primary" disabled={busy}>{busy?'Processando...':isRegister?'Criar conta':'Entrar no painel'} <span>→</span></button></form><button className="link-button" onClick={()=>setIsRegister(!isRegister)}>{isRegister?'Já tenho conta':'Ainda não tenho conta'}</button><p className="muted tiny">Confirmação de e-mail exigida para acessar o painel.</p></div></div>
        : <>
          <div className="stats"><div className="stat"><div className="stat-h"><span>ENDEREÇOS CRIADOS</span><i>✉</i></div><strong>{aliases.length}</strong><small>Total de aliases na sua conta</small></div><div className="stat"><div className="stat-h"><span>ENDEREÇOS ATIVOS</span><i>◉</i></div><strong>{activeCount}</strong><small>Prontos para receber mensagens</small></div><div className="stat"><div className="stat-h"><span>MENSAGENS NA CAIXA</span><i>▤</i></div><strong>{messages.length}</strong><small>Últimas 50 do endereço selecionado</small></div></div>
          <div className="work-grid"><div className="left-col">
            <div className="panel"><div className="panel-title"><div><h2>✦ Gerar novo endereço</h2><p>Crie um e-mail exclusivo em segundos.</p></div></div>
              <form className="create-form" onSubmit={createAlias}><div className="toggle-row"><button type="button" className={kind==='temporary'?'toggle active':'toggle'} onClick={()=>setKind('temporary')}>◷ Temporário</button><button type="button" className={kind==='permanent'?'toggle active':'toggle'} onClick={()=>setKind('permanent')}>♾ Permanente</button></div><label>IDENTIFICAÇÃO (OPCIONAL)<input maxLength={80} placeholder="Ex.: Cadastro no serviço X" value={label} onChange={e=>setLabel(e.target.value)}/></label>{kind==='temporary' && <label>VALIDADE DO ENDEREÇO<select value={ttl} onChange={e=>setTtl(Number(e.target.value))}>{duration.map(x=><option key={x.v} value={x.v}>{x.t}</option>)}</select></label>}<p className="tip">{kind==='temporary'?'Após vencer, o endereço para de receber novas mensagens.':'O endereço continua ativo até você desativá-lo.'}</p><button disabled={busy} className="btn-primary">{busy?'Aguarde...':'✦ Gerar endereço'} <span>→</span></button></form>
            </div>
            <div className="panel mailbox-panel"><div className="panel-title"><div><h2>Seus endereços</h2><p>Selecione uma caixa de entrada.</p></div><div className="count">{aliases.length}</div></div><div className="alias-list">{aliases.length===0?<div className="empty"><span>✉</span><p>Você ainda não criou nenhum endereço.</p></div>:aliases.map(alias=><button key={alias.id} className={selectedId===alias.id?'alias-item on':'alias-item'} onClick={()=>setSelectedId(alias.id)}><div className="alias-symbol">@</div><div className="alias-details"><strong>{alias.label||alias.address}</strong>{alias.label && <small className="mono ellipsis">{alias.address}</small>}<span className={isAliasOpen(alias)?'status good':'status off'}>{isAliasOpen(alias)?'● Ativo':'○ Inativo'} · {alias.kind==='temporary'?'Temporário':'Permanente'}</span></div><span className="alias-chevron">›</span></button>)}</div></div>
          </div>
          <div className="panel inbox"><div className="panel-title inbox-heading"><div><h2>Caixa de entrada</h2><p>{chosen?chosen.address:'Selecione um endereço para visualizar'}</p></div><div className="count">{messages.length}</div></div>
            {chosen && <div className="selected-box"><div className="selected-box-head"><span className={isAliasOpen(chosen)?'status good':'status off'}>{isAliasOpen(chosen)?'● Recebimento ativo':'○ Recebimento inativo'}</span><span className="muted">{chosen.expires_at?`Expira: ${niceDate(chosen.expires_at)}`:'Sem expiração'}</span></div><div className="address-row"><strong className="mono">{chosen.address}</strong><button className="btn-secondary small" onClick={()=>copy(chosen.address)}>▣ Copiar</button></div>{isAliasOpen(chosen) && <button className="danger-link" disabled={busy} onClick={deactivate}>Desativar endereço</button>}</div>}
            {!chosen?<div className="empty inbox-empty"><div className="empty-icon">✉</div><h3>Sua caixa está pronta</h3><p>Gere um endereço para começar a receber mensagens.</p></div>:loadingMsgs?<div className="empty">Carregando mensagens...</div>:messages.length===0?<div className="empty inbox-empty"><div className="empty-icon">✉</div><h3>Nenhuma mensagem ainda</h3><p>Copie o endereço acima e use-o para receber um e-mail de verificação.</p></div>:
              <div className="message-layout"><div className="message-list">{messages.map(mail=><button key={mail.id} className={selectedMessageId===mail.id?'message-item on':'message-item'} onClick={()=>setSelectedMessageId(mail.id)}><div className="message-row"><strong className="ellipsis">{mail.subject||'Sem assunto'}</strong>{mail.otp_code && <span className="code-tag">CÓDIGO</span>}</div><small className="ellipsis">{mail.from_address}</small><span className="muted tiny">{niceDate(mail.received_at)}</span></button>)}</div>{selectedMail && <article className="message-detail"><div className="message-meta"><h3>{selectedMail.subject}</h3><p>De: {selectedMail.from_address}</p><small>{niceDate(selectedMail.received_at)}</small></div>{selectedMail.otp_code && <div className="otp-box"><span>CÓDIGO IDENTIFICADO</span><strong>{selectedMail.otp_code}</strong><button className="btn-primary small" onClick={()=>copy(selectedMail.otp_code!)}>Copiar código</button></div>}<div className="email-body">{selectedMail.body_text||'Mensagem sem texto legível.'}</div><div className="safe-note">Por segurança, o HTML e scripts do e-mail não são executados.</div></article>}</div>}
          </div></div><div className="footer-note">AuthMail Agent MVP · Endereços são aliases de recebimento, não contas Google independentes. Protegido por autenticação e regras de acesso.</div>
        </>}
      </div>
    </section>
  </main>;
}
