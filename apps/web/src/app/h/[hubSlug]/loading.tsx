// apps/web/src/app/h/[hubSlug]/loading.tsx
//
// Skeleton shown while a hub page renders. Matches the Editorial Atlas paper
// canvas so the swap to real content is visually quiet.

export default function HubLoading() {
  return (
    <div className="flex min-h-screen bg-[#F8F4EC]">
      <div className="hidden w-[232px] shrink-0 bg-[#F2EBDA] md:block" />
      <div className="mx-auto w-full max-w-[1080px] px-8 py-7">
        <div className="h-3 w-24 rounded bg-[#E5DECF]" />
        <div className="mt-4 h-10 w-3/4 max-w-[640px] rounded bg-[#E5DECF]" />
        <div className="mt-4 h-4 w-2/3 max-w-[520px] rounded bg-[#EFE9DA]" />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
        </div>
      </div>
    </div>
  );
}
