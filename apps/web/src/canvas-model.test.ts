import { describe, expect, it } from 'vitest';

import { buildCanvasGraph, serializeCanvasState } from './canvas-model';

describe('canvas-model', () => {
  it('builds react flow graph from entities, relations and canvas state', () => {
    const graph = buildCanvasGraph({
      entities: [
        {
          id: 'entity-a',
          workspaceId: 'workspace-1',
          spaceId: 'space-1',
          entityTypeId: 'type-company',
          title: 'Alpha',
          summary: 'First',
          properties: {},
          createdByUserId: 'user-1',
          updatedByUserId: 'user-1',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'entity-b',
          workspaceId: 'workspace-1',
          spaceId: 'space-1',
          entityTypeId: null,
          title: 'Beta',
          summary: null,
          properties: {},
          createdByUserId: 'user-1',
          updatedByUserId: 'user-1',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      entityTypes: [
        {
          id: 'type-company',
          workspaceId: 'workspace-1',
          name: 'Company',
          slug: 'company',
          description: null,
          color: null,
          icon: null,
          isSystem: false,
          fields: [],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      relations: [
        {
          id: 'relation-1',
          workspaceId: 'workspace-1',
          spaceId: 'space-1',
          fromEntityId: 'entity-a',
          toEntityId: 'entity-b',
          relationType: 'depends_on',
          properties: {},
          createdByUserId: 'user-1',
          updatedByUserId: 'user-1',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      canvas: {
        spaceId: 'space-1',
        nodes: [
          {
            entityId: 'entity-a',
            position: { x: 80, y: 100 },
            size: null,
            zIndex: 1,
            collapsed: false,
          },
          {
            entityId: 'entity-b',
            position: { x: 360, y: 220 },
            size: null,
            zIndex: 2,
            collapsed: false,
          },
        ],
        edges: [
          {
            relationId: 'relation-1',
            fromEntityId: 'entity-a',
            toEntityId: 'entity-b',
            controlPoints: [],
          },
        ],
        viewport: {
          zoom: 1,
          offset: { x: 0, y: 0 },
        },
        updatedAt: null,
      },
      selectedEntityId: 'entity-b',
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[0]?.data.entityTypeName).toBe('Company');
    expect(graph.nodes[1]?.selected).toBe(true);
    expect(graph.edges[0]?.data?.relationType).toBe('depends_on');
  });

  it('serializes current graph nodes back into canvas payload', () => {
    const serialized = serializeCanvasState({
      spaceId: 'space-1',
      nodes: [
        {
          id: 'entity-a',
          type: 'entityCard',
          position: { x: 120, y: 160 },
          width: 260,
          height: 118,
          data: {
            entityId: 'entity-a',
            title: 'Alpha',
            summary: null,
            entityTypeName: 'Company',
            relationCount: 1,
          },
        },
      ],
      edgeLayouts: [
        {
          relationId: 'relation-1',
          fromEntityId: 'entity-a',
          toEntityId: 'entity-b',
          controlPoints: [{ x: 200, y: 180 }],
        },
      ],
      viewport: {
        zoom: 1.2,
        offset: { x: -40, y: 24 },
      },
    });

    expect(serialized.spaceId).toBe('space-1');
    expect(serialized.payload.nodes[0]).toEqual({
      entityId: 'entity-a',
      position: { x: 120, y: 160 },
      size: { width: 260, height: 118 },
      zIndex: 1,
      collapsed: false,
    });
    expect(serialized.payload.edges).toHaveLength(1);
    expect(serialized.payload.viewport.zoom).toBe(1.2);
  });
});
