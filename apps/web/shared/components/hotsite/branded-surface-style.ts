import type React from 'react';

/**
 * The only place outside `shells/hotsite` that writes the tenant's secondary colour as a surface
 * (ESLint `SECONDARY_SURFACE_SELECTOR` sends every other file here, TD51-S05). The text colour is
 * `--ba-secondary-text`, which `applyBranding()` derives to read over `--ba-secondary`;
 * `--ba-primary` and `--ba-text` are calibrated against other surfaces and can vanish here, so
 * neither is a fallback: every branded page applies the tokens.
 */
export const brandedSurfaceStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-secondary)',
  borderRadius: 'var(--ba-radius)',
  color: 'var(--ba-secondary-text)',
};

/**
 * The colour of a secondary line (a hint, a count, a caption) on the secondary surface. A softened
 * tint of the readable text colour that `applyBranding()` keeps at 4.5:1 or better, so it replaces
 * an `opacity-*` class, which lowers the contrast of a colour already derived to the minimum.
 */
export const BRANDED_MUTED_TEXT = 'var(--ba-secondary-muted, var(--ba-secondary-text))';

/** A loading block that carries no text, so it needs only the surface colour. */
export const brandedSkeletonStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-secondary)',
};
