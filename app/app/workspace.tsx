'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, Check, CircleHelp, Copy, FileText, History, Link2, Menu, Newspaper, Plus, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const controls = [
  { label:'شدت گرایش رسانه‌ای', value:50, help:'مشخص می‌کند متن تا چه اندازه از گرایش انتخاب‌شده پیروی کند.', low:'۰: نزدیک به بی‌طرف', high:'۱۰۰: کاملاً همسو' },
  { label:'لحن انتقادی', value:50, help:'میزان پرسشگری، نقد و صراحت متن خبر را کنترل می‌کند.', low:'۰: آرام و توصیفی', high:'۱۰۰: تند و چالشی' },
  { label:'جذابیت رسانه‌ای', value:50, help:'روی کشش تیتر، ریتم روایت و انرژی زبان رسانه‌ای اثر می‌گذارد.', low:'۰: رسمی و خشک', high:'۱۰۰: پرکشش و هیجانی' },
  { label:'شدت طنز و سوژه‌پردازی', value:0, help:'از خبر کاملاً جدی تا طنز خبری تمام‌عیار را کنترل می‌کند. در شدت بالا، رفتارها و تناقض‌های سوژه با جوک، کنایه تند، بازی زبانی و ضربه طنز روایت می‌شوند.', low:'۰: کاملاً جدی', high:'۱۰۰: سوژه‌سازی و جوک‌پردازی تمام‌عیار' },
];
type ArticleDraft = { headline:string; lead:string; body:string };
type BiasOption = { id:string; name:string; status:'active'|'archived' };
type GenerationUsage = { model:string; inputTokens:number; cachedInputTokens:number; outputTokens:number; totalTokens:number; estimatedApiCostUsd:number|null; estimatedCredits:number|null; fiveHourEstimatePercent:{min:number;max:number}|null };
type ArticleDraftWithUsage = ArticleDraft & { generationUsage?:GenerationUsage };
type VersionSettings = {mediaBias:string;mediaBiasId?:string;biasIntensity:number;criticalIntensity:number;excitement:number;humorIntensity?:number;outputLength:string;audience:string;platform:string};
type NewsVersion = ArticleDraftWithUsage & {id:string;prompt?:string;settings:VersionSettings;createdAt:string};
type GenerationLog = { id:number; level:'info'|'success'|'warning'|'error'; message:string; time:string };
type StreamEvent = {type:'progress';level:'info'|'success'|'warning';message:string}|{type:'complete';article:{id:string;headline:string;lead:string;body:string;generationUsage?:GenerationUsage;versionItems:NewsVersion[]}}|{type:'error';message:string};

