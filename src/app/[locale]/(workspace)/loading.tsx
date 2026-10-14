export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 animate-pulse">
      <span className="sr-only">Loading page</span>
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-8 w-56 max-w-full rounded bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-5 h-6 w-32 max-w-full rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-64 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
