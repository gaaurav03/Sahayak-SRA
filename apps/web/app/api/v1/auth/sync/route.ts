import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const VALID_ROLES = ["coordinator", "volunteer", "reporter"] as const;
type Role = (typeof VALID_ROLES)[number];

export async function POST(request: Request) {
  try {
    // auth() reads the session directly — no token forwarding needed
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const role = body.role as Role;

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const client = await clerkClient();

    // 1. Update Clerk public metadata with the role
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });

    // 2. Optionally sync to Supabase — fire and forget, non-fatal
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const clerkUser = await client.users.getUser(userId);

      await supabase.from("users").upsert(
        {
          clerk_id: userId,
          full_name:
            `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
            "Unknown",
          email: clerkUser.emailAddresses[0]?.emailAddress,
          role,
        },
        { onConflict: "clerk_id" }
      );
    } catch (dbErr) {
      console.warn("[auth/sync] Supabase sync failed (non-fatal):", dbErr);
    }

    return NextResponse.json({ ok: true, role });
  } catch (error) {
    console.error("[auth/sync] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
