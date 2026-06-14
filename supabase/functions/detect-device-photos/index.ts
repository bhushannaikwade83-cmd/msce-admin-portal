import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StudentRow = Record<string, unknown> & {
  id: string;
  institute_id?: string | null;
};

type Detection = {
  student_id: string;
  photo_kind: "current" | "original";
  suspected: boolean;
  confidence: "high" | "medium" | "low";
  score: number;
  reason: string;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function pick(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = str(row[key]);
    if (value) return value;
  }
  return null;
}

function nameOf(row: Record<string, unknown>): string {
  return pick(row, "name", "student_name", "full_name") ?? String(row.id ?? "");
}

function currentPhoto(row: Record<string, unknown>): string | null {
  return pick(row, "face_photo_url", "photo_url", "student_photo_url", "registration_photo_path");
}

function originalPhoto(row: Record<string, unknown>): string | null {
  return pick(row, "original_face_photo_url", "original_registration_photo_path");
}

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function b2ObjectPathFromUrl(url: string): string | null {
  if (!/backblazeb2\.com/i.test(url)) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/file\/[^/]+\/(.+)/);
    if (!match) return null;
    return decodeURIComponent(match[1].replace(/\+/g, " "));
  } catch {
    return null;
  }
}

async function b2SignedUrl(objectPath: string): Promise<string | null> {
  const keyId = Deno.env.get("B2B_KEY_ID") ?? Deno.env.get("B2_KEY_ID") ?? "";
  const appKey = Deno.env.get("B2B_APPLICATION_KEY") ?? Deno.env.get("B2_APPLICATION_KEY") ?? "";
  const bucketId = Deno.env.get("B2B_BUCKET_ID") ?? Deno.env.get("B2_BUCKET_ID") ?? "";
  const bucketName = Deno.env.get("B2B_BUCKET_NAME") ?? Deno.env.get("B2_BUCKET_NAME") ?? "";
  if (!keyId || !appKey || !bucketId || !bucketName) return null;

  const basic = btoa(`${keyId}:${appKey}`);
  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!authRes.ok) return null;
  const auth = await authRes.json() as {
    authorizationToken?: string;
    apiUrl?: string;
    downloadUrl?: string;
  };
  if (!auth.authorizationToken || !auth.apiUrl || !auth.downloadUrl) return null;

  const durRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: "POST",
    headers: {
      Authorization: auth.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix: objectPath,
      validDurationInSeconds: 900,
    }),
  });
  if (!durRes.ok) return null;
  const dur = await durRes.json() as { authorizationToken?: string };
  if (!dur.authorizationToken) return null;

  const enc = encodeURIComponent(objectPath);
  return `${auth.downloadUrl}/file/${bucketName}/${enc}?Authorization=${dur.authorizationToken}`;
}

async function signedStorageUrl(adminClient: ReturnType<typeof createClient>, path: string): Promise<string | null> {
  const bucket = Deno.env.get("SUPABASE_STORAGE_BUCKET") ?? Deno.env.get("STORAGE_BUCKET") ?? "";
  if (!bucket) return null;
  const clean = path.trim().replace(/^\/+/, "");
  if (!clean) return null;
  const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(clean, 900);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolvePhotoUrl(
  adminClient: ReturnType<typeof createClient>,
  value: string | null,
): Promise<string | null> {
  if (!value) return null;
  if (looksLikeHttpUrl(value)) {
    const b2Path = b2ObjectPathFromUrl(value);
    if (b2Path) return await b2SignedUrl(b2Path) ?? value;
    return value;
  }
  return await b2SignedUrl(value) ?? signedStorageUrl(adminClient, value);
}

async function assertPortalCaller(adminClient: ReturnType<typeof createClient>, jwt: string) {
  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
  if (userErr || !userData?.user) throw new Error("UNAUTHORIZED");

  const callerId = userData.user.id;
  const { data: prof } = await adminClient
    .from("profiles")
    .select("role, status")
    .eq("id", callerId)
    .maybeSingle();

  const role = (prof?.role ?? "").toString().toLowerCase();
  const status = (prof?.status ?? "").toString().toLowerCase();
  if (role === "super_admin" && ["approved", "active", "pending"].includes(status)) return;

  const { data: coder } = await adminClient.from("coders").select("id").eq("id", callerId).maybeSingle();
  if (coder?.id) return;

  const { data: districtViewer } = await adminClient
    .from("portal_district_viewers")
    .select("user_id")
    .eq("user_id", callerId)
    .maybeSingle();
  if (districtViewer?.user_id) return;

  throw new Error("FORBIDDEN");
}

function parseDetectionJson(raw: string, studentId: string, photoKind: "current" | "original"): Detection {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const scoreRaw = Number(parsed.score ?? 0);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(1, scoreRaw)) : 0;
    const confidenceRaw = String(parsed.confidence ?? "").toLowerCase();
    const confidence = confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : score >= 0.75
        ? "high"
        : score >= 0.45
          ? "medium"
          : "low";
    return {
      student_id: studentId,
      photo_kind: photoKind,
      suspected: parsed.suspected === true || score >= 0.45,
      confidence,
      score,
      reason: str(parsed.reason) ?? "Vision model did not provide a reason.",
    };
  } catch {
    return {
      student_id: studentId,
      photo_kind: photoKind,
      suspected: false,
      confidence: "low",
      score: 0,
      reason: "Could not parse vision model response.",
    };
  }
}

