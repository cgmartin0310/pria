/**
 * Simulated clearinghouse ("Test Mode").
 *
 * Builds a realistic X12 278 RESPONSE (005010X217) so the full pipeline can be
 * exercised end-to-end without a live clearinghouse: generate 278 → "submit" →
 * canned response → parse → update the authorization.
 *
 * This is explicitly a TEST harness. Every decision it produces is labelled as
 * simulated in the authorization history — it must never be presented to a user
 * as a real payer decision.
 */

const SEP = "*";
const TERM = "~";

/** HCR01 action codes we can simulate. */
export type SimulatedDecision = "A1" | "A3" | "A4";

export const SIMULATED_DECISIONS: Record<SimulatedDecision, string> = {
  A1: "Approved (certified)",
  A3: "Denied (not certified)",
  A4: "Pended (more info required)",
};

function seg(id: string, ...elements: (string | number | null | undefined)[]): string {
  const parts: string[] = [id];
  for (const e of elements) {
    parts.push(e === null || e === undefined ? "" : String(e));
  }
  while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.join(SEP) + TERM;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function d8(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export interface SimulatedResponseInput {
  decision: SimulatedDecision;
  /** Trace/tracking number echoed back from the request. */
  traceNumber: string;
  payerName: string;
  payerId: string;
  practiceName: string;
  practiceNpi: string;
  patientLastName: string;
  patientFirstName: string;
  memberId: string;
  /** Certification period length in days (approved/modified only). */
  certDays?: number;
}

export interface SimulatedResponse {
  /** The canned X12 278 response EDI. */
  edi: string;
  /** The auth number issued (approved only). */
  authNumber: string | null;
}

/**
 * Build a canned 278 response. Mirrors the segments our parser reads:
 * ST*278, HCR (decision + auth number + cert period), and AAA on rejection.
 */
export function buildSimulatedResponse(
  input: SimulatedResponseInput
): SimulatedResponse {
  const now = new Date();
  const txDate = d8(now);
  const txTime = `${pad(now.getHours())}${pad(now.getMinutes())}`;

  const approved = input.decision === "A1";
  // Deterministic, obviously-fake auth number so it's never mistaken for real.
  const authNumber = approved ? `TEST-${input.traceNumber.slice(-8)}` : null;

  const certStart = new Date(now);
  const certEnd = new Date(now);
  certEnd.setDate(certEnd.getDate() + (input.certDays ?? 90));

  const segs: string[] = [];
  segs.push(seg("ST", "278", "0001", "005010X217"));
  // BHT06 = 11 (response)
  segs.push(seg("BHT", "0007", "11", input.traceNumber, txDate, txTime));

  // 2000A — UMO / payer
  segs.push(seg("HL", 1, "", "20", "1"));
  segs.push(
    seg("NM1", "X3", "2", input.payerName, "", "", "", "", "PI", input.payerId)
  );

  // 2000B — requester
  segs.push(seg("HL", 2, 1, "21", "1"));
  segs.push(
    seg("NM1", "1P", "2", input.practiceName, "", "", "", "", "XX", input.practiceNpi)
  );

  // 2000C — subscriber
  segs.push(seg("HL", 3, 2, "22", "1"));
  segs.push(
    seg(
      "NM1",
      "IL",
      "1",
      input.patientLastName,
      input.patientFirstName,
      "",
      "",
      "",
      "MI",
      input.memberId
    )
  );

  // 2000E — patient event + decision
  segs.push(seg("HL", 4, 3, "EV", "0"));
  segs.push(seg("TRN", "2", input.traceNumber, input.practiceNpi));

  // HCR01 decision, HCR02 auth number, HCR03 cert period range
  if (approved) {
    segs.push(
      seg("HCR", "A1", authNumber, `${d8(certStart)}-${d8(certEnd)}`)
    );
  } else if (input.decision === "A3") {
    segs.push(seg("HCR", "A3"));
    // Reason: not medically necessary (simulated)
    segs.push(seg("MSG", "SIMULATED DENIAL - documentation did not establish medical necessity"));
  } else {
    segs.push(seg("HCR", "A4"));
    segs.push(seg("MSG", "SIMULATED PEND - additional clinical information required"));
  }

  segs.push(seg("SE", segs.length + 1, "0001"));

  const edi = segs.join("\n");
  return { edi, authNumber };
}
