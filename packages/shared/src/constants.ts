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