async function detectDeviceInPhoto(
  imageUrl: string,
  studentId: string,
  photoKind: "current" | "original",
): Promise<Detection> {
  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) {
    return {
      student_id: studentId,
      photo_kind: photoKind,
      suspected: false,
      confidence: "low",
      score: 0,
      reason: "OPENAI_API_KEY is not configured for this Supabase function.",
    };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("DEVICE_PHOTO_MODEL") ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Inspect this student registration photo. Detect if the student's face/photo appears to be photographed from another phone, laptop, monitor, tablet, or computer screen, or if a device/screen border is clearly visible. Return JSON only: {\"suspected\": boolean, \"confidence\": \"high|medium|low\", \"score\": number 0..1, \"reason\": string}. Be conservative: high only when a device/screen is clearly visible.",
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 180,
    }),
  });

  if (!response.ok) {
    return {
      student_id: studentId,
      photo_kind: photoKind,
      suspected: false,
      confidence: "low",
      score: 0,
      reason: `Vision request failed: ${response.status}`,
    };
  }

  const data = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = str(message?.content) ?? "{}";
  return parseDetectionJson(content, studentId, photoKind);
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
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse(401, { success: false, error: "Unauthorized" });
    await assertPortalCaller(adminClient, jwt);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const instituteId = str(body?.instituteId ?? body?.institute_id);
    const limitRaw = Number(body?.limit ?? 60);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 60;
    const includeOriginal = body?.includeOriginal !== false;
    const onlySuspected = body?.onlySuspected !== false;

    if (!instituteId) {
      return jsonResponse(400, { success: false, error: "instituteId is required" });
    }

    const { data: institute, error: instErr } = await adminClient
      .from("institutes")
      .select("id, name, institute_code, city, state")
      .eq("id", instituteId)
      .maybeSingle();
    if (instErr || !institute?.id) {
      return jsonResponse(404, { success: false, error: "Institute not found" });
    }

    const { data: studentsRaw, error: studentsErr } = await adminClient
      .from("students")
      .select("*")
      .eq("institute_id", instituteId)
      .order("id", { ascending: true })
      .limit(limit);
    if (studentsErr) {
      return jsonResponse(500, { success: false, error: studentsErr.message });
    }

    const students = (studentsRaw ?? []) as StudentRow[];
    const detections: Array<Detection & { student: Record<string, unknown> }> = [];
    const skipped: Array<{ student_id: string; reason: string }> = [];

    for (const student of students) {
      const photoJobs: Array<{ kind: "current" | "original"; raw: string | null }> = [
        { kind: "current", raw: currentPhoto(student) },
      ];
      if (includeOriginal) photoJobs.push({ kind: "original", raw: originalPhoto(student) });

      for (const job of photoJobs) {
        const imageUrl = await resolvePhotoUrl(adminClient, job.raw);
        if (!imageUrl) {
          if (job.kind === "current") skipped.push({ student_id: student.id, reason: "No accessible current photo URL/path" });
          continue;
        }
        const detection = await detectDeviceInPhoto(imageUrl, student.id, job.kind);
        if (!onlySuspected || detection.suspected) {
          detections.push({
            ...detection,
            student: {
              id: student.id,
              name: nameOf(student),
              roll_no: pick(student, "sr_no", "user_id", "roll_no", "roll_number", "rollno"),
              class_name: pick(student, "class_name", "class", "grade", "standard", "std"),
              face_photo_url: pick(student, "face_photo_url", "photo_url", "student_photo_url"),
              registration_photo_path: pick(student, "registration_photo_path"),
              original_face_photo_url: pick(student, "original_face_photo_url"),
              original_registration_photo_path: pick(student, "original_registration_photo_path"),
              face_photo_changed_once: student.face_photo_changed_once === true,
            },
          });
        }
      }
    }

    return jsonResponse(200, {
      success: true,
      institute,
      scanned: students.length,
      detections,
      skipped,
      model: Deno.env.get("DEVICE_PHOTO_MODEL") ?? "gpt-4o-mini",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "UNAUTHORIZED") return jsonResponse(401, { success: false, error: "Unauthorized" });
    if (message === "FORBIDDEN") return jsonResponse(403, { success: false, error: "Forbidden" });
    return jsonResponse(500, { success: false, error: message });
  }
});
