import { page } from "./layout.js";
import { esc, map, emailLink } from "./util.js";

/**
 * Both documents are defined as an ordered list of sections. The table of
 * contents is generated from that same list, so an anchor can never drift out
 * of sync with the heading it points at.
 */
function render(ctx, { title, kicker, sections, updated }) {
  const c = ctx.company;

  const toc = `<nav class="legal-toc" aria-label="Sections"><h2>On this page</h2><ol>
    ${map(sections, (s, i) => `<li><a href="#${esc(s.id)}">${i + 1}. ${esc(s.title)}</a></li>`)}
  </ol></nav>`;

  const placeholderNote = c.isPlaceholder ? `<p class="legal-placeholder-note">
    <strong>Setup required.</strong> This document still contains placeholder company details.
    Set <span class="mono">COMPANY_LEGAL_NAME</span>, <span class="mono">COMPANY_REG_NUMBER</span> and
    <span class="mono">COMPANY_ADDRESS</span> (see <span class="mono">src/config/company.js</span>),
    and have a qualified lawyer review this text before publishing.</p>` : '';

  const bodySections = map(sections, (s, i) => {
    const isLast = i === sections.length - 1;
    const heading = `<h2 id="${esc(s.id)}">${i + 1}. ${esc(s.title)}</h2>`;
    return isLast
      ? `<div class="legal-contact" id="${esc(s.id)}"><h2>${i + 1}. ${esc(s.title)}</h2>${s.html}</div>`
      : heading + s.html;
  });

  const body = `
<section class="section legal-page">
  <div class="container">
    <div class="page-head"><div>
      <p class="section-kicker">${esc(kicker)}</p>
      <h1 class="section-title">${esc(title)}</h1>
    </div></div>
    <div class="legal-layout">
      ${toc}
      <div class="legal-body">
        <p class="legal-updated">${esc(updated)}</p>
        ${placeholderNote}
        ${sections.summary || ''}
        ${bodySections}
      </div>
    </div>
  </div>
</section>`;

  return page(ctx, { title, body });
}

function summaryBlock(points) {
  return `<div class="legal-summary"><h2>The short version</h2>
    <p>This summary is for convenience only — the numbered sections below are what actually apply.</p>
    <ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul></div>`;
}

function contactBlock(c, extra) {
  return `<p>${extra}</p><address>
    <strong>${esc(c.legalName)}</strong><br>
    ${esc(c.addressLine)}<br>
    ${esc(c.city)}, ${esc(c.jurisdiction)}<br>
    Registration number: ${esc(c.registrationNumber)}<br>
    ${extra.includes('privacy') || extra.includes('rights')
      ? `Privacy: ${emailLink(c.privacyEmail)}<br>General: ${emailLink(c.contactEmail)}`
      : `General: ${emailLink(c.contactEmail)}<br>Legal &amp; arbitration opt-out: ${emailLink(c.legalEmail)}`}
  </address>`;
}

