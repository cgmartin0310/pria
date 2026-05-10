# PRIA — X12 278 Field Mapping Reference

**Standard:** ASC X12N 005010X217 (HIPAA 5010)  
**Document:** Maps every 278 segment/data element to the PRIA data model layer  
**Updated:** May 2026

---

## Quick Reference: Data Model Layers

| Layer | DB Table | Who Owns It | Set When |
|-------|----------|-------------|----------|
| **Clinic** | `practices` + `practices.clinic_config` | Practice admin | Onboarding (once) |
| **Provider** | `providers` | Practice admin | Per therapist added (once) |
| **Patient** | `patients` | Front desk / intake | Per patient registration |
| **Payer** | `payers` | PRIA system / admin | Payer directory (shared) |
| **Authorization** | `authorizations` | Therapist / billing | Per auth request |

> **Key Design Principle:** Clinic-level data (taxonomy, NPI, facility info, EDI credentials) is configured ONCE during clinic setup and never re-collected per patient or per authorization.

---

## ISA / GS — EDI Envelope

| 278 Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|-------------|-------------|------------|-------|-------|
| ISA05 | Interchange sender qualifier | REQUIRED | **Clinic** | `practices.clinic_config.ediSenderQualifier` | Typically `ZZ` |
| ISA06 | Interchange sender ID | REQUIRED | **Clinic** | `practices.clinic_config.ediSenderId` | Assigned by clearinghouse |
| ISA07 | Interchange receiver qualifier | REQUIRED | **Clinic** | `practices.clinic_config.ediReceiverQualifier` | Typically `ZZ` |
| ISA08 | Interchange receiver ID | REQUIRED | **Clinic** | `practices.clinic_config.ediReceiverId` | Clearinghouse's ID |
| GS02 | Application sender ID | REQUIRED | **Clinic** | `practices.clinic_config.gsApplicationSenderId` | Often same as ISA06 |
| GS03 | Application receiver ID | REQUIRED | **Clinic** | `practices.clinic_config.gsApplicationReceiverId` | Often same as ISA08 |

---

## BHT — Beginning of Hierarchical Transaction

| 278 Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|-------------|-------------|------------|-------|-------|
| BHT01 | Hierarchical structure code | REQUIRED | *System* | Hardcoded `0007` | Always `0007` for 278 |
| BHT02 | Transaction purpose code | REQUIRED | *System* | Hardcoded `13` (request) / `11` (response) | |
| BHT03 | Submitter transaction identifier | REQUIRED | **Authorization** | `authorizations.internal_tracking_number` | PRIA's internal reference; also maps to TRN |
| BHT04 | Date (CCYYMMDD) | REQUIRED | *System* | Generated at submission time | |
| BHT05 | Time (HHMM) | REQUIRED | *System* | Generated at submission time | |
| BHT06 | Transaction type code | REQUIRED | *System* | Hardcoded `RQ` | "Referral/Prior Auth Request" |

---

## Loop 2000A — Utilization Management Organization (Payer/UMO)

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED | *System* | Generated (HL01=1, HL03=20) | |
| NM1 | NM101 | Entity identifier | REQUIRED | *System* | Hardcoded `X3` (UMO) | |
| NM1 | NM102 | Entity type | REQUIRED | *System* | Hardcoded `2` (organization) | |
| NM1 | NM103 | Payer name | REQUIRED | **Payer** | `payers.name` | |
| NM1 | NM108 | ID qualifier | REQUIRED | **Payer** | `payers.payer_id_qualifier` | `PI` or `46` |
| NM1 | NM109 | Payer EDI ID | REQUIRED | **Payer** | `payers.payer_id` | Critical — must be correct EDI ID |

---

