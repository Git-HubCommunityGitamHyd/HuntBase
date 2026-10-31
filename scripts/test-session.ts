import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { encodeSession, decodeSession } from "../src/lib/auth/session";

const user = {
  id: "b0000000-0000-0000-0000-000000000001",
  username: "admin",
  role: "super_admin" as const,
  organization_id: "a0000000-0000-0000-0000-000000000001"
};

const token = encodeSession(user);
console.log("Token length:", token.length);
const decoded = decodeSession(token);
console.log("Decoded:", decoded);
