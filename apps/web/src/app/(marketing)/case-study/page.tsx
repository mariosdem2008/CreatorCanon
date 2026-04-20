import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Case study',
  description:
    'How a business creator archive becomes a structured, sellable education product on CreatorCanon.',
};

const ROWS: Array<[string, string, string]> = [
  ['Source set', 'Focused archive snapshot', '9 selected videos'],
  ['Knowledge model', 'Framework-first structure', '3 tracks + playbooks'],
  ['Trust layer', 'Source grounding', 'Support labels + citations'],
  ['Publishing model', 'Member product', 'Preview + premium modules'],
];

export default function CaseStudyPage() {
  return (
    <>
      {/* Interim banner */}
      <div className="border-b border-rule bg-amber-wash">
        <div className="mx-auto flex max-w-[1140px] items-center gap-3 px-6 py-3">
          <Badge variant="amber">Interim</Badge>
          <span className="text-body-sm text-amber-ink">
            Example case study — flagship customer case study shipping post-launch.
          </span>
        </div>
      </div>

      <article className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[720px] px-6 py-20">
          <div className="text-eyebrow uppercase text-ink-4">Case study · example</div>
          <h1 className="mt-3 font-serif text-display-lg text-ink">
            Operator Ledger shows how a business creator archive can become a structured, sellable
            education product.
          </h1>
          <p className="mt-6 font-serif text-body-lg leading-relaxed text-ink-2">
            This is an illustrative case study, not a claim about a live customer. It demonstrates
            the target story: focused source selection, framework extraction, staged review,
            grounded chat, and a premium publishing flow for business education.
          </p>

          <div className="mt-12 rounded-lg border border-rule bg-paper-warm p-8">
            <div className="text-eyebrow uppercase text-ink-4">What the example proves</div>
            <table className="mt-4 w-full border-collapse text-body-md">
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row[0]}
                    className={i === 0 ? '' : 'border-t border-rule'}
                  >
                    <td className="py-3 pr-4 text-eyebrow uppercase text-ink-4 w-32">
                      {row[0]}
                    </td>
                    <td className="py-3 pr-4 text-ink">{row[1]}</td>
                    <td className="py-3 text-right font-numeric text-ink-2 tabular-nums">
                      {row[2]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t border-rule pt-10 sm:flex-row sm:items-center">
            <div>
              <div className="text-eyebrow uppercase text-ink-4">Next step</div>
              <div className="mt-2 text-heading-lg text-ink">
                Walk through the demo hub or connect your channel.
              </div>
            </div>
            <Button asChild variant="primary" size="lg">
              <Link href="/signup">
                Connect your channel
                <Icon name="arrowRight" size={14} />
              </Link>
            </Button>
          </div>
        </div>
      </article>
    </>
  );
}
