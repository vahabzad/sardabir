import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import { Codex } from "@openai/codex-sdk";
import { findBias } from "./bias-store.js";
import { localCodexEnvironment } from "./codex-environment.js";
import { articleWorkspace, biasWorkspace, promptFile } from "./paths.js";
import { resolveCodexExecutable } from "./codex-executable.js";
import { findArticle, saveArticle } from "./store.js";
import type { GenerationUsage, NewsArticle, NewsSettings, NewsSource } from "./types.js";

const execFileAsync=promisify(execFile);
const FILE_CREDENTIAL_ARGS=["--config",'cli_auth_credentials_store="file"'];
const DEFAULT_CODEX_MODEL="gpt-5.6-sol";
// Dollar/credit rates are per 1M tokens; five-hour ranges are the published Plus local-message estimates.
const MODEL_USAGE_RATES:Record<string,{input:number;cachedInput:number;output:number;credits:{input:number;cachedInput:number;output:number};fiveHour:{min:number;max:number}}>= {
  "gpt-6-astra":{input:10,cachedInput:1,output:50,credits:{input:250,cachedInput:25,output:1250},fiveHour:{min:100/45,max:100/5}},
  "gpt-5.6-sol":{input:4,cachedInput:.4,output:20,credits:{input:100,cachedInput:10,output:500},fiveHour:{min:1,max:10}},
  "gpt-5.6":{input:4,cachedInput:.4,output:20,credits:{input:100,cachedInput:10,output:500},fiveHour:{min:1,max:10}},
  "gpt-5.6-terra":{input:2,cachedInput:.2,output:12,credits:{input:50,cachedInput:5,output:300},fiveHour:{min:.5,max:4}},
  "gpt-5.6-luna":{input:.2,cachedInput:.02,output:1.2,credits:{input:5,cachedInput:.5,output:30},fiveHour:{min:.05,max:.4}},
};

export type GenerationProgress = {level:"info"|"success"|"warning";message:string};

type GenerateNewsInput = { articleId?:string; subject:string; sources:Array<{kind:"url"|"text";value:string}> } & NewsSettings;
type PreparedNews = {prompt:string;settings:NewsSettings;sources:NewsSource[];failedSources:Array<{label:string;message:string}>;unresolvedSourceCount:number};

export async function getLocalCodexStatus(){
  const executable=await resolveCodexExecutable();
  if(!executable) return {ready:false,message:"Codex محلی روی سیستم پیدا نشد."};
  try {
    const {stdout,stderr}=await execFileAsync(executable,[...FILE_CREDENTIAL_ARGS,"login","status"],{timeout:10_000,windowsHide:true,env:localCodexEnvironment()});
    const output=`${stdout}\n${stderr}`.trim();
    return {ready:!/not logged in/i.test(output),message:output||"وضعیت ورود Codex مشخص نیست."};
  } catch(error){
    const output=error&&typeof error==="object"&&"stderr" in error?String(error.stderr):"";
    return {ready:false,message:output.trim()||"Codex CLI قابل اجرا نیست یا وارد حساب نشده است."};
  }
}