## Loop 2000B — Requester / Submitting Provider (Practice)

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED | *System* | Generated (HL01=2, HL03=21) | |
| NM1 | NM101 | Entity identifier | REQUIRED | *System* | `1P` (requesting provider) | |
| NM1 | NM102 | Entity type | REQUIRED | *System* | `2` (org) for group practice | |
| NM1 | NM103 | Practice name | REQUIRED | **Clinic** | `practices.name` | |
| NM1 | NM108 | NPI qualifier | REQUIRED | *System* | Hardcoded `XX` | |
| NM1 | NM109 | Group NPI | REQUIRED | **Clinic** | `practices.npi` | Type 2 (group) NPI |
| N3 | N301 | Address street | SITUATIONAL | **Clinic** | `practices.address.street` | |
| N4 | N401/02/03 | City / State / ZIP | SITUATIONAL | **Clinic** | `practices.address.city/state/zip` | |
| PER | PER02 | Contact name | SITUATIONAL | **Clinic** | Billing dept name | |
| PER | PER04 | Phone | SITUATIONAL | **Clinic** | `practices.phone` | |
| PER | PER06 | Fax | SITUATIONAL | **Clinic** | `practices.fax` | |
| PRV | PRV01 | Provider code | SITUATIONAL | *System* | `PE` (performing) | |
| PRV | PRV02 | Reference ID qualifier | SITUATIONAL | *System* | `PXC` (taxonomy) | |
| PRV | PRV03 | Taxonomy code | SITUATIONAL (**Recommended**) | **Clinic** | `practices.clinic_config.taxonomyCodes[0]` | Multi-discipline: may send multiple PRV |

---

## Loop 2000C — Subscriber (Insured Member / Policyholder)

> When the patient IS the subscriber (relationship = `18`), the patient's info goes here.  
> When the patient is a DEPENDENT, the **subscriber's** info goes here and the patient info goes in 2000D.

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED | *System* | Generated (HL03=22) | |
| NM1 | NM101 | Entity identifier | REQUIRED | *System* | `IL` (insured/subscriber) | |
| NM1 | NM102 | Entity type | REQUIRED | *System* | `1` (person) | |
| NM1 | NM103 | Subscriber last name | REQUIRED | **Patient** | `patients.subscriber_last_name` OR `patients.last_name` | Use subscriber fields when patient is dependent |
| NM1 | NM104 | Subscriber first name | REQUIRED | **Patient** | `patients.subscriber_first_name` OR `patients.first_name` | |
| NM1 | NM105 | Subscriber middle name | SITUATIONAL | **Patient** | `patients.subscriber_middle_name` OR `patients.middle_name` | |
| NM1 | NM108 | ID qualifier | REQUIRED | *System* | `MI` (Member ID) | |
| NM1 | NM109 | Subscriber member ID | REQUIRED | **Patient** | `patients.subscriber_member_id` OR `patients.member_id` | Most critical field |
| REF | REF01/02 | Group number | SITUATIONAL | **Patient** | `patients.group_number` | |
| N3 | N301 | Subscriber address | SITUATIONAL | **Patient** | `patients.subscriber_address.street` OR `patients.address.street` | |
| N4 | N401–03 | City / State / ZIP | SITUATIONAL | **Patient** | `patients.subscriber_address.city/state/zip` | |
| DMG | DMG01 | Date format qualifier | SITUATIONAL | *System* | `D8` | |
| DMG | DMG02 | Subscriber DOB | SITUATIONAL | **Patient** | `patients.subscriber_dob` OR `patients.dob` | Format: CCYYMMDD |
| DMG | DMG03 | Subscriber gender | SITUATIONAL | **Patient** | `patients.subscriber_gender` OR `patients.gender` | `M`, `F`, or `U` |

---

## Loop 2000D — Dependent (Patient, when different from subscriber)

> This loop is ONLY present when the patient is NOT the subscriber (relationship ≠ `18`).

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED if present | *System* | Generated (HL03=23) | |
| NM1 | NM101 | Entity identifier | REQUIRED | *System* | `QC` (patient/dependent) | |
| NM1 | NM103 | Patient last name | REQUIRED | **Patient** | `patients.last_name` | |
| NM1 | NM104 | Patient first name | REQUIRED | **Patient** | `patients.first_name` | |
| NM1 | NM105 | Patient middle name | SITUATIONAL | **Patient** | `patients.middle_name` | |
| NM1 | NM108 | ID qualifier | SITUATIONAL | *System* | `MI` (Member ID) | |
| NM1 | NM109 | Patient member ID | SITUATIONAL | **Patient** | `patients.member_id` | |
| DMG | DMG02 | Patient DOB | SITUATIONAL | **Patient** | `patients.dob` | Format: CCYYMMDD |
| DMG | DMG03 | Patient gender | SITUATIONAL | **Patient** | `patients.gender` | `M`, `F`, or `U` |
| INS | INS | Relationship code | SITUATIONAL | **Patient** | `patients.relationship_to_subscriber` | `01`=Spouse, `19`=Child, etc. |

