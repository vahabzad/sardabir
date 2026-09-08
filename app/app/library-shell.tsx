'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, FileText, Link2, Newspaper, Search, Settings2, SlidersHorizontal } from 'lucide-react';

type Mode = 'archive' | 'sources';
type Article = { id:string; subject:string; headline:string; lead:string; mediaBias:string; biasIntensity:number; status:string; updatedAt:number };
type Source = { id:string; kind:string; url:string|null; title:string|null; articleId:string; headline:string; createdAt:number };
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export function LibraryShell({ mode }: { mode: Mode }) {
  const [query,setQuery]=useState('');
  const [articles,setArticles]=useState<Article[]>([]);
  const [sources,setSources]=useState<Source[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    setLoading(true);
    fetch(`${API_BASE}${mode==='archive'?'/api/articles':'/api/sources'}`)
      .then(async r=>r.ok?await r.json() as { articles?:Article[]; sources?:Source[] }:null)
      .then(data=>{ setArticles(data?.articles??[]); setSources(data?.sources??[]); })
      .catch(()=>{ setArticles([]); setSources([]); })
      .finally(()=>setLoading(false));
  },[mode]);
  const filteredArticles=useMemo(()=>articles.filter(x=>(x.headline+x.subject+x.mediaBias).includes(query)),[articles,query]);
  const filteredSources=useMemo(()=>sources.filter(x=>((x.title||'')+(x.url||'')+x.headline).includes(query)),[sources,query]);

  return <main className="newsroom-shell" dir="rtl">
    <aside className="rail">
      <div className="brand-mark"><span>س</span></div>
      <nav aria-label="ناوبری اصلی">
        <Link href="/" className="rail-button" aria-label="تولید خبر"><Newspaper /></Link>
        <Link href="/archive" className={`rail-button ${mode==='archive'?'active':''}`} aria-label="آرشیو"><Archive /></Link>
        <Link href="/sources" className={`rail-button ${mode==='sources'?'active':''}`} aria-label="منابع"><Link2 /></Link>
        <Link href="/biases" className="rail-button" aria-label="مدیریت گرایش‌ها"><SlidersHorizontal /></Link>
      </nav>
      <div className="rail-spacer"/><button className="rail-button" aria-label="تنظیمات"><Settings2 /></button><button className="avatar">آ</button>
    </aside>
    <section className="workspace library-workspace">
      <header className="library-header">
        <div><span className="eyebrow"><i/> {mode==='archive'?'کتابخانه تحریریه':'ردپای منابع'}</span><h1>{mode==='archive'?'آرشیو خبرها':'منابع خبر'}</h1><p>{mode==='archive'?'همه پیش‌نویس‌ها و نسخه‌های تولیدشده در یک نما':'دسترسی مستقیم به ماده خام هر خبر و خروجی مرتبط'}</p></div>
        <Link className="new-article" href="/"><span>＋</span> خبر تازه</Link>
      </header>
      <div className="library-tools"><div className="search-box"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={mode==='archive'?'جست‌وجو در تیتر، موضوع یا گرایش…':'جست‌وجو در عنوان یا نشانی منبع…'}/></div><button><SlidersHorizontal/> فیلترها</button></div>
      {loading?<div className="library-empty"><span className="empty-loader"/><h2>در حال خواندن اطلاعات…</h2></div>:mode==='archive'?(filteredArticles.length?<div className="archive-grid">{filteredArticles.map((article,index)=><article className="archive-card" key={article.id}>
        <div className="card-top"><span className={`article-status ${article.status}`}>{article.status==='ready'?'آماده انتشار':'پیش‌نویس'}</span><span>۰{index+1}</span></div>
        <span className="card-subject">{article.subject}</span><h2>{article.headline}</h2><p>{article.lead}</p>
        <div className="bias-meter"><div><span>گرایش</span><b>{article.mediaBias}</b></div><div className="meter"><i style={{width:`${article.biasIntensity}%`}}/></div><strong>{article.biasIntensity}</strong></div>
        <footer><span>{new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium'}).format(article.updatedAt)}</span><Link href={`/?article=${article.id}`}>بازکردن و ویرایش ←</Link></footer>
      </article>)}</div>:<div className="library-empty"><Archive/><h2>{query?'خبری با این مشخصات پیدا نشد':'هنوز خبری ذخیره نکرده‌اید'}</h2><p>{query?'عبارت جست‌وجو را تغییر دهید.':'پس از تولید و ذخیره اولین خبر، اینجا در دسترس خواهد بود.'}</p>{!query&&<Link href="/">تولید اولین خبر</Link>}</div>):(filteredSources.length?<div className="source-list">{filteredSources.map((source,index)=><article className="source-card" key={source.id}>
        <span className="source-number">۰{index+1}</span><div className="source-icon">{source.kind==='url'?<Link2/>:<FileText/>}</div>
        <div className="source-main"><span>{source.kind==='url'?'صفحه وب':'متن دستی'}</span><h2>{source.title||'منبع بدون عنوان'}</h2>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>}</div>
        <div className="linked-article"><span>استفاده‌شده در</span><Link href={`/?article=${source.articleId}`}>{source.headline}</Link></div>
      </article>)}</div>:<div className="library-empty"><Link2/><h2>{query?'منبعی با این مشخصات پیدا نشد':'هنوز منبعی ثبت نشده است'}</h2><p>{query?'عبارت جست‌وجو را تغییر دهید.':'منابع لینک و متن، همراه با خبر ذخیره‌شده در این بخش ظاهر می‌شوند.'}</p>{!query&&<Link href="/">افزودن منبع و تولید خبر</Link>}</div>)}
    </section>
  </main>;
}
