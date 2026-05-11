// ─── PA Status ─────────────────────────────────────────────────────────────

export const PA_STATUSES = [
  "draft",
  "submitted",
  "pending",
  "approved",
  "denied",
  "expired",
  "appeal",
] as const;

export type PAStatus = (typeof PA_STATUSES)[number];

// ─── User Roles ─────────────────────────────────────────────────────────────

export const USER_ROLES = ["admin", "therapist", "billing"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Plan Tiers ─────────────────────────────────────────────────────────────

export const PLAN_TIERS = ["solo", "practice", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

// ─── Document Types ──────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  "clinical_note",
  "letter_of_necessity",
  "appeal",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ─── CPT Code Categories for Therapy ────────────────────────────────────────

export const CPT_CATEGORIES = {
  PHYSICAL_THERAPY: {
    label: "Physical Therapy",
    codes: {
      "97010": "Hot/Cold Pack",
      "97012": "Mechanical Traction",
      "97014": "Electrical Stimulation (unattended)",
      "97016": "Vasopneumatic Devices",
      "97018": "Paraffin Bath",
      "97022": "Whirlpool",
      "97024": "Diathermy",
      "97026": "Infrared",
      "97028": "Ultraviolet",
      "97032": "Electrical Stimulation (manual)",
      "97033": "Iontophoresis",
      "97034": "Contrast Baths",
      "97035": "Ultrasound",
      "97036": "Hubbard Tank",
      "97110": "Therapeutic Exercises",
      "97112": "Neuromuscular Reeducation",
      "97116": "Gait Training",
      "97124": "Massage",
      "97129": "Therapeutic Interventions (initial 15 min)",
      "97130": "Therapeutic Interventions (each add'l 15 min)",
      "97140": "Manual Therapy",
      "97150": "Therapeutic Activities (group)",
      "97151": "Behavior Identification Assessment",
      "97530": "Therapeutic Activities",
      "97535": "Self-Care/Home Management Training",
      "97542": "Wheelchair Management Training",
      "97750": "Physical Performance Test",
      "97760": "Orthotic Management (initial)",
      "97761": "Orthotic Management (subsequent)",
    },
  },
  OCCUPATIONAL_THERAPY: {
    label: "Occupational Therapy",
    codes: {
      "97165": "OT Evaluation (low complexity)",
      "97166": "OT Evaluation (moderate complexity)",
      "97167": "OT Evaluation (high complexity)",
      "97168": "OT Re-evaluation",
      "97535": "Self-Care/Home Management Training",
      "97537": "Community/Work Reintegration Training",
      "97545": "Work Hardening/Conditioning (initial 2 hrs)",
      "97546": "Work Hardening/Conditioning (each add'l hr)",
    },
  },
  SPEECH_THERAPY: {
    label: "Speech Therapy",
    codes: {
      "92507": "Speech/Language/Voice Treatment (individual)",
      "92508": "Speech/Language/Voice Treatment (group)",
      "92521": "Evaluation of Speech Fluency",
      "92522": "Evaluation of Speech Sound Production",
      "92523": "Evaluation of Speech Sound Production w/ Language Comprehension",
      "92524": "Behavioral/Qualitative Analysis of Voice/Resonance",
      "92526": "Oral Function Treatment",
      "92597": "Evaluation for Oral/Speech Augmentation Device",
      "92605": "Evaluation for Non-Oral Augmentation Device",
      "92606": "Therapeutic Service for Non-Oral Device",
      "92607": "Evaluation for Speech-Generating Device (first hr)",
      "92608": "Evaluation for Speech-Generating Device (add'l 30 min)",
      "92609": "Therapeutic Services for Speech-Generating Device",
      "92610": "Evaluation of Swallowing Function",
      "92611": "Motion Fluoroscopic Evaluation of Swallowing",
      "92612": "Flexible Endoscopic Evaluation of Swallowing",
      "92616": "Flexible Endoscopic Evaluation w/ Sensory Testing",
    },
  },
  EVALUATIONS: {
    label: "Evaluations",
    codes: {
      "97161": "PT Evaluation (low complexity)",
      "97162": "PT Evaluation (moderate complexity)",
      "97163": "PT Evaluation (high complexity)",
      "97164": "PT Re-evaluation",
      "97165": "OT Evaluation (low complexity)",
      "97166": "OT Evaluation (moderate complexity)",
      "97167": "OT Evaluation (high complexity)",
      "97168": "OT Re-evaluation",
    },
  },
} as const;

// ─── Flat CPT code map (used by NewAuthorization) ──────────────────────────

export const THERAPY_CPT_CODES: Record<string, string> = Object.values(
  CPT_CATEGORIES
).reduce<Record<string, string>>((acc, cat) => ({ ...acc, ...cat.codes }), {});

// ─── Common ICD-10 Codes for Therapy ────────────────────────────────────────

export const COMMON_ICD10_CODES: Record<string, string> = {
  // Musculoskeletal - Shoulder
  "M75.1": "Rotator cuff syndrome",
  "M75.0": "Adhesive capsulitis of shoulder",
  "M75.5": "Bursitis of shoulder",
  // Musculoskeletal - Back
  "M54.5": "Low back pain",
  "M54.4": "Lumbago with sciatica",
  "M51.16": "Intervertebral disc degeneration, lumbar region",
  "M47.816": "Spondylosis with radiculopathy, lumbar region",
  // Musculoskeletal - Knee
  "M17.11": "Primary osteoarthritis, right knee",
  "M17.12": "Primary osteoarthritis, left knee",
  "M23.61": "Other spontaneous disruption of ACL",
  // Musculoskeletal - Hip
  "M16.11": "Primary osteoarthritis, right hip",
  "M16.12": "Primary osteoarthritis, left hip",
  // Neurological
  "G35": "Multiple sclerosis",
  "G20": "Parkinson's disease",
  "I63.9": "Cerebral infarction, unspecified",
  "G81.94": "Hemiplegia, unspecified",
  // Post-surgical
  "Z96.641": "Presence of right artificial knee joint",
  "Z96.642": "Presence of left artificial knee joint",
  "Z96.651": "Presence of right artificial hip joint",
  // Balance/Falls
  "R42": "Dizziness and giddiness",
  "R26.89": "Other abnormalities of gait and mobility",
  // Pediatric
  "F80.1": "Expressive language disorder",
  "F80.2": "Mixed receptive-expressive language disorder",
  "F80.0": "Phonological disorder",
  "R13.10": "Dysphagia, unspecified",
  // Developmental
  "F82": "Specific developmental disorder of motor function",
  "F88": "Other disorders of psychological development",
};

// ─── PA Status Display Config ────────────────────────────────────────────────

export const PA_STATUS_CONFIG: Record<
  PAStatus,
  { label: string; color: string; description: string }
> = {
  draft: {
    label: "Draft",
    color: "gray",
    description: "Authorization request in progress",
  },
  submitted: {
    label: "Submitted",
    color: "blue",
    description: "Submitted to payer, awaiting processing",
  },
  pending: {
    label: "Pending",
    color: "yellow",
    description: "Under review by payer",
  },
  approved: {
    label: "Approved",
    color: "green",
    description: "Authorization approved",
  },
  denied: {
    label: "Denied",
    color: "red",
    description: "Authorization denied",
  },
  expired: {
    label: "Expired",
    color: "orange",
    description: "Authorization period has passed",
  },
  appeal: {
    label: "Appeal",
    color: "purple",
    description: "Denial under appeal",
  },
};

// ─── Alias for diagnosis codes ──────────────────────────────────────────────

export const COMMON_THERAPY_DIAGNOSES = COMMON_ICD10_CODES;

// ─── X12 278 — Facility Type Codes (UM04-1) ─────────────────────────────────
// Maps to the first component of the Health Care Service Location (UM04).
// Used in the UM segment of the 2000E (Patient Event) loop.

export const FACILITY_TYPE_CODES = {
  "11": "Office",
  "12": "Home",
  "21": "Inpatient Hospital",
  "22": "Outpatient Hospital",
  "23": "Emergency Room – Hospital",
  "24": "Ambulatory Surgical Center",
  "31": "Skilled Nursing Facility",
  "32": "Nursing Facility",
  "33": "Custodial Care Facility",
  "34": "Hospice",
  "41": "Ambulance – Land",
  "49": "Independent Clinic",
  "50": "Federally Qualified Health Center",
  "51": "Inpatient Psychiatric Facility",
  "61": "Comprehensive Inpatient Rehabilitation Facility",
  "65": "End Stage Renal Disease Treatment Facility",
  "71": "State/Local Public Health Clinic",
  "72": "Rural Health Clinic",
  "81": "Independent Laboratory",
  "99": "Other Place of Service",
} as const;

export type FacilityTypeCode = keyof typeof FACILITY_TYPE_CODES;

// ─── X12 278 — Certification Type Codes (UM02) ──────────────────────────────
// Indicates what kind of authorization is being requested.
// Used in the UM segment of the 2000E (Patient Event) loop.

export const CERTIFICATION_TYPES = {
  I: "Initial",
  R: "Renewal / Extension",
  S: "Revised",
  A: "Admission",
} as const;

export type CertificationTypeCode = keyof typeof CERTIFICATION_TYPES;

// ─── X12 278 — Service Type Codes (UM03) ────────────────────────────────────
// Identifies the type of benefit/service being authorized.
// Used in the UM segment of the 2000E (Patient Event) loop.
// AD/AE/AF are the primary codes for PT/OT/ST.

export const SERVICE_TYPE_CODES = {
  AD: "Occupational Therapy",
  AE: "Physical Medicine / Physical Therapy",
  AF: "Speech Therapy",
  A9: "Rehabilitation",
  AB: "Rehabilitation – Inpatient",
  AC: "Rehabilitation – Outpatient",
  "42": "Home Health Care",
  "71": "Audiology",
  "1": "Medical Care",
} as const;

export type ServiceTypeCode = keyof typeof SERVICE_TYPE_CODES;

/** Auto-maps provider discipline to the canonical 278 service type code */
export const DISCIPLINE_TO_SERVICE_TYPE: Record<"PT" | "OT" | "ST", ServiceTypeCode> = {
  PT: "AE",
  OT: "AD",
  ST: "AF",
};

// ─── X12 278 — Level of Service Codes (UM06) ────────────────────────────────
// Indicates urgency of the authorization request.
// Used in the UM segment of the 2000E (Patient Event) loop.

export const LEVEL_OF_SERVICE_CODES = {
  E: "Emergency",
  U: "Urgent",
  R: "Routine / Elective",
} as const;

export type LevelOfServiceCode = keyof typeof LEVEL_OF_SERVICE_CODES;

// ─── X12 278 — Request Category Codes (UM01) ────────────────────────────────
// Defines the type of services review being requested.
// Used in the UM segment of the 2000E (Patient Event) loop.

export const REQUEST_CATEGORY_CODES = {
  HS: "Health Services Review",     // Standard for outpatient PT/OT/ST
  SC: "Specialty Care Referral",
  AR: "Admission Review",
  RC: "Request for Certification",
} as const;

export type RequestCategoryCode = keyof typeof REQUEST_CATEGORY_CODES;

// ─── X12 278 — Relationship Codes (INS) ─────────────────────────────────────
// Defines the patient's relationship to the insurance subscriber/policyholder.
// Used in the INS segment of the 2000C/2000D loops.

export const RELATIONSHIP_CODES = {
  "18": "Self (Patient is the subscriber)",
  "01": "Spouse",
  "19": "Child",
  "20": "Employee",
  "21": "Unknown",
  "39": "Organ Donor",
  "40": "Cadaver Donor",
  "53": "Life Partner / Domestic Partner",
  "G8": "Other Relationship",
} as const;

export type RelationshipCode = keyof typeof RELATIONSHIP_CODES;

// ─── X12 278 — Provider Taxonomy Codes (PRV03) ──────────────────────────────
// NUCC (National Uniform Claim Committee) 10-digit taxonomy codes.
// Used in PRV segments in the 2000B and 2010EA loops.
// Reference: https://www.nucc.org/index.php/code-sets-mainmenu-41/provider-taxonomy-mainmenu-40

export const PROVIDER_TAXONOMY_CODES = {
  "225100000X": "Physical Therapist",
  "2251C0400X": "Physical Therapist – Case Management",
  "2251E1300X": "Physical Therapist – Electrophysiology, Clinical",
  "2251G0304X": "Physical Therapist – Geriatrics",
  "2251N0400X": "Physical Therapist – Neurology",
  "2251P0200X": "Physical Therapist – Pediatrics",
  "2251S0007X": "Physical Therapist – Sports",
  "2251X0800X": "Physical Therapist – Orthopedic",
  "225200000X": "Physical Therapy Assistant",
  "225X00000X": "Occupational Therapist",
  "225XE0001X": "Occupational Therapist – Environmental Modification",
  "225XE1200X": "Occupational Therapist – Ergonomics",
  "225XG0600X": "Occupational Therapist – Gerontology",
  "225XH1200X": "Occupational Therapist – Hand",
  "225XH1300X": "Occupational Therapist – Human Factors",
  "225XN1300X": "Occupational Therapist – Neurorehabilitation",
  "225XP0019X": "Occupational Therapist – Physical Rehabilitation",
  "225XP0200X": "Occupational Therapist – Pediatrics",
  "225XR0403X": "Occupational Therapist – Driving and Community Mobility",
  "235Z00000X": "Speech-Language Pathologist",
  "2355A2700X": "Orthotist",
  "2355P0456X": "Prosthetist",
  "261QP2000X": "Physical Therapy Clinic",
  "261QR0400X": "Rehabilitation Clinic / Center",
  "261QS1200X": "Sleep Disorder Clinic",
} as const;

export type ProviderTaxonomyCode = keyof typeof PROVIDER_TAXONOMY_CODES;

/** Canonical taxonomy codes for each therapy discipline */
export const DISCIPLINE_TAXONOMY_DEFAULTS: Record<"PT" | "OT" | "ST", string> = {
  PT: "225100000X",
  OT: "225X00000X",
  ST: "235Z00000X",
};

// ─── X12 278 — Therapy CPT Modifiers ────────────────────────────────────────
// Procedure code modifiers used in SV1 segments (2000F service lines).
// GP/GO/GN are required by many payers to identify therapy plan of care type.

export const THERAPY_MODIFIERS = {
  GP: "Services delivered under an outpatient Physical Therapy plan of care",
  GO: "Services delivered under an outpatient Occupational Therapy plan of care",
  GN: "Services delivered under an outpatient Speech-Language Pathology plan of care",
  KX: "Requirements specified in the medical policy have been met (documentation on file)",
  "59": "Distinct procedural service",
  GZ: "Item or service expected to be denied as not reasonable and necessary",
  GA: "Waiver of Liability Statement (ABN) on file",
} as const;

export type TherapyModifier = keyof typeof THERAPY_MODIFIERS;

/** Auto-maps provider discipline to the standard plan-of-care modifier */
export const DISCIPLINE_TO_MODIFIER: Record<"PT" | "OT" | "ST", TherapyModifier> = {
  PT: "GP",
  OT: "GO",
  ST: "GN",
};

// ─── X12 278 — Payer ID Qualifier Codes (NM108) ─────────────────────────────
// Used in the NM108 element of NM1 segments to qualify the NM109 ID value.

export const PAYER_ID_QUALIFIERS = {
  PI: "Payer ID (most commercial payers)",
  "46": "Electronic Transmitter ID Number (ETIN)",
  XV: "CMS Plan ID",
  XX: "National Provider Identifier (NPI)",
  MI: "Member Identification Number",
  SY: "Social Security Number",
} as const;

// ─── US States ──────────────────────────────────────────────────────────────

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// ─── X12 278 — Known Payer EDI IDs ──────────────────────────────────────────
// Reference table of common payer EDI IDs. Always verify with clearinghouse
// before production use — IDs can vary by state, product line, and clearinghouse.

export const KNOWN_PAYER_EDI_IDS: Record<string, { name: string; qualifier: "PI" | "46" }> = {
  "87726": { name: "UnitedHealthcare", qualifier: "PI" },
  "60054": { name: "Aetna", qualifier: "PI" },
  "62308": { name: "Cigna", qualifier: "PI" },
  "00630": { name: "Anthem BCBS (verify by state)", qualifier: "PI" },
  "61101": { name: "Humana", qualifier: "PI" },
  "94107": { name: "BCBS California (Blue Shield)", qualifier: "PI" },
  "00210": { name: "BCBS of Florida", qualifier: "PI" },
  "04271": { name: "BCBS of Texas", qualifier: "PI" },
  "77039": { name: "Molina Healthcare", qualifier: "PI" },
};
