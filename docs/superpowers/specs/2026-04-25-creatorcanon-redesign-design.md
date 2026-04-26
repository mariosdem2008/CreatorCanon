# CreatorCanon redesign — design spec

**Date:** 2026-04-25
**Author:** Claude (Opus 4.7) brainstorming session
**Status:** Approved — proceeding to phased implementation

## Context

Existing `/app/*` workspace runs on an editorial cream + black + amber design system with Newsreader serif headings. The user finds it slow and visually wrong. ChatGPT-generated reference images (7 screens) show the desired direction: a dense, operational SaaS workspace — dark navy sidebar, cream canvas, bright violet accent, sans-serif throughout.

This spec covers the redesign. **Performance work is deferred** to a separate workstream after the redesign ships (the redesign should naturally trim payload via denser, more-purposeful screens; we measure afterward).

## Scope

| Surface | Included? | Treatment |
|---|---|---|
| `/app/*` (workspace) | Yes | Full rebuild against new tokens + new component library |
| Public hubs (`/h/<sub>`) | Yes | Reskin Editorial Atlas + Playbook OS on the new tokens; **drop Studio Vault** |
| Marketing (`/`, `/pricing`, `/request-access`) | **No** | Keep the editorial premium look from the previous pass |

## Direction

**Pixel-faithful** to the references — the references are the spec, my job is to translate them into a token system that scales across 20+ routes.

## Design tokens

CSS custom properties under a `cc-` prefix.

### Color
- **Sidebar / structure**: `--cc-sidebar: #0B102B`, `--cc-sidebar-2: #131A3B`, idle nav text `--cc-sidebar-ink-3: #A3A8C7`, active nav text white
- **Canvas / surface**: `--cc-canvas: #FAF8F3`, `--cc-surface: #FFFFFF`, `--cc-surface-2: #F2EEE2`, `--cc-rule: #EDEAE2`
- **Accent**: `--cc-accent: #5856F6` (primary CTA + selected nav), `--cc-accent-wash: #EEEEFF`
- **Status**: `--cc-success: #16A34A`, `--cc-warn: #F59E0B`, `--cc-danger: #EF4444`, `--cc-info: #0EA5E9`
- **Ink (text on canvas)**: `--cc-ink: #0B102B`, `--cc-ink-2: #3F455D`, `--cc-ink-3: #5C6378`, `--cc-ink-4: #7A8095`

### Typography
- **Inter** throughout the workspace + hubs (no serif).
- Compact, dense, operational scale: display 28/34px, page title 22px, panel title 14–15px, body 13–14px, caption 11–12px, metric numerals 26–28px tabular-nums.
- No Newsreader serif inside `/app/*` or `/h/<sub>/*`. Marketing keeps the existing serif (out of scope here).

### Spacing
4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 px scale.

### Radii
6 (pills), 8 (buttons / inputs), 10 (nav items), 12 (cards), 16 (large surfaces), 9999 (status pill).

### Elevation
- `shadow-1`: `0 1px 2px rgba(11,16,43,0.04)`
- `shadow-2`: `0 4px 12px rgba(11,16,43,0.06)`
- `shadow-pop`: `0 12px 32px rgba(11,16,43,0.10)`

## Component library — `apps/web/src/components/cc/*`

Built tier by tier. Old `apps/web/src/components/ui/*` stays in place during migration; deleted in Phase 5.

### Tier 1 — Foundation (Phase 1)
AppShell, Sidebar, NavItem, SidebarBrand, PlanCard, AskAtlasFloat, TopBar, AtlasPill, NotificationBell, PageHeader, Panel, Button, Input, Select, Textarea, Toggle, Avatar.

### Tier 2 — Data display (Phase 1)
MetricCard, SparklineCard, StatusPill, SupportLabel, SupportCoverageBar, DataTable, FilterBar, FilterTabs, ProgressStepper, NoticeBanner, EmptyState, Tag, Badge.

### Tier 3 — Workspace specifics (Phases 2–3 as needed)
ChannelHeaderCard, RecentActivityList, HubProgressCard, AtlasActivityFeed, AtlasRecommendations, LivePreviewFrame, VideoRow, PageRow, SectionList.

**`AtlasDock` is removed from Phase 1 entirely.** No stub. Atlas is represented only by:
- AtlasPill in the topbar (visual element only — opens nothing in Phase 1)
- "Need help? Ask Atlas" card at sidebar bottom (visual element only)
A real Atlas panel may land in a later phase if scoped.

