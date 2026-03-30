import { Suspense, lazy, useMemo, useState } from 'react';
import type { PrototypeId } from './types';

const tabs: Array<{ id: PrototypeId; label: string; description: string }> = [
  {
    id: 'core',
    label: 'Core S-2',
    description: 'Auth + workspace + entities via API',
  },
  {
    id: 'canvas',
    label: 'Canvas',
    description: 'React Flow with custom nodes',
  },
  {
    id: 'table',
    label: 'Table',
    description: 'TanStack Table + virtualization',
  },
  {
    id: 'editor',
    label: 'Editor',
    description: 'Tiptap plus entity metadata',
  },
];

const CanvasPrototype = lazy(() =>
  import('./components/CanvasPrototype').then((module) => ({
    default: module.CanvasPrototype,
  })),
);

const TablePrototype = lazy(() =>
  import('./components/TablePrototype').then((module) => ({
    default: module.TablePrototype,
  })),
);

const EditorPrototype = lazy(() =>
  import('./components/EditorPrototype').then((module) => ({
    default: module.EditorPrototype,
  })),
);

const CoreDomainPrototype = lazy(() =>
  import('./components/CoreDomainPrototype').then((module) => ({
    default: module.CoreDomainPrototype,
  })),
);

export function App() {
  const [active, setActive] = useState<PrototypeId>('core');

  const current = useMemo(() => {
    switch (active) {
      case 'core':
        return <CoreDomainPrototype />;
      case 'canvas':
        return <CanvasPrototype />;
      case 'table':
        return <TablePrototype />;
      case 'editor':
        return <EditorPrototype />;
    }
  }, [active]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Ryba S-1 technical research</span>
          <h1>Web prototype harness</h1>
          <p>
            This page is intentionally practical: it checks the libraries and interaction
            patterns we need before the real product work starts.
          </p>
        </div>
        <div className="hero-card">
          <strong>Stage scope</strong>
          <ul>
            <li>Canvas graph validation</li>
            <li>Table virtualization validation</li>
            <li>Rich text editor validation</li>
          </ul>
        </div>
      </header>

      <nav className="tab-strip" aria-label="Prototype sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button${active === tab.id ? ' is-active' : ''}`}
            onClick={() => setActive(tab.id)}
            aria-pressed={active === tab.id}
          >
            <span>{tab.label}</span>
            <small>{tab.description}</small>
          </button>
        ))}
      </nav>

      <div className="page-body">
        <Suspense
          fallback={
            <section className="prototype-shell">
              <div className="prototype-main">
                <div className="section-heading">
                  <h2>Loading prototype</h2>
                  <p>Preparing the selected technical check.</p>
                </div>
              </div>
            </section>
          }
        >
          {current}
        </Suspense>
      </div>
    </main>
  );
}
