import { randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { generateX278Request } from "./edi.service.js";
import type { X12278Request, ServiceLine } from "@pria/shared";
import {
  DISCIPLINE_TO_SERVICE_TYPE,
  DISCIPLINE_TO_MODIFIER,
  DISCIPLINE_TAXONOMY_DEFAULTS,
} from "@pria/shared";

const {
  authorizations,
  practices,
  patients,
  providers,
  payers,
} = schema;

// ─── Inferred DB types ────────────────────────────────────────────────────────

type AuthRow = typeof authorizations.$inferSelect;
type PracticeRow = typeof practices.$inferSelect;
type ProviderRow = typeof providers.$inferSelect;
type PatientRow = typeof patients.$inferSelect;
type PayerRow = typeof payers.$inferSelect;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AssembleResult {
  /** Fully-assembled X12278Request ready to pass to generateX278Request() */
  request: X12278Request;
  /** Non-fatal warnings about missing recommended fields */
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  /** Hard errors — 278 cannot be generated without fixing these */
  errors: string[];
  /** Soft warnings — 278 can be generated but quality/acceptance may suffer */
  warnings: string[];
}

// ─── Main assembler ───────────────────────────────────────────────────────────

/**
 * Assemble an X12278Request from database records.
 *
 * This is the bridge between the PRIA data model and the EDI generator.
 * It loads all related records, validates required fields, auto-populates
 * values that can be derived from provider discipline and clinic config,
 * and builds the final X12278Request.
 *
 * Subscriber vs. Dependent logic:
 *   - patient.relationshipToSubscriber === '18' → patient IS the subscriber
 *     (subscriber = patient fields; no dependent loop)
 *   - Any other relationship code → patient is a dependent
 *     (subscriber = patient's subscriber* fields; dependent = patient fields)
 *
 * @param authorizationId  - Authorization record ID
 * @param practiceId       - Practice record ID (for ownership validation)
 * @returns AssembleResult  - { request: X12278Request, warnings: string[] }
 * @throws Error if authorization not found, clinic config missing, or required fields invalid
 */
export async function assembleX278Request(
  authorizationId: string,
  practiceId: string
): Promise<AssembleResult> {
  // ── Load authorization with all relations ─────────────────────────────────
  const auth = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
    with: {
      practice: true,
      patient: true,
      payer: true,
      provider: true,
    },
  });

  if (!auth) {
    throw new Error(
      `Authorization ${authorizationId} not found for practice ${practiceId}`
    );
  }

  const { patient, payer } = auth;
  const practice: PracticeRow = auth.practice;
  const provider: ProviderRow | null = auth.provider ?? null;
  const clinicConfig = practice.clinicConfig;

  if (!clinicConfig) {
    throw new Error(
      `Practice ${practiceId} has no clinic configuration. ` +
      `Please complete onboarding before submitting X12 278 transactions.`
    );
  }

  // ── Validate required fields ──────────────────────────────────────────────
  const validation = validateFor278(auth, practice, provider, patient, payer);
  if (!validation.valid) {
    throw new Error(
      `Authorization ${authorizationId} is not ready for 278 generation:\n` +
      validation.errors.map((e) => `  • ${e}`).join("\n")
    );
  }

  const warnings = [...validation.warnings];

  // ── Generate/persist internal tracking number ─────────────────────────────
  // Second-granularity alone collides for concurrent submits, so a random
  // suffix is appended, and the write is guarded on the column still being
  // null; if a concurrent run won the race, its value is re-read and used.
  let trackingNumber = auth.internalTrackingNumber;
  if (!trackingNumber) {
    const pad = (n: number, len: number): string => String(n).padStart(len, "0");
    const now = new Date();
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const candidate = [
      "PRIA",
      now.getFullYear(),
      pad(now.getMonth() + 1, 2),
      pad(now.getDate(), 2),
      pad(now.getHours(), 2),
      pad(now.getMinutes(), 2),
      pad(now.getSeconds(), 2),
      suffix,
    ].join("");

    const [claimed] = await db
      .update(authorizations)
      .set({ internalTrackingNumber: candidate, updatedAt: new Date() })
      .where(
        and(
          eq(authorizations.id, authorizationId),
          isNull(authorizations.internalTrackingNumber)
        )
      )
      .returning({ trackingNumber: authorizations.internalTrackingNumber });

    if (claimed?.trackingNumber) {
      trackingNumber = claimed.trackingNumber;
    } else {
      // A concurrent run already assigned one — use theirs.
      const fresh = await db.query.authorizations.findFirst({
        columns: { internalTrackingNumber: true },
        where: eq(authorizations.id, authorizationId),
      });
      trackingNumber = fresh?.internalTrackingNumber ?? candidate;
    }
  }

  // ── Current timestamp for transaction envelope ────────────────────────────
  const now = new Date();
  const p2 = (n: number): string => String(n).padStart(2, "0");
  const transactionDate = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
  const transactionTime = `${p2(now.getHours())}${p2(now.getMinutes())}`;

  // ── Auto-populate service type code from provider discipline ──────────────
  let serviceTypeCode = auth.serviceTypeCode;
  if (!serviceTypeCode && provider) {
    const disc = provider.discipline as "PT" | "OT" | "ST";
    if (disc in DISCIPLINE_TO_SERVICE_TYPE) {
      serviceTypeCode = DISCIPLINE_TO_SERVICE_TYPE[disc];
    }
  }
  if (!serviceTypeCode) {
    serviceTypeCode = "AE"; // default to Physical Medicine/PT
    warnings.push(
      "Service type code defaulted to AE (Physical Medicine/PT) — verify for this discipline"
    );
  }

  // ── Request category and certification type defaults ──────────────────────
  const requestCategoryCode =
    auth.requestCategoryCode ?? clinicConfig.requestCategoryCode ?? "HS";

  const certificationTypeCode = auth.certificationTypeCode ?? "I";

  if (!auth.certificationTypeCode) {
    warnings.push("Certification type defaulted to I (Initial) — update auth record if this is a renewal");
  }

  // ── Place of service / facility type ─────────────────────────────────────
  const facilityTypeCode = auth.placeOfServiceCode ?? clinicConfig.facilityTypeCode ?? "11";

  // ── Diagnoses — merge auth ICD codes with patient diagnosis codes ─────────
  const diagnosisSet = new Set<string>([
    ...(auth.icdCodes ?? []),
    ...(patient.diagnosisCodes ?? []),
  ]);
  const diagnoses = Array.from(diagnosisSet);

  // ── Service lines — auto-inject discipline modifier if missing ────────────
  let serviceLines: ServiceLine[] | undefined;
  if (auth.serviceLines && auth.serviceLines.length > 0) {
    serviceLines = auth.serviceLines.map((line) => {
      if (!provider) return line;
      const disc = provider.discipline as "PT" | "OT" | "ST";
      const defaultMod = disc in DISCIPLINE_TO_MODIFIER
        ? DISCIPLINE_TO_MODIFIER[disc]
        : null;
      if (defaultMod && !(line.modifiers?.includes(defaultMod))) {
        return {
          ...line,
          modifiers: [defaultMod, ...(line.modifiers ?? [])],
        };
      }
      return line;
    });
  }

  // ── Subscriber vs. Dependent logic ───────────────────────────────────────
  const isSelf = patient.relationshipToSubscriber === "18";

  const subscriberData: X12278Request["subscriber"] = isSelf
    ? {
        // Patient IS the subscriber
        lastName: patient.lastName,
        firstName: patient.firstName,
        middleName: patient.middleName ?? undefined,
        memberId: patient.memberId,
        dob: patient.dob,
        gender: (patient.gender as "M" | "F" | "U") ?? undefined,
        address: patient.address ?? undefined,
        groupNumber: patient.groupNumber ?? undefined,
      }
    : {
        // Patient is a dependent — subscriber fields come from patient.subscriber* columns
        lastName: patient.subscriberLastName ?? "",
        firstName: patient.subscriberFirstName ?? "",
        middleName: patient.subscriberMiddleName ?? undefined,
        memberId: patient.subscriberMemberId ?? patient.memberId,
        dob: patient.subscriberDob ?? undefined,
        gender: (patient.subscriberGender as "M" | "F" | "U") ?? undefined,
        address: patient.subscriberAddress ?? undefined,
        groupNumber: patient.groupNumber ?? undefined,
      };

  const dependentData: X12278Request["dependent"] = isSelf
    ? undefined
    : {
        // Patient is the dependent
        lastName: patient.lastName,
        firstName: patient.firstName,
        middleName: patient.middleName ?? undefined,
        dob: patient.dob,
        gender: (patient.gender as "M" | "F" | "U") ?? undefined,
        relationshipCode: patient.relationshipToSubscriber,
      };

  // ── Provider data ─────────────────────────────────────────────────────────
  // Fall back to discipline taxonomy default if provider's code is missing
  let providerTaxonomy = provider?.taxonomyCode ?? "";
  if (!providerTaxonomy && provider) {
    const disc = provider.discipline as "PT" | "OT" | "ST";
    if (disc in DISCIPLINE_TAXONOMY_DEFAULTS) {
      providerTaxonomy = DISCIPLINE_TAXONOMY_DEFAULTS[disc];
      warnings.push(
        `Provider taxonomy code not set — using discipline default ${providerTaxonomy} for ${disc}`
      );
    }
  }

  const providerData: X12278Request["provider"] = {
    providerId: provider?.id ?? "",
    lastName: provider?.lastName ?? "UNKNOWN",
    firstName: provider?.firstName ?? "",
    npi: provider?.npi ?? "",
    taxonomyCode: providerTaxonomy,
    stateLicenseNumber: provider?.stateLicenseNumber ?? undefined,
    // Use practice address as fallback since providers rarely have their own address on file
    address: practice.address,
    phone: practice.phone,
  };

  // ── Assemble X12278Request ────────────────────────────────────────────────
  const request: X12278Request = {
    // BHT / transaction envelope
    transactionId: trackingNumber,
    transactionDate,
    transactionTime,

    // ISA/GS — EDI interchange credentials (from clinic config)
    ediSenderQualifier: clinicConfig.ediSenderQualifier,
    ediSenderId: clinicConfig.ediSenderId,
    ediReceiverQualifier: clinicConfig.ediReceiverQualifier,
    ediReceiverId: clinicConfig.ediReceiverId,

    // 2000A — Payer/UMO
    payer: {
      name: payer.name,
      ediId: payer.payerId,
      idQualifier: payer.payerIdQualifier as "PI" | "46",
    },

    // 2000B — Requester (Group Practice)
    submitter: {
      practiceId: practice.id,
      practiceName: practice.name,
      groupNpi: practice.npi,
      taxonomyCodes: clinicConfig.taxonomyCodes,
      address: practice.address,
      phone: practice.phone,
      fax: practice.fax ?? undefined,
      facilityTypeCode,
      claimType: clinicConfig.claimType,
    },

    // 2000E — Patient Event / Authorization Request
    authRequest: {
      requestCategoryCode,
      certificationTypeCode,
      serviceTypeCode,
      levelOfServiceCode: auth.levelOfServiceCode ?? undefined,
      traceNumber: trackingNumber,
      diagnoses,
      startDate: auth.startDate ?? undefined,
      endDate: auth.endDate ?? undefined,
      onsetDate: auth.onsetDate ?? undefined,
      visitPattern: auth.visitPattern ?? undefined,
      requestedVisits: auth.requestedVisits ?? undefined,
      previousAuthNumber: auth.previousAuthNumber ?? undefined,
      clinicalNotes: auth.clinicalNotes ?? undefined,
    },

    // 2010EA — Rendering/Treating Provider
    provider: providerData,

    // 2000C — Subscriber
    subscriber: subscriberData,

    // 2000D — Dependent (only when patient ≠ subscriber)
    dependent: dependentData,

    // 2000F — Service Lines (optional)
    serviceLines: serviceLines ?? undefined,
  };

  return { request, warnings };
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewResult {
  /** True when all required fields are present and the 278 could be generated. */
  valid: boolean;
  /** Hard errors that block generation (empty when valid). */
  errors: string[];
  /** Non-fatal warnings about missing recommended fields. */
  warnings: string[];
  /** The generated X12 278 string, or null when not valid. */
  edi: string | null;
}

