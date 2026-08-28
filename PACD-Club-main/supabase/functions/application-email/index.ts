import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://pacdresearchclub.com",
  "https://www.pacdresearchclub.com",
  "https://hannahlee0303.github.io",
  "http://localhost:3000",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://pacdresearchclub.com",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
    },
  });
}

async function sendEmail(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom =
    Deno.env.get("EMAIL_FROM") ||
    "PACD Research Club <apply@pacdresearchclub.com>";
  const adminEmail =
    Deno.env.get("ADMIN_EMAIL") || "hannahlee03@163.com";

  if (!resendApiKey) {
    return json(
      request,
      { error: "Transactional email is not configured." },
      503,
    );
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return json(request, { error: "Authentication required." }, 401);
  }

  const scoped = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { action, applicationId } = await request.json();
  if (!["submitted", "status"].includes(action) || !applicationId) {
    return json(request, { error: "Invalid request." }, 400);
  }

  const { data: visibleApplication, error: visibilityError } = await scoped
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  if (visibilityError || !visibleApplication) {
    return json(request, { error: "Application not accessible." }, 403);
  }

  if (action === "status") {
    const { data: isAdmin } = await scoped.rpc("is_admin");
    if (!isAdmin) {
      return json(request, { error: "Administrator access required." }, 403);
    }
  }

  const { data: application, error } = await admin
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single();
  if (error) {
    return json(request, { error: error.message }, 500);
  }

  const safeName = String(application.name).replace(/[<>&"']/g, "");
  const safeInstitution = String(application.institution).replace(
    /[<>&"']/g,
    "",
  );

  try {
    if (action === "submitted") {
      await Promise.all([
        sendEmail(
          resendApiKey,
          emailFrom,
          [application.email],
          "PACD Research Club application received",
          `<p>Dear ${safeName},</p><p>We received your PACD Research Club collaboration application.</p><p><strong>Application ID:</strong> ${application.id}</p><p>You can request a secure sign-in link at <a href="https://pacdresearchclub.com/my-application.html">My application</a>.</p>`,
        ),
        sendEmail(
          resendApiKey,
          emailFrom,
          [adminEmail],
          `New PACD collaboration application — ${safeName}`,
          `<p>A new collaboration application was submitted.</p><p><strong>Applicant:</strong> ${safeName}<br><strong>Institution:</strong> ${safeInstitution}<br><strong>ID:</strong> ${application.id}</p><p><a href="https://pacdresearchclub.com/admin.html">Open the administrator console</a></p>`,
        ),
      ]);
    } else {
      const status = String(application.status).replace("_", " ");
      const note = application.reviewer_notes
        ? `<p><strong>Reviewer note:</strong> ${String(
            application.reviewer_notes,
          ).replace(/[<>&"']/g, "")}</p>`
        : "";
      await sendEmail(
        resendApiKey,
        emailFrom,
        [application.email],
        `PACD Research Club application update — ${status}`,
        `<p>Dear ${safeName},</p><p>Your PACD Research Club collaboration application status is now <strong>${status}</strong>.</p>${note}<p><a href="https://pacdresearchclub.com/my-application.html">View your application</a></p>`,
      );
    }
  } catch (emailError) {
    return json(request, { error: emailError.message }, 502);
  }

  return json(request, { ok: true });
});

