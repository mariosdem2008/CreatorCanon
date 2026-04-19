import Stripe from 'stripe';
import { AtlasError } from '@atlas/core';
import type { ServerEnv } from '@atlas/core';
import { z } from 'zod';

const createCheckoutSessionSchema = z.object({
  /** Stripe customer id; omit for guest checkout (customer created on success). */
  customerId: z.string().optional(),
  /** Price id for the line item. */
  priceId: z.string().min(1),
  mode: z.enum(['payment', 'subscription']).default('payment'),
  quantity: z.number().int().positive().default(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  /** Idempotency key (Stripe-native dedupe header). */
  idempotencyKey: z.string().min(1),
  /** Free-form metadata forwarded onto the Checkout session. */
  metadata: z.record(z.string()).optional(),
});

export type CreateCheckoutSessionParams = z.infer<
  typeof createCheckoutSessionSchema
>;

export interface CheckoutSessionResult {
  id: string;
  url: string;
  status: Stripe.Checkout.Session.Status | null;
}

export interface WebhookHandleResult {
  event: Stripe.Event;
  /** True if the signature verified and the caller should act on the event. */
  verified: boolean;
}

export interface StripeAdapterClient {
  readonly raw: Stripe;

  createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;
  retrieveCheckout(id: string): Promise<Stripe.Checkout.Session>;
  createCustomer(email: string): Promise<Stripe.Customer>;
  /**
   * Verify a Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` and
   * return the parsed event. Raises `AtlasError` on signature failure.
   */
  handleWebhook(
    event: unknown,
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookHandleResult>;
}

const notImplemented = (op: string): AtlasError =>
  new AtlasError({
    code: 'not_implemented',
    category: 'internal',
    message: `StripeClient.${op} is not implemented yet (lands in Epic 5).`,
  });

export const createStripeClient = (env: ServerEnv): StripeAdapterClient => {
  const raw = new Stripe(env.STRIPE_SECRET_KEY, {
    // Pin API version explicitly; matches Stripe SDK 16.x default surface.
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    typescript: true,
  });

  return {
    raw,
    async createCheckoutSession(params) {
      createCheckoutSessionSchema.parse(params);
      throw notImplemented('createCheckoutSession');
    },
    async retrieveCheckout(id) {
      z.string().min(1).parse(id);
      throw notImplemented('retrieveCheckout');
    },
    async createCustomer(email) {
      z.string().email().parse(email);
      throw notImplemented('createCustomer');
    },
    async handleWebhook(_event, signature, _rawBody) {
      z.string().min(1).parse(signature);
      // Epic 5: `raw.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)`
      void env.STRIPE_WEBHOOK_SECRET;
      throw notImplemented('handleWebhook');
    },
  };
};
