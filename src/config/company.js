'use strict';

/**
 * Company / legal entity details used by the Terms and Privacy Policy pages.
 *
 * The bracketed values below are PLACEHOLDERS — replace them with your real
 * registered details (or set the matching environment variables) before you
 * publish the site. `isPlaceholder` drives a visible warning banner on the
 * legal pages so an unfinished entity block can't ship unnoticed.
 */

const PLACEHOLDER = /^\[.*\]$/;

const company = {
  /** Registered legal name of the operating entity. */
  legalName: process.env.COMPANY_LEGAL_NAME || '[Registered Company Name]',
  /** Public-facing brand name. */
  tradingName: process.env.COMPANY_TRADING_NAME || 'GoyHub',
  /** Company / business registration number issued in Anjouan. */
  registrationNumber: process.env.COMPANY_REG_NUMBER || '[Registration Number]',
  /** Street address of the registered office. */
  addressLine: process.env.COMPANY_ADDRESS || '[Registered Office Address]',
  city: process.env.COMPANY_CITY || 'Mutsamudu',
  jurisdiction: 'Autonomous Island of Anjouan, Union of the Comoros',
  country: 'Union of the Comoros',

  /** Contact addresses. */
  contactEmail: process.env.COMPANY_CONTACT_EMAIL || 'support@goyhub.com',
  privacyEmail: process.env.COMPANY_PRIVACY_EMAIL || 'privacy@goyhub.com',
  legalEmail: process.env.COMPANY_LEGAL_EMAIL || 'legal@goyhub.com',

  /** Shown on both legal documents — bump when you revise them. */
  lastUpdated: process.env.LEGAL_LAST_UPDATED || '21 August 2026',

  /** Minimum age to hold an account. */
  minimumAge: 16,
};

company.fullAddress = `${company.addressLine}, ${company.city}, ${company.jurisdiction}`;

company.isPlaceholder = [
  company.legalName,
  company.registrationNumber,
  company.addressLine,
].some((value) => PLACEHOLDER.test(value));

module.exports = company;
