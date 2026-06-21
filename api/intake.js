import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const fallbackSupabaseUrl = "https://hljygplhebcafhynpnlr.supabase.co";
const fallbackSupabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsanlncGxoZWJjYWZoeW5wbmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjU3MDksImV4cCI6MjA5NjEwMTcwOX0.iP2f8j-odh5Jsa3-UmvuhaVBNrb-ju5UTwsisRlF2oI";

const nullableText = z.string().nullable();
const actionPayloadSchema = z.object({
  team_name: nullableText,
  club_name: nullableText,
  event_age: nullableText,
  gender: nullableText,
  state: nullableText,
  division: nullableText,
  preferred_level: nullableText,
  coach_name: nullableText,
  coach_email: nullableText,
  coach_phone: nullableText,
  payment_status: nullableText,
  amount: z.number().nullable(),
  date: nullableText,
  description: nullableText,
  category: nullableText,
  contact_name: nullableText,
  role: nullableText,
  email: nullableText,
  phone: nullableText,
  operation_title: nullableText,
  operation_category: nullableText,
  operation_status: nullableText,
  assigned_to: nullableText,
  label: nullableText,
  url: nullableText,
  notes: nullableText,
});

const intakeResultSchema = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(100),
  clarification_needed: z.boolean(),
  clarification_question: nullableText,
  actions: z.array(z.object({
    action_type: z.enum(["registration", "expense", "contact", "operation", "link"]),
    title: z.string(),
    payload: actionPayloadSchema,
  })).max(12),
});

const systemPrompt = `You convert tournament operations messages and receipt images into proposed database actions.

Rules:
- Never invent names, amounts, dates, contact details, URLs, payment status, or tournament facts.
- Use null for every missing field.
- Return one action for each distinct fact the user wants recorded.
- registration: a team registration or team/payment record.
- expense: an expense, invoice, receipt, reimbursement, or cost. Amount must be positive.
- contact: a person who should be saved independently.
- operation: a task, follow-up, logistical item, or assignment.
- link: a useful tournament URL.
- Normalize dates to YYYY-MM-DD only when the date is clear.
- Normalize payment_status to PAID, PARTIAL, UNPAID, REFUNDED, or null.
- For contacts, prefer roles: referee, vendor, investor, field_manager, logistics, staff, sponsor, other.
- For operations, prefer categories: logistics, field, referee, vendor, sponsor, media, security, other.
- For operations, prefer statuses: pending, in_progress, done.
- If a critical fact is ambiguous, set clarification_needed to true and ask one concise question.
- The output is only a proposal. A human will review it before anything is saved.`;

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function validImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .slice(0, 2)
    .filter((image) => typeof image?.dataUrl === "string" && image.dataUrl.startsWith("data:image/"))
    .map((image) => ({
      name: String(image.name || "attachment"),
      dataUrl: image.dataUrl,
    }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required." });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fallbackSupabaseUrl;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || fallbackSupabaseAnonKey;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return res.status(401).json({ error: "Your session is no longer valid." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not configured in Vercel." });
  }

  const message = String(req.body?.message || "").trim();
  const images = validImages(req.body?.images);
  const tournament = req.body?.tournament || {};

  if (!message && images.length === 0) {
    return res.status(400).json({ error: "Add a message or an image to analyze." });
  }

  const userContent = [
    {
      type: "input_text",
      text: [
        `Selected tournament: ${tournament.name || "Not selected"}`,
        `Tournament dates: ${tournament.start_date || "unknown"} to ${tournament.end_date || "unknown"}`,
        `User message: ${message || "Interpret the attached image."}`,
      ].join("\n"),
    },
    ...images.map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: "high",
    })),
  ];

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      text: {
        format: zodTextFormat(intakeResultSchema, "wayne_ops_intake"),
      },
    });

    if (!response.output_parsed) {
      return res.status(422).json({ error: "The assistant could not prepare a reviewable result." });
    }

    return res.status(200).json(response.output_parsed);
  } catch (error) {
    console.error("AI intake failed", error);
    return res.status(500).json({
      error: error?.message || "The assistant could not analyze this intake.",
    });
  }
}
