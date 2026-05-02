/**
 * Operator-coach shell — entry that selects the right page module given
 * a path within a hub.
 *
 * Routing convention (consumed by the hub route handlers in apps/web/src/app/h/):
 *   /             -> HomePage
 *   /action-plan  -> ActionPlanPage
 *   /worksheets   -> WorksheetIndexPage
 *   /worksheets/[worksheetId] -> WorksheetDetailPage
 *   /calculators/[calculatorId] -> CalculatorPage
 *   /library      -> LibraryPage (de-emphasized)
 *
 * Phase A scope: components only. Wiring into apps/web/src/app/h/[hubSlug]/
 * route segments is intentionally deferred — that file lives in territory
 * Codex may also touch (Phase G distribution work). The shell is shipped
 * as a self-contained library; the route segment that mounts it will be
 * a Phase B follow-up.
 */

export { adaptBundleForOperatorCoach } from './data-adapter';
export type {
  ActionPlanPageProps,
  CalculatorIndexProps,
  HomePageProps,
  LibraryPageProps,
  OperatorCoachShellProps,
  WorksheetIndexProps,
} from './data-adapter';

export { HomePage } from './pages/HomePage';
export { ActionPlanPage } from './pages/ActionPlanPage';
export { WorksheetIndexPage, WorksheetDetailPage } from './pages/WorksheetPage';
export { CalculatorPage } from './pages/CalculatorPage';
export { LibraryPage } from './pages/LibraryPage';
