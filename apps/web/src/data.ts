import type { DemoCanvasEdge, DemoCanvasNode, DemoRow } from './types';

export const canvasNodes: DemoCanvasNode[] = [
  {
    id: 'space-1',
    type: 'entityNode',
    position: { x: 40, y: 90 },
    data: {
      title: 'Workspace',
      entityId: 'WS-001',
      kind: 'root',
      note: 'Entry point for the prototype graph.',
    },
  },
  {
    id: 'space-2',
    type: 'entityNode',
    position: { x: 320, y: 20 },
    data: {
      title: 'Entity',
      entityId: 'ENT-1024',
      kind: 'record',
      note: 'Custom node shows core domain data.',
    },
  },
  {
    id: 'space-3',
    type: 'entityNode',
    position: { x: 320, y: 170 },
    data: {
      title: 'Relation',
      entityId: 'REL-4008',
      kind: 'link',
      note: 'Edge layout stands in for relations.',
    },
  },
];

export const canvasEdges: DemoCanvasEdge[] = [
  {
    id: 'ws-entity',
    source: 'space-1',
    target: 'space-2',
    label: 'opens',
    animated: true,
    type: 'smoothstep',
  },
  {
    id: 'entity-relation',
    source: 'space-2',
    target: 'space-3',
    label: 'links to',
    type: 'smoothstep',
  },
];

const owners = ['Marta', 'Ilya', 'Nina', 'Alex', 'Sasha', 'Vera'];
const statuses: DemoRow['status'][] = ['draft', 'active', 'blocked', 'archived'];

export const tableRows: DemoRow[] = Array.from({ length: 120 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0');
  const day = String((index % 27) + 1).padStart(2, '0');
  return {
    id: `row-${number}`,
    entityId: `ENT-${String(1000 + index)}`,
    title: `Research note ${number}`,
    owner: owners[index % owners.length],
    status: statuses[index % statuses.length],
    updatedAt: `2026-03-${day}`,
  };
});

export const editorSeedContent = `<h2>Research note</h2>
<p>Use the editor to verify rich text editing and entity references.</p>
<p>Linked entity tokens use the format [[entity:ENT-1024]].</p>
<p>That token can be parsed into document metadata without needing a custom mention system yet.</p>`;
