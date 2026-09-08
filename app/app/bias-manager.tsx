'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, FilePenLine, FileText, Link2, Newspaper, Plus, Save, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';

const API_BASE=process.env.NEXT_PUBLIC_API_BASE_URL||'http://localhost:4000';
type Status='active'|'archived';
type Bias={id:string;name:string;worldview:string;tone:string;goals:string;redLines:string;promptFile:string;prompt:string;status:Status;builtIn:boolean;updatedAt:string};
type Fields={name:string;worldview:string;tone:string;goals:string;redLines:string;prompt:string};
const emptyFields:Fields={name:'',worldview:'',tone:'',goals:'',redLines:'',prompt:''};

export function BiasManager(){
  const [biases,setBiases]=useState<Bias[]>([]);
  const [selectedId,setSelectedId]=useState<string>();
  const [fields,setFields]=useState<Fields>(emptyFields);
  const [showArchived,setShowArchived]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const selected=biases.find((bias)=>bias.id===selectedId);
  const visible=useMemo(()=>biases.filter((bias)=>showArchived||bias.status==='active'),[biases,showArchived]);

  useEffect(()=>{fetch(`${API_BASE}/api/biases?includeArchived=true`).then(async(response)=>{if(!response.ok)throw new Error('دریافت گرایش‌ها ناموفق بود.');return await response.json() as {biases:Bias[]};}).then((data)=>{setBiases(data.biases);const first=data.biases.find((bias)=>bias.status==='active')||data.biases[0];if(first){setSelectedId(first.id);setFields(fromBias(first));}}).catch((error)=>setNotice(error.message)).finally(()=>setLoading(false));},[]);

  function choose(bias:Bias){setSelectedId(bias.id);setFields(fromBias(bias));setNotice('');}
  function startNew(){setSelectedId(undefined);setFields(emptyFields);setNotice('');}
  function update<K extends keyof Fields>(key:K,value:Fields[K]){setFields((current)=>({...current,[key]:value}));}

  async function create(){
    if(!fields.name.trim()||!fields.worldview.trim()||!fields.tone.trim()||!fields.goals.trim()||!fields.redLines.trim()){setNotice('همه اطلاعات پایه گرایش را کامل کنید.');return;}
    setSaving(true);setNotice('Codex در حال نوشتن فایل پرامپت اولیه است…');
    try{const response=await fetch(`${API_BASE}/api/biases`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});const data=await response.json() as {bias?:Bias;message?:string};if(!response.ok||!data.bias)throw new Error(data.message||'ساخت گرایش ناموفق بود.');setBiases((current)=>[...current,data.bias!]);setSelectedId(data.bias.id);setFields(fromBias(data.bias));setNotice('گرایش و فایل پرامپت آن ساخته شد؛ حالا می‌توانید متن را ویرایش کنید.');}catch(error){setNotice(error instanceof Error?error.message:'ساخت گرایش ناموفق بود.');}finally{setSaving(false);}
  }

  async function save(){
    if(!selected)return;setSaving(true);setNotice('');
    try{const response=await fetch(`${API_BASE}/api/biases/${encodeURIComponent(selected.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,status:selected.status})});const data=await response.json() as {bias?:Bias;message?:string};if(!response.ok||!data.bias)throw new Error(data.message||'ذخیره گرایش ناموفق بود.');setBiases((current)=>current.map((bias)=>bias.id===data.bias!.id?data.bias!:bias));setFields(fromBias(data.bias));setNotice('تغییرات و فایل پرامپت ذخیره شدند.');}catch(error){setNotice(error instanceof Error?error.message:'ذخیره گرایش ناموفق بود.');}finally{setSaving(false);}
  }

  async function toggleStatus(){
    if(!selected)return;const status:Status=selected.status==='active'?'archived':'active';setSaving(true);setNotice('');
    try{const response=await fetch(`${API_BASE}/api/biases/${encodeURIComponent(selected.id)}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});const data=await response.json() as {bias?:Bias;message?:string};if(!response.ok||!data.bias)throw new Error(data.message||'تغییر وضعیت ناموفق بود.');setBiases((current)=>current.map((bias)=>bias.id===data.bias!.id?data.bias!:bias));setFields(fromBias(data.bias));if(status==='archived')setShowArchived(true);setNotice(status==='archived'?'گرایش بایگانی شد؛ خبرهای قبلی بدون تغییر باقی می‌مانند.':'گرایش دوباره فعال شد.');}catch(error){setNotice(error instanceof Error?error.message:'تغییر وضعیت ناموفق بود.');}finally{setSaving(false);}
  }

  return <main className="newsroom-shell" dir="rtl">
    <aside className="rail"><div className="brand-mark"><span>س</span></div><nav aria-label="ناوبری اصلی"><Link href="/" className="rail-button" aria-label="تولید خبر"><Newspaper/></Link><Link href="/archive" className="rail-button" aria-label="آرشیو"><Archive/></Link><Link href="/sources" className="rail-button" aria-label="منابع"><Link2/></Link><Link href="/biases" className="rail-button active" aria-label="مدیریت گرایش‌ها"><SlidersHorizontal/></Link></nav><div className="rail-spacer"/><button className="rail-button" aria-label="تنظیمات"><Settings2/></button><button className="avatar" aria-label="حساب کاربری">آ</button></aside>
    <section className="workspace bias-workspace">
      <header className="bias-header"><div><span className="eyebrow"><i/> تنظیمات تحریریه</span><h1>مدیریت گرایش‌ها</h1><p>برای هر زاویه رسانه‌ای، یک راهنمای مستقل و قابل‌ویرایش تعریف کنید.</p></div><button className="new-bias" onClick={startNew}><Plus/> گرایش تازه</button></header>
      <div className="bias-layout">
        <aside className="bias-list-panel"><div className="bias-list-head"><div><b>{biases.filter((bias)=>bias.status==='active').length}</b><span>گرایش فعال</span></div><label><input type="checkbox" checked={showArchived} onChange={(event)=>setShowArchived(event.target.checked)}/> نمایش بایگانی</label></div><div className="bias-list">{loading?<div className="bias-loading">در حال خواندن…</div>:visible.map((bias)=><button key={bias.id} className={`${selectedId===bias.id?'selected':''} ${bias.status}`} onClick={()=>choose(bias)}><span className="bias-list-icon"><FileText/></span><span><strong>{bias.name}</strong><small>{bias.builtIn?'پیش‌فرض سیستم':'سفارشی'} · {bias.status==='active'?'فعال':'بایگانی'}</small></span></button>)}</div></aside>
        <section className="bias-editor">
          <div className="bias-editor-title"><div><span className="bias-mode">{selected?'ویرایش گرایش':'گرایش تازه'}</span><h2>{selected?selected.name:'تعریف زاویه جدید'}</h2>{selected&&<small>فایل: {selected.promptFile}</small>}</div>{selected&&<button className={`archive-bias ${selected.status}`} onClick={toggleStatus} disabled={saving}>{selected.status==='active'?<Archive/>:<ArchiveRestore/>}{selected.status==='active'?'بایگانی':'فعال‌سازی'}</button>}</div>
          <div className="bias-fields"><label><span>نام گرایش</span><input value={fields.name} onChange={(event)=>update('name',event.target.value)} placeholder="مثلاً اقتصاد بازار آزاد"/></label><label><span>لحن غالب</span><input value={fields.tone} onChange={(event)=>update('tone',event.target.value)} placeholder="مثلاً تحلیلی، صریح و داده‌محور"/></label><label className="full"><span>دیدگاه کلی و جهان‌بینی</span><textarea value={fields.worldview} onChange={(event)=>update('worldview',event.target.value)} placeholder="این گرایش رویدادها را از چه زاویه‌ای می‌بیند؟"/></label><label><span>اهداف تحریریه</span><textarea value={fields.goals} onChange={(event)=>update('goals',event.target.value)} placeholder="چه نکاتی باید برجسته شوند؟"/></label><label><span>خط قرمزها</span><textarea value={fields.redLines} onChange={(event)=>update('redLines',event.target.value)} placeholder="چه مواردی نباید وارد روایت شوند؟"/></label></div>
          <div className="prompt-editor-head"><div><FilePenLine/><span><b>فایل پرامپت گرایش</b><small>{selected?'متن زیر مستقیماً در تولید خبر استفاده می‌شود.':'پس از تکمیل فرم، Codex نسخه اولیه این فایل را می‌نویسد.'}</small></span></div>{selected&&<span className="markdown-badge">Markdown</span>}</div>
          {selected?<textarea className="prompt-editor" dir="rtl" value={fields.prompt} onChange={(event)=>update('prompt',event.target.value)} spellCheck="false"/>:<div className="prompt-placeholder"><Sparkles/><p>اطلاعات پایه را کامل کنید و دکمه زیر را بزنید؛ Codex محلی فایل پرامپت اولیه را تولید می‌کند.</p></div>}
          {notice&&<output className="bias-notice">{notice}</output>}
          <footer className="bias-actions">{selected?<button className="save-bias" onClick={save} disabled={saving}><Save/>{saving?'در حال ذخیره…':'ذخیره تغییرات'}</button>:<button className="generate-bias" onClick={create} disabled={saving}><Sparkles/>{saving?'Codex در حال نوشتن…':'ساخت پرامپت با Codex'}</button>}<Link href="/">بازگشت به تولید خبر</Link></footer>
        </section>
      </div>
    </section>
  </main>;
}

function fromBias(bias:Bias):Fields{return {name:bias.name,worldview:bias.worldview,tone:bias.tone,goals:bias.goals,redLines:bias.redLines,prompt:bias.prompt};}