function terms(ctx) {
  const c = ctx.company;
  const mailLegal = `${emailLink(c.legalEmail)}`;
  const mailContact = `${emailLink(c.contactEmail)}`;
  const j = esc(c.jurisdiction);

  const sections = [
    { id: 's1', title: 'Who we are', html: `
      <p>GoyHub (the <strong>"Service"</strong>) is operated by <strong>${esc(c.legalName)}</strong>
      (<strong>"we"</strong>, <strong>"us"</strong>, <strong>"our"</strong>), a company registered in the
      ${j} under registration number ${esc(c.registrationNumber)}, with its registered office at
      ${esc(c.addressLine)}, ${esc(c.city)}, ${j}.</p>
      <p>The Service consists of this website, the GoyHub community forum, the GoyHub desktop application
      for Windows, and any related software, downloads, content and support channels we make available.</p>` },

    { id: 's2', title: 'Accepting these terms', html: `
      <p>These Terms &amp; Conditions (the <strong>"Terms"</strong>) form a binding agreement between you and
      us. You accept them by any of the following, whichever happens first:</p>
      <ul>
        <li>selecting <strong>"I accept"</strong> in the notice shown when you first open the Service;</li>
        <li>creating a GoyHub account;</li>
        <li>downloading, installing or using the GoyHub application; or</li>
        <li>otherwise continuing to use the Service.</li>
      </ul>
      <p>Our <a href="/privacy">Privacy Policy</a> is incorporated into these Terms by reference. We record
      the date, IP address and version accepted when you select "I accept". If you do not agree to these
      Terms, you must not use the Service.</p>` },

    { id: 's3', title: 'Eligibility', html: `
      <p>You must be at least ${esc(c.minimumAge)} years old to create a GoyHub account. If the law where you
      live sets a higher minimum age for consenting to online services or to the processing of your personal
      data, you must meet that higher age instead.</p>
      <p>By creating an account you represent that you meet these requirements, that the information you give
      us is accurate, and that you are not barred from using the Service under any applicable law or under a
      previous suspension or ban issued by us.</p>` },

    { id: 's4', title: 'Your account', html: `
      <p>You need an account to post on the forum, to download the application, and to sign in to it. You are
      responsible for everything that happens under your account.</p>
      <ul>
        <li>Choose a strong, unique password and keep it confidential. We store passwords only as salted PBKDF2 hashes and can never tell you your password.</li>
        <li>Do not share, sell, rent, transfer or lend your account, and do not let anyone else use it.</li>
        <li>Do not create an account on behalf of anyone else, or create a new account to evade a ban.</li>
        <li>Do not use bots, scripts or automated tooling to register accounts, or attempt to defeat our human-verification checks.</li>
        <li>Tell us promptly at ${mailContact} if you believe your account has been accessed without your permission.</li>
      </ul>
      <p>We may refuse, reclaim or rename any username that impersonates another person, implies affiliation
      with us or our staff, or that we consider offensive or misleading.</p>` },

    { id: 's5', title: 'Licence to use GoyHub', html: `
      <p>The Service and the GoyHub application are <strong>licensed to you, not sold</strong>. Subject to your
      compliance with these Terms, we grant you a personal, limited, non-exclusive, non-transferable,
      non-sublicensable and revocable licence to download and use one copy of the GoyHub application on
      devices you control, and to access the Service, in each case for your own personal, non-commercial use.</p>
      <p>All rights not expressly granted to you are reserved by us. The GoyHub name, logo, site design,
      source code, compiled binaries, database schema, written content and all associated intellectual
      property remain our property or that of our licensors.</p>` },

    { id: 's6', title: 'No tampering, cloning or copying', html: `
      <p>This section is a material condition of the licence granted in section 5. You must not, and must not
      permit or assist any other person to:</p>
      <h3>6.1 Copying and cloning</h3>
      <ul>
        <li>copy, reproduce, duplicate, mirror or archive the Service, the application, or any part of either, except for a single backup copy of the installer for your own personal use;</li>
        <li><strong>clone, fork, re-skin, re-brand or otherwise create a substantially similar product or service</strong> derived from the Service, its source code, its compiled binaries, its design, its interface or its underlying structure;</li>
        <li>sell, resell, rent, lease, lend, sublicense, distribute, publish, host, or otherwise make the application available to any third party;</li>
        <li>use the Service, its content or its data to build, train, benchmark or improve a competing product, service or model;</li>
        <li>scrape, crawl, harvest, index or bulk-extract any content, user data or statistics from the Service by any automated means, except for well-behaved search engine indexing that respects our robots directives.</li>
      </ul>
      <h3>6.2 Tampering and reverse engineering</h3>
      <ul>
        <li>modify, adapt, translate, patch, hook, inject into, or create derivative works of the application or the Service;</li>
        <li>reverse engineer, decompile, disassemble or otherwise attempt to derive the source code, algorithms, file formats or protocols of the application, <strong>except</strong> to the extent that this restriction is expressly prohibited by applicable law and only after you have asked us in writing for the information you need;</li>
        <li>circumvent, disable, remove or interfere with any licensing, authentication, access-control, rate-limiting, human-verification, integrity-check or security feature;</li>
        <li>remove, obscure, alter or falsify any copyright notice, trademark, watermark, version identifier or attribution;</li>
        <li>distribute a modified, repackaged, cracked, patched or otherwise altered build of the application, or present any such build as genuine GoyHub software;</li>
        <li>tamper with, forge or replay requests to our servers or APIs, or interfere with the integrity or performance of the Service;</li>
        <li>probe, scan or test the vulnerability of any of our systems, or breach or circumvent any security or authentication measure, other than under a written authorisation from us.</li>
      </ul>
      <h3>6.3 Consequences</h3>
      <p>Breach of this section terminates your licence immediately and automatically, without notice. You
      acknowledge that a breach of this section may cause us harm for which damages alone are an inadequate
      remedy, and that we may seek injunctive or other equitable relief in addition to any other remedy
      available to us. Nothing in section 17 (Binding arbitration) prevents either party from seeking urgent
      injunctive relief from a court to protect its intellectual property.</p>
      <p>If you believe you have found a security vulnerability, please report it to ${mailContact} rather
      than exploiting it.</p>` },

    { id: 's7', title: 'Acceptable use', html: `
      <p>When using the forum or any other part of the Service, you must not post, upload, link to or share:</p>
      <ul>
        <li>cheating software, aimbots, wallhacks, injectors, exploits, or instructions or links for obtaining them;</li>
        <li>offers to buy, sell, trade, boost or rent game accounts, or to arrange match-fixing or gambling;</li>
        <li>harassment, threats, hate speech, or content targeting a person or group on the basis of a protected characteristic;</li>
        <li>sexual content involving minors, or any other content that is unlawful in the jurisdictions where it can be viewed;</li>
        <li>another person's private information (including real names, addresses, phone numbers or IP addresses) without their consent;</li>
        <li>malware, phishing links, spam, chain messages, or repetitive promotional content;</li>
        <li>content that infringes anyone's copyright, trademark, privacy or other rights.</li>
      </ul>
      <p>You must also comply with all laws that apply to you, and with the terms of any third-party service
      you use alongside GoyHub, including Steam and Counter-Strike 2.</p>` },

    { id: 's8', title: 'Your content', html: `
      <p>You keep ownership of the threads, posts, configurations and other material you submit to the Service
      (<strong>"Your Content"</strong>). We do not claim ownership of it.</p>
      <p>By submitting Your Content, you grant us a worldwide, non-exclusive, royalty-free, transferable and
      sublicensable licence to host, store, reproduce, adapt for formatting purposes, publish, display and
      distribute Your Content for the purposes of operating, promoting and improving the Service. This licence
      lasts as long as Your Content remains on the Service and, for content that others have quoted, replied to
      or archived, for as long as reasonably necessary afterwards.</p>
      <p>You represent that you have all rights necessary to grant this licence, and that Your Content does not
      breach section 7 or any third party's rights. Forum content is <strong>public</strong>: anything you post
      can be read by anyone with an internet connection and may be indexed by search engines. Do not post
      anything you would not want to be public and permanent.</p>` },

    { id: 's9', title: 'Moderation & enforcement', html: `
      <p>We may, but are not obliged to, monitor the Service. Where we consider it appropriate — including
      where content or conduct breaches these Terms, exposes us or other users to risk, or is the subject of a
      credible complaint — we may at our sole discretion and without prior notice:</p>
      <ul>
        <li>edit, hide, lock, move or delete any thread, post or other content;</li>
        <li>issue a warning, restrict posting, suspend or permanently ban an account;</li>
        <li>revoke access to the application and to any download;</li>
        <li>retain records of the conduct and the associated technical data described in our <a href="/privacy">Privacy Policy</a>;</li>
        <li>report conduct to law enforcement or other authorities where we believe it may be unlawful.</li>
      </ul>
      <p>Bans are enforced at the account level and may also be enforced against related accounts. We are not
      required to give reasons, and no refund or compensation is payable in connection with any moderation
      action.</p>` },

    { id: 's10', title: 'Relationship with Valve', html: `
      <p>GoyHub is an independent, fan-made companion product. We are <strong>not affiliated with, endorsed by,
      sponsored by or associated with Valve Corporation</strong>. "Counter-Strike", "Counter-Strike 2", "CS2"
      and "Steam" are trademarks of Valve Corporation, used here only to describe compatibility.</p>
      <p>Your use of Counter-Strike 2 and Steam remains governed by Valve's own agreements. GoyHub does not
      read or modify game memory and does not inject code into the game. Even so, you are solely responsible
      for ensuring that your use of any third-party tool complies with Valve's rules, and we accept no
      responsibility for any action Valve takes against your game account.</p>` },

    { id: 's11', title: 'Availability & changes', html: `
      <p>The Service is provided free of charge and on an "as available" basis. We do not guarantee any level
      of availability, uptime, performance or data retention. We may change, suspend, limit or discontinue the
      Service or any feature of it, in whole or in part, at any time and without liability to you.</p>
      <p>We may release updates to the application. Some updates may be required for continued use, and older
      versions may stop working without notice.</p>` },

    { id: 's12', title: 'Disclaimers', html: `
      <p>To the fullest extent permitted by applicable law, the Service and everything provided through it are
      supplied <strong>"as is" and "as available", without warranties of any kind</strong>, whether express,
      implied or statutory, including any implied warranties of merchantability, fitness for a particular
      purpose, title, accuracy and non-infringement.</p>
      <p>We do not warrant that:</p>
      <ul>
        <li>the Service will be uninterrupted, timely, secure or error-free;</li>
        <li>statistics, ratings, price data, configuration recommendations or performance presets are accurate, complete or suitable for your system;</li>
        <li>content posted by other users is accurate, lawful or safe to use;</li>
        <li>any defect will be corrected, or that the Service is free of viruses or other harmful components.</li>
      </ul>
      <p>Any configuration, launch option or setting you apply is applied at your own risk. You are responsible
      for backing up your own game settings and files.</p>` },

    { id: 's13', title: 'Limitation of liability', html: `
      <p>To the fullest extent permitted by applicable law, we (together with our directors, officers,
      employees, contractors and agents) will not be liable for any indirect, incidental, special,
      consequential, punitive or exemplary damages, nor for any loss of profits, revenue, goodwill, data, game
      accounts, in-game items or opportunity, however caused and under any theory of liability, even if we have
      been advised of the possibility of such damages.</p>
      <p>Our total aggregate liability arising out of or in connection with the Service or these Terms will not
      exceed the greater of (a) the total amount you have paid us in the twelve months before the event giving
      rise to the claim, or (b) USD 100.</p>
      <p>Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited,
      including liability for fraud or fraudulent misrepresentation, or for death or personal injury caused by
      negligence. Some jurisdictions do not allow certain exclusions, so parts of this section may not apply to
      you; the remaining parts continue to apply.</p>` },

    { id: 's14', title: 'Indemnity', html: `
      <p>You agree to indemnify and hold us harmless from any claim, demand, loss, liability, cost or expense
      (including reasonable legal fees) arising out of or connected with Your Content, your use of the Service,
      your breach of these Terms (including section 6), or your violation of any law or third-party right.</p>` },

    { id: 's15', title: 'Suspension & termination', html: `
      <p>You may stop using the Service at any time and may ask us to close your account by contacting
      ${mailContact}.</p>
      <p>We may suspend or terminate your account and access to the Service at any time, with or without
      notice, including where we believe you have breached these Terms or where continued access poses a risk
      to us, other users or third parties.</p>
      <p>On termination, your licence under section 5 ends immediately and you must stop using and delete all
      copies of the application. Sections 6, 8 (as to content already posted), 12, 13, 14, 17, 18 and 19
      survive termination. Content you posted remains on the forum, reattributed to
      <span class="mono">[deleted]</span>; see our <a href="/privacy">Privacy Policy</a> for how we handle data
      after account closure.</p>` },

    { id: 's16', title: 'Changes to these terms', html: `
      <p>We may update these Terms from time to time. When we do, we will change the "last updated" date and
      version at the top of this page, and where the changes are material we will ask you to accept the new
      version the next time you open the Service. Changes take effect when published. Your continued use of the
      Service after that point means you accept the revised Terms.</p>` },

    { id: 's17', title: 'Binding arbitration & class action waiver', html: `
      <p><strong>Please read this section carefully. It affects how disputes between you and us are resolved
      and, unless you opt out under section 17.7, it requires individual arbitration instead of a court trial
      and waives your right to participate in a class action.</strong></p>
      <h3>17.1 Informal resolution first</h3>
      <p>Before starting arbitration, you agree to contact us at ${mailLegal} with a written description of the
      dispute and the relief you seek, and to negotiate in good faith for at least <strong>30 days</strong>.
      Most issues can be resolved this way.</p>
      <h3>17.2 Agreement to arbitrate</h3>
      <p>If the dispute is not resolved informally, you and we agree that any dispute, claim or controversy
      arising out of or relating to these Terms or the Service — including its formation, interpretation,
      breach, termination, validity or enforceability — will be resolved by <strong>final and binding private
      arbitration</strong>, rather than in court, except as stated in sections 17.5 and 17.7.</p>
      <h3>17.3 Rules, seat and procedure</h3>
      <ul>
        <li>The arbitration will be administered under the arbitration rules in force in the ${j}, or such other internationally recognised arbitration rules as the parties agree in writing.</li>
        <li>The <strong>seat of arbitration</strong> is the ${j}.</li>
        <li>The tribunal will consist of a <strong>single arbitrator</strong>, appointed by agreement of the parties or, failing agreement within 30 days, by the appointing authority under the applicable rules.</li>
        <li>The language of the arbitration is <strong>English</strong>.</li>
        <li>The proceedings and the award are <strong>confidential</strong>, except where disclosure is required by law or to enforce the award.</li>
        <li>Where the amount in dispute is under USD 10,000, the arbitration may be conducted on documents only, or remotely by video, unless the arbitrator directs otherwise.</li>
        <li>The arbitrator's award is final and binding, and judgment on it may be entered by any court of competent jurisdiction.</li>
      </ul>
      <h3>17.4 Individual claims only — class action waiver</h3>
      <p><strong>You and we each agree to bring claims only in an individual capacity, and not as a plaintiff or
      class member in any purported class, collective, consolidated or representative proceeding.</strong> The
      arbitrator may not consolidate the claims of more than one person and may not preside over any form of
      representative or class proceeding. If this paragraph is found unenforceable, then the whole of section 17
      is void and disputes will be resolved under section 18 instead.</p>
      <h3>17.5 Exceptions</h3>
      <p>Either party may, without breaching this section: seek urgent injunctive or other equitable relief from
      a court to protect intellectual property or confidential information, including in respect of a breach of
      section 6; bring an individual claim in a small-claims court if it qualifies under that court's rules; or
      notify a regulator or supervisory authority of a matter within its remit.</p>
      <h3>17.6 Costs</h3>
      <p>Each party bears its own legal costs. The arbitrator's fees and administrative costs are shared equally
      unless the arbitrator allocates them otherwise, including where a claim or defence is found to be
      frivolous or brought in bad faith.</p>
      <h3>17.7 Your right to opt out</h3>
      <p><strong>You may opt out of this arbitration agreement.</strong> To do so, send written notice to
      ${mailLegal} within <strong>30 days</strong> of first accepting these Terms, stating your username, the
      email address on your account, and a clear statement that you are opting out of arbitration. Opting out
      does not affect any other part of these Terms, and we will not close or penalise your account for opting
      out. If you opt out, disputes are resolved under section 18.</p>
      <h3>17.8 Consumers and mandatory law</h3>
      <p>Nothing in this section removes a right you have under mandatory consumer-protection law that cannot be
      waived by agreement. If you are a consumer resident in a jurisdiction — such as a member state of the
      European Union or the United Kingdom — where a pre-dispute agreement to arbitrate is not binding on
      consumers, this section does not apply to you to that extent, and section 18 governs instead.</p>` },

    { id: 's18', title: 'Governing law & jurisdiction', html: `
      <p>These Terms and any dispute or claim arising out of or in connection with them (including
      non-contractual disputes) are governed by the laws of the ${j}, without regard to conflict-of-law rules.</p>
      <p>Where a dispute is not subject to arbitration under section 17, the courts of the ${j} have exclusive
      jurisdiction to settle it, and you submit to that jurisdiction. If you are a consumer resident elsewhere,
      this does not deprive you of the protection of any mandatory provisions of the law of your country of
      residence.</p>` },

    { id: 's19', title: 'General', html: `
      <ul>
        <li><strong>Entire agreement.</strong> These Terms and the Privacy Policy are the entire agreement between you and us regarding the Service.</li>
        <li><strong>Severability.</strong> If any provision is held unenforceable, the rest remains in force and the unenforceable provision is replaced by an enforceable one reflecting the original intent as closely as possible. Section 17.4 is subject to its own rule.</li>
        <li><strong>No waiver.</strong> If we do not enforce a provision, that is not a waiver of our right to do so later.</li>
        <li><strong>Assignment.</strong> You may not assign or transfer these Terms. We may assign them to an affiliate or in connection with a merger, acquisition or sale of assets.</li>
        <li><strong>No third-party rights.</strong> No one other than you and us has any right to enforce these Terms.</li>
        <li><strong>Force majeure.</strong> Neither party is liable for a failure to perform caused by events beyond its reasonable control.</li>
        <li><strong>Language.</strong> These Terms are written in English. Any translation is provided for convenience, and the English version prevails.</li>
      </ul>` },

    { id: 's20', title: 'Payments & memberships', html: `
      <p>Paid membership is sold through the store on the Service. Prices are displayed in the currency shown
      on the store page and are payable in cryptocurrency through our payment server. We do not accept card
      payments, and we never receive or store your card, bank or wallet credentials.</p>
      <p>A membership runs for the period stated on the plan you buy, beginning when your payment confirms. If
      you already hold a paid membership, time you buy is <strong>added to the end</strong> of it rather than
      replacing it. Memberships do <strong>not</strong> renew automatically: when the period ends the account
      returns to the free tier until you buy again. A lifetime plan does not expire, but does not survive
      closure of the account or a ban.</p>
      <p><strong>Refunds.</strong> Cryptocurrency payments cannot be reversed by us. Once a payment has
      confirmed, purchases are final except where a refund is required by consumer law that applies to you, or
      where we choose to make one. If a payment confirms and your account is not upgraded, contact us with the
      order reference and we will either complete the order or refund it.</p>
      <p>We may change prices and what a plan includes at any time; a change never alters a membership already
      bought. We may refuse or cancel an order, and may suspend or withdraw a membership without refund where
      the account breaches these Terms — including sections 6 and 7.</p>
      <p>Network (miner) fees are yours and are not part of the price. An underpaid, overpaid or late payment
      may need to be settled by hand — contact us with the order reference shown on your order page.</p>` },

    { id: 's21', title: 'Contact', html: contactBlock(c, 'Questions about these Terms, or opting out of arbitration under section 17.7? Get in touch:') },
  ];

  sections.summary = summaryBlock([
    'GoyHub is a free companion app and community forum for Counter-Strike 2 players.',
    'You need an account to post and to download. Keep your password safe and don\'t share the account.',
    '<strong>You may not tamper with, clone, copy, decompile or redistribute our software.</strong>',
    'Don\'t cheat, harass people, or upload anything illegal. We can remove content and ban accounts.',
    'You keep ownership of what you post, but you let us host and display it on the site.',
    'Paid memberships are bought with cryptocurrency, do not auto-renew, and <strong>cannot be refunded once the payment confirms</strong> (section 20).',
    '<strong>Disputes go to binding private arbitration, individually — not to court and not as a class action.</strong> You can opt out within 30 days (section 17.7).',
    'The service is provided "as is", with no guarantee of uptime or fitness for any purpose.',
    'We are not affiliated with Valve Corporation.',
  ]);

  return render(ctx, {
    title: 'Terms & Conditions',
    kicker: '// LEGAL',
    sections,
    updated: `Last updated: ${c.lastUpdated} · Version ${ctx.termsVersion}`,
  });
}

