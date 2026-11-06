import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { nameKey } from "../lib/houseMode";

const db = new PrismaClient();

// Password for ALL test logins (cristina, pedro, giuseppe, maria, joao, ivan).
// Set SEED_PASSWORD in .env to use your own; otherwise it is "changeme123".
const SEED_PASSWORD = process.env.SEED_PASSWORD || "changeme123";

async function main() {
  // Safety: never pile test data on top of a database that already has people in it.
  if ((await db.worker.count()) > 0 && process.env.SEED_FORCE !== "true") {
    console.log("Database already has staff — nothing seeded. (Set SEED_FORCE=true to seed anyway.)");
    return;
  }
  console.log("Seeding test data…");

  // --- Houses ---
  const villa1 = await db.house.create({
    data: { name: "Villa 1 — Room C", nameKey: nameKey("Villa 1 — Room C"), address: "Rua das Flores 12, Faro" },
  });
  const villa3 = await db.house.create({
    data: { name: "Villa 3 — Room A", nameKey: nameKey("Villa 3 — Room A"), address: "Rua do Mar 45, Faro" },
  });
  const villa5 = await db.house.create({
    data: { name: "Villa 5 — Room B", nameKey: nameKey("Villa 5 — Room B"), address: "Av. da Republica 8, Faro" },
  });
  // A temporary Airbnb listing — has a validity window
  const airbnb1 = await db.house.create({
    data: {
      name: "Airbnb — Beco do Sol 3",
      nameKey: nameKey("Airbnb — Beco do Sol 3"),
      address: "Beco do Sol 3, Faro",
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // +14 days
    },
  });

  // --- Workers — one of each role, so every page has someone to log in as ---
  const maria = await db.worker.create({
    data: { name: "Maria Costa", language: "pt", area: "CLEANING", role: "worker", username: "maria", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10) },
  });
  const joao = await db.worker.create({
    data: { name: "João Silva", language: "pt", area: "CLEANING", role: "worker", username: "joao", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10) },
  });
  const ivan = await db.worker.create({
    data: { name: "Ivan Melnyk", language: "uk", area: "MAINTENANCE", role: "worker", username: "ivan", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10) },
  });
  // Everyone has a real login now (cleaners and maintenance included).
  // CHANGE THESE PASSWORDS after first login; they're here only so
  // there's something to log in with on day one.
  const cristina = await db.worker.create({
    data: {
      name: "Cristina Alves", language: "pt", area: "CLEANING", role: "manager",
      username: "cristina", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10),
    },
  });
  const giuseppe = await db.worker.create({
    data: {
      name: "Giuseppe Romano", language: "it", area: "CLEANING", role: "admin",
      username: "giuseppe", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10),
    },
  });
  const pedro = await db.worker.create({
    data: {
      name: "Pedro Fonseca", language: "pt", area: "CLEANING", role: "coordinator",
      username: "pedro", passwordHash: await bcrypt.hash(SEED_PASSWORD, 10),
    },
  });

  // --- Cleaning tasks, spread across different statuses so the
  // manager dashboard and cleaner app both show something interesting ---
  await db.cleaningTask.create({
    data: {
      houseId: villa3.id,
      scheduledDate: new Date(),
      scheduledTime: "10:00",
      cleaningTypes: ["CHECKOUT"],
      assignedWorkerId: maria.id,
      priority: "RED",
      status: "IN_PROGRESS",
      startedAt: new Date(),
      checklistData: {
        checklist: [
          { label: "Linen & bed sheets changed", done: true },
          { label: "Bathroom & toilet disinfected", done: true },
          { label: "Kitchen & appliances cleaned", done: false },
          { label: "Trash emptied", done: false },
        ],
        photos: [],
      },
    },
  });

  await db.cleaningTask.create({
    data: {
      houseId: villa1.id,
      scheduledDate: new Date(),
      scheduledTime: "09:00",
      cleaningTypes: ["GENERAL"],
      assignedWorkerId: maria.id,
      priority: "YELLOW",
      status: "TO_BE_VERIFIED",
      startedAt: new Date(Date.now() - 1000 * 60 * 90),
      completedAt: new Date(Date.now() - 1000 * 60 * 10),
      completedByWorkerId: maria.id,
      checklistData: {
        checklist: [
          { label: "Linen & bed sheets changed", done: true },
          { label: "Bathroom & toilet disinfected", done: true },
          { label: "Kitchen & appliances cleaned", done: true },
          { label: "Trash emptied", done: true },
        ],
        photos: [],
      },
    },
  });

  await db.cleaningTask.create({
    data: {
      houseId: villa5.id,
      scheduledDate: new Date(),
      scheduledTime: "13:30",
      cleaningTypes: ["BEDSHEET_CHANGE"],
      assignedWorkerId: joao.id,
      priority: "YELLOW",
      status: "ASSIGNED",
      checklistData: {
        checklist: [
          { label: "Linen & bed sheets changed", done: false },
          { label: "Bathroom & toilet disinfected", done: false },
          { label: "Kitchen & appliances cleaned", done: false },
          { label: "Trash emptied", done: false },
        ],
        photos: [],
      },
    },
  });

  await db.cleaningTask.create({
    data: {
      houseId: airbnb1.id,
      scheduledDate: new Date(),
      scheduledTime: "11:15",
      cleaningTypes: ["DEEP_CLEAN", "OUTDOOR"],
      priority: "ORANGE",
      status: "WITH_ISSUE",
      checklistData: { checklist: [], photos: [] },
      notes: "Guest reported a broken chair on the balcony",
    },
  });

  console.log("Done.\n");
  console.log("Sign in at /login — everyone uses the password from SEED_PASSWORD in .env:");
  console.log({
    "giuseppe": "Super Admin",
    "cristina": "Manager",
    "pedro": "Coordinator",
    "maria": "Cleaner",
    "joao": "Cleaner",
    "ivan": "Maintenance",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
