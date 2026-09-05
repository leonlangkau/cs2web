/**
 * Brand assets shared by every skin's chrome. Kept out of layout.js so the
 * skin modules (which layout.js imports) do not import layout.js back.
 */
const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 4L26.4 22H5.6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
  <path d="M16 28L5.6 10h20.8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
</svg>`;

// White backing plate so the blue mark stays visible in dark browser tab strips.
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23ffffff'/%3E%3Cpath d='M16 5L25.5 21.5H6.5z' fill='none' stroke='%230137B7' stroke-width='2.6' stroke-linejoin='round'/%3E%3Cpath d='M16 27L6.5 10.5h19z' fill='none' stroke='%230137B7' stroke-width='2.6' stroke-linejoin='round'/%3E%3C/svg%3E";

export { BRAND_MARK, FAVICON };
