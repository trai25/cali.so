function SkeletonBar({ className = '' }: { className?: string }) {
  return <span className={`block rounded-sm bg-surface-1 ${className}`} />
}

export function AmaBookingsSkeleton() {
  return (
    <div aria-hidden>
      <SkeletonBar className="mt-2 h-4 w-40" />
      <div className="mt-5 grid grid-cols-2 gap-1 hairline-top pt-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBar key={index} className="h-11 w-full" />
        ))}
      </div>
      <div className="mt-5 grid gap-3 rounded-[2px] bg-surface-1 px-4 py-4 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="grid gap-2">
            <SkeletonBar className="h-3 w-24 bg-border" />
            <SkeletonBar className="h-11 w-full bg-background/70" />
          </div>
        ))}
        <div className="flex justify-end sm:col-span-2">
          <SkeletonBar className="h-8 w-28 bg-background/70" />
        </div>
      </div>
      <section className="mt-8 hairline-top pt-6">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBar className="h-3 w-28" />
          <SkeletonBar className="h-4 w-24" />
        </div>
        <ul className="mt-3 divide-y divide-border/70">
          {Array.from({ length: 3 }, (_, index) => (
            <li
              key={index}
              className="grid min-h-32 gap-3 px-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="grid content-start gap-2">
                <SkeletonBar className="h-4 w-48" />
                <SkeletonBar className="h-4 w-full max-w-96" />
                <SkeletonBar className="h-4 w-4/5 max-w-80" />
                <SkeletonBar className="h-4 w-11/12 max-w-md" />
              </div>
              <SkeletonBar className="h-8 w-28" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SettingsSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <section className="mt-8 hairline-top pt-6">
      <SkeletonBar className="h-3 w-32" />
      <SkeletonBar className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-4 grid gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex min-h-11 items-center justify-between gap-4"
          >
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-8 w-24" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function AmaSettingsSkeleton() {
  return (
    <div aria-hidden>
      <SkeletonBar className="mt-2 h-4 w-full max-w-md" />
      <section className="mt-6 hairline-top pt-6">
        <SkeletonBar className="h-3 w-32" />
        <SkeletonBar className="mt-3 h-4 w-full max-w-md" />
        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="h-8 w-full" />
          </div>
          <SkeletonBar className="h-8 w-28" />
        </div>
        <div className="mt-6">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="hairline-top py-4">
              <div className="flex min-h-11 items-center justify-between gap-4">
                <SkeletonBar className="h-4 w-32" />
                <SkeletonBar className="h-8 w-36" />
              </div>
              {[0, 2, 4].includes(index) && (
                <div className="mt-2 grid gap-3">
                  {Array.from({ length: index === 0 ? 2 : 1 }, (_, row) => (
                    <div
                      key={row}
                      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <SkeletonBar className="h-8 w-full" />
                      <SkeletonBar className="h-8 w-full" />
                      <SkeletonBar className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <SettingsSectionSkeleton rows={2} />
      <SettingsSectionSkeleton rows={2} />
      <SettingsSectionSkeleton rows={3} />
      <SettingsSectionSkeleton rows={5} />
    </div>
  )
}
