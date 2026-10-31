import { NextRequest } from "next/server";
import { handleScan } from "./handler";

export async function POST(request: NextRequest) {
  return handleScan(request);
}
