// Inspect the actual status node while a dialog is open. Its layout must make
// room for text and controls without a floating overlay or duplicate live region.
export function inspectDialogNotice() {
  const notice = document.querySelector("#toast"),
    panel = document.querySelector("#modal-root .modal"),
    bounds = notice.getBoundingClientRect(),
    title = panel.querySelector("h2").getBoundingClientRect(),
    visible = !notice.classList.contains("hidden"),
    overlaps = [];
  if (visible)
    for (const control of panel.querySelectorAll(
      "button, input, select, a[href]",
    )) {
      const r = control.getBoundingClientRect();
      if (
        bounds.left < r.right &&
        bounds.right > r.left &&
        bounds.top < r.bottom &&
        bounds.bottom > r.top
      )
        overlaps.push(
          control.id ||
            control.getAttribute("aria-label") ||
            control.textContent.trim(),
        );
    }
  return {
    count: document.querySelectorAll("#toast").length,
    inside: notice.parentElement === panel,
    visible,
    position: getComputedStyle(notice).position,
    overlaps,
    belowTitle: !visible || bounds.top >= title.bottom,
    horizontalOverflow: panel.scrollWidth > panel.clientWidth,
    notice: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    panel: {
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
    },
    text: notice.textContent,
  };
}
