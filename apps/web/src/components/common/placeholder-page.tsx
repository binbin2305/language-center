/** Wave 0 stand-in for a screen a lane will implement; replace the page body, keep the route. */
export function PlaceholderPage({
  title,
  hint,
  level = 1,
}: {
  title: string;
  hint?: string;
  /** Use 2 for tab content that sits under a page-level h1. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <section className="space-y-2">
      <Heading className={level === 1 ? 'text-2xl font-semibold tracking-tight' : 'text-lg font-semibold'}>
        {title}
      </Heading>
      <p className="text-sm text-muted-foreground">{hint ?? 'Màn hình này đang được xây dựng.'}</p>
    </section>
  );
}
