import type { X12278Request, X12278Response } from "@pria/shared";

/**
 * EDI Service — X12 278 Prior Authorization Transaction (HIPAA 5010X217)
 *
 * Implements production-quality X12 278 generation and response parsing for
 * PT/OT/ST outpatient therapy prior authorization requests.
 *
 * X12 278 Transaction Set Structure:
 *   ISA/GS envelope
 *   ST*278 transaction header
 *   BHT  — Beginning of Hierarchical Transaction
 *   2000A — UMO/Payer loop           (HL level 20)
 *   2000B — Requester loop           (HL level 21)
 *   2000C — Subscriber loop          (HL level 22)
 *   2000D — Dependent loop           (HL level 23, conditional)
 *   2000E — Patient Event loop       (HL level EV)
 *   2010EA — Rendering Provider loop (no HL; within 2000E)
 *   2000F — Service Line loop        (HL level SS, conditional)
 *   SE/GE/IEA trailers
 */

// ─── Delimiters ───────────────────────────────────────────────────────────────

const SEP = "*";       // Element separator
const COMP = ":";      // Component element separator
const TERM = "~";      // Segment terminator

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pad a string to exactly `len` chars, right-padding with spaces (for ISA fixed-width fields). */
function padRight(s: string, len: number): string {
  return s.slice(0, len).padEnd(len, " ");
}

/**
 * Build an EDI segment with proper element separator and terminator.
 * Trailing empty elements are automatically trimmed (but never the segment ID).
 *
 * Every element is sanitized: X12's element separator (*), segment terminator
 * (~), repetition separator (^), and newlines are replaced with spaces so a
 * practice named "SMITH * ASSOCIATES" or a multi-line note can't inject
 * delimiters and corrupt the transaction. The component separator (:) is NOT
 * stripped here because composite elements (UM04, HI, SV1) are deliberately
 * pre-joined with it — free-text sources should avoid colons upstream.
 */
