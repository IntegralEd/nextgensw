// Searchable user guides, compiled from docs/user-guide/*.md at build
// time. Same markdown that trains the helper agent — one source, two
// consumers. Search is a simple case-insensitive match over title +
// body; guides are short enough that fancy indexing would be overkill.

import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import guidesData from '../generated/guides.json';

// Guides shown only on their own gated panel, not in the general list.
const RESTRICTED = { orientation: 'testing-guide' };

export default function UserGuide({ only = null }) {
  const pool = useMemo(() => {
    if (only) return guidesData.guides.filter((g) => g.slug === only);
    return guidesData.guides.filter((g) => !RESTRICTED[g.slug]);
  }, [only]);

  const [query, setQuery] = useState('');
  const [openSlug, setOpenSlug] = useState(pool[0]?.slug || null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (g) => g.title.toLowerCase().includes(q) || g.content.toLowerCase().includes(q)
    );
  }, [query, pool]);

  const open = matches.find((g) => g.slug === openSlug) || matches[0] || null;

  return (
    <div className="panel guide">
      <h1>User guide</h1>
      <input
        type="search"
        className="guide-search"
        placeholder="Search the guides…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search the guides"
      />
      {matches.length === 0 && (
        <p className="muted">Nothing matches “{query}”. Try a shorter word.</p>
      )}
      {matches.length > 1 && (
        <nav className="guide-list">
          {matches.map((g) => (
            <button
              key={g.slug}
              className={g.slug === open?.slug ? 'active' : ''}
              onClick={() => setOpenSlug(g.slug)}
            >
              {g.title}
            </button>
          ))}
        </nav>
      )}
      {open && (
        <article className="guide-body">
          <Markdown remarkPlugins={[remarkGfm]}>{open.content}</Markdown>
        </article>
      )}
    </div>
  );
}
