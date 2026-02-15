export default function Loading() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="h-5 w-40 rounded animate-shimmer" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid mb-4 rounded-lg animate-shimmer"
              style={{ height: `${200 + (i % 3) * 100}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
