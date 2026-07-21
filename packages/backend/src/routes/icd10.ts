import type { FastifyInstance } from "fastify";

/**
 * ICD-10-CM code search.
 *
 * Proxies the free U.S. NIH/NLM Clinical Tables service, which exposes the full
 * ICD-10-CM code set (~70k codes) with no API key. We proxy server-side rather
 * than calling from the browser so the external dependency stays behind our own
 * authenticated API and can be cached or swapped later.
 *
 * Only the clinician's search text is sent upstream — never patient data.
 *
 * NLM response shape: [ totalCount, [codes], hashOrNull, [[code, name], ...] ]
 * Docs: https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html
 */
const NLM_URL = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search";

export async function icd10Routes(app: FastifyInstance) {
  app.get("/icd10/search", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const q = (query["q"] ?? "").trim();
    const limit = Math.min(Math.max(parseInt(query["limit"] ?? "25", 10) || 25, 1), 50);

    if (q.length < 2) {
      return reply.send({ data: [] });
    }

    const url =
      `${NLM_URL}?sf=code,name&df=code,name` +
      `&terms=${encodeURIComponent(q)}&maxList=${limit}`;

    // Guard against a slow/unreachable upstream.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        req.log.warn({ status: res.status }, "NLM ICD-10 search failed");
        return reply.status(502).send({
          error: "UPSTREAM_ERROR",
          message: "Diagnosis code service is unavailable",
          statusCode: 502,
        });
      }

      const json = (await res.json()) as unknown;
      const rows = Array.isArray(json) && Array.isArray(json[3]) ? json[3] : [];
      const data = rows
        .filter(
          (row): row is [string, string] =>
            Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string"
        )
        .map(([code, name]) => ({ code, name }));

      return reply.send({ data });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      req.log.warn({ err }, "NLM ICD-10 search error");
      return reply.status(aborted ? 504 : 502).send({
        error: aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        message: "Diagnosis code service is unavailable",
        statusCode: aborted ? 504 : 502,
      });
    } finally {
      clearTimeout(timeout);
    }
  });
}
