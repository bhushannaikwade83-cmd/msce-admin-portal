const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Action = "create" | "update" | "delete";

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mergeFullName(
  full: string,
  first?: string,
  middle?: string,
  last?: string,
): string {
  const parts = [first, middle, last].map((s) => (s ?? "").toString().trim()).filter((p) => p.length > 0);
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  const fromFull = full.trim();
  if (fromFull.length > 0) return fromFull;
  return joined.length > 0 ? joined : "Staff";
}

const STAFF_EMAIL_DOMAIN = "@staff.msce-attendance.app";
const PASSWORD_SUFFIX = "msceStaffV2";

function staffAuthPassword(pin: string, canonicalInstituteId: string): string {
  return `${pin.trim()}|${canonicalInstituteId.trim()}|${PASSWORD_SUFFIX}`;
}

async function assertPortalCaller(
  adminClient: ReturnType<typeof createClient>,
  callerId: string,
): Promise<void> {
  const { data: prof } = await adminClient
    .from("profiles")
    .select("role, status")
    .eq("id", callerId)
    .maybeSingle();

  const role = (prof?.role ?? "").toString().toLowerCase();
  const st = (prof?.status ?? "").toString().toLowerCase();
  if (role === "super_admin" && ["approved", "active", "pending"].includes(st)) {
    return;
  }

  const { data: coder } = await adminClient
    .from("coders")
    .select("id")
    .eq("id", callerId)
    .maybeSingle();
  if (coder?.id) return;

  throw new Error("PORTAL_FORBIDDEN");
}

