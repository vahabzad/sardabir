'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, CircleHelp, Copy, FileText, History, Link2, Menu, Newspaper, Plus, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const controls = [
  { label:'شدت گرایش رسانه‌ای', value:50, help:'مشخص می‌کند متن تا چه اندازه از گرایش انتخاب‌شده پیروی کند.', low:'۰: نزدیک به بی‌طرف', high:'۱۰۰: کاملاً همسو' },
  { label:'لحن انتقادی', value:50, help:'میزان پرسشگری، نقد و صراحت متن خبر را کنترل می‌کند.', low:'۰: آرام و توصیفی', high:'۱۰۰: تند و چالشی' },
  { label:'جذابیت رسانه‌ای', value:50, help:'روی کشش تیتر، ریتم روایت و انرژی زبان رسانه‌ای اثر می‌گذارد.', low:'۰: رسمی و خشک', high:'۱۰۰: پرکشش و هیجانی' },
];
type ArticleDraft = { headline:string; lead:string; body:string };
type BiasOption = { id:string; name:string; status:'active'|'archived' };

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
  const [articleId,setArticleId]=useState<string>();
  const [article,setArticle]=useState<ArticleDraft|null>(null);

  const settings={mediaBias,mediaBiasId,biasIntensity:values[0],criticalIntensity:values[1],excitement:values[2],outputLength,audience,platform};
  const enteredSources=activeSource==='link'?links.filter(Boolean).map((value)=>({kind:'url' as const,value})):sourceText.trim()?[{kind:'text' as const,value:sourceText}]:[];

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
    Promise.resolve(context.registerTool({name:'stage_news_brief',title:'آماده‌سازی خبر تازه',description:'موضوع، منبع متنی و شدت‌های تحریریه را در فرم آماده می‌کند.',inputSchema:{type:'object',properties:{subject:{type:'string',minLength:1},sourceText:{type:'string'},biasIntensity:{type:'number',minimum:0,maximum:100},criticalIntensity:{type:'number',minimum:0,maximum:100},excitement:{type:'number',minimum:0,maximum:100}},required:['subject'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(rawInput:unknown){
      const input=rawInput as {subject?:unknown;sourceText?:unknown;biasIntensity?:unknown;criticalIntensity?:unknown;excitement?:unknown};
      if(typeof input.subject!=='string'||!input.subject.trim())throw new Error('موضوع معتبر لازم است.');
      const next=[input.biasIntensity,input.criticalIntensity,input.excitement].map((value,index)=>typeof value==='number'?Math.max(0,Math.min(100,value)):controls[index].value);
      setSubject(input.subject.trim());setValues(next);if(typeof input.sourceText==='string'){setActiveSource('text');setSourceText(input.sourceText);}return{staged:true,subject:input.subject.trim(),settings:next};
    }},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();
  },[]);

  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('article');if(!id)return;
    fetch(`${API_BASE}/api/articles/${encodeURIComponent(id)}`).then(async(response)=>{if(!response.ok)throw new Error('خبر پیدا نشد.');return await response.json() as {article:{id:string;subject:string;headline:string;lead:string;body:string;settings:{mediaBias:string;mediaBiasId?:string;biasIntensity:number;criticalIntensity:number;excitement:number;outputLength:string;audience:string;platform:string};sources:Array<{kind:'url'|'text';url?:string;originalText?:string}>}};}).then(({article:saved})=>{
      setArticleId(saved.id);setSubject(saved.subject);setArticle({headline:saved.headline,lead:saved.lead,body:saved.body});setMediaBias(saved.settings.mediaBias);if(saved.settings.mediaBiasId)setMediaBiasId(saved.settings.mediaBiasId);setValues([saved.settings.biasIntensity,saved.settings.criticalIntensity,saved.settings.excitement]);setOutputLength(saved.settings.outputLength);setAudience(saved.settings.audience);setPlatform(saved.settings.platform);
      const urls=saved.sources.filter((source)=>source.kind==='url'&&source.url).map((source)=>source.url!);const text=saved.sources.find((source)=>source.kind==='text')?.originalText;if(urls.length){setActiveSource('link');setLinks(urls);}else if(text){setActiveSource('text');setSourceText(text);}
    }).catch((error)=>setNotice(error.message));
  },[]);

  async function generateArticle(){
    if(!subject.trim()){setNotice('ابتدا موضوع خبر را وارد کنید.');return;}
    if(enteredSources.length===0){setNotice('حداقل یک لینک یا متن منبع وارد کنید.');return;}
    setNotice('');setLoading(true);
    try{const response=await fetch(`${API_BASE}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId,subject,sources:enteredSources,...settings})});const data=await response.json() as {message?:string;article:{id:string;headline:string;lead:string;body:string}};if(!response.ok)throw new Error(data.message||'تولید خبر ناموفق بود.');setArticle({headline:data.article.headline,lead:data.article.lead,body:data.article.body});setArticleId(data.article.id);setNotice('خبر تولید و در آرشیو ذخیره شد.');}catch(error){setNotice(error instanceof Error?error.message:'خطایی رخ داد.');}finally{setLoading(false);}
  }
  async function saveArticle(){
    if(!article)throw new Error('هنوز خبری برای ذخیره وجود ندارد.');const response=await fetch(`${API_BASE}/api/articles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:articleId,subject,...article,...settings})});const data=await response.json() as {id?:string;message?:string};if(!response.ok)throw new Error(data.message||'ذخیره خبر ناموفق بود.');if(data.id)setArticleId(data.id);setNotice('پیش‌نویس در آرشیو ذخیره شد.');
  }

  return <main className="newsroom-shell" dir="rtl">
    <aside className="rail"><div className="brand-mark"><span>س</span></div><nav aria-label="ناوبری اصلی"><Link href="/" className="rail-button active" aria-label="تولید خبر"><Newspaper/></Link><Link href="/archive" className="rail-button" aria-label="آرشیو"><Archive/></Link><Link href="/sources" className="rail-button" aria-label="منابع"><Link2/></Link><Link href="/biases" className="rail-button" aria-label="مدیریت گرایش‌ها"><SlidersHorizontal/></Link></nav><div className="rail-spacer"/><button className="rail-button" aria-label="تنظیمات"><Settings2/></button><button className="avatar" aria-label="حساب کاربری">آ</button></aside>
    <section className="workspace">
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="بازکردن منو"><Menu/></button><div><span className="eyebrow"><i/> میز تولید</span><h1>{articleId?'ویرایش خبر':'خبر تازه'}</h1></div></div><div className="top-actions"><span className={`saved-state ${codexStatus}`} title={codexStatus==='ready'?'وارد حساب ChatGPT شده است':codexStatus==='offline'?'اتصال یا ورود Codex در دسترس نیست':'در حال بررسی وضعیت Codex'}><i/> <span>{codexStatus==='ready'?'Codex متصل':codexStatus==='offline'?'Codex قطع':'بررسی Codex'}</span></span><div className="action-group"><button type="button" className="action-button" disabled={!article} title={article?'مشاهده نسخه‌های خبر':'پس از تولید خبر فعال می‌شود'}><History/><span>نسخه‌ها</span></button><button type="button" className="action-button primary-action" disabled={!article} title={article?'ذخیره تغییرات در آرشیو':'ابتدا یک خبر تولید کنید'} onClick={()=>saveArticle().catch((error)=>setNotice(error.message))}><Save/><span>ذخیره پیش‌نویس</span></button></div></div></header>
      <div className="editor-grid">
        <section className="brief-panel">
          <div className="section-heading"><div><span className="step">۰۱</span><h2>مواد اولیه خبر</h2></div><span className="muted">موضوع و منابع را وارد کنید</span></div>
          <label className="field-label" htmlFor="subject">موضوع خبر</label><input id="subject" className="subject-input" value={subject} onChange={(event)=>setSubject(event.target.value)} placeholder="موضوع اصلی خبر"/>
          <div className="source-tabs" role="tablist" aria-label="نوع منبع"><button className={activeSource==='link'?'active':''} onClick={()=>setActiveSource('link')}><Link2/> لینک منابع</button><button className={activeSource==='text'?'active':''} onClick={()=>setActiveSource('text')}><FileText/> متن خبر</button></div>
          {activeSource==='link'?<div className="source-box">{links.map((link,index)=><div className="source-row" key={index}><span className="source-index">{index+1}</span><input aria-label={`لینک منبع ${index+1}`} value={link} placeholder="https://example.com/news/article" onChange={(event)=>setLinks((current)=>current.map((value,i)=>i===index?event.target.value:value))}/><button aria-label="حذف منبع" onClick={()=>setLinks((current)=>current.length===1?['']:current.filter((_,i)=>i!==index))}>×</button></div>)}<button className="add-source" onClick={()=>setLinks((current)=>[...current,''])}><Plus/> افزودن لینک دیگر</button></div>:<Textarea className="source-text" value={sourceText} onChange={(event)=>setSourceText(event.target.value)} placeholder="متن کامل خبر یا گزارش را اینجا وارد کنید…"/>}
          <div className="section-rule"/><div className="section-heading compact"><div><span className="step">۰۲</span><h2>زاویه تحریریه</h2></div></div>
          <div className="bias-field-head"><label className="field-label" htmlFor="leaning">گرایش رسانه‌ای</label><Link href="/biases">مدیریت گرایش‌ها</Link></div><select className="select-like" id="leaning" value={mediaBiasId} onChange={(event)=>{const selected=biases.find((bias)=>bias.id===event.target.value);setMediaBiasId(event.target.value);if(selected)setMediaBias(selected.name);}}>{biases.filter((bias)=>bias.status==='active'||bias.id===mediaBiasId).map((bias)=><option key={bias.id} value={bias.id} disabled={bias.status==='archived'}>{bias.name}{bias.status==='archived'?' — بایگانی‌شده':''}</option>)}</select>
          <TooltipProvider delay={250}><div className="control-stack">{controls.map((control,index)=><div className="range-control" key={control.label}><div className="range-meta"><div className="range-label"><label htmlFor={`range-${index}`}>{control.label}</label><Tooltip><TooltipTrigger render={<button type="button" className="help-trigger" aria-label={`راهنمای ${control.label}`}><CircleHelp/></button>}/><TooltipContent side="top" align="start" className="editor-tooltip"><strong>{control.label}</strong><p>{control.help}</p><div className="tooltip-scale"><span>{control.low}</span><i/><span>{control.high}</span></div></TooltipContent></Tooltip></div><span>{values[index]} · {toneFor(index,values[index])}</span></div><input id={`range-${index}`} className="native-range" type="range" min="0" max="100" step="1" value={values[index]} onChange={(event)=>setValues((current)=>current.map((value,i)=>i===index?Number(event.target.value):value))}/></div>)}</div></TooltipProvider>
          <div className="settings-row"><div><label className="settings-label" htmlFor="length">حجم خروجی</label><select id="length" value={outputLength} onChange={(event)=>setOutputLength(event.target.value)}><option>۱۵۰ تا ۲۵۰ کلمه</option><option>۳۰۰ تا ۵۰۰ کلمه</option><option>۵۰۰ تا ۸۰۰ کلمه</option><option>۸۰۰ تا ۱۲۰۰ کلمه</option></select></div><div><label className="settings-label" htmlFor="platform">بستر انتشار</label><select id="platform" value={platform} onChange={(event)=>setPlatform(event.target.value)}><option>وب‌سایت خبری</option><option>روزنامه</option><option>خبرنامه</option><option>تلگرام</option><option>اینستاگرام</option><option>شبکه اجتماعی</option></select></div><div><label className="settings-label" htmlFor="audience">مخاطب</label><select id="audience" value={audience} onChange={(event)=>setAudience(event.target.value)}><option>عموم مردم</option><option>مخاطب تخصصی</option><option>مخاطب سیاسی</option><option>کاربران شبکه‌های اجتماعی</option></select></div></div>
          <button type="button" className="generate-button" disabled={loading} onClick={generateArticle}><span className="generate-main"><Sparkles/><strong>{loading?'در حال تولید…':article?'تولید نسخه جدید':'تولید خبر'}</strong></span></button>{notice&&<output className="form-notice">{notice}</output>}
        </section>
        <section className={`result-panel ${article?'':'is-empty'}`}><div className="result-toolbar"><div><span className="status-dot"/> {article?'پیش‌نویس تولیدشده':'بدون خروجی'}</div>{article&&<div><button aria-label="تولید دوباره" onClick={generateArticle}><RotateCcw/></button><button aria-label="کپی" onClick={()=>navigator.clipboard.writeText(`${article.headline}\n\n${article.lead}\n\n${article.body}`).then(()=>setNotice('خبر کپی شد.'))}><Copy/></button><span className="divider"/><button className="more-button">•••</button></div>}</div>
          {article?<><article className="article-preview"><textarea className="article-title" aria-label="تیتر خبر" value={article.headline} onChange={(event)=>setArticle((current)=>({...current!,headline:event.target.value}))}/><textarea className="lead" aria-label="لید خبر" value={article.lead} onChange={(event)=>setArticle((current)=>({...current!,lead:event.target.value}))}/><div className="article-divider"><span>سردبیر</span></div><textarea className="article-body" aria-label="متن خبر" value={article.body} onChange={(event)=>setArticle((current)=>({...current!,body:event.target.value}))}/></article><footer className="result-footer"><span>{article.body.trim().split(/\s+/).filter(Boolean).length} کلمه</span><span>قابل ویرایش و ذخیره</span></footer></>:<div className="empty-result"><Newspaper/><h2>خروجی خبر اینجا نمایش داده می‌شود</h2><p>موضوع و منبع را وارد کنید، زاویه تحریریه را تنظیم کنید و «تولید خبر» را بزنید.</p></div>}
        </section>
      </div>
    </section>
  </main>;
}

function toneFor(index:number,value:number){const scales=index===0?['تقریباً خنثی','ملایم','روشن','صریح','حداکثری']:index===1?['آرام و توصیفی','پرسشگر','صریح و چالشی','تند و مطالبه‌گر','بسیار تند']:['خشک و رسمی','روان','جذاب و رسانه‌ای','پرکشش','بسیار پرقدرت'];return scales[Math.min(4,Math.floor(value/21))];}
