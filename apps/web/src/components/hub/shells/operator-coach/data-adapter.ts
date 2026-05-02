/**
 * Data adapter — converts a ProductBundle (from packages/synthesis) into
 * the prop shapes consumed by the operator-coach shell pages.
 *
 * Keeping the bundle->props transform here means the shell pages stay
 * thin and easy to unit-test with hand-built fixtures. It also creates
 * one chokepoint where future bundle schema migrations are absorbed.
 */

import type {
  ActionPlanComponent,
  ActionPlanPhase,
  CalculatorComponent,
  DiagnosticComponent,
  FunnelComponent,
  ProductBundle,
  WorksheetComponent,
} from '@creatorcanon/synthesis';

export interface OperatorCoachShellProps {
  archetype: 'operator-coach';
  voiceMode: ProductBundle['voiceMode'];
  productGoal: ProductBundle['productGoal'];
  brand: { primaryColor: string; logoUrl?: string; logoAlt?: string };
  primaryCta: { label: string; href: string } | null;
  pages: {
    home: HomePageProps;
    actionPlan: ActionPlanPageProps | null;
    worksheets: WorksheetIndexProps;
    calculators: CalculatorIndexProps;
    library: LibraryPageProps;
  };
}

export interface HomePageProps {
  diagnostic: DiagnosticComponent | null;
  heroHeadline: string;
  heroSubcopy: string;
  primaryCta: { label: string; href: string } | null;
  funnel: FunnelComponent;
}

export interface ActionPlanPageProps {
  phases: ActionPlanPhase[];
  intro: string;
  outroCta: string;
}

export interface WorksheetIndexProps {
  worksheets: WorksheetComponent[];
}

export interface CalculatorIndexProps {
  calculators: CalculatorComponent[];
}

export interface LibraryPageProps {
  /**
   * Stub for Phase A — operator-coach hubs de-emphasize the library;
   * link nav only. Phase H/I/J shells flesh this out.
   */
  enabled: boolean;
}

function nonEmptyString(s: string | undefined | null, fallback: string): string {
  return typeof s === 'string' && s.trim().length > 0 ? s : fallback;
}

function buildHeroHeadline(actionPlan: ActionPlanComponent | undefined): string {
  if (!actionPlan) return 'Find your next move';
  return nonEmptyString(actionPlan.intro?.split('. ')[0], 'Find your next move');
}

function buildHeroSubcopy(actionPlan: ActionPlanComponent | undefined): string {
  if (!actionPlan?.intro) return 'A diagnostic + action plan tailored to your business stage.';
  return actionPlan.intro;
}

export function adaptBundleForOperatorCoach(
  bundle: ProductBundle,
): OperatorCoachShellProps {
  if (bundle.archetype !== 'operator-coach') {
    throw new Error(
      `data-adapter: expected operator-coach archetype, got ${bundle.archetype}`,
    );
  }

  const primaryCta = bundle.creatorConfig.ctas?.primary
    ? { label: bundle.creatorConfig.ctas.primary.label, href: bundle.creatorConfig.ctas.primary.href }
    : null;

  return {
    archetype: 'operator-coach',
    voiceMode: bundle.voiceMode,
    productGoal: bundle.productGoal,
    brand: bundle.creatorConfig.brand,
    primaryCta,
    pages: {
      home: {
        diagnostic: bundle.components.diagnostic ?? null,
        heroHeadline: buildHeroHeadline(bundle.components.actionPlan),
        heroSubcopy: buildHeroSubcopy(bundle.components.actionPlan),
        primaryCta,
        funnel: bundle.components.funnel,
      },
      actionPlan: bundle.components.actionPlan
        ? {
            phases: bundle.components.actionPlan.phases,
            intro: bundle.components.actionPlan.intro,
            outroCta: bundle.components.actionPlan.outroCta,
          }
        : null,
      worksheets: { worksheets: bundle.components.worksheets ?? [] },
      calculators: { calculators: bundle.components.calculators ?? [] },
      library: { enabled: false },
    },
  };
}
