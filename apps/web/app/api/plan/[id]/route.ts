import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await adminClient
    .from("deployments")
    .select("id, modules, config, plan_summary, status, action")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("action", "plan")
    .single();

  if (!data) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  return NextResponse.json(data);
}
