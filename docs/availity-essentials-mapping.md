# Availity Essentials — Auth Wizard Mapping (July 2026 live session)

Selector/binding reference for the `availity_essentials` portal recipe, captured
live against Availity Essentials (NC, Kidology account) with real DevTools
snapshots. Bindings in `{braces}` refer to `PortalSubmissionPayload` paths.

## Global facts

- All A&R apps render inside ONE iframe (`clip-ui`, which later navigates to
  `dashboard-ui` mid-wizard — same frame object). Recipe: single
  `useFrame { urlIncludes: "onboarding-ui-apps" }` after the top-nav clicks.
- Element ids contain dots (`search.requestingProvider.npi`) — the engine
  auto-rewrites bare `#id` selectors to `[id="..."]`.
- Select2 widgets: the visible `s2id_autogenNNN` search-input ids are
  UNSTABLE (change every render). The hidden `<select>`s behind them have
  STABLE ids — drive those with the `select` step (engine forces + fires
  change). Ajax code-search Select2s (diagnosis/procedure) have no preloaded
  options — drive by click + `typeActive` + `press Enter`.
- Wizard chrome (stable): `#authWizardNextButton` (Next on steps 1–5,
  **Submit on step 6** — same id!), `#authWizardPreviousButton` (Back).
- Masked inputs (`(___) ___-____`, `__/__/____`): click + type digits via
  `typeActive` with `digits` / value with `dateMMDDYYYY` transforms.

## Navigation (after login)

1. Top document (no frame): click "Patient Registration" (top nav button) →
   click "Authorizations & Referrals".
2. `useFrame onboarding-ui-apps` → click `#NAVIGATION-authorizations` (A&R hub).
3. Click "New Request" → wizard Step 1.

## Step 1 — Start an Authorization  ⚠ hidden-select ids NOT yet captured

- Organization Select2 (single-org account: likely preselected "Kidology Inc")
- Transaction Type Select2 → always **"Outpatient Authorization"**
- Payer Select2 → `{payerName}` (payer-rules `portalPayerName` override wins:
  e.g. directory "CENTENE" → dropdown "CAROLINA COMPLETE HEALTH"; Healthy Blue
  therapy auths must select **"Carelon Medical Benefits Management"** — the
  generic Healthy Blue flow rejects therapy CPTs, see Payer routing below)
- Patient screen (after payer): Review Type = **"Medical Services"** (constant);
  select patient by member id — `[id="subscriber.memberId"]` ←
  `{patient.memberId}`; `[id="patient.birthDate"]` ← `{patient.dob}`
  (mm/dd/yyyy); relationship Select2 ← `{patient.relationshipCode}`
  (18 Self / 01 Spouse / 19 Child / G8 Other)
- Next fires a REAL-TIME ELIGIBILITY CHECK (result banner, e.g. "Status A")
- Anthem payers: ICR routing interstitial may appear
  (`[id="radio.appeals"]`, `[id="radio.rx"]`, `[id="radio.other"]`) —
  handle with `clickIfPresent`
- **TODO: run the hidden-`<select>` snippet on the payer page + patient page
  to get stable ids for the four Select2s above.**

## Step 2 — Requesting Provider  (= ordering/referring physician, Type 1 NPI)

Per biller research: the OPR NPI that must match the claim's referring
provider. NOT the group. (Availity accepted Group + Kidology NPI here in
testing, but that risks claim mismatches.)

- Search By: defaults to NPI ✓
- Provider Type Select2: needs **"Provider"** (individual) for the referring
  physician (hidden select id not captured — TODO with step-1 sweep)
- `[id="search.requestingProvider.npi"]` ← `{referringProvider.npi}`
- Click `input[value="Retrieve Provider Info"]`
- Multi-location NPI results: rows with `input[id^="selectProvider"]`
  buttons, paginated ("review all results pages") — `clickInRow` matching
  `{practice.address.street}` applies only when a Type 2 NPI was searched;
  an individual NPI likely returns a single result (verify)
- Populated form (`requestingProvider.*` ids): `facilityName`, `npi`,
  `addressLine1`, `city`, `zipCode` auto-filled; `contactName` auto-filled
  from the Availity account; **`[id="requestingProvider.phone"]` (required)**
  ← `{practice.phone}` (digits, masked input), `[id="requestingProvider.fax"]`
  (optional) ← `{practice.fax}` — the payer faxes decision letters there
- `#authWizardNextButton`

## Step 3 — Rendering Provider + Service Type / POS

Top of page (shared controls, set once here):

