import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { nanoid } from "nanoid";
import { dataRoot, databaseFile } from "./paths.js";
import type { Database, NewsArticle } from "./types.js";

let writeChain = Promise.resolve();

async function ensureDatabase() {
  await mkdir(dataRoot, { recursive: true });
  try { await readFile(databaseFile, "utf8"); }
  catch { await writeFile(databaseFile, JSON.stringify({ articles: [], biases: [] }, null, 2), "utf8"); }
}

export async function readDatabase(): Promise<Database> {
  await ensureDatabase();
  const stored=JSON.parse(await readFile(databaseFile, "utf8")) as Partial<Database>;
  return {articles:stored.articles??[],biases:stored.biases??[]};
}

export function updateDatabase<T>(mutate: (database: Database) => T | Promise<T>): Promise<T> {
  const operation = writeChain.then(async () => {
    const database = await readDatabase();
    const result = await mutate(database);
    const temp = `${databaseFile}.${nanoid(6)}.tmp`;
    await writeFile(temp, JSON.stringify(database, null, 2), "utf8");
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temp, databaseFile); break; }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (!["EBUSY", "EPERM", "EACCES"].includes(code) || attempt >= 9) throw error;
        await delay(50 * (attempt + 1));
      }
    }
    return result;
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function findArticle(id: string) {
  return (await readDatabase()).articles.find((article) => article.id === id);
}

export function saveArticle(article: NewsArticle) {
  return updateDatabase((database) => {
    const index = database.articles.findIndex((item) => item.id === article.id);
    if (index === -1) database.articles.push(article); else database.articles[index] = article;
    return structuredClone(article);
  });
}
