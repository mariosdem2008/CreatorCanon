export interface DnsRecord {
  type: 'A' | 'CNAME';
  name: string;
  value: string;
}

export interface DomainValidationResult {
  valid: boolean;
  domain: string;
  message?: string;
}

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const COMMON_TWO_PART_PUBLIC_SUFFIXES = new Set([
  'ac.uk',
  'co.jp',
  'co.uk',
  'com.au',
  'com.br',
  'com.mx',
  'com.sg',
  'net.au',
  'org.au',
  'org.uk',
]);

export function normalizeDomainInput(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  return withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, '') ?? '';
}

export function validateCustomDomain(input: string): DomainValidationResult {
  const domain = normalizeDomainInput(input);
  if (!domain) {
    return { valid: false, domain, message: 'Enter a domain.' };
  }
  if (domain.length > 253) {
    return { valid: false, domain, message: 'Domain is too long.' };
  }

  const labels = domain.split('.');
  if (labels.length < 2) {
    return { valid: false, domain, message: 'Use a public domain like example.com.' };
  }
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1] ?? '')) {
    return { valid: false, domain, message: 'Domain needs a valid top-level domain.' };
  }
  if (!labels.every((label) => DOMAIN_LABEL_RE.test(label))) {
    return { valid: false, domain, message: 'Domain contains invalid characters.' };
  }

  return { valid: true, domain };
}

export function getDnsRecordsForDomain(domain: string): DnsRecord[] {
  const normalized = normalizeDomainInput(domain);
  const labels = normalized.split('.');
  const twoPartSuffix = labels.slice(-2).join('.');

  if (
    labels.length <= 2 ||
    (labels.length === 3 && COMMON_TWO_PART_PUBLIC_SUFFIXES.has(twoPartSuffix))
  ) {
    return [{ type: 'A', name: '@', value: '76.76.21.21' }];
  }

  const candidatePublicSuffix = labels.slice(-2).join('.');
  const suffixLabelCount = COMMON_TWO_PART_PUBLIC_SUFFIXES.has(candidatePublicSuffix)
    ? 3
    : 2;
  return [
    {
      type: 'CNAME',
      name: labels.slice(0, -suffixLabelCount).join('.'),
      value: 'cname.vercel-dns.com',
    },
  ];
}