export async function prepareNewsPrompt(input:GenerateNewsInput,onProgress?:(event:GenerationProgress)=>void,options:{allowUnresolvedUrls?:boolean}={}):Promise<PreparedNews>{
  const progress=(level:GenerationProgress["level"],message:string)=>onProgress?.({level,message});
  progress("info",`بررسی ${input.sources.length} منبع آغاز شد.`);
  const sourceResults=await Promise.all(input.sources.map(async(source,index)=>{
    const label=sourceLabel(source,index);
    progress("info",`در حال خواندن ${label}…`);
    try{
      const resolved=await resolveSource(source);
      progress("success",`${label} با موفقیت خوانده شد.`);
      return {ok:true as const,source:resolved};
    }catch(error){
      const message=error instanceof Error?error.message:"منبع قابل خواندن نبود.";
      if(options.allowUnresolvedUrls&&source.kind==="url"){
        const fallback=unresolvedUrlSource(source.value);
        if(fallback){progress("warning",`${label} قابل استخراج نبود و با لینک خام در پرامپت قرار گرفت.`);return {ok:true as const,source:fallback,unresolved:{label,message}};}
      }
      progress("warning",`${label} استفاده نشد: ${message}`);
      return {ok:false as const,label,message};
    }
  }));
  const resolvedSources=sourceResults.filter((result):result is Extract<(typeof sourceResults)[number],{ok:true}>=>result.ok).map((result)=>result.source);
  const failedSources=sourceResults.filter((result):result is Extract<(typeof sourceResults)[number],{ok:false}>=>!result.ok);
  const unresolvedSourceCount=sourceResults.filter((result)=>result.ok&&"unresolved" in result).length;
  if(!resolvedSources.length)throw new Error(`هیچ منبع قابل‌استفاده‌ای باقی نماند. ${failedSources.map((item)=>item.label).join("، ")}`);
  progress(failedSources.length?"warning":"success",failedSources.length?`${resolvedSources.length} منبع قابل استفاده است و ${failedSources.length} منبع کنار گذاشته شد.`:`هر ${resolvedSources.length} منبع قابل استفاده است.`);
  const template=await readFile(promptFile,"utf8");
  const selectedBias=input.mediaBiasId?await findBias(input.mediaBiasId):undefined;
  const settings:NewsSettings={mediaBias:selectedBias?.name||input.mediaBias,mediaBiasId:selectedBias?.id,mediaBiasPrompt:selectedBias?.prompt||"",biasIntensity:input.biasIntensity,criticalIntensity:input.criticalIntensity,excitement:input.excitement,humorIntensity:input.humorIntensity,outputLength:input.outputLength,audience:input.audience,platform:input.platform};
  const sourcePacket=resolvedSources.map((source,index)=>`منبع ${index+1}${source.url?` — ${source.url}`:""}:\n${source.extractedText}`).join("\n\n---\n\n");
  const unresolvedDirective=unresolvedSourceCount?"\n- بازیابی منبع: محتوای یک یا چند لینک در مرحله آماده‌سازی قابل استخراج نبود. پیش از نوشتن، نشانی‌های درج‌شده را با دسترسی شبکه باز کن و فقط از محتوای واقعی بازیابی‌شده استفاده کن؛ اگر صفحه باز نشد، بر پایه موضوع یا نشانی لینک واقعیت، عدد یا نقل‌قول نساز.":"";
  const prompt=`${template}\n\nراهنمای اختصاصی گرایش انتخاب‌شده:\n${settings.mediaBiasPrompt||`گرایش ${settings.mediaBias} را فقط مطابق شدت تعیین‌شده اعمال کن.`}\n\nاطلاعات واقعی این اجرا:\nموضوع خبر: ${input.subject}\nگرایش رسانه‌ای: ${settings.mediaBias}\nشدت گرایش رسانه‌ای: ${input.biasIntensity}\nشدت لحن انتقادی: ${input.criticalIntensity}\nجذابیت و هیجان رسانه‌ای: ${input.excitement}\nشدت طنز و سوژه‌پردازی: ${input.humorIntensity} (۰ کاملاً جدی، ۱۰۰ سوژه‌سازی و جوک‌پردازی تمام‌عیار)\nدستور اجرایی این شدت: ${humorDirective(input.humorIntensity)}\nحجم خروجی: ${input.outputLength}\nمخاطب: ${input.audience}\nبستر انتشار: ${input.platform}\n\nقواعد اجرایی الزامی این خروجی:\n- حجم: متن کامل خروجی باید در بازه «${input.outputLength}» بماند؛ اطلاعات را متناسب با این سقف اولویت‌بندی و فشرده کن.\n- مخاطب: ${audienceDirective(input.audience)}\n- بستر انتشار: ${platformDirective(input.platform)}\n- قاعده ترکیب: سطح واژگان و عمق اطلاعات را «مخاطب» تعیین می‌کند و ساختار، ریتم و شیوه ارائه را «بستر انتشار». هر دو را هم‌زمان و به‌طور محسوس اجرا کن. این قواعد اجرایی بر توصیه‌های عمومی‌تر قالب مقدم‌اند.${unresolvedDirective}\n\nمنابع خبر:\n${sourcePacket}\n\nفقط خروجی نهایی را با سه بخش «تیتر:»، «لید:» و «متن خبر:» برگردان.`;

  return {prompt,settings,sources:resolvedSources,failedSources,unresolvedSourceCount};
}

