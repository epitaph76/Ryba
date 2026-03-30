import type { ReactNode } from 'react';

type PrototypeChromeProps = {
  title: string;
  summary: string;
  children: ReactNode;
  aside: ReactNode;
};

export function PrototypeChrome({ title, summary, children, aside }: PrototypeChromeProps) {
  return (
    <section className="prototype-shell">
      <div className="prototype-main">
        <div className="section-heading">
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        {children}
      </div>
      <aside className="prototype-aside">{aside}</aside>
    </section>
  );
}
