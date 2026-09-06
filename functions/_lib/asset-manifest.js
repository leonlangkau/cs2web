// GENERATED FROM public/{css,js,fonts} by scripts/build-assets.cjs — do not edit by hand.

const MANIFEST = {
  "/css/skin-neon.css": "0be15d90",
  "/css/skin-prism.css": "26b56eb3",
  "/css/style.css": "4a010702",
  "/css/ui-neon.css": "137efa52",
  "/css/ui-switch.css": "fecc2f0a",
  "/js/boot.js": "e295cf6b",
  "/js/captcha.js": "cb02d481",
  "/js/crypto-pay.js": "c03e40a0",
  "/js/fingerprint.js": "7c3dc35d",
  "/js/fx.js": "fdd03416",
  "/js/main.js": "a04d3099",
  "/js/rb-client-BAUGi7xL.js": "97d37d76",
  "/js/status.js": "fcc1a3b7",
  "/js/support.js": "b287e3fc",
  "/js/ui-neon.js": "d087c6f0",
  "/js/ui-prism.js": "e34f44c7",
  "/fonts/chakra-petch-latin-500-normal.woff2": "36ad966c",
  "/fonts/chakra-petch-latin-600-normal.woff2": "a5888696",
  "/fonts/chakra-petch-latin-700-normal.woff2": "ce5095dc",
  "/fonts/ibm-plex-sans-latin-400-italic.woff2": "6de912e5",
  "/fonts/ibm-plex-sans-latin-400-normal.woff2": "3b646991",
  "/fonts/ibm-plex-sans-latin-500-normal.woff2": "0717336f",
  "/fonts/ibm-plex-sans-latin-600-normal.woff2": "8960851d",
  "/fonts/jetbrains-mono-var.woff2": "18be4527",
  "/fonts/manrope-latin-wght-normal.woff2": "a30ddcd3",
  "/fonts/space-grotesk-var.woff2": "06408904",
  "/fonts/syne-latin-700-normal.woff2": "0aad6941",
  "/fonts/syne-latin-800-normal.woff2": "1a340e84",
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