export function audienceDirective(audience:string){
  if(audience==="عموم مردم")return "برای خواننده بدون دانش قبلی بنویس. اصطلاح تخصصی، مخفف و جزئیات فنیِ غیرضروری را حذف کن؛ هر اصطلاح تخصصیِ ضروری را همان بار اول با زبان روزمره و کوتاه توضیح بده. جمله‌ها روشن و کوتاه باشند و فقط اطلاعاتی را نگه دار که برای فهم اصل رویداد و اثر آن بر زندگی مردم لازم است.";
  if(audience==="مخاطب تخصصی")return "واژگان دقیق تخصصی، داده‌ها، سازوکارها و جزئیات فنیِ مرتبط را حفظ کن و از ساده‌سازی‌ای که دقت را از بین می‌برد بپرهیز. از توضیح بدیهیات رشته خودداری کن، اما ادعا و عدم‌قطعیت را دقیق نشان بده.";
  if(audience==="مخاطب سیاسی")return "بر بازیگران، نهادها، مواضع، موازنه قدرت و پیامدهای سیاستی تمرکز کن. اصطلاح فنیِ خارج از حوزه سیاست را کوتاه توضیح بده و از جزئیات تخصصی‌ای که به پیامد سیاسی کمک نمی‌کند صرف‌نظر کن.";
  if(audience==="کاربران شبکه‌های اجتماعی")return "بدون فرض دانش قبلی، مستقیم و قابل‌فهم بنویس. زمینه را به حداقل لازم کاهش بده، جمله‌ها و بندها را کوتاه نگه دار و از آمار، مخفف و اصطلاح تخصصیِ بدون توضیح پرهیز کن.";
  return `سطح واژگان، میزان پیش‌زمینه و انتخاب جزئیات را مشخصاً برای «${audience}» تنظیم کن و اطلاعات تخصصیِ نامتناسب را وارد متن نکن.`;
}

export function platformDirective(platform:string){
  if(platform==="وب‌سایت خبری")return "تیتر روشن و جست‌وجوپذیر، لید مستقل و بدنه با هرم وارونه بنویس؛ مهم‌ترین واقعیت ابتدا، سپس جزئیات و زمینه. بندها کوتاه باشند و از هشتگ و ایموجی استفاده نکن.";
  if(platform==="روزنامه")return "لحن چاپی، رسمی و یکدست با تیتر موجز و روایت پیوسته بساز. زمینه و اتصال منطقی بندها را تقویت کن و از هشتگ، ایموجی و خطاب مستقیم پرهیز کن.";
  if(platform==="خبرنامه")return "تیتر را شبیه موضوع جذاب خبرنامه و لید را پاسخ روشن به «چرا مهم است» بنویس. بدنه را گزیده، توضیحی و رو به خواننده تنظیم کن و در پایان جمع‌بندی کوتاهی از پیامد اصلی بده؛ اطلاعات تازه نساز.";
  if(platform==="تلگرام")return "برای خواندن روی موبایل بنویس: تیتر ضربه‌دار، لید بسیار کوتاه و بندهای یک تا دو جمله‌ای. اصل خبر را در چند خط نخست کامل منتقل کن؛ از مقدمه طولانی، جدول و تکرار بپرهیز و حداکثر دو هشتگ مرتبط در پایان متن خبر بیاور.";
  if(platform==="اینستاگرام")return "خروجی را مانند کپشن خبری بساز: تیترِ قلاب‌دار، لید یک‌جمله‌ای و بدنه‌ای کوتاه با شکست خط فراوان. نکته اصلی را همان ابتدا بگو و در پایان حداکثر سه هشتگ دقیق و مرتبط بیاور؛ از جدول و جزئیات سنگین پرهیز کن.";
  if(platform==="شبکه اجتماعی")return "خروجی را سریع و فشرده بساز: تیتر کوتاه، لید یک‌جمله‌ای و بدنه با جمله‌های مستقل و قابل اسکن. مهم‌ترین نکته و پیامد را جلو بینداز، تکرار و زمینه طولانی را حذف کن و حداکثر دو هشتگ مرتبط در پایان بیاور.";
  return `قالب، طول بند، ریتم تیتر و شیوه ارائه را متناسب با قواعد رایج «${platform}» تغییر بده تا خروجی آن با وب‌سایت خبری یکسان نباشد.`;
}