/**
 * Validate an authorization for 278 generation and, when valid, return the
 * generated X12 278 — without throwing. Powers the "Preview 278" UI so users
 * can see exactly what will be sent (and what's missing) before submitting.
 */
export async function previewX278(
  authorizationId: string,
  practiceId: string
): Promise<PreviewResult> {
  const auth = await db.query.authorizations.findFirst({
    where: and(
      eq(authorizations.id, authorizationId),
      eq(authorizations.practiceId, practiceId)
    ),
    with: { practice: true, patient: true, payer: true, provider: true },
  });

  if (!auth) {
    throw new Error(`Authorization ${authorizationId} not found`);
  }

  const validation = validateFor278(
    auth,
    auth.practice,
    auth.provider ?? null,
    auth.patient,
    auth.payer
  );

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      warnings: validation.warnings,
      edi: null,
    };
  }

  const { request, warnings } = await assembleX278Request(authorizationId, practiceId);
  const edi = generateX278Request(request);

  return { valid: true, errors: [], warnings, edi };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate all required and recommended fields for X12 278 generation.
 *
 * Required fields (errors — block generation):
 *   - Practice: NPI, clinic config with EDI credentials and taxonomy codes
 *   - Payer: EDI payer ID
 *   - Patient: memberId, firstName, lastName, dob
 *   - Dependent situation: subscriberLastName/FirstName when patient is dependent
 *   - Provider: NPI
 *   - Authorization: at least one diagnosis code
 *
 * Recommended fields (warnings — generation proceeds):
 *   - Service dates, visit pattern, level of service
 *   - Provider state license number
 *   - Certification type code
 *
 * @param auth     Authorization record (with icdCodes)
 * @param practice Practice record (with clinicConfig and npi)
 * @param provider Provider record or null if not yet assigned
 * @param patient  Patient record (with memberId, dob, subscriber fields)
 * @param payer    Payer record (with payerId)
 */
