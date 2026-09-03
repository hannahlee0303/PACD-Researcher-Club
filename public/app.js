import {
  assetUrl,
  escapeHtml,
  mapQuestionnaire,
  mapResearch,
  pageUrl,
  siteUrl,
  supabase,
} from "./supabase-client.js";

function byId(id) {
  return document.getElementById(id);
}

function itemPageLink(type, item) {
  return pageUrl(
    `item.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`,
  );
}

function renderFeaturedCard(node, item, type) {
  if (!node) return;

  if (!item) {
    node.removeAttribute("href");
    node.innerHTML =
      '<div class="featured-title">Updates will appear here after editorial review.</div>';
    return;
  }

  const link =
    type === "questionnaires" && item.linkUrl
      ? item.linkUrl
      : item.doiUrl || itemPageLink(type, item);
  const external = /^https?:\/\//i.test(link);
  node.href = link;
  node.target = external ? "_blank" : "_self";
  node.rel = external ? "noreferrer noopener" : "";

  const extraLabel =
    type === "questionnaires"
      ? `<span class="chip">${escapeHtml(item.estimatedTime || "")}</span>`
      : "";
  const image = item.imageUrl || assetUrl("assets/home-1-logo.jpg");
  node.innerHTML = `
    <img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" />
    <div class="featured-title">
      <span>${escapeHtml(item.title)}</span>
      ${extraLabel}
    </div>
  `;
}

function renderRollingList(node, items, type) {
  if (!node) return;

  const rows = (items || []).map((item) => {
    const link =
      type === "questionnaires" && item.linkUrl
        ? item.linkUrl
        : item.doiUrl || itemPageLink(type, item);
    const external = /^https?:\/\//i.test(link);
    const meta =
      type === "questionnaires"
        ? `Estimated time: ${escapeHtml(item.estimatedTime || "-")}`
        : [item.journal, item.quartile].filter(Boolean).map(escapeHtml).join(" · ");
    return `<a class="roll-item" href="${escapeHtml(link)}" ${
      external ? 'target="_blank" rel="noreferrer noopener"' : ""
    }>${escapeHtml(item.title)}<span class="roll-meta">${meta}</span></a>`;
  });

  if (rows.length === 0) {
    node.innerHTML =
      '<div class="roll-item">No verified public entry yet.</div>';
    return;
  }

  node.innerHTML = `<div class="rolling-track">${rows
    .concat(rows)
    .join("")}</div>`;
}

