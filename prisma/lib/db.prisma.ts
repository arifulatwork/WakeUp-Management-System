import { PrismaClient } from "@prisma/client";
import { notifyChange } from "./events";

const WRITES = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// Real PostgreSQL (Supabase or your own server).
//
// SAFETY NET: password hashes must never reach a browser. The routes strip them
// when they read a worker directly, but `include: { assignedWorker: true }` on a
// task / ticket / request would carry the hash along with the worker. (The demo
// database already removes it; this does the same for Postgres.) So every result
// that is NOT a Worker query is scrubbed of `passwordHash`, however deeply nested.

function strip(v: any): any {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) if (k !== "passwordHash") out[k] = strip(x);
    return out;
  }
  return v; // Date, number, string, null …
}

function build() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends(({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: any; query: (a: any) => Promise<any> }) {
          const result = await query(args);
          if (WRITES.has(operation)) notifyChange(lowerFirst(model)); // live screens reload
          return model === "Worker" ? result : strip(result);
        },
      },
    },
  } as any));
}

// One client only, even with Next.js hot reloads in development.
const g = global as unknown as { __prisma?: ReturnType<typeof build> };
export const db = g.__prisma ?? build();
if (process.env.NODE_ENV !== "production") g.__prisma = db;
