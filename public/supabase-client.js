import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  SITE,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./config.js";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function siteBase() {
  if (window.location.pathname.startsWith(SITE.repositoryBase)) {
    return SITE.repositoryBase;
  }
  return "/";
}

export function siteUrl(path = "") {
  const clean = String(path).replace(/^\/+/, "");
  return `${window.location.origin}${siteBase()}${clean}`;
}

export function pageUrl(path = "") {
  const clean = String(path).replace(/^\/+/, "");
  return `${siteBase()}${clean}`;
}

export function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return pageUrl(String(value).replace(/^\/+/, ""));
}

export function publicMediaUrl(path) {
  if (!path) return "";
  const { data } = supabase.storage.from("public-media").getPublicUrl(path);
  return data.publicUrl;
}

export function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function mapIntro(row) {
  if (!row) return {};
  return {
    title: row.title,
    background: row.background,
    statement: row.statement ?? [],
    actionPlan: row.action_plan ?? [],
    groupImage: assetUrl(row.group_image),
    logoImage: assetUrl(row.logo_image),
    source: row.source,
  };
}

export function mapFounder(row) {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    role: row.role,
    bio: row.bio,
    imageUrl: assetUrl(row.image_url),
  };
}

export function mapResearch(row) {
  return {
    id: row.id,
    title: row.title,
    journal: row.journal,
    impactFactor: row.impact_factor,
    quartile: row.quartile,
    authorsTeam: row.authors_team,
    imageUrl: row.image_url?.startsWith("public-media/")
      ? publicMediaUrl(row.image_url.replace(/^public-media\//, ""))
      : assetUrl(row.image_url),
    doiUrl: row.doi_url,
    summary: row.summary,
    createdAt: row.published_at ?? row.created_at,
  };
}

export function mapQuestionnaire(row) {
  const resolveMedia = (value) =>
    value?.startsWith("public-media/")
      ? publicMediaUrl(value.replace(/^public-media\//, ""))
      : assetUrl(value);
  return {
    id: row.id,
    title: row.title,
    researchName: row.research_name,
    audience: row.audience,
    introText: row.intro_text,
    introImageUrl: resolveMedia(row.intro_image_url),
    isPaid: row.is_paid ? "Yes" : "No",
    estimatedTime: row.estimated_time,
    qrUrl: resolveMedia(row.qr_url),
    linkUrl: row.link_url,
    contactInfo: row.contact_info,
    imageUrl: resolveMedia(row.image_url),
    highlightUrl: resolveMedia(row.highlight_url),
    helpUs: row.help_us,
    createdAt: row.published_at ?? row.created_at,
  };
}

export async function currentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function requireAdmin() {
  const session = await currentSession();
  if (!session) return false;
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

