const pop = document.querySelector(".info-popover");
const trigger = document.querySelector(".info-popover__trigger");
if (pop && trigger) {
  function setExpanded(open) {
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  pop.addEventListener("mouseenter", () => setExpanded(true));
  pop.addEventListener("mouseleave", () => setExpanded(false));
  pop.addEventListener("focusin", () => setExpanded(true));
  pop.addEventListener("focusout", (e) => {
    if (!pop.contains(e.relatedTarget)) setExpanded(false);
  });
}
