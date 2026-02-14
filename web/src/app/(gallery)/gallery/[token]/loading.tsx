export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid mb-4 rounded-xl bg-gray-200 animate-pulse"
              style={{ height: `${200 + (i % 3) * 100}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
