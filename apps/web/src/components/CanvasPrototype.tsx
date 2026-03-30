import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type NodeProps,
} from 'reactflow';
import { canvasEdges, canvasNodes } from '../data';
import type { EntityNodeData } from '../types';
import { PrototypeChrome } from './PrototypeChrome';

function EntityNode({ data, selected }: NodeProps<EntityNodeData>) {
  return (
    <article className={`entity-node${selected ? ' is-selected' : ''}`}>
      <span className="entity-node__kind">{data.kind}</span>
      <strong>{data.title}</strong>
      <span className="entity-node__id">{data.entityId}</span>
      <p>{data.note}</p>
      <Handle type="target" position={Position.Left} className="entity-node__handle" />
      <Handle type="source" position={Position.Right} className="entity-node__handle" />
    </article>
  );
}

const nodeTypes = {
  entityNode: EntityNode,
};

export function CanvasPrototype() {
  const sideNotes = useMemo(
    () => [
      'Confirms custom nodes can render entity shells.',
      'Validates edge layout for relation links.',
      'Shows whether React Flow feels viable for the visual canvas.',
    ],
    [],
  );

  return (
    <PrototypeChrome
      title="Canvas prototype"
      summary="React Flow with custom nodes and sample relations. This is a technical check, not a finished canvas experience."
      aside={
        <div className="stack">
          <div className="info-card">
            <h3>What this checks</h3>
            <ul className="bullet-list">
              {sideNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
          <div className="info-card">
            <h3>Fixture data</h3>
            <dl className="metric-grid">
              <div>
                <dt>Nodes</dt>
                <dd>{canvasNodes.length}</dd>
              </div>
              <div>
                <dt>Edges</dt>
                <dd>{canvasEdges.length}</dd>
              </div>
              <div>
                <dt>Node type</dt>
                <dd>Custom entity shell</dd>
              </div>
            </dl>
          </div>
        </div>
      }
    >
      <div className="canvas-frame">
        <ReactFlow
          nodes={canvasNodes}
          edges={canvasEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          defaultEdgeOptions={{ style: { strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            nodeStrokeColor="#273142"
            nodeColor="#dbeafe"
            maskColor="rgba(10, 14, 24, 0.55)"
          />
          <Controls />
          <Background gap={28} size={1} color="#1e293b" />
        </ReactFlow>
      </div>
    </PrototypeChrome>
  );
}
