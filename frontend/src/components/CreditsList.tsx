/** One clip's credit, as written by scripts/library.py into public/credits.json. */
export type Credit = {
  key: string;
  collection: string;
  source: "Pixabay" | "Wikimedia Commons" | string;
  source_page_url: string | null;
  author: string;
  author_url: string | null;
  license_name: string;
  license_url: string | null;
  retrieved: string;
};

export type CreditsFile = { generated: string | null; items: Credit[] };

function MaybeLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sage underline underline-offset-4 hover:text-sage-hover">
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}

/**
 * The per-clip credits table, grouped by collection. Rendered on the server from the file it is
 * given, so the page arrives complete: loading it in the browser made everything below the list
 * jump when it arrived (CLS 0.67 on desktop, docs/metrics.md row P4).
 */
export function CreditsList({ file }: { file: CreditsFile }) {
  if (file.items.length === 0) {
    return <p className="mt-6 text-muted">The demo library has not been seeded yet, so there are no clips to credit.</p>;
  }

  const collections = [...new Set(file.items.map((c) => c.collection))];
  const bySource = (source: string) => file.items.filter((c) => c.source === source).length;

  return (
    <>
      <p className="tnum mt-6 text-sm text-muted">
        {file.items.length} clips: {bySource("Pixabay")} from Pixabay, {bySource("Wikimedia Commons")} from Wikimedia Commons
        {file.generated && ` · list generated ${file.generated}`}
      </p>
      {collections.map((collection) => (
        <section key={collection} aria-labelledby={`credits-${collection}`} className="mt-10">
          <h2 id={`credits-${collection}`} className="text-xl font-semibold tracking-[-0.02em]">
            {collection}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="text-subtle">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Clip
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Author
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Licence
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    Retrieved
                  </th>
                </tr>
              </thead>
              <tbody>
                {file.items
                  .filter((c) => c.collection === collection)
                  .map((c) => (
                    <tr key={c.key} className="border-b border-line align-top">
                      <td className="py-2 pr-4">
                        <MaybeLink href={c.source_page_url}>{c.source}</MaybeLink>
                      </td>
                      <td className="py-2 pr-4">
                        <MaybeLink href={c.author_url}>{c.author}</MaybeLink>
                      </td>
                      <td className="py-2 pr-4">
                        <MaybeLink href={c.license_url}>{c.license_name}</MaybeLink>
                      </td>
                      <td className="tnum py-2 text-muted">{c.retrieved}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