function renderHelpSurveys(items) {
  const wrap = byId("help-surveys-grid");
  if (!wrap) return;

  const surveys = (items || []).filter((item) => item.helpUs);
  if (surveys.length === 0) {
    wrap.innerHTML = '<p class="tiny">No highlighted survey yet.</p>';
    return;
  }

  wrap.innerHTML = surveys
    .map((item) => {
      const coverLink =
        item.linkUrl ||
        item.highlightUrl ||
        itemPageLink("questionnaires", item);
      const detailLink = itemPageLink("questionnaires", item);
      const coverMarkup = item.imageUrl
        ? `<a class="help-survey-cover" href="${escapeHtml(
            coverLink,
          )}" target="_blank" rel="noreferrer noopener">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" />
          </a>`
        : "";
      return `
        <article class="help-survey-card${item.imageUrl ? "" : " help-survey-card--without-cover"}">
          <div class="help-survey-copy">
            <a class="help-survey-title" href="${escapeHtml(
              coverLink,
            )}" target="_blank" rel="noreferrer noopener">${escapeHtml(
              item.title,
            )}</a>
            <p class="help-survey-muted">${escapeHtml(item.audience || "")}</p>
            <p class="help-survey-desc">${escapeHtml(item.introText || "")}</p>
            <p class="help-survey-small">${escapeHtml(
              item.estimatedTime || "",
            )} · Voluntary</p>
            <a class="panel-link" href="${escapeHtml(
              detailLink,
            )}">Open questionnaire details</a>
          </div>
          ${coverMarkup}
          <div class="help-survey-qr-block">
            <div class="survey-note survey-note-top">scan with your phone</div>
            <img class="survey-qr" src="${escapeHtml(
              item.qrUrl || assetUrl("assets/scan.png"),
            )}" alt="Survey QR code" />
            <div class="survey-note survey-note-bottom">Help us with an APAC survey</div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function ensureAnonymousSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

function selectedInterests(form) {
  return [...form.querySelectorAll('input[name="interests"]:checked')].map(
    (input) => input.value,
  );
}

async function uploadCv(file, userId, applicationId) {
  if (!file || file.size === 0) return null;
  if (file.type !== "application/pdf") {
    throw new Error("CV must be a PDF file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("CV must be 10 MB or smaller.");
  }

  const path = `${userId}/${applicationId}.pdf`;
  const { error } = await supabase.storage
    .from("application-files")
    .upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

function setupJoinDialog() {
  const joinDialog = byId("join-dialog");
  const resultDialog = byId("result-dialog");
  const joinForm = byId("join-form");
  const resultText = byId("result-text");
  const submitButton = joinForm?.querySelector('button[type="submit"]');

  [byId("open-join-modal"), byId("open-join-modal-secondary")]
    .filter(Boolean)
    .forEach((button) =>
      button.addEventListener("click", () => joinDialog.showModal()),
    );

  byId("close-join-modal")?.addEventListener("click", () =>
    joinDialog.close(),
  );
  byId("close-result")?.addEventListener("click", () => resultDialog.close());

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";

    try {
      const formData = new FormData(joinForm);
      const session = await ensureAnonymousSession();
      const applicationId = crypto.randomUUID();
      const email = String(formData.get("email") || "")
        .trim()
        .toLowerCase();
      const cvPath = await uploadCv(
        formData.get("cv"),
        session.user.id,
        applicationId,
      );

      const { error } = await supabase.from("applications").insert({
        id: applicationId,
        user_id: session.user.id,
        name: String(formData.get("name") || "").trim(),
        professional_role: String(
          formData.get("professionalRole") || "",
        ).trim(),
        institution: String(formData.get("institution") || "").trim(),
        country_region: String(formData.get("countryRegion") || "").trim(),
        email,
        interests: selectedInterests(joinForm),
        proposal: String(formData.get("proposal") || "").trim(),
        cv_path: cvPath,
      });
      if (error) throw error;

      await supabase.functions
        .invoke("application-email", {
          body: { action: "submitted", applicationId },
        })
        .catch(() => {});

      await supabase.auth.signOut();
      const { error: emailError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: siteUrl("my-application.html"),
          shouldCreateUser: true,
        },
      });

      joinDialog.close();
      joinForm.reset();
      resultText.textContent = emailError
        ? `Application ${applicationId} was submitted. Use “My application” to request a secure sign-in link.`
        : `Application ${applicationId} was submitted. We sent a secure sign-in link to ${email}.`;
      resultDialog.showModal();
    } catch (error) {
      window.alert(error.message || "Failed to submit application.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit";
    }
  });
}

function setupActivityTicker(items) {
  const node = byId("activity-body");
  if (!node) return;

  const messages = items
    .slice(0, 8)
    .map((item) => `Published update: ${item.title}`);
  if (messages.length === 0) {
    node.textContent =
      "Research updates are published after editorial verification.";
    return;
  }

  let index = 0;
  node.textContent = messages[index];
  window.setInterval(() => {
    index = (index + 1) % messages.length;
    node.textContent = messages[index];
  }, 4300);
}

async function bootHome() {
  const [researchResult, questionnaireResult] = await Promise.all([
    supabase
      .from("research_items")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(14),
    supabase
      .from("questionnaires")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(14),
  ]);

  const firstError = [
    researchResult.error,
    questionnaireResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const research = (researchResult.data || []).map(mapResearch);
  const questionnaires = (questionnaireResult.data || []).map(
    mapQuestionnaire,
  );
  const frontier = research.filter((item) =>
    researchResult.data.find(
      (row) => row.id === item.id && row.section === "frontier",
    ),
  );
  const results = research.filter((item) =>
    researchResult.data.find(
      (row) => row.id === item.id && row.section === "results",
    ),
  );

  renderHelpSurveys(questionnaires);
  renderFeaturedCard(byId("frontier-featured"), frontier[0], "frontier");
  renderFeaturedCard(byId("results-featured"), results[0], "results");
  renderFeaturedCard(
    byId("questionnaires-featured"),
    questionnaires[0],
    "questionnaires",
  );
  renderRollingList(byId("frontier-list"), frontier.slice(0, 7), "frontier");
  renderRollingList(byId("results-list"), results.slice(0, 7), "results");
  renderRollingList(
    byId("questionnaires-list"),
    questionnaires.slice(0, 7),
    "questionnaires",
  );
  setupActivityTicker([...research, ...questionnaires]);
}

setupJoinDialog();
bootHome().catch((error) => {
  console.info("Latest research data is temporarily unavailable.", error);
  renderHelpSurveys([]);
  renderFeaturedCard(byId("frontier-featured"), null, "frontier");
  renderFeaturedCard(byId("results-featured"), null, "results");
  renderFeaturedCard(byId("questionnaires-featured"), null, "questionnaires");
  renderRollingList(byId("frontier-list"), [], "frontier");
  renderRollingList(byId("results-list"), [], "results");
  renderRollingList(byId("questionnaires-list"), [], "questionnaires");
  setupActivityTicker([]);
});