---

## Loop 2000E — Patient Event (Core Authorization Request)

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED | *System* | Generated (HL03=EV) | |
| TRN | TRN02 | Trace number | SITUATIONAL | **Authorization** | `authorizations.internal_tracking_number` | For matching response to request |
| **UM** | UM01 | Request category code | **REQUIRED** | **Authorization** | `authorizations.request_category_code` | `HS`=Health Services Review (default for PT/OT/ST) |
| **UM** | UM02 | Certification type | **REQUIRED** | **Authorization** | `authorizations.certification_type_code` | `I`=Initial, `R`=Renewal, `S`=Revised |
| **UM** | UM03 | Service type code | **REQUIRED** | **Authorization** | `authorizations.service_type_code` | `AD`=OT, `AE`=PT, `AF`=Speech; auto-populate from provider discipline |
| **UM** | UM04-1 | Facility type code | **REQUIRED** | **Authorization** / **Clinic** | `authorizations.place_of_service_code` (defaults to `practices.clinic_config.facilityTypeCode`) | `11`=Office, `22`=Outpatient Hospital |
| **UM** | UM04-2 | Claim type | **REQUIRED** | **Clinic** | `practices.clinic_config.claimType` | `B`=Professional |
| UM | UM06 | Level of service | SITUATIONAL | **Authorization** | `authorizations.level_of_service_code` | `R`=Routine, `U`=Urgent, `E`=Emergency |
| UM | UM09 | Release of information | SITUATIONAL | *System* | Hardcoded `Y` | |
| REF | REF01/02 | Previous auth number | SITUATIONAL | **Authorization** | `authorizations.previous_auth_number` | Required for renewals |
| DTP | DTP (start) | Requested service start date | SITUATIONAL (**Usually Required**) | **Authorization** | `authorizations.start_date` | |
| DTP | DTP (end) | Requested service end date | SITUATIONAL | **Authorization** | `authorizations.end_date` | |
| DTP | DTP (onset) | Date of onset / injury | SITUATIONAL | **Authorization** | `authorizations.onset_date` | Required when UM05 is set |
| **HI** | HI01 | Primary ICD-10 diagnosis | SITUATIONAL (**Required when known**) | **Authorization** | `authorizations.icd_codes[0]` | Qualifier `BF` + ICD-10 code |
| HI | HI02–HI12 | Additional diagnoses | SITUATIONAL | **Authorization** | `authorizations.icd_codes[1..11]` | Up to 12 total |
| HSD | HSD02 | Visits/units per period | SITUATIONAL (**Strongly Recommended**) | **Authorization** | `authorizations.visit_pattern.visitsPerPeriod` | |
| HSD | HSD03 | Period frequency | SITUATIONAL | **Authorization** | `authorizations.visit_pattern.periodFrequency` | `DA`=Day, `WK`=Week, `MO`=Month |
| HSD | HSD04 | Period count | SITUATIONAL | **Authorization** | `authorizations.visit_pattern.periodCount` | |
| HSD | HSD06 | Total duration | SITUATIONAL | **Authorization** | `authorizations.visit_pattern.totalDurationDays` | |
| MSG | MSG01 | Clinical notes / justification | SITUATIONAL | **Authorization** | `authorizations.clinical_notes` | Free-text to UMO; also see `clinical_summary` |
| CRC | — | Functional limitations | SITUATIONAL | *Future* | Not yet in model | Planned for later milestone |

---