function seg(id: string, ...elements: (string | number | null | undefined)[]): string {
  const parts: string[] = [id];
  for (const e of elements) {
    parts.push(
      e === null || e === undefined
        ? ""
        : String(e).replace(/[*~^\r\n]/g, " ")
    );
  }
  // Trim trailing empty elements
  while (parts.length > 1 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts.join(SEP) + TERM;
}

/** Convert YYYY-MM-DD to YYYYMMDD */
function date8(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/** Split array into chunks of at most `size` */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── X12 278 Request Generator ────────────────────────────────────────────────

/**
 * Generate a HIPAA 5010X217-compliant X12 278 prior authorization request string.
 *
 * Segment count in SE01 includes all segments from ST through SE (inclusive).
 * ISA/GS/GE/IEA are envelope segments and are NOT counted.
 *
 * @param request Fully-assembled X12278Request (use edi-assembler.service to build from DB)
 * @returns X12 278 EDI string with `~` terminators and newlines between segments
 */
export function generateX278Request(request: X12278Request): string {
  // Transaction-level segments (counted in SE01)
  const txSegs: string[] = [];
  const add = (s: string): void => { txSegs.push(s); };

  const txDate = request.transactionDate; // YYYYMMDD
  const isaDate = txDate.slice(2);         // YYMMDD
  const txTime = request.transactionTime;  // HHMM

  // ISA control number: 9-digit zero-padded, derived from current timestamp
  const isaCtrl = (Date.now() % 1_000_000_000).toString().padStart(9, "0");

  // ── ISA — Interchange Control Header ─────────────────────────────────────
  // All ISA fields are FIXED-WIDTH. Do not use the seg() helper here.
  // ISA06: sender ID  = 15 chars (right-padded)
  // ISA08: receiver ID = 15 chars (right-padded)
  // ISA09: date = 6 chars (YYMMDD)
  // ISA10: time = 4 chars (HHMM)
  // ISA13: control number = 9 chars (zero-padded)
  const isaLine = [
    "ISA",
    "00",
    "          ",   // ISA02: 10 spaces (no auth info)
    "00",
    "          ",   // ISA04: 10 spaces (no security info)
    request.ediSenderQualifier,
    padRight(request.ediSenderId, 15),
    request.ediReceiverQualifier,
    padRight(request.ediReceiverId, 15),
    isaDate,
    txTime,
    "^",            // ISA11: repetition separator
    "00501",        // ISA12: version
    isaCtrl,        // ISA13: interchange control number
    "0",            // ISA14: ACK not requested
    "P",            // ISA15: Production (use 'T' for test)
    ":",            // ISA16: component element separator
  ].join(SEP) + TERM;

  // ── GS — Functional Group Header ─────────────────────────────────────────
  const gsLine = seg(
    "GS",
    "HS",                       // GS01: Health Care Services Review
    request.ediSenderId,        // GS02: application sender ID
    request.ediReceiverId,      // GS03: application receiver ID
    txDate,                     // GS04: YYYYMMDD
    txTime,                     // GS05: HHMM
    "1",                        // GS06: group control number
    "X",                        // GS07: responsible agency (X12)
    "005010X217"                // GS08: version/release ID
  );

  // ── ST — Transaction Set Header ───────────────────────────────────────────
  add(seg("ST", "278", "0001", "005010X217"));

  // ── BHT — Beginning of Hierarchical Transaction ───────────────────────────
  // BHT01: 0007 = Referral / Prior Authorization
  // BHT02: 13   = Request (01=Cancellation, 02=Modification, 13=Request)
  // BHT06: RQ   = Request
  add(seg("BHT", "0007", "13", request.transactionId, txDate, txTime, "RQ"));

  // ─────────────────────────────────────────────────────────────────────────
  // HL counter — each hierarchical level gets a sequential integer ID
  // ─────────────────────────────────────────────────────────────────────────
  let hlCounter = 0;
  const nextHL = (): number => ++hlCounter;

  // ── 2000A — UMO/Payer Loop ────────────────────────────────────────────────
  // HL level code 20 = Information Receiver (UMO/Payer)
  const hlUMO = nextHL(); // 1
  add(seg("HL", hlUMO, "", "20", "1"));

  // NM1 — Payer/UMO identification
  // NM101: X3 = Utilization Management Organization
  // NM102: 2  = Non-Person Entity
  add(seg(
    "NM1", "X3", "2",
    request.payer.name,
    "", "", "", "",           // NM104-NM107 (empty for org)
    request.payer.idQualifier, // NM108: PI or 46
    request.payer.ediId        // NM109: EDI payer ID
  ));

  // ── 2000B — Requester/Submitting Provider Loop ────────────────────────────
  // HL level code 21 = Provider (Requesting Provider)
  const hlReq = nextHL(); // 2
  add(seg("HL", hlReq, hlUMO, "21", "1"));

  // NM1 — Requesting Provider (Group Practice)
  // NM101: 1P = Requesting Provider/Group
  // NM102: 2  = Non-Person Entity
  add(seg(
    "NM1", "1P", "2",
    request.submitter.practiceName,
    "", "", "", "",         // NM104-NM107 empty (org)
    "XX",                   // NM108: XX = NPI
    request.submitter.groupNpi // NM109: group NPI
  ));

  // N3 — Requester street address
  add(seg("N3", request.submitter.address.street));

  // N4 — Requester city/state/zip
  add(seg("N4",
    request.submitter.address.city,
    request.submitter.address.state,
    request.submitter.address.zip
  ));

  // PER — Requester contact (phone required; fax optional)
  {
    const perParts: (string | number | null | undefined)[] = [
      "IC",                            // PER01: IC = Information Contact
      request.submitter.practiceName,  // PER02: contact name
      "TE",                            // PER03: TE = Telephone
      request.submitter.phone,         // PER04: phone number
    ];
    if (request.submitter.fax) {
      perParts.push("FX", request.submitter.fax); // PER05-06: fax
    }
    add(seg("PER", ...perParts));
  }

  // PRV — Provider taxonomy (practice/group level)
  // PRV01: RF = Referring Provider (role of the requesting entity)
  // PRV02: PXC = Health Care Provider Taxonomy Code
  if (request.submitter.taxonomyCodes.length > 0) {
    add(seg("PRV", "RF", "PXC", request.submitter.taxonomyCodes[0]));
  }

  // ── 2000C — Subscriber Loop ───────────────────────────────────────────────
  // HL level code 22 = Subscriber
  // Child indicator always "1" because 2000D or 2000E follows
  const hasDependent = !!request.dependent;
  const hlSub = nextHL(); // 3
  add(seg("HL", hlSub, hlReq, "22", "1"));

  // NM1 — Subscriber/Insured identification
  // NM101: IL = Insured or Subscriber
  // NM102: 1  = Person
  add(seg(
    "NM1", "IL", "1",
    request.subscriber.lastName,    // NM103
    request.subscriber.firstName,   // NM104
    request.subscriber.middleName || "", // NM105
    "", "",                          // NM106-NM107 (empty)
    "MI",                            // NM108: MI = Member ID
    request.subscriber.memberId      // NM109
  ));

  // DMG — Subscriber demographics
  if (request.subscriber.dob || request.subscriber.gender) {
    add(seg(
      "DMG",
      "D8",                                                            // DMG01: format
      request.subscriber.dob ? date8(request.subscriber.dob) : "",    // DMG02: YYYYMMDD
      request.subscriber.gender || ""                                  // DMG03: M/F/U
    ));
  }

  // REF — Group/plan number (1L = Group or Policy Number)
  if (request.subscriber.groupNumber) {
    add(seg("REF", "1L", request.subscriber.groupNumber));
  }

  // N3/N4 — Subscriber address (situational; include when available)
  if (request.subscriber.address) {
    add(seg("N3", request.subscriber.address.street));
    add(seg("N4",
      request.subscriber.address.city,
      request.subscriber.address.state,
      request.subscriber.address.zip
    ));
  }

  // ── 2000D — Dependent/Patient Loop (conditional) ─────────────────────────
  // Only present when patient is NOT the subscriber (relationship ≠ '18')
  // HL level code 23 = Dependent
  let hlEventParent = hlSub; // default: event loop parent is subscriber
  if (hasDependent && request.dependent) {
    const hlDep = nextHL(); // 4 (when dependent present)
    hlEventParent = hlDep;
    add(seg("HL", hlDep, hlSub, "23", "1"));

    // NM1 — Dependent/Patient identification
    // NM101: QC = Patient
    // NM102: 1  = Person
    // Note: dependent NM1 typically does not include a separate member ID
    add(seg(
      "NM1", "QC", "1",
      request.dependent.lastName,   // NM103
      request.dependent.firstName,  // NM104
      request.dependent.middleName || "" // NM105
    ));

    // DMG — Dependent demographics
    if (request.dependent.dob || request.dependent.gender) {
      add(seg(
        "DMG",
        "D8",
        request.dependent.dob ? date8(request.dependent.dob) : "",
        request.dependent.gender || ""
      ));
    }

    // INS — Insured Benefit
    // INS01: N = Not the subscriber (dependent)
    // INS02: relationship code (01=Spouse, 19=Child, etc.)
    add(seg("INS", "N", request.dependent.relationshipCode));
  }

  // ── 2000E — Patient Event Loop ────────────────────────────────────────────
  // HL level code EV = Patient Event (the authorization request itself)
  // Child indicator: "1" if service lines (2000F) follow, "0" otherwise
  const hasServiceLines = !!(request.serviceLines && request.serviceLines.length > 0);
  const hlEvent = nextHL();
  add(seg("HL", hlEvent, hlEventParent, "EV", hasServiceLines ? "1" : "0"));

  // TRN — Trace Number
  // TRN01: 1 = Current Transaction Trace Numbers
  // TRN02: trace reference (internal tracking number)
  // TRN03: originating company (group NPI as 10-digit identifier)
  add(seg("TRN", "1", request.authRequest.traceNumber, request.submitter.groupNpi));

  // UM — Utilization Management Request
  // UM01: Request Category Code (HS = Health Services Review)
  // UM02: Certification Type Code (I=Initial, R=Renewal, S=Revised, A=Admission)
  // UM03: Service Type Code (AE=PT, AD=OT, AF=Speech)
  // UM04: Health Care Service Location (facility type : claim type)
  //        UM04-1 facility type: 11=Office, 22=Outpatient Hospital
  //        UM04-2 claim type: B=Professional, A=Institutional
  // UM05: Related Causes Code (accident indicator — omitted when not applicable)
  // UM06: Level of Service Code (E=Emergency, U=Urgent, R=Routine)
  // UM07-UM08: optional (health condition, prognosis)
  // UM09: Y = Release of information authorized
  add(seg(
    "UM",
    request.authRequest.requestCategoryCode,   // UM01
    request.authRequest.certificationTypeCode, // UM02
    request.authRequest.serviceTypeCode,       // UM03
    `${request.submitter.facilityTypeCode}${COMP}${request.submitter.claimType}`, // UM04
    "",                                         // UM05 (accident indicator — not used)
    request.authRequest.levelOfServiceCode || "", // UM06
    "",                                         // UM07
    "",                                         // UM08
    "Y"                                         // UM09: release of info
  ));

  // HI — Health Diagnosis Codes
  // 5010 ICD-10-CM qualifiers: ABK = principal diagnosis, ABF = additional.
  // (BK/BF are the ICD-9 equivalents — using BF for ICD-10 was incorrect.)
  // X12 allows up to 12 composite elements per HI segment.
  if (request.authRequest.diagnoses.length > 0) {
    let emitted = 0;
    for (const diagChunk of chunk(request.authRequest.diagnoses, 12)) {
      const hiElements = diagChunk.map((code) => {
        const qualifier = emitted === 0 ? "ABK" : "ABF";
        emitted++;
        return `${qualifier}${COMP}${code}`;
      });
      add(["HI", ...hiElements].join(SEP) + TERM);
    }
  }

  // DTP — Service Date Range
  // Qualifier 291 = Requested Service Date
  // RD8 format = YYYYMMDD-YYYYMMDD (range); D8 = single date
  if (request.authRequest.startDate && request.authRequest.endDate) {
    add(seg("DTP", "291", "RD8",
      `${date8(request.authRequest.startDate)}-${date8(request.authRequest.endDate)}`
    ));
  } else if (request.authRequest.startDate) {
    add(seg("DTP", "291", "D8", date8(request.authRequest.startDate)));
  }

  // DTP — Onset/Injury Date (qualifier 439)
  if (request.authRequest.onsetDate) {
    add(seg("DTP", "439", "D8", date8(request.authRequest.onsetDate)));
  }

  // HSD — Health Care Services Delivery (visit pattern)
  // HSD01: VS = Visits, UN = Units (15-min)
  // HSD02: quantity per period (e.g. 2 visits)
  // HSD03: period type (DA=Day, WK=Week, MO=Month)
  // HSD04: number of periods (e.g. 6 weeks)
  // HSD05: time period qualifier (35 = estimated)
  // HSD06: total duration (e.g. 42 days)
  if (request.authRequest.visitPattern) {
    const vp = request.authRequest.visitPattern;
    add(seg(
      "HSD",
      "VS",                  // HSD01: visits
      vp.visitsPerPeriod,    // HSD02: visits per period
      vp.periodFrequency,    // HSD03: DA/WK/MO
      vp.periodCount,        // HSD04: number of periods
      vp.totalDurationDays ? "35" : "", // HSD05: time period qualifier
      vp.totalDurationDays || ""        // HSD06: total duration days
    ));
  } else if (
    request.authRequest.requestedVisits &&
    request.authRequest.requestedVisits > 0
  ) {
    // Fallback: no structured pattern, but a total visit count was requested.
    // Without this, the common create-form path (requestedVisits only) sent
    // authorizations with NO quantity at all.
    add(seg("HSD", "VS", request.authRequest.requestedVisits));
  }

  // REF — Previous Authorization Number (qualifier 9F = Prior Authorization Number)
  if (request.authRequest.previousAuthNumber) {
    add(seg("REF", "9F", request.authRequest.previousAuthNumber));
  }

  // MSG — Clinical Notes / Free-Text Message to UMO
  // Max 264 chars per X12 spec; strip ALL reserved chars incl. newlines and
  // the component separator (free text has no legitimate composites).
  if (request.authRequest.clinicalNotes) {
    const msgText = request.authRequest.clinicalNotes
      .substring(0, 264)
      .replace(/[*~:^\r\n]/g, " ");
    add(seg("MSG", msgText));
  }

  // ── 2010EA — Rendering/Treating Provider Loop ─────────────────────────────
  // Note: 2010EA does NOT have an HL segment; it's part of the 2000E loop.
  // NM101: 71 = Attending Provider (rendering therapist)
  // NM102: 1  = Person
  const prov = request.provider;
  add(seg(
    "NM1", "71", "1",
    prov.lastName,   // NM103
    prov.firstName,  // NM104
    "", "", "",      // NM105-NM107 (empty)
    "XX",            // NM108: XX = NPI
    prov.npi         // NM109: individual NPI
  ));

  // REF — State License Number (0B = State License Number)
  // Situational; many payers require for therapy providers
  if (prov.stateLicenseNumber) {
    add(seg("REF", "0B", prov.stateLicenseNumber));
  }

  // N3/N4 — Provider address (situational)
  if (prov.address) {
    add(seg("N3", prov.address.street));
    add(seg("N4", prov.address.city, prov.address.state, prov.address.zip));
  }

  // PER — Provider contact (situational)
  if (prov.phone) {
    add(seg("PER", "IC", `${prov.lastName} ${prov.firstName}`, "TE", prov.phone));
  }

  // PRV — Provider taxonomy
  // PRV01: PE = Performing Provider (role for rendering therapist)
  // PRV02: PXC = Health Care Provider Taxonomy Code
  add(seg("PRV", "PE", "PXC", prov.taxonomyCode));

  // ── 2000F — Service Line Loops (conditional) ─────────────────────────────
  // Only present when individual CPT service lines need separate authorization.
  // HL level code SS = Service (leaf level; child indicator always 0)
  if (hasServiceLines && request.serviceLines) {
    for (const line of request.serviceLines) {
      const hlSvc = nextHL();
      add(seg("HL", hlSvc, hlEvent, "SS", "0"));

      // SV1 — Professional Service
      // SV101: composite (HC = HCPCS/CPT : code : modifier1 : modifier2 ...)
      // SV102: monetary amount (blank in 278)
      // SV103: unit basis (UN = Units/15-min, VS = Visits)
      // SV104: quantity
      const modParts = line.modifiers && line.modifiers.length > 0 ? line.modifiers : [];
      const sv1Code = ["HC", line.cptCode, ...modParts].join(COMP);
      const units = line.units ?? 1;
      const unitType = line.unitType ?? "UN";
      add(seg("SV1", sv1Code, "", unitType, units));
    }
  }

  // ── SE — Transaction Set Trailer ─────────────────────────────────────────
  // SE01: segment count from ST through SE inclusive
  const segCount = txSegs.length + 1; // +1 for SE itself
  add(seg("SE", segCount, "0001"));

  // ── Assemble full EDI interchange ─────────────────────────────────────────
  const lines = [
    isaLine,
    gsLine,
    ...txSegs,
    seg("GE", "1", "1"),          // GE: 1 transaction in group
    seg("IEA", "1", isaCtrl),     // IEA: 1 functional group in interchange
  ];

  return lines.join("\n");
}

// ─── X12 278 Response Parser ─────────────────────────────────────────────────

/**
 * Parse a 278-11 (Health Care Services Review — Response) EDI transaction.
 *
 * Key segments parsed:
 *   HCR — Health Care Review Information (decision code + auth number)
 *   REF*G1 — Prior Authorization Number (fallback if not in HCR)
 *   AAA — Request Validation (error indicator)
 *   DTP — Certification period dates (when separate from HCR)
 */
export function parseX278Response(rawEdi: string): X12278Response {
  // Split on segment terminator ~ and clean up whitespace/newlines
  const rawSegments = rawEdi
    .split("~")
    .map((s) => s.replace(/[\r\n]/g, "").trim())
    .filter((s) => s.length > 0);

  // Extract transaction ID from ST segment
  const stSeg = rawSegments.find((s) => s.startsWith("ST*278"));
  const transactionId = stSeg ? (stSeg.split("*")[2] ?? "UNKNOWN") : "UNKNOWN";

  let status: X12278Response["status"] = "pending";
  let authNumber: string | null = null;
  let decisionCode: string | undefined;
  let certificationPeriodStart: string | undefined;
  let certificationPeriodEnd: string | undefined;
  let message = "Authorization pending payer review";

  // ── HCR — Health Care Review Information ──────────────────────────────────
  // HCR01: Action Code
  //   A1 = Certified / Approved
  //   A2 = Modified (approved with modifications)
  //   A3 = Not Certified / Denied
  //   A4 = Pended (additional information required)
  //   A7 = Modified / Pended
  //   A8 = Pended — Awaiting additional clinical information
  //   A9 = Pending
  // HCR02: Reference Identification (auth number when certified)
  // HCR03: Certification period start (YYYYMMDD, optional)
  // HCR04: Certification period end  (YYYYMMDD, optional)
  const hcrSeg = rawSegments.find((s) => s.startsWith("HCR*"));
  if (hcrSeg) {
    const parts = hcrSeg.split("*");
    decisionCode = parts[1] ?? undefined;
    authNumber = parts[2] || null;

    // Parse certification period from HCR03/HCR04
    // Some payers send as HCR03=YYYYMMDD-YYYYMMDD (range) or separate fields
    const certField3 = parts[3] ?? "";
    const certField4 = parts[4] ?? "";

    if (certField3.includes("-")) {
      // Range format: YYYYMMDD-YYYYMMDD
      const [start, end] = certField3.split("-");
      certificationPeriodStart = start || undefined;
      certificationPeriodEnd = end || undefined;
    } else {
      certificationPeriodStart = certField3 || undefined;
      certificationPeriodEnd = certField4 || undefined;
    }

    // Map HCR01 action code to status
    switch (decisionCode) {
      case "A1":
        status = "approved";
        message = "Authorization certified and approved";
        break;
      case "A2":
        status = "modified";
        message = "Authorization approved with modifications";
        break;
      case "A3":
        status = "denied";
        message = "Authorization not certified — denied by payer";
        break;
      case "A4":
      case "A7":
      case "A8":
      case "A9":
        status = "pending";
        message = "Authorization pended — additional information required";
        break;
      default:
        status = "pending";
        message = `Authorization response received (decision code: ${decisionCode ?? "unknown"})`;
    }
  }

  // ── REF*G1 — Prior Authorization Number (fallback) ────────────────────────
  if (!authNumber) {
    const refG1 = rawSegments.find((s) => s.startsWith("REF*G1*"));
    if (refG1) {
      authNumber = refG1.split("*")[2] ?? null;
    }
  }

  // ── DTP — Certification period (when sent separately from HCR) ────────────
  if (!certificationPeriodStart) {
    // Look for DTP*435 = Admission Date Range, or DTP*290 = Certification period
    const dtpCert = rawSegments.find(
      (s) => s.startsWith("DTP*290*") || s.startsWith("DTP*435*")
    );
    if (dtpCert) {
      const parts = dtpCert.split("*");
      const dateValue = parts[3] ?? "";
      if (parts[2] === "RD8" && dateValue.includes("-")) {
        const [start, end] = dateValue.split("-");
        certificationPeriodStart = start || undefined;
        certificationPeriodEnd = end || undefined;
      } else if (parts[2] === "D8") {
        certificationPeriodStart = dateValue || undefined;
      }
    }
  }

  // ── HSD — Certified visit count (HSD*VS*n), when the payer returns one ────
  // Critical for A2 (modified) decisions: the payer may certify FEWER visits
  // than requested, and without this the record looks fully approved.
  let certifiedVisits: number | undefined;
  const hsdSeg = rawSegments.find((s) => s.startsWith("HSD*"));
  if (hsdSeg) {
    const parts = hsdSeg.split("*");
    if (parts[1] === "VS") {
      const n = parseInt(parts[2] ?? "", 10);
      if (Number.isFinite(n) && n > 0) certifiedVisits = n;
    }
  }

  // ── AAA — Request Validation (error) ─────────────────────────────────────
  if (status === "pending" && !hcrSeg) {
    const aaaSeg = rawSegments.find((s) => s.startsWith("AAA*"));
    if (aaaSeg) {
      const parts = aaaSeg.split("*");
      if (parts[1] === "N") {
        status = "error";
        message = parts[3]
          ? `Authorization request error: ${parts[3]}`
          : "Authorization request rejected — validation failed";
      }
    }
  }

  return {
    transactionId,
    authNumber,
    status,
    decisionCode,
    message,
    certificationPeriodStart,
    certificationPeriodEnd,
    certifiedVisits,
    rawSegments,
  };
}

// ─── Clearinghouse Submission ─────────────────────────────────────────────────

/**
 * Submit EDI transaction to clearinghouse.
 *
 * Production implementation: POST to clearinghouse API (Availity, Change Healthcare,
 * Waystar, etc.) with proper authentication and error handling.
 * This stub simulates the async submission and always returns accepted.
 */
export async function submitToClearinghouse(
  ediContent: string,
  payerId: string
): Promise<{ submissionId: string; status: "accepted" | "rejected"; errors: string[] }> {
  console.log(`[EDI] Submitting to clearinghouse for payer ${payerId}`);
  console.log(`[EDI] EDI content: ${ediContent.length} chars, ${ediContent.split("~").length - 1} segments`);

  // TODO: Replace with actual clearinghouse API call
  // Example: POST https://api.clearinghouse.com/v1/278
  // Headers: Authorization: Bearer <token>, Content-Type: application/edi-x12
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    submissionId: `SUB-${Date.now()}`,
    status: "accepted",
    errors: [],
  };
}

// ─── Status Inquiry ───────────────────────────────────────────────────────────

/**
 * Submit an X12 278I inquiry (status check) for an existing prior authorization.
 *
 * Production implementation: construct and submit a 278I transaction to the
 * clearinghouse to get a real-time status on a pended authorization.
 * This stub returns a static pending response.
 */
export async function inquireAuthStatus(
  authNumber: string,
  payerId: string
): Promise<{ status: string; message: string; details: Record<string, unknown> }> {
  console.log(`[EDI] Checking status for auth ${authNumber} with payer ${payerId}`);

  // TODO: Replace with actual 278I inquiry transaction
  return {
    status: "pending",
    message: "Authorization under review",
    details: {
      authNumber,
      payerId,
      checkedAt: new Date().toISOString(),
    },
  };
}
