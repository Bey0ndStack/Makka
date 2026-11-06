export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Loading page</span>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-slate-200" />
          <div className="h-8 w-56 max-w-full rounded bg-slate-200" />
        </div>
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="h-[66px] rounded-xl border border-slate-200 bg-white" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-12 border-b border-slate-100 bg-sand" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-6 border-b border-slate-100 px-5 py-4 last:border-0">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="ms-auto h-4 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
