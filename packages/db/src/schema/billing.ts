import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  costProviderEnum,
  costUserInteractionEnum,
  invoiceStatusEnum,
  planEnum,
  subscriptionStatusEnum,
} from './enums';
import { workspace } from './workspace';
import { generationRun } from './run';

/**
 * `customer` — Stripe customer mirror keyed by workspace.
 * One row per workspace that has ever touched Stripe.
 */
export const customer = pgTable(
  'customer',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    email: text('email'),
    defaultPaymentMethodId: text('default_payment_method_id'),
    taxId: text('tax_id'),
    livemode: boolean('livemode').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceUnique: uniqueIndex('customer_workspace_unique').on(t.workspaceId),
    stripeCustomerUnique: uniqueIndex('customer_stripe_customer_unique').on(
      t.stripeCustomerId,
    ),
  }),
);

export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull(),
    plan: planEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
      mode: 'date',
    }),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
      mode: 'date',
    }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true, mode: 'date' }),
    trialStart: timestamp('trial_start', { withTimezone: true, mode: 'date' }),
    trialEnd: timestamp('trial_end', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    stripeSubUnique: uniqueIndex('subscription_stripe_sub_unique').on(
      t.stripeSubscriptionId,
    ),
    workspaceStatusIdx: index('subscription_workspace_status_idx').on(
      t.workspaceId,
      t.status,
    ),
    customerIdx: index('subscription_customer_idx').on(t.customerId),
  }),
);

export const invoice = pgTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscription.id, {
      onDelete: 'set null',
    }),
    stripeInvoiceId: text('stripe_invoice_id').notNull(),
    status: invoiceStatusEnum('status').notNull(),
    amountDueCents: integer('amount_due_cents').notNull().default(0),
    amountPaidCents: integer('amount_paid_cents').notNull().default(0),
    currency: text('currency').notNull().default('usd'),
    hostedInvoiceUrl: text('hosted_invoice_url'),
    pdfUrl: text('pdf_url'),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    /** Optional tie-back to a generation_run for per-run hub purchases. */
    runId: text('run_id').references(() => generationRun.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    stripeInvoiceUnique: uniqueIndex('invoice_stripe_invoice_unique').on(
      t.stripeInvoiceId,
    ),
    workspaceCreatedIdx: index('invoice_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    subscriptionIdx: index('invoice_subscription_idx').on(t.subscriptionId),
    customerIdx: index('invoice_customer_idx').on(t.customerId),
  }),
);

/**
 * `stripe_event` — durable dedupe + replay record for Stripe webhook events.
 */
export const stripeEvent = pgTable(
  'stripe_event',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspace.id, {
      onDelete: 'set null',
    }),
    stripeEventId: text('stripe_event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    livemode: boolean('livemode').notNull().default(false),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    stripeEventUnique: uniqueIndex('stripe_event_stripe_event_id_unique').on(
      t.stripeEventId,
    ),
    workspaceReceivedIdx: index('stripe_event_workspace_received_idx').on(
      t.workspaceId,
      t.receivedAt,
    ),
    typeIdx: index('stripe_event_type_idx').on(t.type),
  }),
);

/**
 * `cost_ledger_entry` — one row per LLM / STT / external API call.
 * Provider enum includes 'gemini'. Fields include video seconds + frames
 * for the Gemini visual lane.
 */
export const costLedgerEntry = pgTable(
  'cost_ledger_entry',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspace.id, {
      onDelete: 'set null',
    }),
    runId: text('run_id').references(() => generationRun.id, {
      onDelete: 'set null',
    }),
    stageName: text('stage_name'),
    userInteraction: costUserInteractionEnum('user_interaction')
      .notNull()
      .default('pipeline'),
    provider: costProviderEnum('provider').notNull(),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /** Gemini direct-video mode: seconds of video ingested. */
    inputSecondsVideo: integer('input_seconds_video'),
    /** Gemini sampled-frames mode: number of frames sent. */
    inputFrames: integer('input_frames'),
    durationMs: integer('duration_ms'),
    costCents: numeric('cost_cents', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runStageIdx: index('cost_ledger_entry_run_stage_idx').on(
      t.runId,
      t.stageName,
    ),
    providerModelIdx: index('cost_ledger_entry_provider_model_idx').on(
      t.provider,
      t.model,
    ),
    createdIdx: index('cost_ledger_entry_created_idx').on(t.createdAt),
    workspaceCreatedIdx: index('cost_ledger_entry_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);
