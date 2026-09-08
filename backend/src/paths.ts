import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(sourceDir, "..");
export const projectRoot = path.resolve(backendRoot, "..");
export const dataRoot = path.join(backendRoot, "data");
export const databaseFile = path.join(dataRoot, "database.json");
export const jobsRoot = path.join(backendRoot, "jobs");
export const biasesRoot = path.join(dataRoot, "biases");
export const promptFile = path.join(projectRoot, "پرامت_بازطراحی_شده_تولید_خبر.txt");
export const articleWorkspace = (articleId: string) => path.join(jobsRoot, articleId);
export const biasWorkspace = (biasId: string) => path.join(jobsRoot, "bias-prompts", biasId);
