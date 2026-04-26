import Stripe from 'stripe';
import { CanonError } from '@creatorcanon/core';
import type { ServerEnv } from '@creatorcanon/core';
import { z } from 'zod';

const createCheckoutSessionSchema = z.object({
  /** Stripe customer id; omit for guest checkout (customer created on success). */
  customerId: z.string().optional(),
  /** Price id for the line item. Optional when passing inline amount data. */
  priceId: z.string().min(1).optional(),
  amountCents: z.number().int().positive().optional(),
  currency: z.string().min(3).default('usd'),
  productName: z.string().min(1).optional(),
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

export interface BillingPortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export interface BillingPortalSessionResult {
  id: string;
  url: string;
}

export interface StripeAdapterClient {
  readonly raw: Stripe;

  createCheckoutSession(
    params: CreateCheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;
  retrieveCheckout(id: string): Promise<Stripe.Checkout.Session>;
  createCustomer(email: string): Promise<Stripe.Customer>;
  createBillingPortalSession(
    params: BillingPortalSessionParams,
  ): Promise<BillingPortalSessionResult>;
  /**
   * Verify a Stripe webhook signature using `STRIPE_WEBHOOK_SECRET` and
   * return the parsed event. Raises `CanonError` on signature failure.
   */
  handleWebhook(
    event: unknown,
    signature: string,
    rawBody: string | Buffer,
  ): Promise<WebhookHandleResult>;
}

export const createStripeClient = (env: ServerEnv): StripeAdapterClient => {
  const raw = new Stripe(env.STRIPE_SECRET_KEY, {
    // Pin API version explicitly; matches Stripe SDK 16.x default surface.
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    typescript: true,
  });

  return {
    raw,
    async createCheckoutSession(params) {
      const parsed = createCheckoutSessionSchema.parse(params);
      if (!parsed.priceId && (!parsed.amountCents || !parsed.productName)) {
        throw new CanonError({
          code: 'invalid_input',
          category: 'validation',
          message: 'Stripe checkout requires either a priceId or inline amount/product data.',
        });
      }

      const session = await raw.checkout.sessions.create({
        mode: parsed.mode,
        customer: parsed.customerId,
        success_url: parsed.successUrl,
        cancel_url: parsed.cancelUrl,
        metadata: parsed.metadata,
        payment_intent_data: {
          metadata: parsed.metadata,
        },
        line_items: [
          parsed.priceId
            ? {
                price: parsed.priceId,
                quantity: parsed.quantity,
              }
            : {
                quantity: parsed.quantity,
                price_data: {
                  currency: parsed.currency,
                  unit_amount: parsed.amountCents,
                  product_data: {
                    name: parsed.productName!,
                  },
                },
              },
        ],
      }, {
        idempotencyKey: parsed.idempotencyKey,
      });

      if (!session.url) {
        throw new CanonError({
          code: 'provider_error',
          category: 'provider_upstream',
          message: 'Stripe did not return a checkout URL.',
        });
      }

      return {
        id: session.id,
        url: session.url,
        status: session.status,
      };
    },
    async retrieveCheckout(id) {
      const checkoutId = z.string().min(1).parse(id);
      return raw.checkout.sessions.retrieve(checkoutId);
    },
    async createCustomer(email) {
      const customerEmail = z.string().email().parse(email);
      return raw.customers.create({ email: customerEmail });
    },
    async createBillingPortalSession({ customerId, returnUrl }) {
      const id = z.string().min(1).parse(customerId);
      const url = z.string().url().parse(returnUrl);
      const session = await raw.billingPortal.sessions.create({
        customer: id,
        return_url: url,
      });
      if (!session.url) {
        throw new CanonError({
          code: 'provider_error',
          category: 'provider_upstream',
          message: 'Stripe did not return a billing portal URL.',
        });
      }
      return { id: session.id, url: session.url };
    },
    async handleWebhook(_event, signature, rawBody) {
      const signedHeader = z.string().min(1).parse(signature);

      try {
        const event = raw.webhooks.constructEvent(
          rawBody,
          signedHeader,
          env.STRIPE_WEBHOOK_SECRET,
        );

        return { event, verified: true };
      } catch (error) {
        throw new CanonError({
          code: 'invalid_input',
          category: 'validation',
          message: error instanceof Error ? error.message : 'Stripe webhook verification failed.',
        });
      }
    },
  };
};
