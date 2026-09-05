// GENERATED FROM public/{css,js,fonts} by scripts/build-assets.cjs — do not edit by hand.

const MANIFEST = {
  "/css/style.css": "4a010702",
  "/js/boot.js": "e295cf6b",
  "/js/captcha.js": "cb02d481",
  "/js/crypto-pay.js": "c03e40a0",
  "/js/fingerprint.js": "7c3dc35d",
  "/js/fx.js": "fdd03416",
  "/js/main.js": "a04d3099",
  "/js/rb-client-BAUGi7xL.js": "97d37d76",
  "/js/status.js": "fcc1a3b7",
  "/js/support.js": "b287e3fc",
  "/js/ui-neon.js": "70a29f34",
  "/js/ui-prism.js": "70a29f34",
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
