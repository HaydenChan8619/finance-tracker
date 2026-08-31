import bcrypt from "bcryptjs";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.from(chunk));
}

const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");
if (!password) {
  throw new Error("Pipe a password to this command.");
}

console.log(await bcrypt.hash(password, 12));
