import { NextResponse } from "next/server";
import realProperties from "@/lib/realProperties.json";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    count: realProperties.length,
    properties: realProperties,
  });
}
