/** Swipeable gallery with CSS scroll-snap: no JavaScript shipped for it. */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 text-5xl text-zinc-400" aria-hidden>
        🛍️
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={i === 0 ? title : `${title} – photo ${i + 1}`}
            width={600}
            height={600}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'low'}
            decoding="async"
            className="aspect-square w-full flex-none snap-center object-cover"
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
          {images.length} photos · glissez
        </div>
      )}
    </div>
  );
}
