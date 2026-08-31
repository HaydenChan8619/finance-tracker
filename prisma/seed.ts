import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const categories = [
  { name: "Food", color: "#2d8a78" },
  { name: "Entertainment", color: "#8a62b7" },
  { name: "Clothing", color: "#bc5a72" },
  { name: "Personal Care", color: "#3d8f9d" },
  { name: "Driving", color: "#4d7db8" },
  { name: "Misc", color: "#87938f" },
  { name: "Income", color: "#2a6f68" },
];

for (const category of categories) {
  await prisma.category.upsert({
    where: { name: category.name },
    create: category,
    update: { color: category.color },
  });
}

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
