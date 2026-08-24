/**
 * Company / legal entity details shown on the Terms and Privacy Policy pages.
 *
 * Built from the runtime config rather than read at import time, because
 * Cloudflare supplies vars per-request via the Worker `env` binding rather than
 * through process.env.
 *
 * The bracketed values are PLACEHOLDERS — replace them (wrangler.toml [vars]
 * for Cloudflare, or environment variables locally) before publishing.
 * `isPlaceholder` drives a visible warning banner on the legal pages so an
 * unfinished entity block cannot ship unnoticed.
 */

const PLACEHOLDER = /^\[.*\]$/;

function createCompany(env = {}) {
  const company = {
    legalName: env.COMPANY_LEGAL_NAME || '[Registered Company Name]',
    tradingName: env.COMPANY_TRADING_NAME || 'AimHub',
    registrationNumber: env.COMPANY_REG_NUMBER || '[Registration Number]',
    addressLine: env.COMPANY_ADDRESS || '[Registered Office Address]',
    city: env.COMPANY_CITY || 'Mutsamudu',
    jurisdiction: 'Autonomous Island of Anjouan, Union of the Comoros',
    country: 'Union of the Comoros',

    contactEmail: env.COMPANY_CONTACT_EMAIL || 'support@goyhub.com',
    privacyEmail: env.COMPANY_PRIVACY_EMAIL || 'privacy@goyhub.com',
    legalEmail: env.COMPANY_LEGAL_EMAIL || 'legal@goyhub.com',

    lastUpdated: env.LEGAL_LAST_UPDATED || '24 August 2026',
    minimumAge: 16,
  };

  company.fullAddress = `${company.addressLine}, ${company.city}, ${company.jurisdiction}`;
  company.isPlaceholder = [
    company.legalName,
    company.registrationNumber,
    company.addressLine,
  ].some((value) => PLACEHOLDER.test(value));

  return company;
}

export { createCompany };
