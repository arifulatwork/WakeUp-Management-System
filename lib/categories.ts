import { db } from "@/lib/db";

// Food categories live in their own database table ("Category"). A product points to its category by name.
export const GENERAL = "General"; // the built-in fallback: always exists, cannot be renamed or removed

export async function categoryExists(name: string): Promise<boolean> {
  return (await db.category.count({ where: { name } })) > 0;
}
