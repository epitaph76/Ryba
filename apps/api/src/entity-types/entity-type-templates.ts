import type { EntityFieldOption, EntityFieldType } from '@ryba/types';

type FieldTemplate = {
  key: string;
  label: string;
  fieldType: EntityFieldType;
  description?: string;
  required?: boolean;
  config?: {
    options?: EntityFieldOption[];
    placeholder?: string;
    allowMultiple?: boolean;
    relationEntityTypeId?: string | null;
  };
};

export type EntityTypeTemplate = {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  fields: FieldTemplate[];
};

const statusOptions = (...values: string[]): EntityFieldOption[] =>
  values.map((value) => ({
    value,
    label: value,
    color: null,
  }));

export const DEFAULT_ENTITY_TYPE_TEMPLATES: EntityTypeTemplate[] = [
  {
    name: 'Company',
    slug: 'company',
    description: 'Business account or organization.',
    color: '#155eef',
    icon: 'building',
    fields: [
      {
        key: 'website',
        label: 'Website',
        fieldType: 'url',
      },
      {
        key: 'status',
        label: 'Status',
        fieldType: 'status',
        config: {
          options: statusOptions('lead', 'active', 'partner'),
        },
      },
      {
        key: 'notes',
        label: 'Notes',
        fieldType: 'rich_text',
      },
    ],
  },
  {
    name: 'Contact',
    slug: 'contact',
    description: 'Person related to a company or project.',
    color: '#0f766e',
    icon: 'user',
    fields: [
      {
        key: 'email',
        label: 'Email',
        fieldType: 'text',
      },
      {
        key: 'role',
        label: 'Role',
        fieldType: 'text',
      },
      {
        key: 'profile_url',
        label: 'Profile URL',
        fieldType: 'url',
      },
    ],
  },
  {
    name: 'Task',
    slug: 'task',
    description: 'Track work with status and due date.',
    color: '#9333ea',
    icon: 'check-square',
    fields: [
      {
        key: 'status',
        label: 'Status',
        fieldType: 'status',
        required: true,
        config: {
          options: statusOptions('todo', 'in_progress', 'done'),
        },
      },
      {
        key: 'priority',
        label: 'Priority',
        fieldType: 'select',
        config: {
          options: statusOptions('low', 'medium', 'high'),
        },
      },
      {
        key: 'due_date',
        label: 'Due date',
        fieldType: 'date',
      },
      {
        key: 'is_blocked',
        label: 'Blocked',
        fieldType: 'boolean',
      },
    ],
  },
  {
    name: 'Note',
    slug: 'note',
    description: 'Freeform note anchored in the graph.',
    color: '#f59e0b',
    icon: 'sticky-note',
    fields: [
      {
        key: 'body',
        label: 'Body',
        fieldType: 'rich_text',
      },
      {
        key: 'status',
        label: 'Status',
        fieldType: 'status',
        config: {
          options: statusOptions('draft', 'published'),
        },
      },
    ],
  },
  {
    name: 'Project',
    slug: 'project',
    description: 'Initiative with budget and phase.',
    color: '#d92d20',
    icon: 'folder',
    fields: [
      {
        key: 'status',
        label: 'Status',
        fieldType: 'status',
        required: true,
        config: {
          options: statusOptions('planned', 'active', 'paused', 'done'),
        },
      },
      {
        key: 'budget',
        label: 'Budget',
        fieldType: 'number',
      },
      {
        key: 'kickoff_date',
        label: 'Kickoff date',
        fieldType: 'date',
      },
      {
        key: 'repository',
        label: 'Repository',
        fieldType: 'url',
      },
    ],
  },
];
