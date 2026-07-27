import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { RecipeStep } from "./portal-recipe.types.js";
import { PortalError } from "./portal.service.js";

const { portalRecipes } = schema;

/**
 * Save a new recipe version for a portal (produced by recording a demo).
 * Auto-increments the version and, when requested, makes it the active one.
 */
export async function createRecipe(input: {
  portalKey: string;
  /** Optional payer variant — null scopes the recipe as the portal generic. */
  payerId?: string | null;
  name: string;
  steps: RecipeStep[];
  activate?: boolean;
  createdBy?: string;
}) {
  // Versioning and single-active are scoped to (portalKey, payerId).
  const scope = and(
    eq(portalRecipes.portalKey, input.portalKey),
    input.payerId
      ? eq(portalRecipes.payerId, input.payerId)
      : isNull(portalRecipes.payerId)
  );

  const [{ maxVersion } = { maxVersion: 0 }] = await db
    .select({ maxVersion: sql<number>`coalesce(max(${portalRecipes.version}), 0)` })
    .from(portalRecipes)
    .where(scope);

  const version = Number(maxVersion) + 1;

  if (input.activate) {
    await db
      .update(portalRecipes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(scope);
  }

  const [row] = await db
    .insert(portalRecipes)
    .values({
      portalKey: input.portalKey,
      payerId: input.payerId ?? null,
      name: input.name,
      version,
      steps: input.steps as unknown[],
      isActive: !!input.activate,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return row;
}

export async function listRecipes(portalKey?: string) {
  const rows = await db.query.portalRecipes.findMany({
    where: portalKey ? eq(portalRecipes.portalKey, portalKey) : undefined,
    orderBy: [desc(portalRecipes.portalKey), desc(portalRecipes.version)],
  });
  // NOTE: createdBy (an email) is intentionally NOT returned — this listing is
  // visible to every tenant and must not disclose other users' addresses.
  return rows.map((r) => ({
    id: r.id,
    portalKey: r.portalKey,
    payerId: r.payerId,
    name: r.name,
    version: r.version,
    stepCount: Array.isArray(r.steps) ? r.steps.length : 0,
    isActive: r.isActive,
    createdAt: r.createdAt,
  }));
}

/**
 * The recipe the worker should replay: the payer-specific active variant
 * when one exists, otherwise the portal's generic active recipe.
 */
export async function getActiveRecipe(portalKey: string, payerId?: string | null) {
  if (payerId) {
    const specific = await db.query.portalRecipes.findFirst({
      where: and(
        eq(portalRecipes.portalKey, portalKey),
        eq(portalRecipes.payerId, payerId),
        eq(portalRecipes.isActive, true)
      ),
    });
    if (specific) return specific;
  }
  return db.query.portalRecipes.findFirst({
    where: and(
      eq(portalRecipes.portalKey, portalKey),
      isNull(portalRecipes.payerId),
      eq(portalRecipes.isActive, true)
    ),
  });
}

export async function activateRecipe(id: string) {
  const recipe = await db.query.portalRecipes.findFirst({
    where: eq(portalRecipes.id, id),
  });
  if (!recipe) throw new PortalError(404, "Recipe not found");

  await db
    .update(portalRecipes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(portalRecipes.portalKey, recipe.portalKey),
        recipe.payerId
          ? eq(portalRecipes.payerId, recipe.payerId)
          : isNull(portalRecipes.payerId)
      )
    );

  await db
    .update(portalRecipes)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(portalRecipes.id, id));

  return { activated: id, portalKey: recipe.portalKey };
}
