import type { X12278Request } from "@pria/shared";

/**
 * Maps our assembled X12 278 request onto Availity's Service Reviews JSON.
 *
 * Availity does NOT accept a raw X12 278 — you send structured JSON and they
 * build the EDI. Our assembler already produces everything needed, so this is a
 * field-level translation rather than a second data model.
 *
 * Field names/codes verified against Availity's Service Reviews 2.0.0 reference.
 */

/** Availity wants plain YYYY-MM-DD for date fields. */
function asDate(d?: string): string | undefined {
  if (!d) return undefined;
  return /^\d{8}$/.test(d)
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    : d;
}

/** Drop undefined/empty values so we don't send noise Availity may reject. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0)
    ) {
      delete obj[key];
    }
  }
  return obj;
}

export interface MapOptions {
  /** The payer's Availity-specific id (from the payer directory). */
  availityPayerId: string;
}

export function toServiceReview(
  request: X12278Request,
  opts: MapOptions
): Record<string, unknown> {
  const { submitter, subscriber, dependent, provider, authRequest } = request;

  // Patient is the dependent when present, otherwise the subscriber themselves.
  const patient = dependent
    ? clean({
        firstName: dependent.firstName,
        lastName: dependent.lastName,
        middleName: dependent.middleName,
        birthDate: asDate(dependent.dob),
        genderCode: dependent.gender,
        subscriberRelationshipCode: dependent.relationshipCode,
      })
    : clean({
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        middleName: subscriber.middleName,
        birthDate: asDate(subscriber.dob),
        genderCode: subscriber.gender,
        subscriberRelationshipCode: "18", // Self
      });

  const serviceReview: Record<string, unknown> = {
    payer: clean({
      id: opts.availityPayerId,
      name: request.payer.name,
    }),

    // The practice submitting the request (group NPI).
    requestingProvider: clean({
      lastName: submitter.practiceName,
      npi: submitter.groupNpi,
      specialtyCode: submitter.taxonomyCodes?.[0],
      addressLine1: submitter.address?.street,
      city: submitter.address?.city,
      stateCode: submitter.address?.state,
      zipCode: submitter.address?.zip,
      phone: submitter.phone,
      fax: submitter.fax,
    }),

    subscriber: clean({
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      middleName: subscriber.middleName,
      memberId: subscriber.memberId,
      addressLine1: subscriber.address?.street,
      city: subscriber.address?.city,
      stateCode: subscriber.address?.state,
      zipCode: subscriber.address?.zip,
    }),

    patient,

    // BF = ICD-10-CM principal diagnosis
    diagnoses: authRequest.diagnoses.map((code) => ({
      qualifierCode: "BF",
      code,
    })),

    // HS = Health Services Review (outpatient authorization) — always correct
    // for outpatient PT/OT/ST. (AR = inpatient, SC = referral.)
    requestTypeCode: "HS",
    serviceTypeCode: authRequest.serviceTypeCode,
    placeOfServiceCode: submitter.facilityTypeCode,
    fromDate: asDate(authRequest.startDate),
    toDate: asDate(authRequest.endDate),
  };

  // Requested visits → quantity (VS = visits). Prefer the structured pattern's
  // total; fall back to the flat requestedVisits so the common create-form path
  // never submits without a visit count.
  const totalVisits = authRequest.visitPattern
    ? authRequest.visitPattern.visitsPerPeriod * authRequest.visitPattern.periodCount
    : (authRequest.requestedVisits ?? 0);
  if (totalVisits > 0) {
    serviceReview["quantity"] = String(totalVisits);
    serviceReview["quantityTypeCode"] = "VS";
  }

  // CPT/HCPCS lines (HC qualifier).
  if (request.serviceLines && request.serviceLines.length > 0) {
    serviceReview["procedures"] = request.serviceLines.map((line) =>
      clean({
        qualifierCode: "HC",
        code: line.cptCode,
        description: line.description,
        fromDate: asDate(authRequest.startDate),
        toDate: asDate(authRequest.endDate),
      })
    );
  }

  // The treating therapist. roleCode 71 = attending/rendering provider.
  if (provider?.npi) {
    serviceReview["renderingProviders"] = [
      clean({
        roleCode: "71",
        lastName: provider.lastName,
        firstName: provider.firstName,
        npi: provider.npi,
        specialtyCode: provider.taxonomyCode,
        addressLine1: provider.address?.street,
        city: provider.address?.city,
        stateCode: provider.address?.state,
        zipCode: provider.address?.zip,
        phone: provider.phone,
      }),
    ];
  }

  return clean(serviceReview);
}
