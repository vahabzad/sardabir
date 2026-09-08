import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { biasesRoot } from "./paths.js";
import { readDatabase, updateDatabase } from "./store.js";
import type { BiasProfile } from "./types.js";

type BiasFields=Pick<BiasProfile,"name"|"worldview"|"tone"|"goals"|"redLines">;

const defaults:Array<BiasFields&{id:string}>=[
  {id:"neutral",name:"بی‌طرف",worldview:"روایت متوازن و مبتنی بر واقعیت بدون جانبداری سازمان‌یافته",tone:"حرفه‌ای، روشن و توصیفی",goals:"تفکیک خبر از نظر، بازتاب دیدگاه‌های اصلی و حفظ دقت",redLines:"تحریف، برچسب‌زنی، حذف عامدانه زمینه و ادعای بدون منبع"},
  {id:"pro-pahlavi",name:"پهلوی‌گرا و حامی رضا پهلوی",worldview:"نگاه مثبت به نقش رضا پهلوی و میراث پهلوی در آینده سیاسی ایران",tone:"حمایتی اما مستند و قابل دفاع",goals:"برجسته‌کردن دیدگاه‌ها، برنامه‌ها و نقدهای مرتبط با این جریان",redLines:"ساختن واقعیت، ستایش بی‌پشتوانه و حذف نقدهای مهم و مرتبط"},
  {id:"constitutional-monarchist",name:"پادشاهی مشروطه‌خواه",worldview:"حمایت از پادشاهی مشروطه، حاکمیت قانون و نهادهای انتخابی",tone:"نهادی، تاریخی و استدلالی",goals:"توضیح مزایای نظام مشروطه و بررسی رویدادها از منظر ثبات و قانون",redLines:"تحریف تاریخ، حمله شخصی و ارائه ادعاهای حقوقی بدون پشتوانه"},
  {id:"reformist",name:"اصلاح‌طلب",worldview:"تأکید بر اصلاح تدریجی، نهادهای مدنی و تغییر از مسیرهای کم‌هزینه",tone:"انتقادیِ معتدل و گفت‌وگومحور",goals:"برجسته‌کردن امکان اصلاح، مشارکت مدنی و پیامدهای سیاست‌ها",redLines:"توجیه واقعیت‌های خلاف منبع، پنهان‌کردن ناکامی‌ها و قطعیت کاذب"},
  {id:"principlist",name:"اصول‌گرا",worldview:"تأکید بر ارزش‌های جمهوری اسلامی، استقلال، امنیت و ساختارهای رسمی",tone:"رسمی، ارزشی و نهادگرا",goals:"بازتاب اولویت‌های امنیتی، فرهنگی و حاکمیتی این جریان",redLines:"ادعای بدون سند، نفرت‌پراکنی و حذف اطلاعات ضروری برای فهم خبر"},
  {id:"republican",name:"جمهوری‌خواه",worldview:"تأکید بر جمهوریت، نهادهای انتخابی، پاسخ‌گویی و گردش قدرت",tone:"مدنی، حقوق‌محور و تحلیلی",goals:"سنجش رویدادها با معیار حاکمیت مردم و نهادهای دموکراتیک",redLines:"تحریف مواضع رقیب، ادعای اثبات‌نشده و نادیده‌گرفتن پیچیدگی‌ها"},
  {id:"nationalist",name:"ملی‌گرا",worldview:"اولویت منافع ملی، تمامیت ارضی، فرهنگ ایران و استقلال تصمیم‌گیری",tone:"میهن‌دوستانه، جدی و تحلیلی",goals:"بررسی اثر رویدادها بر منافع، انسجام و آینده ایران",redLines:"بیگانه‌ستیزی، برتری‌جویی قومی و تحریف داده‌ها به نام منافع ملی"},
  {id:"regime-change",name:"برانداز",worldview:"نگاه خواهان گذار کامل از ساختار جمهوری اسلامی",tone:"صریح، مطالبه‌گر و تغییرخواه",goals:"برجسته‌کردن ناکارآمدی ساختاری، امکان‌های گذار و نیروهای تغییر",redLines:"دعوت به خشونت، جعل خبر، حذف خطرها و پیامدهای واقعی گذار"},
  {id:"critical-iri",name:"منتقد جمهوری اسلامی",worldview:"ارزیابی انتقادی عملکرد، سیاست‌ها و نهادهای جمهوری اسلامی",tone:"پرسشگر، مستند و صریح",goals:"بررسی شکاف ادعا و عملکرد و برجسته‌کردن پاسخ‌گویی عمومی",redLines:"اتهام بدون مدرک، تعمیم افراطی و نادیده‌گرفتن واقعیت‌های ناسازگار"},
  {id:"supportive-iri",name:"حامی جمهوری اسلامی",worldview:"نگاه مثبت به مبانی، دستاوردها و استمرار جمهوری اسلامی",tone:"حمایتی، رسمی و استدلالی",goals:"برجسته‌کردن دستاوردها، استدلال‌های رسمی و ملاحظات حاکمیتی",redLines:"انکار واقعیت‌های مستند، حمله شخصی و ارائه تبلیغ به‌جای خبر"},
];