export async function generateNews(input:GenerateNewsInput,onProgress?:(event:GenerationProgress)=>void){
  const progress=(level:GenerationProgress["level"],message:string)=>onProgress?.({level,message});
  progress("info","بررسی اتصال Codex…");
  const login=await getLocalCodexStatus();
  if(!login.ready) throw new Error("Codex محلی وارد حساب ChatGPT نیست. دستور npm run codex:login را اجرا کنید.");
  progress("success","اتصال Codex آماده است.");
  const existing=input.articleId?await findArticle(input.articleId):undefined;
  const articleId=existing?.id||nanoid(12);
  const {prompt,settings,sources:resolvedSources,failedSources,unresolvedSourceCount}=await prepareNewsPrompt(input,onProgress,{allowUnresolvedUrls:true});

  const executable=await resolveCodexExecutable(); if(!executable) throw new Error("فایل اجرایی Codex پیدا نشد.");
  const workspace=articleWorkspace(articleId); await mkdir(workspace,{recursive:true});
  const model=await resolveCodexModel();
  progress("info",`تولید خبر با مدل ${model} آغاز شد…`);
  const codex=new Codex({codexPathOverride:executable,env:localCodexEnvironment(),config:{forced_login_method:"chatgpt",cli_auth_credentials_store:"file"}});
  if(unresolvedSourceCount)progress("warning",`${unresolvedSourceCount} لینک با دریافت مستقیم باز نشد؛ Codex تلاش می‌کند محتوای آن را از نشانی اصلی بازیابی کند.`);
  const threadOptions={workingDirectory:workspace,skipGitRepoCheck:true,sandboxMode:"read-only" as const,approvalPolicy:"never" as const,networkAccessEnabled:unresolvedSourceCount>0,model};
  const thread=existing?.threadId?codex.resumeThread(existing.threadId,threadOptions):codex.startThread(threadOptions);
  const result=await thread.run(prompt);
  progress("success","پاسخ Codex دریافت شد؛ در حال پردازش خروجی…");
  const parsed=parseOutput(result.finalResponse);
  const generationUsage=buildGenerationUsage(model,result.usage);
  const now=new Date().toISOString();
  const version={id:nanoid(10),...parsed,prompt,settings,...(generationUsage?{generationUsage}:{}),createdAt:now};
  const article:NewsArticle={id:articleId,subject:input.subject,...parsed,settings,sources:resolvedSources,versions:[version,...(existing?.versions||[])],...(generationUsage?{generationUsage}:{}),threadId:thread.id||existing?.threadId,status:"draft",createdAt:existing?.createdAt||now,updatedAt:now};
  await saveArticle(article);
  progress("success","خبر و آمار مصرف آن در آرشیو ذخیره شد.");
  if(failedSources.length)progress("warning",`منابع استفاده‌نشده: ${failedSources.map((item)=>item.label).join("، ")}`);
  return article;
}

