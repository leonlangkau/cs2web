// GENERATED FROM public/{css,js,fonts} by scripts/build-assets.cjs — do not edit by hand.

const MANIFEST = {
  "/css/style.css": "89715bc5",
  "/js/boot.js": "e295cf6b",
  "/js/captcha.js": "4253bc85",
  "/js/crypto-pay.js": "c03e40a0",
  "/js/fingerprint.js": "7c3dc35d",
  "/js/fx.js": "36af4062",
  "/js/main.js": "a04d3099",
  "/fonts/jetbrains-mono-var.woff2": "18be4527",
  "/fonts/space-grotesk-var.woff2": "06408904",
};

/**
 * Cache-busting URL for a static asset. Unknown paths (external scripts, or
 * anything not under the hashed directories) are returned untouched.
 */
function asset(urlPath) {
  const version = MANIFEST[urlPath];
  return version ? `${urlPath}?v=${version}` : urlPath;
}

export { asset, MANIFEST };