async function resolveInstitute(
  adminClient: ReturnType<typeof createClient>,
  instituteKey: string,
): Promise<{ id: string; code: string; name: string; rpcKey: string }> {
  const { data: inst, error } = await adminClient
    .from("institutes")
    .select("id, name, institute_code")
    .or(`id.eq.${instituteKey},institute_code.eq.${instituteKey}`)
    .limit(1)
    .maybeSingle();

  if (error || !inst?.id) {
    throw new Error("INSTITUTE_NOT_FOUND");
  }

  const id = (inst.id as string).trim();
  const code = ((inst.institute_code ?? "") as string).trim();
  const name = ((inst.name ?? "") as string).trim();
  const rpcKey = code.length > 0 ? code : id;
  return { id, code, name, rpcKey };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { success: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, { success: false, error: "Server misconfigured" });
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return jsonResponse(401, { success: false, error: "Unauthorized" });
    }

    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse(401, { success: false, error: "Invalid session" });
    }

    const callerId = userData.user.id;

    try {
      await assertPortalCaller(adminClient, callerId);
    } catch {
      return jsonResponse(403, {
        success: false,
        error: "Only MSCE portal super admins can manage instructors here.",
      });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse(400, { success: false, error: "Invalid JSON body" });
    }

    const action = (body.action ?? "").toString().trim().toLowerCase() as Action;
    if (!["create", "update", "delete"].includes(action)) {
      return jsonResponse(400, { success: false, error: "action must be create, update, or delete" });
    }

    if (action === "delete") {
      const profileId = (body.profileId ?? body.profile_id ?? "").toString().trim();
      if (!profileId) {
        return jsonResponse(400, { success: false, error: "profileId is required" });
      }

      const { data: row, error: rowErr } = await adminClient
        .from("profiles")
        .select("id, role, email")
        .eq("id", profileId)
        .maybeSingle();

      if (rowErr || !row?.id) {
        return jsonResponse(404, { success: false, error: "Instructor not found" });
      }
      if ((row.role ?? "").toString() !== "attendance_user") {
        return jsonResponse(400, { success: false, error: "Profile is not an institute instructor" });
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(profileId);
      if (delErr) {
        return jsonResponse(500, { success: false, error: delErr.message });
      }

      return jsonResponse(200, { success: true, message: "Instructor removed" });
    }

    if (action === "update") {
      const profileId = (body.profileId ?? body.profile_id ?? "").toString().trim();
      if (!profileId) {
        return jsonResponse(400, { success: false, error: "profileId is required" });
      }

      const { data: row, error: rowErr } = await adminClient
        .from("profiles")
        .select("id, role, institute_id, name, phone_number, email")
        .eq("id", profileId)
        .maybeSingle();

      if (rowErr || !row?.id) {
        return jsonResponse(404, { success: false, error: "Instructor not found" });
      }
      if ((row.role ?? "").toString() !== "attendance_user") {
        return jsonResponse(400, { success: false, error: "Profile is not an institute instructor" });
      }

      const instituteKey = (row.institute_id ?? "").toString().trim();
      const inst = await resolveInstitute(adminClient, instituteKey);

      const first = (body.firstName ?? body.first_name ?? "").toString().trim();
      const middle = (body.middleName ?? body.middle_name ?? "").toString().trim();
      const last = (body.lastName ?? body.last_name ?? "").toString().trim();
      const fullNameRaw = (body.fullName ?? body.full_name ?? row.name ?? "").toString();
      const fullName = mergeFullName(fullNameRaw, first, middle, last);

      if (fullName.length < 2 || fullName.length > 200) {
        return jsonResponse(400, { success: false, error: "Invalid full name length" });
      }

      const mobileRaw = (body.mobile ?? body.phone ?? body.phone_number ?? row.phone_number ?? "")
        .toString();
      const mobileDigits = mobileRaw.replace(/\D/g, "");
      if (mobileDigits.length < 10 || mobileDigits.length > 15) {
        return jsonResponse(400, {
          success: false,
          error: "Enter a valid mobile number (10–15 digits).",
        });
      }

      const pin = (body.pin ?? "").toString().trim();
      const patch: Record<string, unknown> = {
        name: fullName,
        phone_number: mobileDigits,
      };

      if (pin.length > 0) {
        if (!/^\d{4}$/.test(pin)) {
          return jsonResponse(400, { success: false, error: "PIN must be 4 digits" });
        }
        const pinHash = await sha256Hex(pin);
        const { data: pinTaken } = await adminClient.rpc("institute_instructor_pin_taken", {
          p_institute_key: inst.rpcKey,
          p_pin_hash: pinHash,
          p_exclude_profile_id: profileId,
        });
        if (pinTaken === true) {
          return jsonResponse(409, {
            success: false,
            error: "This PIN is already in use at this institute. Choose a different PIN.",
          });
        }
        patch.pin_hash = pinHash;
        patch.has_pin = true;
        patch.pin_set_at = new Date().toISOString();

        const { error: authUpdErr } = await adminClient.auth.admin.updateUserById(profileId, {
          password: staffAuthPassword(pin, inst.id),
        });
        if (authUpdErr) {
          return jsonResponse(500, { success: false, error: authUpdErr.message });
        }
      }

      const { error: profErr } = await adminClient.from("profiles").update(patch).eq("id", profileId);
      if (profErr) {
        return jsonResponse(500, { success: false, error: profErr.message });
      }

      return jsonResponse(200, { success: true, message: "Instructor updated", profileId });
    }

    // create
    const instituteKey = (body.instituteKey ?? body.institute_id ?? "").toString().trim();
    if (!instituteKey) {
      return jsonResponse(400, { success: false, error: "instituteKey is required" });
    }

    const pin = (body.pin ?? "").toString().trim();
    const first = (body.firstName ?? body.first_name ?? "").toString().trim();
    const middle = (body.middleName ?? body.middle_name ?? "").toString().trim();
    const last = (body.lastName ?? body.last_name ?? "").toString().trim();
    const fullNameRaw = (body.fullName ?? body.full_name ?? "").toString();
    const fullName = mergeFullName(fullNameRaw, first, middle, last);

    if (!first || !middle || !last) {
      return jsonResponse(400, {
        success: false,
        error: "First name, middle name, and last name are all required.",
      });
    }

    const mobileDigits = ((body.mobile ?? body.phone ?? body.phone_number ?? "") as string)
      .replace(/\D/g, "");
    if (mobileDigits.length < 10 || mobileDigits.length > 15) {
      return jsonResponse(400, {
        success: false,
        error: "Enter a valid mobile number (10–15 digits).",
      });
    }

    if (!/^\d{4}$/.test(pin)) {
      return jsonResponse(400, { success: false, error: "PIN must be 4 digits" });
    }

    const inst = await resolveInstitute(adminClient, instituteKey);
    const pinHash = await sha256Hex(pin);

    const { data: pinTaken, error: pinTakenErr } = await adminClient.rpc(
      "institute_instructor_pin_taken",
      { p_institute_key: inst.rpcKey, p_pin_hash: pinHash },
    );
    if (pinTakenErr) {
      return jsonResponse(500, { success: false, error: "Could not verify PIN uniqueness" });
    }
    if (pinTaken === true) {
      return jsonResponse(409, {
        success: false,
        error: "This PIN is already in use at this institute. Choose a different PIN.",
      });
    }

    const { data: countData, error: cntErr } = await adminClient.rpc("count_institute_instructors", {
      p_institute_key: inst.rpcKey,
    });
    if (cntErr) {
      return jsonResponse(500, { success: false, error: "Could not verify instructor count" });
    }
    const maxInstructors = 4;
    const instructorCount = typeof countData === "number" ? countData : Number(countData ?? 0);
    if (instructorCount >= maxInstructors) {
      return jsonResponse(409, {
        success: false,
        error: `This institute already has ${instructorCount} instructor(s) (max ${maxInstructors}).`,
        instructorCount,
        maxInstructors,
      });
    }

    const emailLocal = `att.${inst.id}.${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const email = `${emailLocal}${STAFF_EMAIL_DOMAIN}`;
    const password = staffAuthPassword(pin, inst.id);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        institute_id: inst.id,
        institute_name: inst.name,
        app_role: "attendance_user",
        full_name: fullName,
        phone_number: mobileDigits,
      },
    });

    if (createErr || !created?.user?.id) {
      return jsonResponse(400, {
        success: false,
        error: createErr?.message ?? "Could not create instructor login",
      });
    }

    const newId = created.user.id;
    const pinSetAt = new Date().toISOString();

    const { error: profileErr } = await adminClient.from("profiles").upsert(
      {
        id: newId,
        email,
        name: fullName,
        role: "attendance_user",
        institute_id: inst.id,
        institute_name: inst.name,
        phone_number: mobileDigits,
        pin_hash: pinHash,
        pin_set_at: pinSetAt,
        has_pin: true,
        status: "active",
      },
      { onConflict: "id" },
    );

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(newId);
      return jsonResponse(500, {
        success: false,
        error: "Profile sync failed; instructor was not created",
      });
    }

    return jsonResponse(200, {
      success: true,
      message: "Instructor created",
      userId: newId,
      email,
      fullName,
      instructorCount: instructorCount + 1,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "INSTITUTE_NOT_FOUND") {
      return jsonResponse(400, { success: false, error: "Institute not found for that ID" });
    }
    return jsonResponse(500, { success: false, error: msg });
  }
});