## Loop 2010EA — Patient Event Provider (Rendering/Treating Therapist)

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| NM1 | NM101 | Entity identifier | REQUIRED | *System* | `SJ` (service provider) | |
| NM1 | NM102 | Entity type | REQUIRED | *System* | `1` (person) | |
| NM1 | NM103 | Therapist last name | REQUIRED | **Provider** | `providers.last_name` | |
| NM1 | NM104 | Therapist first name | REQUIRED | **Provider** | `providers.first_name` | |
| NM1 | NM107 | Suffix | SITUATIONAL | **Provider** | `providers.suffix` | e.g., `DPT` |
| NM1 | NM108 | NPI qualifier | REQUIRED | *System* | `XX` | |
| NM1 | NM109 | Individual NPI | REQUIRED | **Provider** | `providers.npi` | Type 1 (individual) NPI |
| REF | REF*0B | State license number | SITUATIONAL | **Provider** | `providers.state_license_number` | Some payers require |
| N3 | N301 | Address | SITUATIONAL | **Clinic** | `practices.address.street` | Usually practice address |
| N4 | N401–03 | City / State / ZIP | SITUATIONAL | **Clinic** | `practices.address.city/state/zip` | |
| PER | PER04 | Phone | SITUATIONAL | **Clinic** | `practices.phone` | |
| PRV | PRV01 | Provider code | SITUATIONAL | *System* | `PE` (performing) | |
| PRV | PRV02 | Reference qualifier | SITUATIONAL | *System* | `PXC` (taxonomy) | |
| PRV | PRV03 | Taxonomy code | SITUATIONAL (**Recommended**) | **Provider** | `providers.taxonomy_code` | e.g., `225100000X` for PT |

---

## Loop 2000F — Service Line Items (Individual CPT Codes)

> Optional loop. Present when individual CPT codes need separate authorization (common for PT/OT/ST).

| 278 Segment | Element | Description | Requirement | PRIA Layer | Field | Notes |
|-------------|---------|-------------|-------------|------------|-------|-------|
| HL | HL01–04 | Hierarchical level | REQUIRED if present | *System* | Generated (HL03=SS) | |
| TRN | TRN02 | Service trace number | SITUATIONAL | *System* | Generated per service line | |
| SV1 | SV101-1 | Procedure code qualifier | SITUATIONAL (**Required if service-level auth**) | *System* | `HC` (CPT/HCPCS) | |
| SV1 | SV101-2 | CPT/HCPCS code | SITUATIONAL (**Required if service-level auth**) | **Authorization** | `authorizations.service_lines[n].cptCode` | e.g., `97110` |
| SV1 | SV101-3 | Modifier 1 | SITUATIONAL | **Authorization** | `authorizations.service_lines[n].modifiers[0]` | `GP`/`GO`/`GN` for therapy discipline |
| SV1 | SV101-4 | Modifier 2 | SITUATIONAL | **Authorization** | `authorizations.service_lines[n].modifiers[1]` | e.g., `KX`, `59` |
| SV1 | SV105 | Units requested | SITUATIONAL | **Authorization** | `authorizations.service_lines[n].units` | 15-min units or visits |
| HSD | HSD01 | Unit/measurement qualifier | SITUATIONAL | **Authorization** | `authorizations.service_lines[n].unitType` | `UN`=15-min units, `VS`=visits |

---

## 278 Response Fields (278-11 — Populated After Payer Decision)

| 278 Segment | Element | Description | PRIA Layer | Field |
|-------------|---------|-------------|------------|-------|
| HCR | HCR01 | Decision action code | **Authorization** | `authorizations.decision_code` |
| HCR | HCR02 | Authorization number | **Authorization** | `authorizations.auth_number` |
| HCR | HCR03 (start) | Certification period start | **Authorization** | `authorizations.certification_period_start` |
| HCR | HCR03 (end) | Certification period end | **Authorization** | `authorizations.certification_period_end` |

**HCR01 Decision Codes:**
| Code | Meaning | PRIA Status |
|------|---------|-------------|
| `A1` | Certified / Approved | `approved` |
| `A2` | Modified (partial approval) | `approved` (with notes) |
| `A3` | Denied | `denied` |
| `A4` | Pended for review | `pending` |

---

## Field Ownership Summary

### Clinic Layer — Configured Once at Onboarding
These fields are set by the practice admin during clinic setup and never re-entered per patient or per auth.

| Field | Maps to 278 | DB Column |
|-------|-------------|-----------|
| Practice name | 2000B NM103 | `practices.name` |
| Group NPI (Type 2) | 2000B NM109 | `practices.npi` |
| Practice address | 2000B N3/N4 | `practices.address` |
| Practice phone | 2000B PER | `practices.phone` |
| Practice fax | 2000B PER | `practices.fax` |
| Taxonomy code(s) | 2000B PRV03 | `practices.clinic_config.taxonomyCodes` |
| Facility type code | UM04-1 | `practices.clinic_config.facilityTypeCode` |
| Claim type | UM04-2 | `practices.clinic_config.claimType` |
| EDI sender qualifier | ISA05 | `practices.clinic_config.ediSenderQualifier` |
| EDI sender ID | ISA06 | `practices.clinic_config.ediSenderId` |
| EDI receiver qualifier | ISA07 | `practices.clinic_config.ediReceiverQualifier` |
| EDI receiver ID | ISA08 | `practices.clinic_config.ediReceiverId` |
| Default request category | UM01 | `practices.clinic_config.requestCategoryCode` |

