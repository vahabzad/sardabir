import "dotenv/config";
import { mkdir } from "node:fs/promises";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { nanoid } from "nanoid";
import { createBias, ensureDefaultBiases, findBias, listBiases, setBiasStatus, updateBias } from "./bias-store.js";
import { generateBiasPrompt, generateNews, getLocalCodexStatus } from "./generator.js";
import { biasesRoot, dataRoot, jobsRoot } from "./paths.js";
import { biasInputSchema, biasUpdateSchema, generationSchema, saveSchema } from "./schemas.js";
import { findArticle, readDatabase, saveArticle } from "./store.js";
import type { NewsArticle, NewsSource } from "./types.js";

const app=express(); const port=Number(process.env.PORT||4000);
await Promise.all([mkdir(dataRoot,{recursive:true}),mkdir(jobsRoot,{recursive:true}),mkdir(biasesRoot,{recursive:true})]);
await ensureDefaultBiases();
app.disable("x-powered-by"); app.use(helmet()); app.use(cors({origin:(process.env.FRONTEND_ORIGIN||"http://localhost:3000").split(",")})); app.use(express.json({limit:"1mb"}));

app.get("/api/health",(_req,res)=>res.json({ok:true,service:"sardabir-local"}));
app.get("/api/codex/status",async(_req,res)=>res.json(await getLocalCodexStatus()));
app.get("/api/biases",async(req,res)=>{const includeArchived=req.query.includeArchived==="true";const biases=(await listBiases()).filter((item)=>includeArchived||item.status==="active");res.json({biases});});
app.get("/api/biases/:id",async(req,res)=>{const bias=await findBias(String(req.params.id));if(!bias)return res.status(404).json({message:"گرایش پیدا نشد."});res.json({bias});});
app.post("/api/biases",async(req,res)=>{const parsed=biasInputSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"اطلاعات گرایش را کامل کنید."});try{const prompt=await generateBiasPrompt(parsed.data);const bias=await createBias(parsed.data,prompt);res.status(201).json({bias});}catch(error){console.error(error);res.status(500).json({message:error instanceof Error?error.message:"ساخت پرامپت گرایش ناموفق بود."});}});
app.put("/api/biases/:id",async(req,res)=>{const parsed=biasUpdateSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"اطلاعات یا متن پرامپت معتبر نیست."});const bias=await updateBias(String(req.params.id),parsed.data,parsed.data.prompt,parsed.data.status);if(!bias)return res.status(404).json({message:"گرایش پیدا نشد."});res.json({bias});});
app.patch("/api/biases/:id/status",async(req,res)=>{const status=req.body?.status;if(status!=="active"&&status!=="archived")return res.status(400).json({message:"وضعیت گرایش معتبر نیست."});const bias=await setBiasStatus(String(req.params.id),status);if(!bias)return res.status(404).json({message:"گرایش پیدا نشد."});res.json({bias});});
app.get("/api/articles",async(_req,res)=>{const articles=(await readDatabase()).articles.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(publicArticle);res.json({articles});});
app.get("/api/articles/:id",async(req,res)=>{const article=await findArticle(String(req.params.id));if(!article)return res.status(404).json({message:"خبر پیدا نشد."});res.json({article});});
app.get("/api/sources",async(_req,res)=>{const articles=(await readDatabase()).articles;const sources=articles.flatMap((article)=>article.sources.map((source)=>({...source,articleId:article.id,headline:article.headline}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));res.json({sources});});
app.post("/api/generate",async(req,res)=>{
  const parsed=generationSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({message:"موضوع، منابع و تنظیمات خبر را کامل کنید."});
  try{const article=await generateNews(parsed.data);res.status(201).json({article:publicArticle(article),sources:article.sources});}
  catch(error){console.error(error);res.status(500).json({message:error instanceof Error?error.message:"تولید خبر ناموفق بود."});}
});
app.post("/api/articles",async(req,res)=>{
  const parsed=saveSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:"اطلاعات خبر معتبر نیست."});
  const existing=parsed.data.id?await findArticle(parsed.data.id):undefined;const selectedBias=parsed.data.mediaBiasId?await findBias(parsed.data.mediaBiasId):undefined;const now=new Date().toISOString();const settings={mediaBias:selectedBias?.name||parsed.data.mediaBias,mediaBiasId:selectedBias?.id||parsed.data.mediaBiasId,mediaBiasPrompt:selectedBias?.prompt||existing?.settings.mediaBiasPrompt||"",biasIntensity:parsed.data.biasIntensity,criticalIntensity:parsed.data.criticalIntensity,excitement:parsed.data.excitement,humorIntensity:parsed.data.humorIntensity,outputLength:parsed.data.outputLength,audience:parsed.data.audience,platform:parsed.data.platform};
  const sources=(parsed.data.sources||existing?.sources||[]) as NewsSource[];const version={id:nanoid(10),headline:parsed.data.headline,lead:parsed.data.lead,body:parsed.data.body,settings,createdAt:now};
  const article:NewsArticle={id:existing?.id||nanoid(12),subject:parsed.data.subject,headline:parsed.data.headline,lead:parsed.data.lead,body:parsed.data.body,settings,sources,versions:[version,...(existing?.versions||[])],generationUsage:existing?.generationUsage,threadId:existing?.threadId,status:parsed.data.status||"draft",createdAt:existing?.createdAt||now,updatedAt:now};
  await saveArticle(article);res.status(201).json({id:article.id,updatedAt:article.updatedAt});
});
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(error);res.status(500).json({message:"خطای داخلی سرویس محلی"});});
app.listen(port,()=>console.log(`Sardabir local API: http://localhost:${port}`));

function publicArticle(article:NewsArticle){return {id:article.id,subject:article.subject,headline:article.headline,lead:article.lead,body:article.body,mediaBias:article.settings.mediaBias,biasIntensity:article.settings.biasIntensity,criticalIntensity:article.settings.criticalIntensity,excitement:article.settings.excitement,humorIntensity:article.settings.humorIntensity??0,outputLength:article.settings.outputLength,audience:article.settings.audience,platform:article.settings.platform,status:article.status,updatedAt:new Date(article.updatedAt).getTime(),createdAt:article.createdAt,versions:article.versions.length,generationUsage:article.generationUsage};}
