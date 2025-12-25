# UI Design Principles (Zen Minimalist)

1. **Calm hierarchy** – use generous white space (24px+) and a single accent color to direct attention. Section titles are larger, body text is warm and readable.
2. **Typography first** – Inter (variable) with clear type scale: large titles (2.5rem+), section headings (1.8rem), body (1.125rem), meta (0.85rem). Maintain line-height ≥1.5.
3. **Palette discipline** – only neutrals for backgrounds/borders, a muted sage accent for interactions, plus subtle dark-mode tweaks. Keep contrast ≥4.5:1.
4. **Token-driven spacing** – rely on multiples of 8px for spacing (8/16/24/32), radius of 18px, and card shadows to avoid clutter.
5. **Accessible focus** – every interactive element has a clear focus ring (color token `--ring`) and keyboard/tab navigation in side/nav.
6. **Component restraint** – limit to one primary action per area; actions that are not available are shown disabled with muted text.
7. **Avoid noise** – fewer borders, no heavy gradients, minimal icons, and avoid animation beyond subtle fades.
8. **Consistent shell** – sidebar/top bar remain constant; modules render within the same card-like surface.
