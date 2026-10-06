import { escapeHtml, mapResearch, pageUrl, supabase } from "./supabase-client.js";

const PDFJS_VERSION = "6.3.289";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;
const params = new URLSearchParams(window.location.search);
const type = params.get("type");
const id = params.get("id");
const titleNode = document.getElementById("reader-title");
const journalNode = document.getElementById("reader-journal");
const statusNode = document.getElementById("reader-status");
const pagesNode = document.getElementById("reader-pages");
const downloadLink = document.getElementById("reader-download");
const backLink = document.getElementById("reader-back");

function showError(message) {
  statusNode.classList.add("reader-status-error");
  statusNode.textContent = message;
}

async function renderPaper() {
  if (!id || !["frontier", "results"].includes(type)) {
    throw new Error("This paper link is incomplete or invalid.");
  }

  const { data, error } = await supabase
    .from("research_items")
    .select("*")
    .eq("id", id)
    .eq("section", type)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This research paper is not available.");

  const item = mapResearch(data);
  const pdfUrl = String(item.pdfUrl || "").trim();
  if (!pdfUrl) throw new Error("No PDF has been uploaded for this research entry.");

  titleNode.textContent = item.title || "Research paper";
  journalNode.textContent = [item.journal, item.authorsTeam].filter(Boolean).join(" · ");
  document.title = `${item.title || "Research paper"} | PACD Research Club`;
  backLink.href = pageUrl(`item.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(item.id)}`);
  downloadLink.href = pdfUrl;
  downloadLink.hidden = false;

  statusNode.textContent = "Preparing the responsive reading view…";
  const pdfjs = await import(`${PDFJS_BASE}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
  const documentTask = pdfjs.getDocument({
    url: pdfUrl,
    cMapUrl: `${PDFJS_BASE}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}/standard_fonts/`,
    wasmUrl: `${PDFJS_BASE}/wasm/`,
  });
  const pdf = await documentTask.promise;
  const outputScale = Math.min(window.devicePixelRatio || 1, 1.5);
  const maxWidth = Math.max(160, Math.min(pagesNode.clientWidth, 980) - 24);

  statusNode.textContent = `Loading ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}…`;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 1.5);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not prepare the paper reader.");

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Page ${pageNumber} of ${pdf.numPages}`);

    const pageCard = document.createElement("article");
    pageCard.className = "reader-page";
    pageCard.append(canvas);
    pagesNode.append(pageCard);

    await page.render({
      canvasContext: context,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
      viewport,
    }).promise;
    page.cleanup();
    statusNode.textContent = `Displaying page ${pageNumber} of ${pdf.numPages}`;
  }

  statusNode.textContent = "The paper is ready. Use your browser’s zoom controls if you need larger text.";
  statusNode.classList.add("reader-status-ready");
}

renderPaper().catch((error) => {
  showError(error.message || "Unable to display this paper.");
});

