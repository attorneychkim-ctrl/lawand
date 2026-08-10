type MoveAttentionOptions = {
  block?: ScrollLogicalPosition;
  focusTarget?: HTMLElement | null;
};

export function moveAttention(
  scrollTarget: HTMLElement,
  { block = "start", focusTarget = scrollTarget }: MoveAttentionOptions = {},
) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  scrollTarget.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block,
  });
  focusTarget?.focus({ preventScroll: true });
}