export async function generateBiasPrompt(input:{name:string;worldview:string;tone:string;goals:string;redLines:string}){
  const login=await getLocalCodexStatus();if(!login.ready)throw new Error("Codex محلی وارد حساب ChatGPT نیست.");
  const executable=await resolveCodexExecutable();if(!executable)throw new Error("فایل اجرایی Codex پیدا نشد.");
  const workspace=biasWorkspace(nanoid(10));await mkdir(workspace,{recursive:true});
  const codex=new Codex({codexPathOverride:executable,env:localCodexEnvironment(),config:{forced_login_method:"chatgpt",cli_auth_credentials_store:"file"}});
  const thread=codex.startThread({workingDirectory:workspace,skipGitRepoCheck:true,sandboxMode:"read-only",approvalPolicy:"never",networkAccessEnabled:false,...(process.env.CODEX_MODEL?{model:process.env.CODEX_MODEL}:{})});
  const request=`برای یک سامانه تولید خبر فارسی، فایل راهنمای تحریریه یک گرایش رسانه‌ای را بنویس. این فایل در کنار پرامپت اصلی استفاده می‌شود و باید اجرایی، دقیق و قابل ویرایش باشد.\n\nنام گرایش: ${input.name}\nجهان‌بینی: ${input.worldview}\nلحن: ${input.tone}\nاهداف: ${input.goals}\nخط قرمزها: ${input.redLines}\n\nالزامات:\n- به فارسی و با قالب Markdown بنویس.\n- بخش‌های «تعریف زاویه»، «اولویت‌های روایی»، «لحن و واژگان»، «نحوه اعمال شدت صفر تا صد»، «الزامات صحت خبر» و «خط قرمزها» را داشته باشد.\n- شدت صفر باید نزدیک به روایت خنثی و شدت صد نمایانگر کامل این زاویه باشد.\n- دستور جعل واقعیت، نقل‌قول یا منبع ندهد و خبر را با تبلیغات اشتباه نگیرد.\n- فقط متن نهایی فایل Markdown را برگردان و توضیح اضافه نده.`;
  const result=await thread.run(request);
  return result.finalResponse.replace(/^```(?:markdown)?\s*/i,"").replace(/\s*```$/," ").trim();
}

function humorDirective(value:number){
  if(value<=20)return "خبر را کاملاً جدی بنویس و از شوخی، کنایه و بازی زبانی استفاده نکن.";
  if(value<=40)return "فقط چند کنایه یا شوخی بسیار ظریف به کار ببر و ساختار خبر جدی را حفظ کن.";
  if(value<=60)return "در چند جای متن طنز روشن، تشبیه بامزه یا پایان‌بندی شوخ بساز، بدون اینکه سوژه‌پردازی بر خبر غالب شود.";
  if(value<=80)return "تناقض یا رفتار بازیگر اصلی را به سوژه طنز تبدیل کن؛ تیتر طناز و چند شوخی، بازی زبانی و ضربه طنز روشن در متن لازم است.";
  return "خروجی را به طنز خبری تمام‌عیار نزدیک کن: سوژه اصلی را فعالانه دستمایه جوک و کنایه تند قرار بده، تیتر طناز بساز و در سراسر متن چندین شوخی، تشبیه کمیک، اغراق بلاغی آشکار و punchline بیاور. طنز باید بخش غالب روایت باشد، نه تزئین آن؛ واقعیت، انتساب و ایمنی قربانیان را حفظ کن.";
}

function parseOutput(output:string){
  const clean=output.replace(/\*\*/g,"").trim();
  const match=clean.match(/تیتر\s*:\s*([\s\S]*?)\n\s*لید\s*:\s*([\s\S]*?)\n\s*متن خبر\s*:\s*([\s\S]*)/);
  if(!match) throw new Error("خروجی Codex ساختار تیتر، لید و متن خبر را نداشت.");
  return {headline:match[1].trim(),lead:match[2].trim(),body:match[3].trim()};
}

async function resolveCodexModel(){
  if(process.env.CODEX_MODEL?.trim())return process.env.CODEX_MODEL.trim();
  const codexRoot=process.env.CODEX_HOME?.trim()||path.join(homedir(),".codex");
  try{
    const config=await readFile(path.join(codexRoot,"config.toml"),"utf8");
    return config.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1]||DEFAULT_CODEX_MODEL;
  }catch{return DEFAULT_CODEX_MODEL;}
}