export function Workspace() {
  const [activeSource,setActiveSource]=useState<'link'|'text'>('link');
  const [values,setValues]=useState(controls.map((item)=>item.value));
  const [subject,setSubject]=useState('');
  const [links,setLinks]=useState(['']);
  const [sourceText,setSourceText]=useState('');
  const [mediaBias,setMediaBias]=useState('بی‌طرف');
  const [mediaBiasId,setMediaBiasId]=useState('neutral');
  const [biases,setBiases]=useState<BiasOption[]>([]);
  const [outputLength,setOutputLength]=useState('۳۰۰ تا ۵۰۰ کلمه');
  const [audience,setAudience]=useState('عموم مردم');
  const [platform,setPlatform]=useState('وب‌سایت خبری');
  const [loading,setLoading]=useState(false);
  const [codexStatus,setCodexStatus]=useState<'checking'|'ready'|'offline'>('checking');
  const [notice,setNotice]=useState('');
  const [generationLogs,setGenerationLogs]=useState<GenerationLog[]>([]);
  const [articleId,setArticleId]=useState<string>();
  const [article,setArticle]=useState<ArticleDraftWithUsage|null>(null);
  const [versions,setVersions]=useState<NewsVersion[]>([]);
  const [versionsOpen,setVersionsOpen]=useState(false);
  const [copyingPrompt,setCopyingPrompt]=useState(false);

  const settings={mediaBias,mediaBiasId,biasIntensity:values[0],criticalIntensity:values[1],excitement:values[2],humorIntensity:values[3],outputLength,audience,platform};
  const enteredSources=activeSource==='link'?links.map((value)=>value.trim()).filter(Boolean).map((value)=>({kind:'url' as const,value})):sourceText.trim()?[{kind:'text' as const,value:sourceText.trim()}]:[];

  useEffect(()=>{
    fetch(`${API_BASE}/api/codex/status`)
      .then(async(response)=>response.ok?await response.json() as {ready:boolean}:Promise.reject())
      .then((status)=>setCodexStatus(status.ready?'ready':'offline'))
      .catch(()=>setCodexStatus('offline'));
    fetch(`${API_BASE}/api/biases?includeArchived=true`)
      .then(async(response)=>response.ok?await response.json() as {biases:BiasOption[]}:Promise.reject())
      .then((data)=>{setBiases(data.biases);if(!new URLSearchParams(window.location.search).has('article')){const first=data.biases.find((bias)=>bias.status==='active');if(first){setMediaBiasId(first.id);setMediaBias(first.name);}}})
      .catch(()=>setBiases([]));
  },[]);

  useEffect(()=>{
    const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    Promise.resolve(context.registerTool({name:'stage_news_brief',title:'آماده‌سازی خبر تازه',description:'موضوع، منبع متنی و شدت‌های تحریریه را در فرم آماده می‌کند.',inputSchema:{type:'object',properties:{subject:{type:'string',minLength:1},sourceText:{type:'string'},biasIntensity:{type:'number',minimum:0,maximum:100},criticalIntensity:{type:'number',minimum:0,maximum:100},excitement:{type:'number',minimum:0,maximum:100},humorIntensity:{type:'number',minimum:0,maximum:100}},required:['subject'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(rawInput:unknown){
      const input=rawInput as {subject?:unknown;sourceText?:unknown;biasIntensity?:unknown;criticalIntensity?:unknown;excitement?:unknown;humorIntensity?:unknown};
      if(typeof input.subject!=='string'||!input.subject.trim())throw new Error('موضوع معتبر لازم است.');
      const next=[input.biasIntensity,input.criticalIntensity,input.excitement,input.humorIntensity].map((value,index)=>typeof value==='number'?Math.max(0,Math.min(100,value)):controls[index].value);
      setSubject(input.subject.trim());setValues(next);if(typeof input.sourceText==='string'){setActiveSource('text');setSourceText(input.sourceText);}return{staged:true,subject:input.subject.trim(),settings:next};
    }},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();
  },[]);

  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('article');if(!id)return;
    fetch(`${API_BASE}/api/articles/${encodeURIComponent(id)}`).then(async(response)=>{if(!response.ok)throw new Error('خبر پیدا نشد.');return await response.json() as {article:{id:string;subject:string;headline:string;lead:string;body:string;generationUsage?:GenerationUsage;versions:NewsVersion[];settings:VersionSettings;sources:Array<{kind:'url'|'text';url?:string;originalText?:string}>}};}).then(({article:saved})=>{
      setArticleId(saved.id);setSubject(saved.subject);setArticle({headline:saved.headline,lead:saved.lead,body:saved.body,generationUsage:saved.generationUsage});setVersions(saved.versions||[]);setMediaBias(saved.settings.mediaBias);if(saved.settings.mediaBiasId)setMediaBiasId(saved.settings.mediaBiasId);setValues([saved.settings.biasIntensity,saved.settings.criticalIntensity,saved.settings.excitement,saved.settings.humorIntensity??0]);setOutputLength(saved.settings.outputLength);setAudience(saved.settings.audience);setPlatform(saved.settings.platform);
      const urls=saved.sources.filter((source)=>source.kind==='url'&&source.url).map((source)=>source.url!);const text=saved.sources.find((source)=>source.kind==='text')?.originalText;if(urls.length){setActiveSource('link');setLinks(urls);}else if(text){setActiveSource('text');setSourceText(text);}
    }).catch((error)=>setNotice(error.message));
  },[]);

  async function generateArticle(){
    if(subject.trim().length<3){setNotice('موضوع خبر باید حداقل ۳ نویسه داشته باشد.');return;}
    if(enteredSources.length===0){setNotice('حداقل یک لینک یا متن منبع وارد کنید.');return;}
    setNotice('');setGenerationLogs([]);setLoading(true);
    const appendLog=(level:GenerationLog['level'],message:string)=>setGenerationLogs((current)=>current[current.length-1]?.level===level&&current[current.length-1]?.message===message?current:[...current,{id:Date.now()+current.length,level,message,time:new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())}]);
    try{
      const response=await fetch(`${API_BASE}/api/generate/stream`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId,subject,sources:enteredSources,...settings})});
      if(!response.ok){const data=await response.json() as {message?:string};throw new Error(data.message||'تولید خبر ناموفق بود.');}
      if(!response.body)throw new Error('مرورگر امکان دریافت گزارش زنده را فراهم نکرد.');
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let completed=false;let streamError='';
      const consume=(line:string)=>{
        if(!line.trim())return;
        const event=JSON.parse(line) as StreamEvent;
        if(event.type==='progress')appendLog(event.level,event.message);
        else if(event.type==='error'){streamError=event.message;appendLog('error',event.message);}
        else {completed=true;setArticle({headline:event.article.headline,lead:event.article.lead,body:event.article.body,generationUsage:event.article.generationUsage});setVersions(event.article.versionItems||[]);setArticleId(event.article.id);}
      };
      while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines)consume(line);if(done){consume(buffer);break;}}
      if(streamError)throw new Error(streamError);if(!completed)throw new Error('جریان تولید پیش از دریافت نتیجه نهایی قطع شد.');
      setNotice('خبر تولید و در آرشیو ذخیره شد.');
    }catch(error){const message=error instanceof Error?error.message:'خطایی رخ داد.';appendLog('error',message);setNotice(message);}finally{setLoading(false);}
  }
  async function saveArticle(){
    if(!article)throw new Error('هنوز خبری برای ذخیره وجود ندارد.');const response=await fetch(`${API_BASE}/api/articles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:articleId,subject,...article,...settings})});const data=await response.json() as {id?:string;versions?:NewsVersion[];message?:string};if(!response.ok)throw new Error(data.message||'ذخیره خبر ناموفق بود.');if(data.id)setArticleId(data.id);if(data.versions)setVersions(data.versions);setNotice('پیش‌نویس به‌عنوان یک نسخه تازه در آرشیو ذخیره شد.');
  }
  async function copyFinalPrompt(){
    if(subject.trim().length<3){setNotice('موضوع خبر باید حداقل ۳ نویسه داشته باشد.');return;}
    if(!enteredSources.length){setNotice('برای ساخت پرامپت حداقل یک منبع وارد کنید.');return;}
    setCopyingPrompt(true);setNotice('در حال آماده‌سازی پرامپت نهایی…');
    try{const response=await fetch(`${API_BASE}/api/prompts/preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId,subject,sources:enteredSources,...settings})});const data=await response.json() as {prompt?:string;unresolvedSourceCount?:number;message?:string};if(!response.ok||!data.prompt)throw new Error(data.message||'ساخت پرامپت ناموفق بود.');await navigator.clipboard.writeText(data.prompt);setNotice(data.unresolvedSourceCount?`پرامپت کپی شد؛ محتوای ${faNumber(data.unresolvedSourceCount)} منبع قابل استخراج نبود و لینک خام آن در پرامپت قرار گرفت.`:'پرامپت نهایی دقیقاً با محتوای منابع در کلیپ‌بورد کپی شد.');}
    catch(error){setNotice(error instanceof Error?error.message:'کپی پرامپت ناموفق بود.');}finally{setCopyingPrompt(false);}
  }
  function restoreVersion(version:NewsVersion){
    setArticle({headline:version.headline,lead:version.lead,body:version.body,generationUsage:version.generationUsage});setMediaBias(version.settings.mediaBias);if(version.settings.mediaBiasId)setMediaBiasId(version.settings.mediaBiasId);setValues([version.settings.biasIntensity,version.settings.criticalIntensity,version.settings.excitement,version.settings.humorIntensity??0]);setOutputLength(version.settings.outputLength);setAudience(version.settings.audience);setPlatform(version.settings.platform);setVersionsOpen(false);setNotice('نسخه انتخاب‌شده در ویرایشگر قرار گرفت؛ برای ثبت آن «ذخیره پیش‌نویس» را بزنید.');
  }

  return <main className="newsroom-shell" dir="rtl">
    <aside className="rail"><div className="brand-mark"><span>س</span></div><nav aria-label="ناوبری اصلی"><Link href="/" className="rail-button active" aria-label="تولید خبر"><Newspaper/></Link><Link href="/archive" className="rail-button" aria-label="آرشیو"><Archive/></Link><Link href="/sources" className="rail-button" aria-label="منابع"><Link2/></Link><Link href="/biases" className="rail-button" aria-label="مدیریت گرایش‌ها"><SlidersHorizontal/></Link></nav><div className="rail-spacer"/><button className="rail-button" aria-label="تنظیمات"><Settings2/></button><button className="avatar" aria-label="حساب کاربری">آ</button></aside>
    <section className="workspace">
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="بازکردن منو"><Menu/></button><div><span className="eyebrow"><i/> میز تولید</span><h1>{articleId?'ویرایش خبر':'خبر تازه'}</h1></div></div><div className="top-actions"><span className={`saved-state ${codexStatus}`} title={codexStatus==='ready'?'وارد حساب ChatGPT شده است':codexStatus==='offline'?'اتصال یا ورود Codex در دسترس نیست':'در حال بررسی وضعیت Codex'}><i/> <span>{codexStatus==='ready'?'Codex متصل':codexStatus==='offline'?'Codex قطع':'بررسی Codex'}</span></span><div className="action-group"><button type="button" className="action-button" disabled={!versions.length} title={versions.length?`${faNumber(versions.length)} نسخه ذخیره شده`:'پس از تولید خبر فعال می‌شود'} onClick={()=>setVersionsOpen(true)}><History/><span>نسخه‌ها ({faNumber(versions.length)})</span></button><button type="button" className="action-button primary-action" disabled={!article} title={article?'ذخیره تغییرات در آرشیو':'ابتدا یک خبر تولید کنید'} onClick={()=>saveArticle().catch((error)=>setNotice(error.message))}><Save/><span>ذخیره پیش‌نویس</span></button></div></div></header>
      <div className="editor-grid">
        <section className="brief-panel">
          <div className="section-heading"><div><span className="step">۰۱</span><h2>مواد اولیه خبر</h2></div><span className="muted">موضوع و منابع را وارد کنید</span></div>
          <label className="field-label" htmlFor="subject">موضوع خبر</label><input id="subject" className="subject-input" value={subject} onChange={(event)=>setSubject(event.target.value)} placeholder="موضوع اصلی خبر"/>
          <div className="source-tabs" role="tablist" aria-label="نوع منبع"><button className={activeSource==='link'?'active':''} onClick={()=>setActiveSource('link')}><Link2/> لینک منابع</button><button className={activeSource==='text'?'active':''} onClick={()=>setActiveSource('text')}><FileText/> متن خبر</button></div>
          {activeSource==='link'?<div className="source-box">{links.map((link,index)=><div className="source-row" key={index}><span className="source-index">{index+1}</span><input aria-label={`لینک منبع ${index+1}`} value={link} placeholder="https://example.com/news/article" onChange={(event)=>setLinks((current)=>current.map((value,i)=>i===index?event.target.value:value))}/><button aria-label="حذف منبع" onClick={()=>setLinks((current)=>current.length===1?['']:current.filter((_,i)=>i!==index))}>×</button></div>)}<button className="add-source" onClick={()=>setLinks((current)=>[...current,''])}><Plus/> افزودن لینک دیگر</button></div>:<Textarea className="source-text" value={sourceText} onChange={(event)=>setSourceText(event.target.value)} placeholder="متن کامل خبر یا گزارش را اینجا وارد کنید…"/>}
          <div className="section-rule"/><div className="section-heading compact"><div><span className="step">۰۲</span><h2>زاویه تحریریه</h2></div></div>
          <div className="bias-field-head"><label className="field-label" htmlFor="leaning">گرایش رسانه‌ای</label><Link href="/biases">مدیریت گرایش‌ها</Link></div><select className="select-like" id="leaning" value={mediaBiasId} onChange={(event)=>{const selected=biases.find((bias)=>bias.id===event.target.value);setMediaBiasId(event.target.value);if(selected)setMediaBias(selected.name);}}>{biases.filter((bias)=>bias.status==='active'||bias.id===mediaBiasId).map((bias)=><option key={bias.id} value={bias.id} disabled={bias.status==='archived'}>{bias.name}{bias.status==='archived'?' — بایگانی‌شده':''}</option>)}</select>
          <TooltipProvider delay={250}><div className="control-stack">{controls.map((control,index)=><div className="range-control" key={control.label}><div className="range-meta"><div className="range-label"><label htmlFor={`range-${index}`}>{control.label}</label><Tooltip><TooltipTrigger render={<button type="button" className="help-trigger" aria-label={`راهنمای ${control.label}`}><CircleHelp/></button>}/><TooltipContent side="top" align="start" className="editor-tooltip"><strong>{control.label}</strong><p>{control.help}</p><div className="tooltip-scale"><span>{control.low}</span><i/><span>{control.high}</span></div></TooltipContent></Tooltip></div><span>{values[index]} · {toneFor(index,values[index])}</span></div><input id={`range-${index}`} className="native-range" type="range" min="0" max="100" step="1" value={values[index]} onChange={(event)=>setValues((current)=>current.map((value,i)=>i===index?Number(event.target.value):value))}/></div>)}</div></TooltipProvider>
          <div className="settings-row"><div><label className="settings-label" htmlFor="length">حجم خروجی</label><select id="length" value={outputLength} onChange={(event)=>setOutputLength(event.target.value)}><option>۱۰ تا ۵۰ کلمه</option><option>۵۰ تا ۱۰۰ کلمه</option><option>۱۰۰ تا ۱۵۰ کلمه</option><option>۱۵۰ تا ۲۵۰ کلمه</option><option>۳۰۰ تا ۵۰۰ کلمه</option><option>۵۰۰ تا ۸۰۰ کلمه</option><option>۸۰۰ تا ۱۲۰۰ کلمه</option></select></div><div><label className="settings-label" htmlFor="platform">بستر انتشار</label><select id="platform" value={platform} onChange={(event)=>setPlatform(event.target.value)}><option>وب‌سایت خبری</option><option>روزنامه</option><option>خبرنامه</option><option>تلگرام</option><option>اینستاگرام</option><option>شبکه اجتماعی</option></select></div><div><label className="settings-label" htmlFor="audience">مخاطب</label><select id="audience" value={audience} onChange={(event)=>setAudience(event.target.value)}><option>عموم مردم</option><option>مخاطب تخصصی</option><option>مخاطب سیاسی</option><option>کاربران شبکه‌های اجتماعی</option></select></div></div>
          <div className="generate-actions"><button type="button" className="generate-button" disabled={loading} onClick={generateArticle}><span className="generate-main"><Sparkles/><strong>{loading?'در حال تولید…':article?'تولید نسخه جدید':'تولید خبر'}</strong></span></button><button type="button" className="copy-prompt-button" disabled={loading||copyingPrompt} onClick={copyFinalPrompt}><Copy/><span>{copyingPrompt?'در حال ساخت…':'کپی پرامپت'}</span></button></div>{(loading||generationLogs.length>0)&&<GenerationLogPanel logs={generationLogs} loading={loading}/>} {notice&&<output className="form-notice">{notice}</output>}
        </section>
        <section className={`result-panel ${article?'':'is-empty'}`}><div className="result-toolbar"><div><span className="status-dot"/> {article?'پیش‌نویس تولیدشده':'بدون خروجی'}</div>{article&&<div><button aria-label="تولید دوباره" onClick={generateArticle}><RotateCcw/></button><button aria-label="کپی" onClick={()=>navigator.clipboard.writeText(`${article.headline}\n\n${article.lead}\n\n${article.body}`).then(()=>setNotice('خبر کپی شد.'))}><Copy/></button><span className="divider"/><button className="more-button">•••</button></div>}</div>
          {article?<><article className="article-preview"><textarea className="article-title" aria-label="تیتر خبر" value={article.headline} onChange={(event)=>setArticle((current)=>({...current!,headline:event.target.value}))}/><textarea className="lead" aria-label="لید خبر" value={article.lead} onChange={(event)=>setArticle((current)=>({...current!,lead:event.target.value}))}/><div className="article-divider"><span>سردبیر</span></div><textarea className="article-body" aria-label="متن خبر" value={article.body} onChange={(event)=>setArticle((current)=>({...current!,body:event.target.value}))}/></article>{article.generationUsage?<UsageSummary usage={article.generationUsage}/>:<section className="usage-summary usage-summary-empty">آمار مصرف برای نسخه‌های تولیدشده پیش از فعال‌شدن این قابلیت ثبت نشده است.</section>}<footer className="result-footer"><span>{article.body.trim().split(/\s+/).filter(Boolean).length} کلمه</span><span>قابل ویرایش و ذخیره</span></footer></>:<div className="empty-result"><Newspaper/><h2>خروجی خبر اینجا نمایش داده می‌شود</h2><p>موضوع و منبع را وارد کنید، زاویه تحریریه را تنظیم کنید و «تولید خبر» را بزنید.</p></div>}
        </section>
      </div>
    </section>
    <VersionDialog open={versionsOpen} onOpenChange={setVersionsOpen} versions={versions} onRestore={restoreVersion} onCopyPrompt={(prompt)=>navigator.clipboard.writeText(prompt).then(()=>setNotice('پرامپت این نسخه کپی شد.'))}/>
  </main>;
}