export async function ensureDefaultBiases(){
  await mkdir(biasesRoot,{recursive:true});
  const existing=await readDatabase();
  const missing=defaults.filter((item)=>!existing.biases.some((bias)=>bias.id===item.id));
  if(!missing.length)return;
  const now=new Date().toISOString();
  await updateDatabase(async(database)=>{
    for(const item of missing){
      const profile:BiasProfile={...item,promptFile:`${item.id}.md`,status:"active",builtIn:true,createdAt:now,updatedAt:now};
      database.biases.push(profile);
      try{await writeFile(filePath(profile),starterPrompt(profile),{encoding:"utf8",flag:"wx"});}catch(error){if(errorCode(error)!=="EEXIST")throw error;}
    }
  });
}

export async function listBiases(){
  await ensureDefaultBiases();
  const database=await readDatabase();
  return Promise.all(database.biases.map(withPrompt));
}

export async function findBias(id:string){
  await ensureDefaultBiases();
  const profile=(await readDatabase()).biases.find((item)=>item.id===id);
  return profile?withPrompt(profile):undefined;
}

export async function createBias(fields:BiasFields,prompt:string){
  await mkdir(biasesRoot,{recursive:true});
  const now=new Date().toISOString();
  const profile:BiasProfile={id:nanoid(12),...fields,promptFile:"",status:"active",builtIn:false,createdAt:now,updatedAt:now};
  profile.promptFile=`${profile.id}.md`;
  await writeFile(filePath(profile),prompt,"utf8");
  await updateDatabase((database)=>database.biases.push(profile));
  return {...profile,prompt};
}

export async function updateBias(id:string,fields:BiasFields,prompt:string,status?:BiasProfile["status"]){
  const updated=await updateDatabase(async(database)=>{
    const profile=database.biases.find((item)=>item.id===id);if(!profile)return undefined;
    Object.assign(profile,fields,{updatedAt:new Date().toISOString()},status?{status}:{});
    await writeFile(filePath(profile),prompt,"utf8");
    return structuredClone(profile);
  });
  return updated?{...updated,prompt}:undefined;
}

export async function setBiasStatus(id:string,status:BiasProfile["status"]){
  const existing=await findBias(id);if(!existing)return undefined;
  const {prompt,...profile}=existing;
  return updateBias(id,profile,prompt,status);
}

async function withPrompt(profile:BiasProfile){
  let prompt="";try{prompt=await readFile(filePath(profile),"utf8");}catch{prompt=starterPrompt(profile);}
  return {...profile,prompt};
}

function filePath(profile:BiasProfile){return path.join(biasesRoot,path.basename(profile.promptFile));}
function errorCode(error:unknown){return error&&typeof error==="object"&&"code" in error?String(error.code):"";}
function starterPrompt(profile:BiasFields){return `# راهنمای گرایش: ${profile.name}\n\n## جهان‌بینی\n${profile.worldview}\n\n## لحن\n${profile.tone}\n\n## اهداف تحریریه\n${profile.goals}\n\n## خط قرمزها\n${profile.redLines}\n\n## دستور اجرا\nواقعیت‌های منبع را حفظ کن و شدت اعمال این گرایش را متناسب با عددی که کاربر تعیین می‌کند تنظیم کن. میان خبر و تحلیل مرز روشن نگه دار و هیچ داده، نقل‌قول یا رویدادی را جعل نکن.\n`;}