### Tier 4 — Route layouts (Phase 3)
TwoPaneLayout, ThreePaneLayout, ActivityPaneLayout, DataTablePage, SettingsLayout.

## App shell layout

- **Sidebar**: 232px, sticky full-height, dark navy (`#0B102B`).
  - Top: SidebarBrand (CreatorCanon logo lockup).
  - Middle: 5 nav items (Home / Videos / Pages / Publish / Settings). **No Workspace section. No Inbox / Insights / Activity in v1.**
  - Bottom: AskAtlasFloat ("Need help? Ask Atlas") then PlanCard (avatar, name, "Creator Plan · 1 of 3 hubs").
- **Active nav state**: soft 12% violet wash + 1px violet inset edge, white text + icon. **No shadow halo / glow.**
- **Topbar**: 50px, route context crumb on the left ("Home / Welcome back, Ali"), AtlasPill + NotificationBell on the right.
  - Notification bell red dot reads from `inbox_item.status='unread'` rows.
- **Canvas**: cream `#FAF8F3`, padded 22/28, content max-width 1240px, left-aligned.

## Home (`/app`) — command-center layout

Six sections in order, denser vertical rhythm than current:

1. **PageHeader** — eyebrow "COMMAND CENTER", title "Welcome back, {name}", body "Your channel is connected. Choose the videos for your first knowledge hub and Atlas will handle the rest." Right side: **single primary CTA "Select videos →"**. No "Browse channel" here.
2. **NoticeBanner** — Atlas badge + "{N} source-ready videos found. Atlas suggests starting with your highest-engagement, most-comprehensive teaching content for the strongest first hub." with "Review picks →" action.
3. **HubProgressCard** — five-step stepper:
   1. Select videos
   2. Configure hub
   3. Generate
   4. Review pages
   5. Publish
4. **MetricCards × 4**, zero state by default:
   - Videos selected — "0" — sub: "Select at least 8 to start"
   - Pages generated — "0" — sub: "Generated after your first run"
   - Pages approved — "0" — sub: "Approved during review"
   - Hub status — "Not started" — sub: "Not started yet"
5. **Two-column row**:
   - **ChannelHeaderCard** — real avatar, channel name, handle, total videos, transcript coverage, connected pill, secondary CTA "View videos" inside the card. Real data from `channel` + counts from `video` table.
   - **RecentActivityList** — pulls from `inbox_item`. Empty state: icon, "No activity yet", "Select videos to start your first hub. Atlas will log every step here." with "Select videos →" CTA. **"View all" header link is hidden when list is empty.**

## Hub templates (Phase 5)

- **Drop Studio Vault** entirely.
- **Editorial Atlas** + **Playbook OS** — reskin on the new tokens. Both keep their reader-focused content layouts; only the visual language migrates.
- Hub theme picker still surfaces both at config time; default flips from "Editorial Atlas" to whatever feels strongest after the reskin.

## Migration plan — five phases

Each phase typecheck/lint/preview-verifies before the next. Each phase is independently shippable. Each phase pauses for user review before the next starts.

| Phase | Scope | Verification |
|---|---|---|
| **1** | Tokens + Tier 1/2 primitives + new AppShell + Home (`/app`) command center. Old `/app` other routes still use legacy components. | typecheck + lint + preview QA of `/app` |
| **2** | Migrate Videos (`/app/library`) to new shell + DataTable. | typecheck + lint + preview QA |
| **3** | Migrate Projects (`/app/projects`, `/app/projects/[id]`, configure, pages, review, generating, publish) on Tier 3/4 layouts. | typecheck + lint + preview QA |
| **4** | Migrate Settings tree on new shell. | typecheck + lint + preview QA |
| **5** | Drop Studio Vault, reskin Editorial Atlas + Playbook OS hub templates. Delete legacy `components/ui/*` and any unmigrated layouts. | typecheck + lint + e2e + preview QA |

User reviews after each phase; can request changes before Phase N+1 starts.

## Out of scope

- Performance optimization (queries, streaming, caching) — separate workstream.
- AtlasDock implementation — deferred indefinitely; phase 1 has only the visual pill + helper card.
- Marketing surface redesign — keep current.
- Schema changes — none required for the redesign itself; the persisted `agent_suggestion` and `inbox_item` tables added earlier today are sufficient.

## Open follow-ups

- After Phase 1 lands, measure first-paint + LCP for `/app` to validate the "redesign trims payload" hypothesis. If it didn't, schedule perf work next.
- Hub theme picker copy needs a refresh when Studio Vault is removed (Phase 5).
