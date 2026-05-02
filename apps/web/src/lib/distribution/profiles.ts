export const DISTRIBUTION_PROFILE_TYPES = [
  'public',
  'lead_magnet',
  'paid_product',
  'member_library',
  'zip_export',
] as const;

export type DistributionProfileType = (typeof DISTRIBUTION_PROFILE_TYPES)[number];

export const ESP_PROVIDERS = [
  'convertkit',
  'beehiiv',
  'mailchimp',
  'klaviyo',
  'generic_webhook',
] as const;

export type EspProvider = (typeof ESP_PROVIDERS)[number];

export const OAUTH_PROVIDERS = ['discord', 'circle'] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type DistributionRequirement = 'none' | 'email' | 'paid' | 'member';

export interface DistributionGatingRule {
  routePattern: string;
  requirement: DistributionRequirement;
}

export interface DistributionFunnelCopy {
  emailCapture: {
    headline: string;
    body: string;
    cta: string;
  };
  paywall: {
    headline: string;
    body: string;
    cta: string;
    priceLabel: string;
  };
  memberGate: {
    headline: string;
    body: string;
    cta: string;
  };
  thankYou: {
    headline: string;
    body: string;
  };
}

export interface DistributionProfileDraft {
  type: DistributionProfileType;
  label: string;
  description: string;
  espProvider: EspProvider | null;
  oauthProvider: OAuthProvider | null;
  gatingRules: DistributionGatingRule[];
  analyticsTags: string[];
  funnel: DistributionFunnelCopy;
}

export interface DistributionProfileOption {
  type: DistributionProfileType;
  label: string;
  badge: string;
  description: string;
  authLabel: string;
  backendOwner: 'Codex' | 'Claude' | 'none';
}

const DEFAULT_FUNNEL: DistributionFunnelCopy = {
  emailCapture: {
    headline: 'Keep reading with the creator notes',
    body: 'Enter your email to unlock the full hub and get the follow-up resources.',
    cta: 'Unlock the hub',
  },
  paywall: {
    headline: 'Unlock the complete knowledge system',
    body: 'Get the full library, implementation notes, source-linked proof, and future updates.',
    cta: 'Continue to checkout',
    priceLabel: '$49 one-time access',
  },
  memberGate: {
    headline: 'Members only',
    body: 'Connect your community account so we can confirm your membership access.',
    cta: 'Connect account',
  },
  thankYou: {
    headline: "You're on the list",
    body: 'The hub is unlocked in this browser. Check your inbox for the saved link.',
  },
};

export const DISTRIBUTION_PROFILE_OPTIONS: DistributionProfileOption[] = [
  {
    type: 'public',
    label: 'Public',
    badge: 'Open',
    description: 'No gate. Best for public reference hubs and SEO-friendly libraries.',
    authLabel: 'None',
    backendOwner: 'none',
  },
  {
    type: 'lead_magnet',
    label: 'Lead magnet',
    badge: 'Email',
    description: 'Capture consented email before deep content while keeping the public preview open.',
    authLabel: 'Email capture',
    backendOwner: 'Claude',
  },
  {
    type: 'paid_product',
    label: 'Paid product',
    badge: 'Stripe',
    description: 'Present a paid access offer before the full hub. Stripe wiring lands in Phase E.',
    authLabel: 'Checkout + magic link',
    backendOwner: 'Claude',
  },
  {
    type: 'member_library',
    label: 'Member library',
    badge: 'Community',
    description: 'Require a Discord or Circle membership check before private hub access.',
    authLabel: 'Discord or Circle OAuth',
    backendOwner: 'Claude',
  },
  {
    type: 'zip_export',
    label: 'Zip export',
    badge: 'Static',
    description: 'Prepare the hub for a portable static export without access gates.',
    authLabel: 'None',
    backendOwner: 'Claude',
  },
];

const PROFILE_DEFAULTS: Record<
  DistributionProfileType,
  Pick<
    DistributionProfileDraft,
    'espProvider' | 'oauthProvider' | 'gatingRules' | 'analyticsTags'
  >
> = {
  public: {
    espProvider: null,
    oauthProvider: null,
    gatingRules: [],
    analyticsTags: ['distribution:public'],
  },
  lead_magnet: {
    espProvider: 'generic_webhook',
    oauthProvider: null,
    gatingRules: [{ routePattern: '/library/**', requirement: 'email' }],
    analyticsTags: ['distribution:lead_magnet', 'gate:email'],
  },
  paid_product: {
    espProvider: null,
    oauthProvider: null,
    gatingRules: [{ routePattern: '/**', requirement: 'paid' }],
    analyticsTags: ['distribution:paid_product', 'gate:paid'],
  },
  member_library: {
    espProvider: null,
    oauthProvider: 'discord',
    gatingRules: [{ routePattern: '/**', requirement: 'member' }],
    analyticsTags: ['distribution:member_library', 'gate:member'],
  },
  zip_export: {
    espProvider: null,
    oauthProvider: null,
    gatingRules: [],
    analyticsTags: ['distribution:zip_export'],
  },
};

export function isDistributionProfileType(
  value: string,
): value is DistributionProfileType {
  return DISTRIBUTION_PROFILE_TYPES.includes(value as DistributionProfileType);
}

export function getDistributionProfileOption(
  type: DistributionProfileType,
): DistributionProfileOption {
  const option = DISTRIBUTION_PROFILE_OPTIONS.find((item) => item.type === type);
  if (!option) {
    throw new Error(`Unknown distribution profile type: ${type}`);
  }
  return option;
}

export function createDistributionProfileDraft(
  type: DistributionProfileType,
  overrides: Partial<DistributionProfileDraft> = {},
): DistributionProfileDraft {
  const option = getDistributionProfileOption(type);
  const defaults = PROFILE_DEFAULTS[type];

  return {
    type,
    label: option.label,
    description: option.description,
    espProvider: defaults.espProvider,
    oauthProvider: defaults.oauthProvider,
    gatingRules: defaults.gatingRules,
    analyticsTags: defaults.analyticsTags,
    funnel: DEFAULT_FUNNEL,
    ...overrides,
  };
}

export function profileRequiresBackend(type: DistributionProfileType): boolean {
  return type === 'lead_magnet' || type === 'paid_product' || type === 'member_library';
}
