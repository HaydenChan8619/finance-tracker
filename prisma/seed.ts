import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const categories = [
  { name: "Food", color: "#f59e0b" },
  { name: "Entertainment", color: "#8b5cf6" },
  { name: "Driving", color: "#3b82f6" },
  { name: "Personal", color: "#ec4899" },
  { name: "Education", color: "#06b6d4" },
  { name: "Housing", color: "#e11d48" },
  { name: "Transport", color: "#6366f1" },
  { name: "Income", color: "#10b981" },
  { name: "Misc", color: "#64748b" },
];

const personalCare = await prisma.category.findUnique({ where: { name: "Personal Care" } });
if (personalCare) {
  const personalExists = await prisma.category.findUnique({ where: { name: "Personal" } });
  if (!personalExists) {
    await prisma.category.update({
      where: { id: personalCare.id },
      data: { name: "Personal", color: "#3d8f9d" },
    });
  }
}

for (const category of categories) {
  await prisma.category.upsert({
    where: { name: category.name },
    create: category,
    update: { color: category.color },
  });
}

const allowedNames = categories.map((c) => c.name);
await prisma.category.deleteMany({
  where: {
    name: { notIn: allowedNames },
    transactions: { none: {} },
    imports: { none: {} },
  },
});

const email = process.env.ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
const configuredHash = process.env.ADMIN_PASSWORD_HASH?.trim();
const configuredPassword = process.env.ADMIN_PASSWORD;
if (email && (configuredHash || configuredPassword)) {
  const passwordHash = configuredHash || (await bcrypt.hash(configuredPassword as string, 12));
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash },
    update: { passwordHash },
  });
}

console.log(`Seeded ${categories.length} categories${email ? ` and ${email}` : ""}.`);
await prisma.$disconnect();
