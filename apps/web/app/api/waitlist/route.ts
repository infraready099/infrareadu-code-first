import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(url, serviceKey);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!name || !email || !email.includes("@")) {
      return NextResponse.json({ error: "Name and valid email are required." }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase
      .from("waitlist")
      .insert({ name, email, source: "landing" });

    if (error) {
      // Unique violation — email already exists, treat as success
      if (error.code === "23505") {
        console.log(`[waitlist] duplicate email ignored: ${email}`);
        return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
      }
      console.error("[waitlist] insert error:", error);
      return NextResponse.json({ error: "Database error." }, { status: 500 });
    }

    console.log(`[waitlist] new signup: name="${name}" email="${email}"`);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[waitlist] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