function buildGenerationUsage(model:string,usage:{input_tokens:number;cached_input_tokens:number;output_tokens:number}|null):GenerationUsage|undefined{
  if(!usage)return undefined;
  const inputTokens=Math.max(0,usage.input_tokens);
  const cachedInputTokens=Math.min(inputTokens,Math.max(0,usage.cached_input_tokens));
  const outputTokens=Math.max(0,usage.output_tokens);
  const uncachedInputTokens=inputTokens-cachedInputTokens;
  const rates=MODEL_USAGE_RATES[model.toLowerCase()];
  const estimatedApiCostUsd=rates?((uncachedInputTokens*rates.input)+(cachedInputTokens*rates.cachedInput)+(outputTokens*rates.output))/1_000_000:null;
  const estimatedCredits=rates?((uncachedInputTokens*rates.credits.input)+(cachedInputTokens*rates.credits.cachedInput)+(outputTokens*rates.credits.output))/1_000_000:null;
  return {model,inputTokens,cachedInputTokens,outputTokens,totalTokens:inputTokens+outputTokens,estimatedApiCostUsd,estimatedCredits,fiveHourEstimatePercent:rates?.fiveHour||null};
}

function sourceLabel(source:{kind:"url"|"text";value:string},index:number){
  if(source.kind==="text")return `متن واردشده شماره ${index+1}`;
  try{return `منبع ${index+1} (${new URL(source.value).hostname})`;}catch{return `منبع ${index+1}`;}
}

function unresolvedUrlSource(value:string):NewsSource|undefined{
  try{const url=new URL(value);if(!["http:","https:"].includes(url.protocol)||isPrivateHost(url.hostname))return undefined;return{id:nanoid(10),kind:"url",url:url.toString(),title:url.hostname,extractedText:`محتوای این منبع به‌صورت خودکار قابل استخراج نبود. نشانی منبع برای دسترسی مستقیم: ${url.toString()}`,createdAt:new Date().toISOString()};}catch{return undefined;}
}

async function resolveSource(source:{kind:"url"|"text";value:string}):Promise<NewsSource>{
  const now=new Date().toISOString();
  if(source.kind==="text") return {id:nanoid(10),kind:"text",title:"متن واردشده",originalText:source.value,extractedText:source.value.trim().slice(0,60_000),createdAt:now};
  const url=new URL(source.value); if(!["http:","https:"].includes(url.protocol)||isPrivateHost(url.hostname)) throw new Error("نشانی منبع مجاز نیست.");
  const response=await fetchSourcePage(url);
  const finalUrl=new URL(response.url);if(isPrivateHost(finalUrl.hostname))throw new Error("مسیر هدایت‌شده منبع مجاز نیست.");
  const html=(await response.text()).slice(0,800_000);
  const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g,"").trim()||finalUrl.hostname);
  const extractedText=decode(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()).slice(0,60_000);
  if(extractedText.length<80)throw new Error(`محتوای قابل‌خواندن از ${url.hostname} پیدا نشد. متن خبر را مستقیماً وارد کنید.`);
  return {id:nanoid(10),kind:"url",url:finalUrl.toString(),title,extractedText,createdAt:now};
}

async function fetchSourcePage(url:URL){
  const retryable=new Set([408,425,429,500,502,503,504]);
  let lastStatus=0;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language":"fa-IR,fa;q=0.9,en-US;q=0.7,en;q=0.6",
        "Cache-Control":attempt?"no-cache":"max-age=0",
        "Upgrade-Insecure-Requests":"1",
      },redirect:"follow",signal:AbortSignal.timeout(30_000)});
      if(response.ok)return response;
      lastStatus=response.status;
      if(!retryable.has(response.status))break;
    }catch(error){
      if(attempt===1)throw new Error(`ارتباط با ${url.hostname} برقرار نشد. لینک را بررسی کنید یا متن خبر را وارد کنید.`,{cause:error});
    }
    await new Promise((resolve)=>setTimeout(resolve,700));
  }
  throw new Error(`سایت ${url.hostname} پاسخ ${lastStatus||'نامعتبر'} داد. می‌توانید متن خبر را مستقیماً وارد کنید.`);
}
function decode(value:string){return value.replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"');}
function isPrivateHost(host:string){const value=host.toLowerCase();return value==="localhost"||value.endsWith(".local")||value==="::1"||value.startsWith("127.")||value.startsWith("10.")||value.startsWith("192.168.")||/^172\.(1[6-9]|2\d|3[01])\./.test(value);}
