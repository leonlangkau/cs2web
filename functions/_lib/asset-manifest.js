// GENERATED FROM public/{css,js,fonts} by scripts/build-assets.cjs — do not edit by hand.

const MANIFEST = {
  "/css/style.css": "71c1f802",
  "/js/boot.js": "6c89cbd4",
  "/js/captcha.js": "4253bc85",
  "/js/fingerprint.js": "7c3dc35d",
  "/js/fx.js": "ae8845cb",
  "/js/main.js": "8bf18d85",
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
