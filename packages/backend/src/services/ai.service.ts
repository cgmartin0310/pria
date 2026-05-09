import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type {
  ClinicalSummaryRequest,
  ClinicalSummaryResponse,
  DenialPrediction,
} from "@pria/shared";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// ─── Clinical Summary Generation ──────────────────────────────────────────────

export async function generateClinicalSummary(
  request: ClinicalSummaryRequest
): Promise<ClinicalSummaryResponse> {
  const prompt = `You are a clinical documentation specialist for a physical/occupational/speech therapy practice.

Generate a compelling medical necessity summary for a prior authorization request with the following details:

Patient: ${request.patientName} (DOB: ${request.dob})
Diagnosis Codes: ${request.diagnosisCodes.join(", ")}
CPT Codes Requested: ${request.cptCodes.join(", ")}
Requested Visits: ${request.requestedVisits}
${request.functionalLimitations ? `Functional Limitations: ${request.functionalLimitations}` : ""}
${request.treatmentGoals ? `Treatment Goals: ${request.treatmentGoals}` : ""}
${request.priorTreatments ? `Prior Treatments: ${request.priorTreatments}` : ""}

Respond with a JSON object containing:
- summary: A 2-3 paragraph clinical narrative establishing medical necessity
- keyPoints: Array of 3-5 bullet points summarizing key clinical factors
- medicalNecessityScore: A score from 0-100 estimating likelihood of approval based on documentation quality`;

  const message = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content?.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Extract JSON from response (Claude might wrap it in markdown)
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON from Claude response");
  }

  return JSON.parse(jsonMatch[0]) as ClinicalSummaryResponse;
}

// ─── Denial Prediction ────────────────────────────────────────────────────────

export async function predictDenialRisk(params: {
  payerName: string;
  cptCodes: string[];
  icdCodes: string[];
  requestedVisits: number;
  clinicalSummary?: string;
}): Promise<DenialPrediction> {
  const prompt = `You are an expert in insurance prior authorization for therapy services.

Analyze this prior authorization request and predict the denial risk:

Payer: ${params.payerName}
CPT Codes: ${params.cptCodes.join(", ")}
ICD-10 Codes: ${params.icdCodes.join(", ")}
Requested Visits: ${params.requestedVisits}
${params.clinicalSummary ? `Clinical Summary: ${params.clinicalSummary.substring(0, 500)}...` : ""}

Respond with a JSON object:
- likelihood: "low" | "medium" | "high"
- score: 0-100 (100 = certain denial)
- reasons: Array of specific denial risk factors
- recommendations: Array of specific actions to improve approval chances`;

  const message = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content?.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON from Claude response");
  }

  return JSON.parse(jsonMatch[0]) as DenialPrediction;
}

// ─── Appeal Letter Generation ──────────────────────────────────────────────────

export async function generateAppealLetter(params: {
  patientName: string;
  authNumber: string;
  denialReason: string;
  clinicalSummary: string;
  cptCodes: string[];
  icdCodes: string[];
  providerName: string;
  providerNpi: string;
  payerName: string;
}): Promise<string> {
  const prompt = `You are a clinical appeal specialist. Write a compelling appeal letter for a denied prior authorization.

Details:
- Patient: ${params.patientName}
- Auth Number: ${params.authNumber}
- Payer: ${params.payerName}
- Denial Reason: ${params.denialReason}
- Treating Provider: ${params.providerName} (NPI: ${params.providerNpi})
- Services: ${params.cptCodes.join(", ")}
- Diagnoses: ${params.icdCodes.join(", ")}
- Clinical Background: ${params.clinicalSummary}

Write a formal appeal letter that:
1. Clearly identifies the denial being appealed
2. States why the denial is incorrect
3. Provides clinical justification
4. References relevant clinical guidelines
5. Requests immediate reconsideration

Format as a professional medical letter, ready to send.`;

  const message = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content?.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return content.text;
}
