import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const categories = [
  { name: "Groceries", color: "#2d8a78" },
  { name: "Dining", color: "#db744d" },
  { name: "Coffee", color: "#b8894b" },
  { name: "Transportation", color: "#4d7db8" },
  { name: "Entertainment", color: "#8a62b7" },
  { name: "Housing", color: "#53636b" },
  { name: "Utilities", color: "#cf8d31" },
  { name: "Subscriptions", color: "#3d8f9d" },
  { name: "Health", color: "#4d9b76" },
  { name: "Shopping", color: "#bc5a72" },
  { name: "Income", color: "#2d8a78" },
  { name: "Other", color: "#87938f" },
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