### Provider Layer — Once per Therapist
| Field | Maps to 278 | DB Column |
|-------|-------------|-----------|
| Individual NPI | 2010EA NM109 | `providers.npi` |
| Last name | 2010EA NM103 | `providers.last_name` |
| First name | 2010EA NM104 | `providers.first_name` |
| Suffix / credentials | 2010EA NM107 | `providers.suffix` |
| Individual taxonomy code | 2010EA PRV03 | `providers.taxonomy_code` |
| State license number | 2010EA REF*0B | `providers.state_license_number` |
| Discipline | Drives UM03 + SV1 modifiers | `providers.discipline` |

### Patient Layer — Per Patient Registration
| Field | Maps to 278 | DB Column |
|-------|-------------|-----------|
| First / last name | 2000C/D NM104/103 | `patients.first_name`, `patients.last_name` |
| Middle name | 2000C/D NM105 | `patients.middle_name` |
| Date of birth | 2000C/D DMG02 | `patients.dob` |
| Gender | 2000C/D DMG03 | `patients.gender` |
| Member ID | 2000C NM109 | `patients.member_id` (**Most critical**) |
| Relationship to subscriber | 2000D INS | `patients.relationship_to_subscriber` |
| Group/plan number | 2000C REF | `patients.group_number` |
| Patient address | 2000C/D N3/N4 | `patients.address` |
| Subscriber last/first name | 2000C NM103/104 | `patients.subscriber_last_name`, `patients.subscriber_first_name` |
| Subscriber member ID | 2000C NM109 | `patients.subscriber_member_id` |
| Subscriber DOB | 2000C DMG02 | `patients.subscriber_dob` |
| Subscriber gender | 2000C DMG03 | `patients.subscriber_gender` |
| Subscriber address | 2000C N3/N4 | `patients.subscriber_address` |

### Payer Layer — Payer Directory (Shared)
| Field | Maps to 278 | DB Column |
|-------|-------------|-----------|
| Payer name | 2000A NM103 | `payers.name` |
| Payer EDI ID | 2000A NM109 | `payers.payer_id` |
| Payer ID qualifier | 2000A NM108 | `payers.payer_id_qualifier` |
| Submission method | Routing logic | `payers.rules_config.submissionMethod` |
| Supports X12 278 | Routing logic | `payers.supports_x278` |

### Authorization Layer — Per Auth Request
| Field | Maps to 278 | DB Column |
|-------|-------------|-----------|
| Certification type | UM02 | `authorizations.certification_type_code` |
| Service type code | UM03 | `authorizations.service_type_code` |
| Level of service | UM06 | `authorizations.level_of_service_code` |
| Place of service | UM04-1 | `authorizations.place_of_service_code` |
| Request category | UM01 | `authorizations.request_category_code` |
| ICD-10 diagnoses | HI01–HI12 | `authorizations.icd_codes` |
| Visit pattern | HSD | `authorizations.visit_pattern` (JSONB) |
| Requested service start | DTP | `authorizations.start_date` |
| Requested service end | DTP | `authorizations.end_date` |
| Onset date | DTP | `authorizations.onset_date` |
| Previous auth number | REF | `authorizations.previous_auth_number` |
| Internal tracking ID | BHT03, TRN | `authorizations.internal_tracking_number` |
| Service lines (CPT + modifiers) | 2000F SV1 | `authorizations.service_lines` (JSONB) |
| Clinical notes | MSG | `authorizations.clinical_notes` |
| Decision code | HCR01 | `authorizations.decision_code` |
| Auth number (response) | HCR02 | `authorizations.auth_number` |
| Certification period start | HCR03 | `authorizations.certification_period_start` |
| Certification period end | HCR03 | `authorizations.certification_period_end` |

---

## Validation Rules

