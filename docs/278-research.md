# X12 278 Health Care Services Review – Comprehensive Research

**Document:** Prior Authorization EDI Research for PRIA  
**Audience:** CEO building a prior authorization tool for PT/OT/ST practices  
**Standard:** ASC X12N 278 (005010X217) – Request for Review and Response  
**Date:** May 2026

---

## Table of Contents

1. [What is the 278 Transaction](#1-what-is-the-278-transaction)
2. [Transaction Structure](#2-transaction-structure)
3. [Key Data Points Needed (Data Collection Matrix)](#3-key-data-points-needed)
4. [Service Type Codes for Therapy](#4-service-type-codes-for-therapy)
5. [Clearinghouse Landscape](#5-clearinghouse-landscape)
6. [Recommendations for PRIA](#6-recommendations-for-pria)

---

## 1. What is the 278 Transaction

### Overview of X12 278 (ASC X12N 278)

The **EDI 278 Health Care Services Review Information** transaction set is the standardized electronic format for prior authorization requests and responses in U.S. healthcare. Its full name is the *Health Care Services Review – Request for Review and Response*, and it falls under the X12N Insurance Subcommittee of the Accredited Standards Committee (ASC) X12.

Key identifiers:
- **Transaction Set:** 278
- **Functional Group:** HI
- **Implementation Guide:** ASC X12N/005010X217 (the HIPAA-mandated version)
- **Subcommittee:** X12N (Insurance)
- **Standard Version:** HIPAA 5010 (current mandate; 008060 published but not yet adopted)

The 278 is used to transmit health care service information — subscriber, patient, demographic, diagnosis, and treatment data — for the purpose of requesting prior authorization, certification, notification, or reporting the outcome of a health care services review. Users include payers, plan sponsors, providers, utilization management organizations (UMOs), and other entities involved in health care services review.

A single EDI 278 transaction is typically used for **one patient and one patient event** — this differs from EDI 837 (claims), where multiple patients can be batched. This one-patient design makes the 278 more granular but also more predictable for implementation.

### Difference Between 278 Request and 278 Response

The 278 operates as either a **one-way notification** or a **two-way inquiry/response** pair:

| Direction | Description | Who Sends |
|-----------|-------------|-----------|
| **278 Request (278-13)** | Prior authorization request submitted by the provider to the payer/UMO | Treating provider (PT/OT/SLP practice) |
| **278 Response (278-11)** | Authorization decision returned by the payer/UMO | Payer or UMO |

- The **278-13** (request) carries patient demographics, provider info, diagnosis codes, service details, and the type of certification requested.
- The **278-11** (response) returns the same structure, augmented with a Health Care Review (HCR) segment containing the authorization decision: Approved (A1), Pended for Review (A4), Denied (A3), or Modified (A2), along with a certification/authorization number if approved.

If the payer needs additional clinical documentation, they may request it via the **EDI 275** (Additional Information to Support a Health Care Claim or Encounter) transaction.

### How It Fits Into the Prior Authorization Workflow

```
Provider Identifies Need for Prior Auth
           │
           ▼
Collect Patient / Service / Provider Data
           │
           ▼
Generate X12 278 Request (278-13)
           │
           ▼
Submit via Clearinghouse or Direct Connection
           │
           ▼
Payer/UMO Processes Request
           │
      ┌────┴────┐
      │         │
   Approved   Denied / Pended
      │         │
      ▼         ▼
Authorization  Appeals / Additional
Number Issued    Documentation (275)
      │
      ▼
Provider Renders Service → Submits 837 Claim
(Includes Auth Number from 278 Response)
```

The authorization number from the 278 response is then used on the **EDI 837P** (professional claim) when billing, closing the loop.

### Relationship to HIPAA Mandates

The 278 is a **HIPAA-mandated transaction** under the Administrative Simplification provisions of HIPAA (45 CFR Part 162). Key mandates:

- **HIPAA 5010:** All covered entities (providers, payers, clearinghouses) must use the 005010X217 version of the 278 for electronic prior authorization transactions.
- **Enforcement:** The Office for Civil Rights (OCR) enforces HIPAA transaction standards; covered entities must accept and send compliant 278 transactions if they conduct prior authorization electronically.
- **CMS-0057-F (January 2024 final rule):** The CMS Interoperability and Prior Authorization Final Rule requires impacted payers (MA, Medicaid, CHIP, QHP plans) to implement **FHIR-based Prior Authorization APIs by January 1, 2027**. CMS has explicitly stated that covered entities using a fully FHIR-based Prior Authorization API will not face enforcement for not using X12 278. This is a major inflection point — FHIR is becoming a standalone replacement for 278 for many payers.
- **Current reality (2026):** X12 278 remains the dominant standard in production. FHIR prior auth APIs are being built by large payers, but commercial payers (especially non-CMS regulated) still rely on 278 or proprietary web portals. Both paths need to be supported.

---

## 2. Transaction Structure

### EDI Envelope Hierarchy

Every X12 278 transaction is wrapped in standard X12 envelopes:

```
ISA  — Interchange Control Header (sender/receiver IDs, date/time, version)
  GS — Functional Group Header (transaction type = HI, dates, control number)
    ST*278*[control]*005010X217 — Transaction Set Header
    BHT — Beginning of Hierarchical Transaction
    
    [Hierarchical Loops (2000x)]
    
    SE — Transaction Set Trailer
  GE — Functional Group Trailer
IEA — Interchange Control Trailer
```

### The Hierarchical Loop Architecture

The 278 uses **Hierarchical Level (HL) segments** to define parent-child relationships. The HIPAA 005010X217 implementation defines 6 mandatory/optional levels:

```
2000A — Utilization Management Organization (UMO / Payer)
  └── 2000B — Requester (Submitting Provider)
        └── 2000C — Subscriber (Insured Member)
              └── 2000D — Dependent (Patient, if different from subscriber)
                    └── 2000E — Patient Event (the service authorization request)
                          └── 2000F — Service (individual service line items)
```

The BHT segment defines the hierarchical structure code **0007** for the 278, identifying: Information Source (2000A) → Information Receiver (2000B) → Subscriber (2000C) → Dependent (2000D) → Event (2000E) → Services (2000F).

---

### Loop-by-Loop Breakdown

#### Heading (Table 1)

| Pos | Segment | Name | Usage | Description |
|-----|---------|------|-------|-------------|
| 0100 | ST | Transaction Set Header | **REQUIRED** | Begins transaction; includes `ST01=278`, `ST02=control number`, `ST03=005010X217` |
| 0200 | BHT | Beginning of Hierarchical Transaction | **REQUIRED** | Hierarchical structure (0007), purpose code (13=request, 11=response), submitter reference, date, time |

**BHT Key Elements:**
- BHT01: Hierarchical Structure Code = `0007`
- BHT02: Transaction Set Purpose Code = `13` (Request) or `11` (Response)
- BHT03: Submitter Transaction Identifier (your internal reference/tracking ID)
- BHT04: Date (CCYYMMDD)
- BHT05: Time (HHMM)
- BHT06: Transaction Type Code = `RQ` (Referral/Prior Auth Request)

---

#### Loop 2000A — Utilization Management Organization (UMO / Payer)

Identifies the insurance company or utilization management organization receiving the request.

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | **REQUIRED** | HL01=1, HL02=(blank), HL03=20 (Information Source), HL04=1 (has children) |
| NM1 | **REQUIRED** | NM101=X3 (UMO), NM102=2 (org), NM103=Payer Name, NM108=46 (ETIN) or PI (Payer ID), NM109=Payer EDI ID |
| REF | SITUATIONAL | Additional payer reference numbers |
| AAA | SITUATIONAL | Request validation / error codes |

---

#### Loop 2000B — Requester / Submitting Provider

Identifies the provider or entity making the authorization request (the PT/OT/SLP practice).

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | **REQUIRED** | HL01=2, HL02=1 (child of 2000A), HL03=21 (Information Receiver), HL04=1 |
| NM1 | **REQUIRED** | NM101=1P (referring/requesting provider), NM102=1 (individual) or 2 (org), NM103-04=Name, NM108=XX (NPI), NM109=NPI number |
| REF | SITUATIONAL | Secondary IDs (taxonomy, state license, provider group ID) |
| N3 | SITUATIONAL | Provider address line |
| N4 | SITUATIONAL | Provider city, state, ZIP |
| PER | SITUATIONAL | Contact (phone/fax for follow-up) |
| PRV | SITUATIONAL | Provider specialty — PRV01=PE (performing), PRV03=taxonomy code |

**Note for therapy practices:** If the practice is a group, NM102=2 and NM109=Group NPI. If individual therapist, NM102=1 and NM109=Individual NPI.

---

#### Loop 2000C — Subscriber (Insured Member)

Identifies the policyholder. This is the person who holds the insurance policy.

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | **REQUIRED** | HL01=3, HL02=2 (child of 2000B), HL03=22 (Subscriber), HL04=0 or 1 |
| NM1 | **REQUIRED** | NM101=IL (insured/subscriber), NM102=1, NM103-04=Last/First name, NM108=MI (Member ID), NM109=Member ID number |
| REF | SITUATIONAL | Additional subscriber IDs (SSN if no member ID available: REF01=SY) |
| N3 | SITUATIONAL | Subscriber address |
| N4 | SITUATIONAL | Subscriber city, state, ZIP |
| DMG | SITUATIONAL | Demographics: DMG01=D8, DMG02=DOB (CCYYMMDD), DMG03=Gender (M/F/U) |
| INS | SITUATIONAL | Relationship to insured (self vs. dependent) |

---

#### Loop 2000D — Dependent (Patient, if different from subscriber)

Only present when the patient is NOT the subscriber (e.g., child on parent's policy).

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | **REQUIRED** (if present) | HL01=4, HL02=3 (child of 2000C), HL03=23 (Dependent), HL04=1 |
| NM1 | **REQUIRED** | NM101=QC (patient), NM102=1, Name fields, NM108=34 (SSN) or MI, NM109=ID |
| DMG | SITUATIONAL | Patient DOB, gender |
| INS | SITUATIONAL | Relationship code (01=Spouse, 19=Child, 53=Life Partner, etc.) |

---

#### Loop 2000E — Patient Event (The Core Authorization Request)

This is the heart of the 278 — it defines WHAT is being requested (the clinical event).

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | **REQUIRED** | HL01=4 or 5, HL02=parent HL#, HL03=EV (Event), HL04=0 or 1 |
| TRN | SITUATIONAL | Requester trace number (your unique transaction ID for tracking/matching) |
| **UM** | **REQUIRED** | Health Care Services Review Information — defines the type of review |
| REF | SITUATIONAL | Previous authorization number (for re-auth requests) |
| DTP | SITUATIONAL | Service dates: event date, onset date, accident date |
| **HI** | SITUATIONAL (**Required when known**) | Diagnosis codes (ICD-10) — HI01=BF:M54.5 (ICD-10 primary) |
| HSD | SITUATIONAL | Health Care Services Delivery — visits per period (e.g., 3 visits/week × 4 weeks) |
| CRC | SITUATIONAL | Conditions indicator (functional limitations, activities permitted) |
| PWK | SITUATIONAL | Paperwork/attachments reference |
| MSG | SITUATIONAL | Free-text message to UMO |

**UM Segment (Critical — must get right):**
- UM01: **Request Category Code** (SC=Specialty Care Referral, HS=Health Services Review, AR=Admission Review)
- UM02: **Certification Type Code** (I=Initial, R=Renewal/Extension, S=Revised, A=Admission)
- UM03: **Service Type Code** (AD=Occupational Therapy, AE=Physical Medicine, AF=Speech Therapy — see Section 4)
- UM04: **Health Care Service Location Information** (Facility Type + Claim Type + Facility Qualifier)
  - UM04-1: Facility Type Code (11=Office, 22=Outpatient Hospital, 12=Home, etc.)
  - UM04-2: Claim Type (B=Professional, A=Institutional)
- UM05: **Related Causes Code** (if accident/injury related)
- UM06: **Level of Service Code** (E=Emergency, U=Urgent, R=Elective/Routine)
- UM09: **Release of Information Code** (Y=Yes)

**HI Segment (Diagnosis Codes):**
- HI01: Primary diagnosis — qualifier BF (ICD-10-CM) + code
- HI02-HI12: Additional diagnoses (up to 12 total)

Example: `HI*BF:M47.816*BF:M54.5~` (Spondylosis with radiculopathy, lumbar + low back pain)

**HSD Segment (Delivery Pattern — Critical for PT/OT):**
- HSD01: Unit or Basis for Measurement Code (VS=Visits, UN=Units)
- HSD02: Number of units
- HSD03: Frequency Period (DA=Day, WK=Week, MO=Month)
- HSD04: Period count
- HSD05: Duration unit
- HSD06: Total duration

Example: `HSD*VS*2*DA*3*7*30~` = "2 visits per 3 days for 30 days" (i.e., 2x/week × 4 weeks)

**2010EA — Patient Event Provider (Specialty Provider / Rendering Provider):**

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| NM1 | REQUIRED (when 2000F not used) | NM101=SJ (service provider), NM103-04=Name, NM108=XX (NPI), NM109=Individual NPI |
| REF | SITUATIONAL | Secondary IDs (taxonomy, state license) |
| N3 | SITUATIONAL | Provider address |
| N4 | SITUATIONAL | City, State, ZIP |
| PER | SITUATIONAL | Contact info |
| PRV | SITUATIONAL | Taxonomy code for specialty |

---

#### Loop 2000F — Service Line Items

Optional loop for when multiple specific service lines need authorization. For PT/OT/ST, this is where individual CPT codes are listed.

| Segment | Usage | Key Elements |
|---------|-------|-------------|
| HL | REQUIRED (if present) | HL03=SS (Service), child of 2000E |
| TRN | SITUATIONAL | Service-level trace number |
| UM | SITUATIONAL | Override patient-event UM when different |
| SV1 | SITUATIONAL | **Professional Service** — contains CPT code(s) |
| HSD | SITUATIONAL | Service-specific delivery pattern |

**SV1 Segment (Professional Service):**
- SV101: Composite Medical Procedure Identifier
  - SV101-1: Qualifier (HC = CPT/HCPCS)
  - SV101-2: Procedure Code (e.g., 97110 Therapeutic Exercise)
  - SV101-3: Procedure modifier 1
  - SV101-4: Procedure modifier 2
- SV105: Units of service

Example: `SV1*HC:97110**UN*18~` (CPT 97110, 18 units requested)

**2010F — Service Provider (overrides 2010EA for this service line):**

Same structure as 2010EA — NM1, REF, N3, N4, PER, PRV.

---

#### Transaction Trailer

| Segment | Usage | Description |
|---------|-------|-------------|
| SE | **REQUIRED** | Transaction Set Trailer — SE01=segment count, SE02=control number matching ST02 |

---

### Complete 278 Request Example (Therapy)

```
ISA*00*          *00*          *ZZ*PRACTICEEDI    *ZZ*PAYERID        *260510*1100*^*00501*000000001*0*P*:~
GS*HI*PRACTICEEDI*PAYERID*20260510*1100*1*X*005010X217~
ST*278*0001*005010X217~
BHT*0007*13*PRIA-2026-001*20260510*1100*RQ~

HL*1**20*1~
NM1*X3*2*UNITED HEALTHCARE*****PI*87726~

HL*2*1*21*1~
NM1*1P*2*PRIA THERAPY CLINIC*****XX*1234567890~
N3*123 THERAPY WAY~
N4*ANYTOWN*CA*90210~
PER*IC*BILLING DEPT*TE*8005551234~
PRV*PE*PXC*225100000X~

HL*3*2*22*1~
NM1*IL*1*DOE*JANE****MI*123456789~
N3*456 PATIENT AVE~
N4*ANYTOWN*CA*90210~
DMG*D8*19850315*F~

HL*4*3*EV*1~
TRN*1*PRIA-EVT-001*1234567890~
UM*HS*I*AE*11:B****Y~
HI*BF:M47.816*BF:M54.5~
HSD*VS*2*WK*1*7*30~

NM1*SJ*1*SMITH*JOHN****XX*0987654321~
N4*ANYTOWN*CA*90210~
PER*IC**TE*8005555678~
PRV*PE*PXC*225100000X~

HL*5*4*SS*0~
TRN*1*PRIA-SVC-001*1234567890~
SV1*HC:97110**UN*18~

SE*29*0001~
GE*1*1~
IEA*1*000000001~
```

---

### 278 Response Segments (Additional)

The 278 response (278-11) mirrors the request structure and adds:

| Segment | Location | Description |
|---------|----------|-------------|
| **HCR** | 2000E | Health Care Review Outcome — HCR01=Action Code (A1=Certified, A3=Denied, A4=Pended, A2=Modified), HCR02=Authorization Number, HCR03=Certification Period |
| AAA | Multiple | Request Validation / Reason Codes (when rejected or pended) |

---

## 3. Key Data Points Needed

### Data Collection Matrix for PT/OT/ST Practice

The following table maps all required/situational 278 data elements to practical collection requirements. The "PRIA Status" column assumes PRIA collects basic patient/provider data from its therapy practice EHR integration.

#### A. Patient Demographics

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Patient Last Name | 2000C/D NM103 | **REQUIRED** | ✅ Likely collected | Subscriber or Dependent loop |
| Patient First Name | 2000C/D NM104 | **REQUIRED** | ✅ Likely collected | |
| Patient Middle Name | 2000C/D NM105 | SITUATIONAL | ❓ May collect | |
| Patient Date of Birth | 2000C/D DMG02 | **REQUIRED** | ✅ Likely collected | Format: CCYYMMDD |
| Patient Gender | 2000C/D DMG03 | **REQUIRED** | ✅ Likely collected | M/F/U |
| Patient Member ID / Insurance ID | 2000C NM109 | **REQUIRED** | ❓ May collect | Most critical field; from insurance card |
| Patient Address | 2000C N3/N4 | SITUATIONAL | ❓ May collect | Street, City, State, ZIP |
| Patient SSN | 2000C REF (SY) | SITUATIONAL | ⚠️ Sensitive | Only if no Member ID; handle carefully per HIPAA |
| Relationship to Subscriber | 2000D INS | REQUIRED if dependent | ❓ May not collect | 18=Self, 01=Spouse, 19=Child |

#### B. Subscriber / Insured Info (if different from patient)

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Subscriber Last Name | 2000C NM103 | **REQUIRED** | ❓ May not collect | When patient is dependent |
| Subscriber First Name | 2000C NM104 | **REQUIRED** | ❓ May not collect | |
| Subscriber Member ID | 2000C NM109 | **REQUIRED** | ❓ May not collect | The policyholder's ID |
| Subscriber DOB | 2000C DMG02 | SITUATIONAL | ❌ Likely not collected | Needed when subscriber ≠ patient |
| Subscriber Address | 2000C N3/N4 | SITUATIONAL | ❌ Likely not collected | |
| Group Number | 2000C REF | SITUATIONAL | ❓ May collect | Plan/group number from insurance card |

#### C. Provider Information

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Practice/Group NPI | 2000B NM109 | **REQUIRED** | ✅ Should collect | Type 2 NPI for group practice |
| Treating Therapist NPI | 2010EA NM109 | **REQUIRED** | ✅ Should collect | Type 1 NPI for individual |
| Provider Name (Practice) | 2000B NM103 | **REQUIRED** | ✅ Should collect | |
| Treating Therapist Name | 2010EA NM103/04 | **REQUIRED** | ✅ Should collect | |
| Provider Address | 2000B N3/N4 | SITUATIONAL | ✅ Should collect | Location treating patient |
| Provider Phone | 2000B PER | SITUATIONAL | ✅ Should collect | For UMO follow-up |
| Provider Taxonomy Code | 2000B PRV03 | SITUATIONAL (**strongly recommended**) | ❓ May not collect | 10-digit NUCC code; see Section 4 |
| Provider Tax ID | Not in 278 | N/A | N/A | Not required in 278 |
| State License Number | 2000B REF (0B) | SITUATIONAL | ❌ Likely not collected | Some payers require for therapy |

#### D. Payer / UMO Information

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Payer Name | 2000A NM103 | **REQUIRED** | ✅ Should collect | |
| Payer EDI ID / Electronic Transmitter ID | 2000A NM109 | **REQUIRED** | ❓ Needs payer directory | Critical — must know payer's EDI ID |
| Payer ID Type | 2000A NM108 | **REQUIRED** | ❓ Needs payer directory | PI (Payer ID) or 46 (ETIN) |
| Plan/Group Number | 2000C REF | SITUATIONAL | ❓ May collect | From patient insurance card |

#### E. Service / Authorization Details

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Request Category (Specialty Care, Health Services, Admission) | 2000E UM01 | **REQUIRED** | ❌ Not collected | HS=Health Services Review for PT/OT/ST |
| Certification Type (Initial/Renewal/Revised) | 2000E UM02 | **REQUIRED** | ❌ Not collected | I=Initial, R=Renewal |
| Service Type Code | 2000E UM03 | **REQUIRED** | ❌ Not collected | AD/AE/AF — see Section 4 |
| Place of Service / Facility Type | 2000E UM04 | **REQUIRED** | ❌ Not collected | 11=Office, 22=Outpatient Hospital |
| Urgency / Level of Service | 2000E UM06 | SITUATIONAL | ❌ Not collected | R=Routine, U=Urgent |
| Requested Service Start Date | 2000E DTP | SITUATIONAL (**usually required**) | ❓ May collect | When services are to begin |
| Requested Service End Date | 2000E DTP | SITUATIONAL | ❌ Not collected | Authorization period end |
| Number of Visits Requested | 2000E HSD | SITUATIONAL (**strongly recommended**) | ❌ Not collected | e.g., 2 visits/week × 4 weeks |
| Previous Authorization Number | 2000E REF | SITUATIONAL | ❌ Not collected | Required for re-authorization |

#### F. Diagnosis / Clinical Information

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| Primary ICD-10 Diagnosis Code | 2000E HI01 | SITUATIONAL (**Required when known**) | ✅ Should collect | BF qualifier + ICD-10 code |
| Secondary ICD-10 Codes (up to 11) | 2000E HI02-HI12 | SITUATIONAL | ✅ Should collect | |
| Date of Onset / Injury | 2000E DTP | SITUATIONAL | ❓ May collect | Required if accident/injury related |
| Accident Indicator | 2000E UM05 | SITUATIONAL | ❌ Not collected | AA=Auto Accident, OA=Other Accident |
| Functional Limitations | 2000E CRC | SITUATIONAL | ❌ Not collected | CRC with code set for limitations |
| Activities Permitted | 2000E CRC | SITUATIONAL | ❌ Not collected | |

#### G. Procedure / Service Line Details

| Data Element | 278 Location | Requirement | PRIA Status | Notes |
|---|---|---|---|---|
| CPT/HCPCS Procedure Codes | 2000F SV101 | SITUATIONAL (**Required if service-level auth**) | ✅ Should collect | e.g., 97110, 97530, 97165 |
| CPT Modifiers | 2000F SV101-3/4 | SITUATIONAL | ❓ May not collect | GP (PT services), GO (OT services), GN (ST services) |
| Units per Service | 2000F SV105 | SITUATIONAL | ❓ May collect | 15-min units or visit count |

---

### Summary: What PRIA Likely Has vs. Needs to Add

**PRIA Likely Already Collects:**
- Patient name, DOB, gender
- Primary diagnosis ICD-10 codes
- CPT procedure codes
- Provider NPI (individual and group)
- Provider name and address
- Insurance carrier name

**PRIA Needs to Add:**
- Patient **Member ID / Insurance ID** (from insurance card — most critical)
- **Subscriber info** when patient is a dependent (subscriber name, DOB, member ID)
- **Payer EDI ID** (need a payer directory or mapping table)
- **Certification type** (Initial vs. Renewal) — workflow logic
- **Service type code** (AD/AE/AF per discipline)
- **Facility/place of service** context (UM04)
- **Requested visit pattern** (HSD: visits/week × duration)
- **Requested service date range** (start/end dates)
- **Provider taxonomy codes** (10-digit NUCC codes)
- **Previous authorization number** for re-auth requests
- **CPT modifiers** (GP/GO/GN are required by many payers for therapy claims)
- **State license numbers** (some payer companion guides require these)

---

## 4. Service Type Codes for Therapy

### X12 Service Type Codes (STC) — Therapy-Relevant Codes

These codes are used in the **UM03** data element of the UM segment at Loop 2000E (Patient Event). They identify the type of benefit/service being authorized.

| Code | Description | Use for PT/OT/ST |
|------|-------------|-----------------|
| **AD** | **Occupational Therapy** | ✅ **Primary code for OT authorization requests** |
| **AE** | **Physical Medicine** | ✅ **Primary code for PT authorization requests** |
| **AF** | **Speech Therapy** | ✅ **Primary code for ST/SLP authorization requests** |
| A9 | Rehabilitation | Secondary — sometimes used for general rehab |
| AB | Rehabilitation - Inpatient | For inpatient rehab settings |
| AC | Rehabilitation - Outpatient | For outpatient rehab settings |
| 71 | Audiology | Audiological services (sometimes paired with SLP) |
| 1 | Medical Care | General medical — used when service doesn't fit specific codes |
| 42 | Home Health Care | If PT/OT/ST delivered in home |

**Important Note:** Some payers (e.g., Medicaid, Medicare Advantage plans) use their own code preferences. Always check the payer's companion guide. For example:
- UnitedHealthcare's 278 companion guide specifies UM03 codes accepted for outpatient therapy
- Medicaid programs often have state-specific code requirements

### Certification Type Codes (UM02)

Used in the UM segment to indicate the type of authorization being requested:

| Code | Description | When to Use |
|------|-------------|-------------|
| **I** | **Initial** | First-time authorization for this condition/episode |
| **R** | **Renewal/Extension** | Extending an existing authorization |
| **S** | **Revised** | Modifying an existing authorized plan |
| **A** | **Admission** | Inpatient/facility admissions |

For outpatient PT/OT/ST practices, **I** (Initial) and **R** (Renewal) are the most common. Many payers require a new Initial auth at the start of each plan of care and Renewals for continued treatment.

### Provider Taxonomy Codes for Therapy

These are used in the **PRV03** data element and in clearinghouse routing.

| Taxonomy Code | Description |
|---------------|-------------|
| **225100000X** | Physical Therapist |
| **225X00000X** | Occupational Therapist |
| **235Z00000X** | Speech-Language Pathologist |
| **225200000X** | Physical Therapy Assistant |
| **225A00000X** | Music Therapist |
| **261QR0400X** | Rehabilitation Clinic/Center |
| **261QP2000X** | Physical Therapy Clinic |

### Therapy CPT Codes Commonly Requiring Prior Authorization

| CPT Code | Description | Discipline |
|----------|-------------|-----------|
| 97110 | Therapeutic Exercises | PT/OT |
| 97112 | Neuromuscular Reeducation | PT/OT |
| 97116 | Gait Training | PT |
| 97530 | Therapeutic Activities | PT/OT |
| 97535 | Self-Care/Home Management Training | PT/OT |
| 97150 | Therapeutic Exercises - Group | PT/OT |
| 97140 | Manual Therapy | PT |
| 97165 | Occupational Therapy Evaluation - Low | OT |
| 97166 | Occupational Therapy Evaluation - Moderate | OT |
| 97167 | Occupational Therapy Evaluation - High | OT |
| 97168 | Occupational Therapy Re-evaluation | OT |
| 92507 | Speech/Language Treatment | ST |
| 92508 | Group Speech/Language Treatment | ST |
| 92521-92524 | Speech Evaluations | ST |
| 97001/97002 | Physical Therapy Evaluation/Re-evaluation | PT |
| 97003/97004 | Occupational Therapy Evaluation/Re-evaluation | OT |

**CPT Modifiers for Therapy (often required):**
- **GP** — Services delivered under an outpatient physical therapy plan of care
- **GO** — Services delivered under an outpatient occupational therapy plan of care
- **GN** — Services delivered under an outpatient speech-language pathology plan of care
- **KX** — Services meet medical necessity; documentation is on file (Medicare)
- **59** — Distinct procedural service

---

## 5. Clearinghouse Landscape

### Major Clearinghouses Supporting 278 Transactions

| Clearinghouse | Parent Company | Scale | 278 Support | Notes |
|---------------|---------------|-------|-------------|-------|
| **Availity** | Independent (joint venture) | ~2M providers, 5B+ transactions/yr | ✅ Full 278 + FHIR PA API | Largest network; free basic tier; partnered with Abridge for AI-PA |
| **Change Healthcare / Optum** | UnitedHealth Group | 15B+ annual transactions | ✅ Full 278 | Suffered major 2024 cyberattack; still largest by volume |
| **Waystar** | Public (NASDAQ: WAY) | ~30K clients, $2.4T gross claims/yr | ✅ Full 278 | #1 KLAS 2025 Claims; AI-powered (AltitudeAI) |
| **Cognizant TriZetto** | Cognizant | 875K+ providers, 8K+ payer connections | ✅ Full 278 | Enterprise-grade; 2025-2026 data breach affected reputation |
| **Office Ally** | Independent | 80K+ orgs, 1B+ transactions/yr | ✅ 278 (limited) | Free to providers; best for small practices; limited payer reach for PA |
| **Experian Health (ClaimSource)** | Experian | 1,796+ direct payer connections | ✅ Full 278 | #1 KLAS 2024 Claims; AI denial prevention |
| **SSI Group (Claims Direct)** | Independent | ~1/3 of US health systems | ✅ Full 278 | Strong for hospitals/health systems; resilient during outages |
| **Claim.MD** | Independent | — | ✅ 278 | $0.10–0.25/claim; transparent pricing; good for small-mid practices |

### How a Practice Connects to a Clearinghouse for 278 Submission

#### The Basic Flow

```
PRIA Platform
    │
    │ Generate X12 278 file (or JSON → 278 translation)
    │
    ▼
Clearinghouse Connection
    │
    ├── SFTP (Batch): Upload .edi file to clearinghouse SFTP server
    ├── REST API (Real-time): POST JSON/EDI payload to clearinghouse API
    ├── AS2 (Secure EDI): Encrypted direct connection (enterprise)
    │
    ▼
Clearinghouse Validates, Routes, and Forwards
    │
    ▼
Payer / UMO Receives 278 Request
    │
    ▼
278 Response → Back Through Clearinghouse → Back to PRIA
```

#### API vs. Batch File Submission

| Method | Description | Latency | Best For |
|--------|-------------|---------|----------|
| **REST API** | JSON or EDI payload via HTTPS POST; real-time response | Seconds to minutes | Real-time PA decisions; user-facing apps like PRIA |
| **SFTP Batch** | Upload .edi file; asynchronous processing | Hours | High volume batch submissions |
| **AS2** | Encrypted direct EDI connection | Near real-time | Enterprise health systems |
| **Web Portal** | Manual entry into clearinghouse UI | Manual | Fallback; not automated |

**For PRIA:** REST API integration is the right model. It enables real-time feedback to the therapist/admin submitting the auth request, fits a SaaS product architecture, and supports modern UX. Most major clearinghouses offer REST APIs that accept X12 EDI text or JSON-formatted data and translate/route to payers.

#### Clearinghouse Enrollment Process

Before a practice can use a clearinghouse:
1. **Practice enrolls with clearinghouse** (NPI, tax ID, practice info)
2. **Payer enrollment** — Clearinghouse facilitates EDI enrollment with each payer (takes 2-10 weeks per payer)
3. **Testing** — Send test transactions to validate formatting and routing
4. **Go-live** — Production submissions

For PRIA as a platform: PRIA would enroll as a **vendor** or **billing service** with the clearinghouse, then each client practice would enroll under PRIA's clearinghouse account.

### Pricing Models

| Model | Description | Examples |
|-------|-------------|---------|
| **Free Basic** | Free claim submission; monetize via premium features | Availity, Office Ally |
| **Per-Transaction** | $0.10–$0.50 per claim or transaction | Claim.MD ($0.10–0.25), CollaborateMD |
| **Monthly Subscription** | $200–$800/month; includes unlimited transactions | Waystar, Experian |
| **Enterprise/Custom** | Volume-based; negotiated contract | Change Healthcare/Optum, TriZetto |

**Estimated cost for PA transactions:** When clearinghouses charge per transaction, prior auth (278) typically costs $0.25–$0.50 per request/response pair. Some clearinghouses bundle PA into their subscription.

### Which Major Payers Accept 278 Electronically

| Payer | Electronic 278 Support | Notes |
|-------|----------------------|-------|
| **UnitedHealthcare** | ✅ Full 278 via EDI (005010X217) | Published companion guide; also has portal (Cerner/Optum AuthPortal) |
| **Aetna / CVS Health** | ✅ Full 278 via clearinghouse | Accepts through most major clearinghouses |
| **Cigna / Evernorth** | ✅ Full 278 via clearinghouse | Also has NaviMedix portal for PA |
| **Anthem / Elevance** | ✅ Full 278 via clearinghouse | Accepts via Availity and direct |
| **Humana** | ✅ Full 278 via clearinghouse | Also portal-based PA available |
| **BCBS Plans** | ✅ Most plans accept 278 | Varies by state plan; companion guides differ |
| **Medicare (Traditional)** | ⚠️ Limited — PA not typically required for outpatient PT/OT/ST under Medicare Part B; some MA plans do | Medicare Advantage plans vary widely |
| **Medicaid (State)** | ⚠️ Varies by state | Most states accept 278 via clearinghouse; some still fax/portal |
| **Kaiser Permanente** | ⚠️ Partial — internal for Kaiser members | Limited external EDI; mostly portal-based |
| **Molina Healthcare** | ✅ Accepts via clearinghouse | |
| **Oscar Health** | ⚠️ Limited EDI | Mostly portal-based for small practices |

**Reality check:** Not all payers return a 278 response electronically. Some accept the 278 request but respond via fax, phone, or portal. PRIA should plan for multi-modal response handling.

---

## 6. Recommendations for PRIA

### 6.1 Additional Data Fields PRIA Needs to Add

Based on the data matrix in Section 3, PRIA needs to add the following to its data collection workflows:

**High Priority (Required for 278 generation):**
1. **Patient Member ID** — Most critical field; must be captured from insurance card or confirmed by the practice
2. **Insurance Relationship** — Is the patient the subscriber or a dependent? If dependent, need subscriber info
3. **Subscriber Demographics** — When patient ≠ subscriber: subscriber name, DOB, member ID
4. **Payer EDI ID** — Build/maintain a payer directory table mapping payer names to EDI IDs
5. **Certification Type** — Initial vs. Renewal; workflow logic to determine based on prior auth history
6. **Service Type Code** — Auto-populate based on discipline (PT→AE, OT→AD, ST→AF)
7. **Facility Type / Place of Service** — Typically 11 (Office) for outpatient PT/OT/ST
8. **Visit Pattern** — Visits/week and duration (e.g., 3x/week × 6 weeks)
9. **Requested Service Dates** — Start date (and optionally end date)

**Medium Priority (Situational but commonly required):**
10. **Provider Taxonomy Codes** — Per-provider taxonomy; store in provider profile
11. **CPT Modifiers** (GP/GO/GN) — These should be applied automatically based on discipline
12. **Previous Authorization Number** — For renewal requests; store prior auth numbers in patient record
13. **Onset Date / Date of Injury** — For accident/injury related cases
14. **Secondary Insurance Information** — For coordination of benefits scenarios

**Lower Priority (Edge cases):**
15. State license numbers
16. Functional limitation codes (CRC segment)
17. Referring physician NPI (some payers require in 2010B loop)

### 6.2 Build vs. Library vs. Clearinghouse API

#### Option A: Build Your Own X12 Generator

**Pros:**
- Full control over transaction generation
- No per-transaction fees
- Can optimize for speed and customization

**Cons:**
- X12 278 is complex; getting segment ordering, validation, and companion guide compliance right is non-trivial
- Each payer has its own companion guide with variations
- Testing and certification process with each payer/clearinghouse
- Ongoing maintenance as standards evolve (X12 releases new versions)
- HIPAA security requirements for transaction handling

**Assessment:** Not recommended as the primary path for an early-stage startup. The 278 has enough complexity (mandatory vs. situational rules, companion guide variations, character-level formatting) that building your own generator from scratch will consume 3-6 months of engineering time before you can reliably submit to even one payer.

#### Option B: Use an Open-Source X12 Library

**Available Libraries:**
- **Python:** `x12-edi-tools` (PyPI) — X12 parsing and generation; `pyx12` — well-established HIPAA validator
- **Node.js:** `node-x12-edi` (GitHub: mvogttech) — zero-dependency, bidirectional X12 processing; JSON-to-EDI generation
- **Java:** `edifabric` — enterprise-grade X12 library with 278 support

**Pros:**
- Faster than building from scratch
- Handling segment parsing is done; you focus on business logic
- Can be combined with clearinghouse submission

**Cons:**
- Still need to handle companion guide variations
- Still need to manage clearinghouse/payer connectivity separately
- Libraries may not be fully compliant with 005010X217 nuances

**Assessment:** Use a library for X12 generation, but still route through a clearinghouse for submission. Best of both worlds: you control the transaction format but leverage the clearinghouse's payer network and routing.

**Recommended approach for PRIA (Node.js stack):**
```
PRIA Business Logic (collect data, apply rules)
  → node-x12-edi (generate 278 X12 string)
  → Clearinghouse REST API (submit + receive response)
  → Parse 278 response (node-x12-edi or custom parser)
  → Update PRIA authorization record
```

#### Option C: Clearinghouse API (Recommended Primary Path)

Most major clearinghouses offer **REST APIs** that accept either:
- Raw X12 EDI strings (you generate the 278 and POST it)
- JSON payloads (clearinghouse generates the 278 internally)

**Top clearinghouse API options for PRIA:**

| Clearinghouse | API Type | 278 Support | Best For |
|---------------|----------|-------------|---------|
| **Availity** | REST (JSON + EDI) | ✅ Full | Broadest payer network; FHIR-ready; good documentation |
| **Waystar** | REST API | ✅ Full | Best AI/automation features; #1 KLAS |
| **Change Healthcare / Optum** | REST + EDI | ✅ Full | Highest transaction volume; deep payer connections |
| **Claim.MD** | REST | ✅ 278 | Transparent pricing; good for smaller volumes |
| **Stedi** | REST (JSON→EDI) | ✅ Full | Developer-friendly; pay-per-transaction; excellent 278 docs |

**Stedi** deserves special mention: they offer a developer-centric clearinghouse with JSON APIs that translate to X12 internally. For a startup like PRIA, their documentation and pay-as-you-go model make them worth evaluating for the MVP.

**Assessment: Start with Availity or Stedi as primary clearinghouse. Layer in Change Healthcare/Optum for payer breadth as you scale.**

### 6.3 Priority Payers to Target First

For outpatient PT/OT/ST practices, prioritize in this order:

**Tier 1 (Highest volume, electronic 278 well-established):**
1. **UnitedHealthcare** — Largest commercial insurer; well-documented 278 companion guide; high PA volume for therapy
2. **Anthem / Elevance** — Major regional presence; accepts 278 via Availity
3. **Aetna** — Strong commercial; clearinghouse-friendly
4. **Cigna** — High PA requirements for therapy; good electronic support

**Tier 2 (Important for completeness):**
5. **Humana** — High Medicare Advantage volume (therapy practices see lots of Humana MA)
6. **BCBS Plans** — State-by-state; prioritize by your target markets (Blue Shield CA, BCBS FL, BCBS TX)
7. **Medicare Advantage Plans** — Bundled with Tier 1 payers above; growing share of therapy patients

**Tier 3 (Address as customer demand grows):**
8. **Medicaid (State-by-State)** — Complex; varies enormously; prioritize by state
9. **Molina, Oscar, Kaiser** — Regional; add as needed

**Why Medicare Traditional is not Tier 1:** Traditional Medicare (Fee-for-Service) generally does NOT require prior authorization for outpatient PT/OT/ST services. However, they do require Advance Beneficiary Notices (ABNs) and have therapy caps (now retired, but KX modifier required). Medicare Advantage plans DO require PA and should be targeted via the commercial payer paths above.

### 6.4 Regulatory Considerations

#### Current: HIPAA 5010 (005010X217)
- **This is the law today.** All electronic prior authorization must use 005010X217.
- Payer companion guides are additive — they clarify/restrict what 005010X217 allows; they cannot add new required elements.
- Must maintain HIPAA-compliant data handling (encryption at rest/transit, BAAs with clearinghouses).

#### Upcoming: CMS-0057-F FHIR Prior Authorization API
- **Effective January 1, 2026:** New prior authorization turnaround time requirements (72 hours urgent, 7 days non-urgent).
- **Effective January 1, 2027:** Impacted payers (Medicare Advantage, Medicaid, CHIP, QHP marketplace plans) must implement FHIR-based Prior Authorization API (HL7 Da Vinci PAS Implementation Guide).
- **HHS enforcement discretion:** Covered entities using a fully FHIR-based PA API will NOT face enforcement for not using X12 278 for those transactions.
- **What this means for PRIA:**
  - FHIR PA APIs will be available from major payers starting in 2026-2027
  - Build for FHIR early — it's the future standard
  - The Da Vinci PAS IG (Prior Authorization Support) is the implementation guide to follow for FHIR-based PA
  - In the interim (now through 2027), X12 278 remains the practical standard

#### Da Vinci PAS (Prior Authorization Support) FHIR IG
The HL7 Da Vinci PAS Implementation Guide defines how to map the 278 data elements to FHIR resources (primarily `Claim` and `ClaimResponse` resources with prior auth extensions). PRIA should plan for dual-path support: X12 278 today, FHIR PA API by 2027.

#### X12 008060 Versions
X12 published updated 008060 versions of all HIPAA implementation guides in late 2025, but formal HHS rulemaking to mandate them is pending. **Stay on 005010X217 for production.** Monitor HHS NPRM activity.

---

## Appendix: Quick Reference

### 278 Transaction Identifiers
- Transaction Set: 278
- Implementation: 005010X217
- Functional Group: HI
- BHT02 (Request): 13
- BHT02 (Response): 11

### Therapy Service Type Codes (UM03)
- AD — Occupational Therapy
- AE — Physical Medicine (PT)
- AF — Speech Therapy

### Key Therapy Taxonomy Codes (PRV03)
- 225100000X — Physical Therapist
- 225X00000X — Occupational Therapist
- 235Z00000X — Speech-Language Pathologist

### Certification Types (UM02)
- I — Initial
- R — Renewal

### Common ICD-10 Dx Codes for Therapy Auth
- M47.816 — Spondylosis w/ radiculopathy, lumbar
- M54.5 — Low back pain
- M25.511/M25.512 — Pain in shoulder (R/L)
- S13.4XXA — Sprain of ligaments of cervical spine
- G35 — Multiple Sclerosis (ST relevant)
- R47.01 — Aphasia (ST)

### Payer ID Reference (Sample — always verify)
| Payer | Common EDI Payer ID |
|-------|---------------------|
| UnitedHealthcare | 87726 |
| Aetna | 60054 |
| Cigna | 62308 |
| Anthem BCBS | 00630 (varies by state) |
| Humana | 61101 |
| BCBS California | 94107 |
| Medicare Part B | Varies by MAC region |

*Note: Always verify payer IDs with the clearinghouse before submission — payer IDs can vary by state, product line, and clearinghouse.*

---

*Research compiled May 2026. Standards and regulations subject to change. Verify with official ASC X12 implementation guides and payer companion guides before production implementation.*