export function validateFor278(
  auth: AuthRow,
  practice: PracticeRow,
  provider: ProviderRow | null,
  patient: PatientRow,
  payer: PayerRow
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Practice ──────────────────────────────────────────────────────────────
  if (!practice.npi) {
    errors.push("Missing: Practice Group NPI (required for 278 2000B NM109)");
  }

  const cfg = practice.clinicConfig;
  if (!cfg) {
    errors.push(
      "Missing: Clinic configuration — complete onboarding to set EDI credentials and taxonomy codes"
    );
    // Return early; can't validate further without config
    return { valid: false, errors, warnings };
  }

  if (!cfg.ediSenderQualifier) {
    errors.push("Missing: EDI Sender Qualifier (clinicConfig.ediSenderQualifier → ISA05)");
  }
  if (!cfg.ediSenderId) {
    errors.push("Missing: EDI Sender ID (clinicConfig.ediSenderId → ISA06)");
  }
  if (!cfg.ediReceiverQualifier) {
    errors.push("Missing: EDI Receiver Qualifier (clinicConfig.ediReceiverQualifier → ISA07)");
  }
  if (!cfg.ediReceiverId) {
    errors.push("Missing: EDI Receiver ID (clinicConfig.ediReceiverId → ISA08)");
  }
  if (!cfg.taxonomyCodes || cfg.taxonomyCodes.length === 0) {
    errors.push(
      "Missing: Practice taxonomy codes (clinicConfig.taxonomyCodes → 2000B PRV03)"
    );
  }
  if (!cfg.facilityTypeCode) {
    warnings.push(
      "Recommended: Facility type code (clinicConfig.facilityTypeCode → UM04-1) — defaulting to 11 (Office)"
    );
  }
  if (!cfg.claimType) {
    warnings.push(
      "Recommended: Claim type (clinicConfig.claimType → UM04-2) — defaulting to B (Professional)"
    );
  }

  // ── Payer ─────────────────────────────────────────────────────────────────
  if (!payer.payerId) {
    errors.push("Missing: Payer EDI ID (payer.payerId → 2000A NM109)");
  }

  // ── Patient/Subscriber ────────────────────────────────────────────────────
  if (!patient.memberId) {
    errors.push(
      "Missing: Patient member ID (patient.memberId → 2000C NM109) — most critical field for 278"
    );
  }
  if (!patient.firstName) {
    errors.push("Missing: Patient first name (patient.firstName → NM104)");
  }
  if (!patient.lastName) {
    errors.push("Missing: Patient last name (patient.lastName → NM103)");
  }
  if (!patient.dob) {
    errors.push("Missing: Patient date of birth (patient.dob → DMG02)");
  }

  // Dependent situation — subscriber fields required when patient is not self
  if (patient.relationshipToSubscriber !== "18") {
    if (!patient.subscriberLastName) {
      errors.push(
        "Missing: Subscriber last name (patient.subscriberLastName → 2000C NM103) " +
        "— required when patient is a dependent"
      );
    }
    if (!patient.subscriberFirstName) {
      errors.push(
        "Missing: Subscriber first name (patient.subscriberFirstName → 2000C NM104) " +
        "— required when patient is a dependent"
      );
    }
    if (!patient.subscriberMemberId) {
      warnings.push(
        "Recommended: Subscriber member ID (patient.subscriberMemberId → 2000C NM109) " +
        "— defaulting to patient member ID"
      );
    }
  }

  // ── Provider ──────────────────────────────────────────────────────────────
  if (!provider) {
    warnings.push(
      "No treating provider assigned — provider fields in 278 will contain placeholder values. " +
      "Assign a provider to the authorization before submitting."
    );
  } else {
    if (!provider.npi) {
      errors.push("Missing: Provider NPI (provider.npi → 2010EA NM109)");
    }
    if (!provider.taxonomyCode) {
      warnings.push(
        "Recommended: Provider taxonomy code (provider.taxonomyCode → 2010EA PRV03) " +
        "— will use discipline default"
      );
    }
    if (!provider.stateLicenseNumber) {
      warnings.push(
        "Optional: Provider state license number (provider.stateLicenseNumber → 2010EA REF*0B) " +
        "— some payers require this for therapy providers"
      );
    }
  }

  // ── Authorization ─────────────────────────────────────────────────────────
  const allDiagnoses = [
    ...(auth.icdCodes ?? []),
    ...(patient.diagnosisCodes ?? []),
  ];
  if (allDiagnoses.length === 0) {
    errors.push(
      "Missing: At least one ICD-10 diagnosis code (auth.icdCodes or patient.diagnosisCodes → HI segment)"
    );
  }

  if (!auth.startDate) {
    warnings.push(
      "Recommended: Service start date (auth.startDate → DTP qualifier 291) — will be omitted from 278"
    );
  }
  if (!auth.endDate) {
    warnings.push(
      "Recommended: Service end date (auth.endDate → DTP qualifier 291) — will be omitted from 278"
    );
  }
  if (!auth.visitPattern) {
    warnings.push(
      "Recommended: Visit pattern (auth.visitPattern → HSD segment) — " +
      "omitting HSD may cause rejection with some payers"
    );
  }
  if (!auth.certificationTypeCode) {
    warnings.push(
      "Recommended: Certification type code (auth.certificationTypeCode → UM02) — " +
      "defaulting to I (Initial)"
    );
  }
  if (!auth.levelOfServiceCode) {
    warnings.push(
      "Optional: Level of service code (auth.levelOfServiceCode → UM06) — " +
      "defaulting to blank (most payers assume Routine)"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
