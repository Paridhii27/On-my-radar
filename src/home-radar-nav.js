import { playRadarStartSound } from "./radar-start-sound.js";

const DEFAULT_HINT = "Hover a mode to see what it does.";

const nav = document.querySelector("nav.radar-orbit");
const hintEl = document.getElementById("radar-mode-hint");

function setHint(text) {
  if (hintEl) hintEl.textContent = text;
}

if (nav) {
  nav.querySelectorAll("a.radar-orbit__btn[href]").forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      e.preventDefault();
      playRadarStartSound();
      const go = () => {
        window.location.href = href;
      };
      window.setTimeout(go, 120);
    });

    const hint = anchor.getAttribute("data-hint");
    if (!hint) return;

    anchor.addEventListener("mouseenter", () => setHint(hint));
    anchor.addEventListener("mouseleave", (e) => {
      const to = e.relatedTarget;
      if (to && nav.contains(to) && to.closest?.("a.radar-orbit__btn[data-hint]")) {
        return;
      }
      setHint(DEFAULT_HINT);
    });

    anchor.addEventListener("focusin", () => setHint(hint));
    anchor.addEventListener("focusout", (e) => {
      const to = e.relatedTarget;
      if (to && nav.contains(to) && to.closest?.("a.radar-orbit__btn[data-hint]")) {
        return;
      }
      setHint(DEFAULT_HINT);
    });
  });
}