function privacy(ctx) {
  const c = ctx.company;
  const mailPrivacy = `${emailLink(c.privacyEmail)}`;
  const j = esc(c.jurisdiction);

  const sections = [
    { id: 'p1', title: 'Who we are', html: `
      <p>GoyHub is operated by <strong>${esc(c.legalName)}</strong> (<strong>"we"</strong>, <strong>"us"</strong>,
      <strong>"our"</strong>), registered in the ${j} under registration number ${esc(c.registrationNumber)},
      with its registered office at ${esc(c.addressLine)}, ${esc(c.city)}, ${j}. We are the controller of the
      personal data described in this policy.</p>` },

    { id: 'p2', title: 'Scope', html: `
      <p>This Privacy Policy explains what personal data we collect through the GoyHub website, community forum
      and desktop application (together, the <strong>"Service"</strong>), why we collect it, who we share it
      with, and what choices you have. It forms part of our <a href="/terms">Terms &amp; Conditions</a>.</p>
      <p>By using the Service you acknowledge the practices described here.</p>` },

    { id: 'p3', title: 'What we collect', html: `
      <h3>3.1 Account data</h3>
      <p>When you create an account we collect and store:</p>
      <ul>
        <li><strong>Username</strong> — public, shown alongside everything you post.</li>
        <li><strong>Email address</strong> — not shown publicly. We hold it to identify your account, to verify requests you make about it, and so we can contact you about security or service matters. We do not currently offer an automated password reset: if you lose your password, contact us.</li>
        <li><strong>Password</strong> — stored only as a salted <span class="mono">PBKDF2-HMAC-SHA256</span> hash. We never store, log or transmit your password in plain text and cannot recover it for you.</li>
        <li><strong>Account status</strong> — your role (member or administrator), whether the account is banned, and when it was created.</li>
      </ul>
      <h3>3.2 Technical and security data</h3>
      <p>We automatically record the following each time certain events occur:</p>
      <ul>
        <li><strong>IP address</strong> of the connecting device.</li>
        <li><strong>Browser user-agent string</strong> (browser and operating system identifiers).</li>
        <li><strong>Event type and timestamp</strong> — specifically for account sign-up, successful login, failed login, blocked login attempt on a banned account, logout, file download, store orders being created, paid and completed, and administrator actions.</li>
        <li><strong>Session records</strong> — a hashed session identifier, the IP address and user agent the session was created from, and its creation and expiry times.</li>
        <li><strong>Sign-up IP and most recent login IP</strong>, stored on your account record.</li>
        <li><strong>The username or email address entered in a failed sign-in attempt</strong> — recorded alongside the IP address and browser even where no such account exists, so that repeated attempts against real accounts can be investigated.</li>
        <li><strong>Failed human-verification attempts</strong> on the sign-up form, with the reason.</li>
        <li><strong>Acceptance of these terms</strong> — the date, IP address and version you accepted.</li>
      </ul>
      <h3>3.3 Content data</h3>
      <p>The threads, replies, configurations, crosshair codes and other material you submit, together with
      associated metadata such as timestamps, view counts and the category you posted in.</p>
      <h3>3.4 Application data</h3>
      <p>Where you sign in to the GoyHub desktop application, we may collect the technical data above together
      with information the application needs to function — such as your linked game profile identifier, match
      statistics it retrieves on your behalf, saved configuration profiles, application version, and diagnostic
      and crash information.</p>
      <h3>3.5 Purchase data</h3>
      <p>If you buy a membership from the store we create an order record and keep it. It holds the plan you
      chose, its price, currency and duration, an order reference, the identifier of the invoice raised on our
      payment server, the order's status, and the times it was created, updated and completed. Your account
      record also stores which tier you are on and the date your membership ends.</p>
      <p>Payment itself is handled by our own <span class="mono">BTCPay Server</span>. The only information we
      pass to it is the order reference, the amount, and your username and account number so that the payment
      can be matched to your account. We do not receive or store wallet addresses, transaction contents, card
      numbers or bank details, and we do not use a third-party card processor.</p>
      <h3>3.6 Correspondence</h3>
      <p>If you contact us by email or through a support channel, we keep the message, your contact details and
      our reply.</p>` },

    { id: 'p4', title: 'Cookies', html: `
      <p>The Service sets a small number of strictly necessary first-party cookies. It does not set advertising cookies.</p>
      <ul>
        <li><span class="mono">ghsession</span> — keeps you signed in. <span class="mono">HttpOnly</span>, <span class="mono">SameSite=Lax</span>, expires after 7 days, and marked <span class="mono">Secure</span> over HTTPS.</li>
        <li><span class="mono">ghcsrf</span> — a cross-site request forgery token that protects forms from being submitted by third-party sites.</li>
        <li><span class="mono">ghflash</span> — a short-lived cookie (about 60 seconds) that carries a one-off status message between pages.</li>
        <li><span class="mono">ghterms</span> — records that you accepted the Terms, and which version, so the notice is not shown again.</li>
      </ul>
      <p>These cookies are required for the Service to work; blocking them will prevent you from signing in or
      submitting forms. You can delete cookies through your browser settings at any time.</p>` },

    { id: 'p5', title: 'How we use your data', html: `
      <p>We use the data described above to:</p>
      <ul>
        <li>create and maintain your account and keep you signed in;</li>
        <li>operate, display and deliver the forum, the website and the application;</li>
        <li><strong>protect the Service and its users</strong> — detecting and investigating abuse, spam, bot activity, credential-stuffing and brute-force attempts, ban evasion, and multiple-account abuse; enforcing rate limits; and maintaining an audit trail of security-relevant events;</li>
        <li>moderate content and enforce our <a href="/terms">Terms &amp; Conditions</a>;</li>
        <li>respond to your support requests and send you service-related messages;</li>
        <li>understand how the Service is used, produce aggregate statistics, and develop and improve our features;</li>
        <li>comply with legal obligations and respond to lawful requests;</li>
        <li>establish, exercise or defend legal claims.</li>
      </ul>
      <p>Where the law requires a legal basis for this processing, we rely on the performance of our contract
      with you (operating your account), our legitimate interests (security, abuse prevention, moderation and
      improving the Service), your consent where we ask for it, and compliance with legal obligations.</p>` },

    { id: 'p6', title: 'IP address logging', html: `
      <p>Because GoyHub is a free service with an open sign-up, IP logging is central to how we keep it usable.
      We record the IP address and browser of each sign-up, login attempt, logout and download, and we retain
      those records so that our administrators can:</p>
      <ul>
        <li>identify and block accounts used for spam, harassment or cheating-related activity;</li>
        <li>detect when a banned user returns under a new account;</li>
        <li>investigate suspicious login patterns and protect accounts from takeover;</li>
        <li>evidence abuse when reporting it to a hosting provider, network operator or authority.</li>
      </ul>
      <p>These logs are visible to our administrators through an access-controlled admin interface, and every
      administrator action against an account is itself logged. Where the Service runs behind a reverse proxy or
      content delivery network <em>and is configured to trust it</em>, the IP we record is the client address
      that proxy reports; otherwise it is the address of the system that connected to us, which in such a
      deployment may be the proxy rather than you.</p>` },

    { id: 'p7', title: 'Public content', html: `
      <p>The forum is public. Your username, your posts, the time you posted, your join date and your post count
      are visible to anyone visiting the site, including people without an account, and may be indexed by search
      engines and copied or archived by third parties beyond our control.</p>
      <p>Do not post personal information — yours or anyone else's — that you do not want to be public and
      permanent. We are not responsible for information you choose to disclose publicly.</p>` },

    { id: 'p8', title: 'Sharing & disclosure', html: `
      <p>We do not sell your personal data. We may share it in the following circumstances:</p>
      <ul>
        <li><strong>Service providers.</strong> Hosting, storage, content delivery, email delivery, error monitoring, analytics and security providers who process data on our instructions in order to run the Service.</li>
        <li><strong>Legal and safety.</strong> Where we believe in good faith that disclosure is required by applicable law, regulation, legal process or governmental request, or is reasonably necessary to enforce our Terms, investigate suspected fraud or abuse, or protect the rights, property or safety of us, our users or the public.</li>
        <li><strong>Business transfers.</strong> In connection with a merger, acquisition, reorganisation, financing, or sale of all or part of our business or assets, in which case your data may be transferred to the counterparty subject to this policy.</li>
        <li><strong>Affiliates.</strong> With companies under common ownership or control with us, for the purposes described in this policy.</li>
        <li><strong>With your direction.</strong> Where you ask us to share it, or publish it yourself.</li>
        <li><strong>Aggregated or de-identified data.</strong> Statistics that do not identify you may be published or shared freely.</li>
      </ul>` },

    { id: 'p9', title: 'Retention', html: `
      <p>We keep personal data for as long as we consider necessary for the purposes it was collected for. In practice:</p>
      <ul>
        <li><strong>Account data</strong> — for as long as your account is open, and afterwards where we need it for security, legal or dispute-resolution purposes.</li>
        <li><strong>Security and IP logs</strong> — retained for as long as we judge necessary to protect the Service and to detect repeat abuse and ban evasion, which may be indefinitely. This is deliberate: short retention would defeat the purpose of the logs.</li>
        <li><strong>Session records</strong> — deleted automatically when they expire, and immediately when you log out or are banned.</li>
        <li><strong>Forum content</strong> — retained indefinitely as part of the public record of the forum, including after an account is closed.</li>
        <li><strong>Order records</strong> — kept as our record of what was bought and paid for, including after an account is closed, for accounting, tax and dispute-resolution purposes.</li>
        <li><strong>Correspondence</strong> — for as long as needed to handle your request and keep a record of it.</li>
      </ul>
      <p>Where we no longer need data in identifiable form, we may anonymise it and keep it as aggregate
      statistics indefinitely.</p>` },

    { id: 'p10', title: 'Security', html: `
      <p>We take reasonable technical and organisational measures to protect your data, including:</p>
      <ul>
        <li>salted <span class="mono">PBKDF2-HMAC-SHA256</span> password hashing — plain-text passwords are never stored;</li>
        <li>server-side sessions where only a hash of the session token is stored, with <span class="mono">HttpOnly</span> cookies;</li>
        <li>cross-site request forgery protection bound to your session;</li>
        <li>rate limiting on login, sign-up, posting and downloads;</li>
        <li>a proof-of-work human-verification check on sign-up;</li>
        <li>a strict content security policy and other hardened HTTP security headers;</li>
        <li>administrator access restricted to authorised accounts, with every administrative action recorded.</li>
      </ul>
      <p>No online service can be completely secure. You are responsible for keeping your password confidential
      and for the security of the device you use. If we become aware of a breach affecting your personal data,
      we will act in accordance with applicable law.</p>` },

    { id: 'p11', title: 'Your choices & rights', html: `
      <p>You can at any time:</p>
      <ul>
        <li>ask us to correct or update the details on your account;</li>
        <li>stop using the Service and ask us to close your account;</li>
        <li>delete cookies through your browser;</li>
        <li>ask us for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it.</li>
      </ul>
      <p>Depending on where you live, you may have additional statutory rights — for example under the EU or UK
      General Data Protection Regulation, or comparable laws — including rights of access, rectification,
      erasure, restriction, objection, portability, and the right to lodge a complaint with your local
      supervisory authority. We will honour valid requests to the extent applicable law requires.</p>
      <p>To make a request, email ${mailPrivacy} from the address registered to your account. We may ask you for
      information to verify your identity before we act, and we will respond within the period required by
      applicable law.</p>
      <p>Please note two limits. First, we may retain security and IP logs, and records needed to enforce bans or
      to establish, exercise or defend legal claims, even after an account is deleted. Second, deleting an
      account does not delete the threads and replies you posted: removing them would break the conversations
      other members took part in, so they stay on the forum and are <strong>reattributed to
      <span class="mono">[deleted]</span></strong>, with your username removed from them. If a specific post
      needs to come down, ask us and we will consider it on its merits.</p>` },

    { id: 'p12', title: 'International transfers', html: `
      <p>We operate from the ${j}, and our hosting and service providers may be located in other countries. Your
      personal data may therefore be transferred to, stored in and processed in countries whose data-protection
      laws differ from those of your own country and may offer a lower level of protection.</p>
      <p>Where required by applicable law, we put appropriate safeguards in place for such transfers. By using
      the Service, you acknowledge these transfers.</p>` },

    { id: 'p13', title: 'Children', html: `
      <p>The Service is not intended for children under ${esc(c.minimumAge)}, and we do not knowingly collect
      personal data from them. If you believe a child has provided us with personal data, contact ${mailPrivacy}
      and we will delete the account and associated data.</p>` },

    { id: 'p14', title: 'Changes to this policy', html: `
      <p>We may update this Privacy Policy from time to time. We will change the "last updated" date at the top
      of this page and, where the changes are material, make reasonable efforts to notify you through the
      Service. Changes take effect when published, and your continued use of the Service afterwards means you
      accept the updated policy.</p>` },

    { id: 'p15', title: 'Contact', html: contactBlock(c, 'For privacy questions or to exercise your rights, contact us:') },
  ];

  sections.summary = summaryBlock([
    'We collect your username, email address and a hashed password when you sign up.',
    'We log the <strong>IP address, browser and timestamp</strong> of every sign-up, login, failed login, logout and download, for security and abuse prevention.',
    'Forum posts are public and are indexed by search engines.',
    'We use strictly necessary cookies to keep you signed in. We don\'t sell your data.',
    'If you buy a membership we keep an order record; payment runs on our own server and we never see your wallet or card details.',
    'We keep security logs for as long as we consider necessary to protect the Service.',
  ]);

  return render(ctx, {
    title: 'Privacy Policy',
    kicker: '// LEGAL',
    sections,
    updated: `Last updated: ${c.lastUpdated}`,
  });
}

export { terms, privacy };