- `select [id="serviceTypeCode"]` ← `{serviceType.code}` — options include
  **PT** - Physical Therapy (NOT X12's AE — Pria translates AE→PT),
  **AD** - Occupational Therapy, **AF** - Speech Therapy
- `select [id="placeOfServiceCode"]` ← `{placeOfService.code}` (11 Office,
  12 Home; also 19/22 hospital)

Rendering provider (= treating therapist, Type 1):

- `[id="copy-prv-info"]` checkbox — label unconfirmed; if it copies Step 2's
  provider it must NOT be used (requesting=physician ≠ service=therapist)
- serviceProvider search: Provider type, `[id="search.renderingProviders.serviceProvider.0.npi"]`
  ← `{provider.npi}` → `input[value="Retrieve Provider Info"]` (2nd instance:
  use `:nth-match(input[value="Retrieve Provider Info"], 1)` within this step's
  screen — only one shows at a time in practice) → location select if
  multi-row (`clickInRow` on `{practice.address.street}`)
- Populated `renderingProviders.serviceProvider.0.*` form: `contactName` NOT
  auto-filled here; phone (required) ← `{practice.phone}`, fax optional
- "Add a Facility (optional)" link → facility search
  `[id="search.renderingProviders.facility.0.npi"]` ← `{practice.npi}`
  (Type 2 group — per biller research the group anchors here so approvals
  don't fragment per-therapist)
- `#authWizardNextButton`

## Step 4 — Add Service Information

- `#fromDate` ← `{startDate}` (dateMMDDYYYY), `#toDate` ← `{endDate}` —
  prefilled from eligibility dates; overwrite
- `#quantity` ← `{requestedVisits}`; `select [id="quantityTypeCode"]` ← `VS`
  (Visits; other options DY/FL/HS/MN)
- `select [id="serviceLevelCode"]` ← `{serviceLevelCode}` — **E = Elective,
  U = Urgent (portal semantics; X12's E means Emergency — payload translates)**
- Diagnosis: ajax Select2 (no preloaded options) — click container, `typeActive`
  `{diagnoses.{i}}`, `press Enter`; "Add another diagnosis code" link for i≥1
  (`forEach` list "diagnoses", startIndex 1)
- Procedures (`forEach` list "procedures"):
  - code: ajax Select2 — type `{procedures.{i}.code}` + Enter
  - `select [id="procedures.{i}.qualifierCode"]` ← `HC` (CPT/HCPCS)
  - `[id="procedures.{i}.serviceQuantity"]` ← `{procedures.{i}.units}` —
    units per visit: PT/OT timed 15-min units (60-min session = 4), ST
    untimed = 1  ⚠ confirm with billers: per-visit vs total-for-auth
  - `select [id="procedures.{i}.serviceQuantityTypeCode"]` ← `FL` (Units)
  - modifier link "Add a modifier code (optional)" — GP/GO/GN question open
  - "Add another procedure code" for i≥1
- `[id="providerNotes.0.message"]` ← `{clinicalNotes}` — SMALL CHAR CAP
  (~264-char counter observed); truncate defensively
- Next → **real-time payer evaluation** → summary screen (frame now
  `dashboard-ui`) with status banner (e.g. "Authorization - Undetermined"),
  Transaction ID, `#printButton`, `#nextStepsButton` (continue). Some
  payers may AUTO-APPROVE here — worker must read the status; instant
  approval ⇒ capture auth number, skip remaining steps.
- `#nextStepsButton` → Step 5

## Step 5 — Add Attachments

- "Add File" button (hidden file input behind it) — attachments SKIPPABLE
  (Next present) for this payer/service; Pria has no doc storage yet →
  recipe clicks Next. If a payer requires files: pause `needs_human`.

## Step 6 — Review and Submit

- Read-only review; per-section edit links (`aria: "step1 memberInfo"` … 
  `"step5 addAttachments"`)
- **Submit is `#authWizardNextButton` (text "Submit")** — same id as Next!
- v1 policy: `pauseForHuman` before submit until trusted; post-submit
  confirmation screen NOT yet captured (need element for `captureText`
  confirmationNumber) — **TODO: snippet the confirmation page on the first
  manual filing.**

## Payer routing learned

- **Healthy Blue NC**: generic wizard REJECTS therapy CPTs (97530 error:
  "Precertification for this code can be submitted … choosing the link
  Carelon Medical Benefits Management or through Provider Portal at
  www.providerportal.com"). Route: select payer **"Carelon Medical Benefits
  Management"** in Step 1 (flow past that unverified) — or Carelon's own
  portal (rehab.carelonmedicalbenefitsmanagement.com, would need its own
  recipe). Set via Payer Rules → portalPayerName.
- **Carolina Complete (Centene)**: directory name "CENTENE"; wizard dropdown
  "CAROLINA COMPLETE…" — portalPayerName override. 6-month auths, ZERO
  unmanaged visits (auth before first treatment; eval exempt).
- Approved-letter facts (Carelon/Healthy Blue, July 2026): 30 visits/6
  months granted; ordering provider on letter = individual therapist;
  servicing facility = group NPI.

## Remaining captures before recipe v1 ships

1. Hidden-`<select>` snippet on Step 1 payer page AND patient page (stable
   ids for organization / transaction type / payer / review type /
   relationship selects).
2. Incognito login → MFA screen (code input + submit selectors) — blocks
   unattended worker login.
3. Post-submit confirmation page (confirmation-number element) — grab during
   the first manual filing.
4. Biller confirmations: per-visit vs total units; GP/GO/GN modifiers;
   attachment requirements per payer; approvals at group vs therapist level.