function VersionDialog({open,onOpenChange,versions,onRestore,onCopyPrompt}:{open:boolean;onOpenChange:(open:boolean)=>void;versions:NewsVersion[];onRestore:(version:NewsVersion)=>void;onCopyPrompt:(prompt:string)=>void}){
  const [leftId,setLeftId]=useState('');const [rightId,setRightId]=useState('');
  const effectiveLeftId=versions.some((item)=>item.id===leftId)?leftId:versions[Math.min(1,versions.length-1)]?.id||'';const effectiveRightId=versions.some((item)=>item.id===rightId)?rightId:versions[0]?.id||'';
  const left=versions.find((item)=>item.id===effectiveLeftId);const right=versions.find((item)=>item.id===effectiveRightId);const diff=left&&right?compareVersions(left,right):null;
  return <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal><DialogContent className="version-dialog" dir="rtl"><DialogHeader><DialogTitle>نسخه‌های خبر</DialogTitle><DialogDescription>{faNumber(versions.length)} نسخه ذخیره شده؛ دو نسخه را برای دیدن تغییرات و تنظیمات پرامپت انتخاب کنید.</DialogDescription></DialogHeader><div className="version-selectors"><VersionPicker label="نسخه مبنا" value={effectiveLeftId} versions={versions} onChange={setLeftId}/><span>در مقایسه با</span><VersionPicker label="نسخه جدید" value={effectiveRightId} versions={versions} onChange={setRightId}/></div>{left&&right&&diff?<><div className="diff-legend"><span><i className="removed"/> حذف یا جایگزین‌شده</span><span><i className="added"/> افزوده یا جایگزین جدید</span></div><div className="version-compare"><VersionColumn title="نسخه مبنا" version={left} segments={diff.left}/><VersionColumn title="نسخه جدید" version={right} segments={diff.right}/></div><div className="version-actions"><button onClick={()=>onRestore(right)}><Check/> انتقال نسخه جدید به ویرایشگر</button>{right.prompt&&<button className="secondary" onClick={()=>onCopyPrompt(right.prompt!)}><Copy/> کپی پرامپت این نسخه</button>}</div></>:<div className="version-empty">نسخه کافی برای مقایسه وجود ندارد.</div>}</DialogContent></Dialog>;
}