### Required for 278 Generation (HARD STOP — cannot submit without these)
1. `practices.npi` — Group NPI
2. `practices.clinic_config.ediSenderId` / `ediReceiverId` — EDI credentials
3. `practices.clinic_config.facilityTypeCode` — Place of service
4. `providers.npi` — Individual provider NPI
5. `providers.taxonomy_code` — Provider taxonomy
6. `patients.member_id` — Member/subscriber ID (**single most critical field**)
7. `patients.last_name` + `patients.first_name` — Patient name
8. `patients.dob` — Date of birth
9. `payers.payer_id` — Payer EDI ID
10. `authorizations.certification_type_code` — Initial vs. Renewal
11. `authorizations.service_type_code` — AD/AE/AF
12. `authorizations.icd_codes[0]` — At least one ICD-10 diagnosis

### Required when patient is a dependent (relationship ≠ '18')
- `patients.subscriber_last_name` + `patients.subscriber_first_name`
- `patients.subscriber_member_id`
- `patients.subscriber_dob` (recommended)

### Strongly Recommended (included by most payers' companion guides)
- `authorizations.visit_pattern` — HSD segment (visits/week × duration)
- `authorizations.start_date` — DTP: service start
- `providers.state_license_number` — REF*0B (some payers require)
- `authorizations.service_lines` — 2000F loop with CPT codes + modifiers

### Auto-populated by System
| Field | Source |
|-------|--------|
| `authorizations.service_type_code` | From `providers.discipline`: PT→AE, OT→AD, ST→AF |
| `authorizations.service_lines[n].modifiers` | From `providers.discipline`: PT→GP, OT→GO, ST→GN |
| `authorizations.request_category_code` | From `practices.clinic_config.requestCategoryCode` (default: `HS`) |
| `authorizations.place_of_service_code` | From `practices.clinic_config.facilityTypeCode` |

---

## Constants Reference

All constants are exported from `@pria/shared/constants`:

| Constant | Used For |
|----------|----------|
| `FACILITY_TYPE_CODES` | UM04-1 valid values |
| `CERTIFICATION_TYPES` | UM02 valid values |
| `SERVICE_TYPE_CODES` | UM03 valid values |
| `LEVEL_OF_SERVICE_CODES` | UM06 valid values |
| `REQUEST_CATEGORY_CODES` | UM01 valid values |
| `RELATIONSHIP_CODES` | INS segment |
| `PROVIDER_TAXONOMY_CODES` | PRV03 reference |
| `THERAPY_MODIFIERS` | SV1 procedure modifiers |
| `DISCIPLINE_TO_SERVICE_TYPE` | Auto-map PT/OT/ST → UM03 code |
| `DISCIPLINE_TO_MODIFIER` | Auto-map PT/OT/ST → GP/GO/GN |
| `DISCIPLINE_TAXONOMY_DEFAULTS` | Default taxonomy per discipline |
| `KNOWN_PAYER_EDI_IDS` | Reference payer ID table (verify with clearinghouse) |
| `PAYER_ID_QUALIFIERS` | NM108 qualifier codes |

---

## Common Therapy CPT Codes (for Service Lines)

| CPT | Description | Discipline | Modifier |
|-----|-------------|-----------|---------|
| 97110 | Therapeutic Exercises | PT/OT | GP or GO |
| 97112 | Neuromuscular Reeducation | PT/OT | GP or GO |
| 97116 | Gait Training | PT | GP |
| 97140 | Manual Therapy | PT | GP |
| 97150 | Therapeutic Activities (group) | PT/OT | GP or GO |
| 97530 | Therapeutic Activities | PT/OT | GP or GO |
| 97535 | Self-Care/Home Management | PT/OT | GP or GO |
| 97161 | PT Evaluation (low complexity) | PT | GP |
| 97162 | PT Evaluation (moderate complexity) | PT | GP |
| 97163 | PT Evaluation (high complexity) | PT | GP |
| 97164 | PT Re-evaluation | PT | GP |
| 97165 | OT Evaluation (low complexity) | OT | GO |
| 97166 | OT Evaluation (moderate complexity) | OT | GO |
| 97167 | OT Evaluation (high complexity) | OT | GO |
| 97168 | OT Re-evaluation | OT | GO |
| 92507 | Speech/Language Treatment (individual) | ST | GN |
| 92508 | Speech/Language Treatment (group) | ST | GN |
| 92521–92524 | Speech Evaluations | ST | GN |

---

*Last updated: May 2026. Verify payer companion guides before production use.*