function VersionPicker({label,value,versions,onChange}:{label:string;value:string;versions:NewsVersion[];onChange:(id:string)=>void}){return <fieldset className="version-picker"><legend>{label}</legend><div>{versions.map((version,index)=><button type="button" className={value===version.id?'selected':''} aria-pressed={value===version.id} key={version.id} onClick={()=>onChange(version.id)}><strong>نسخه {faNumber(versions.length-index)}</strong><time>{formatDate(version.createdAt)}</time></button>)}</div></fieldset>;}
function VersionColumn({title,version,segments}:{title:string;version:NewsVersion;segments:DiffSegment[]}){return <section className="version-column"><header><div><strong>{title}</strong><time>{formatDate(version.createdAt)}</time></div></header><VersionSettingsSummary settings={version.settings}/><div className="version-copy">{segments.map((segment,index)=><span className={segment.kind} key={index}>{segment.text}</span>)}</div></section>;}
function VersionSettingsSummary({settings}:{settings:VersionSettings}){const items=[['گرایش',settings.mediaBias],['شدت گرایش',faNumber(settings.biasIntensity)],['نقد',faNumber(settings.criticalIntensity)],['جذابیت',faNumber(settings.excitement)],['طنز',faNumber(settings.humorIntensity??0)],['حجم',settings.outputLength],['مخاطب',settings.audience],['بستر',settings.platform]];return <dl className="version-settings" aria-label="تنظیمات پرامپت این نسخه">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}
type DiffSegment={text:string;kind:'same'|'removed'|'added'};
function compareVersions(left:NewsVersion,right:NewsVersion){const a=`${left.headline}\n\n${left.lead}\n\n${left.body}`.split('\n');const b=`${right.headline}\n\n${right.lead}\n\n${right.body}`.split('\n');const table=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)table[i][j]=a[i-1]===b[j-1]?table[i-1][j-1]+1:Math.max(table[i-1][j],table[i][j-1]);const leftSegments:DiffSegment[]=[];const rightSegments:DiffSegment[]=[];let i=a.length,j=b.length;while(i||j){if(i&&j&&a[i-1]===b[j-1]){leftSegments.unshift({text:a[--i]+'\n',kind:'same'});rightSegments.unshift({text:b[--j]+'\n',kind:'same'});}else if(j&&(!i||table[i][j-1]>=table[i-1][j])){rightSegments.unshift({text:b[--j]+'\n',kind:'added'});}else{leftSegments.unshift({text:a[--i]+'\n',kind:'removed'});}}return{left:leftSegments,right:rightSegments};}
function formatDate(value:string){return new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}

function GenerationLogPanel({logs,loading}:{logs:GenerationLog[];loading:boolean}){
  const failed=logs.some((log)=>log.level==='error');
  const status=loading?'در حال اجرا':failed?'تولید ناموفق':'با موفقیت پایان یافت';
  return <section className="generation-log" aria-label="گزارش زنده تولید خبر" aria-live="polite">
    <header><div><i className={loading?'is-live':failed?'is-error':'is-done'}/><strong>گزارش زنده تولید</strong></div><span>{status}</span></header>
    <div className="generation-log-list">{logs.length?logs.map((log)=><div className={`generation-log-row ${log.level}`} key={log.id}><time>{log.time}</time><i/><p>{log.message}</p></div>):<div className="generation-log-wait"><span/>در انتظار اولین رویداد…</div>}</div>
  </section>;
}

function UsageSummary({usage}:{usage:GenerationUsage}){
  const quota=usage.fiveHourEstimatePercent;
  return <section className="usage-summary" aria-label="مصرف تولید خبر">
    <div className="usage-summary-head"><strong>مصرف این نسخه</strong><span>{usage.model}</span></div>
    <div className="usage-stats">
      <div><span>کل توکن</span><b>{faNumber(usage.totalTokens)}</b><small>{faNumber(usage.inputTokens)} ورودی · {faNumber(usage.outputTokens)} خروجی</small></div>
      <div><span>ورودی کش‌شده</span><b>{faNumber(usage.cachedInputTokens)}</b><small>در محاسبه هزینه ارزان‌تر است</small></div>
      <div><span>هزینه معادل API</span><b dir="ltr">{usage.estimatedApiCostUsd===null?'نامشخص':formatUsd(usage.estimatedApiCostUsd)}</b><small>هزینه واقعی پلن اشتراکی نیست</small></div>
      <div><span>برآورد سهمیه ۵ساعته</span><b>{quota?`${faDecimal(quota.min)}٪ تا ${faDecimal(quota.max)}٪`:'نامشخص'}</b><small>تخمینی؛ مصرف واقعی متغیر است</small></div>
    </div>
  </section>;
}

function faNumber(value:number){return new Intl.NumberFormat('fa-IR').format(value);}
function faDecimal(value:number){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:value<1?2:1}).format(value);}
function formatUsd(value:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:4}).format(value);}

function toneFor(index:number,value:number){const scales=index===0?['تقریباً خنثی','ملایم','روشن','صریح','حداکثری']:index===1?['آرام و توصیفی','پرسشگر','صریح و چالشی','تند و مطالبه‌گر','بسیار تند']:index===2?['خشک و رسمی','روان','جذاب و رسانه‌ای','پرکشش','بسیار پرقدرت']:['کاملاً جدی','کنایه ظریف','طنز مشخص','سوژه‌پرداز','جوک‌پردازی تمام‌عیار'];return scales[Math.min(4,Math.floor(value/21))];}
