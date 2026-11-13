/**
 * A realistic manifest: Invoice (every widget type, including an array of line items) and Customer
 * (target of the belongsTo relation). Shaped exactly like `GET /.well-known/strutvane.json` returns
 * it for an actor with full permissions; tests derive restricted variants with `withCapabilities()`.
 */
import type {
  FieldDescriptor,
  ResourceCapabilities,
  ResourceDescriptor,
  ResourceManifest,
} from '@strutvane/contracts'

export const ALL: ResourceCapabilities = {
  list: true,
  view: true,
  create: true,
  update: true,
  delete: true,
  restore: false,
  export: true,
}

/** Defaults for a field descriptor, so the fixture lists only what matters per field. */
export function field(
  f: Partial<FieldDescriptor> & Pick<FieldDescriptor, 'name' | 'type' | 'label'>,
): FieldDescriptor {
  return {
    required: false,
    nullable: true,
    unique: false,
    readOnly: false,
    writeOnce: false,
    filterOperators: [],
    sortable: false,
    searchable: false,
    ...f,
  }
}

/** Defaults for a resource descriptor. */
export function resource(
  r: Partial<ResourceDescriptor> & Pick<ResourceDescriptor, 'name' | 'path' | 'fields'>,
): ResourceDescriptor {
  return {
    label: r.name,
    pluralLabel: `${r.name}s`,
    titleField: 'id',
    actions: [],
    capabilities: ALL,
    softDeletes: false,
    tenantScoped: true,
    audited: false,
    ...r,
  }
}

export const customerResource: ResourceDescriptor = resource({
  name: 'Customer',
  path: 'customers',
  label: 'Customer',
  pluralLabel: 'Customers',
  titleField: 'name',
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true }),
    field({
      name: 'name',
      type: 'string',
      label: 'Name',
      required: true,
      sortable: true,
      searchable: true,
      filterOperators: ['eq', 'contains'],
    }),
    field({
      name: 'region',
      type: 'enum',
      label: 'Region',
      enumValues: ['EU', 'US', 'APAC'],
      filterOperators: ['eq', 'in'],
    }),
  ],
})

export const invoiceResource: ResourceDescriptor = resource({
  name: 'Invoice',
  path: 'invoices',
  label: 'Invoice',
  pluralLabel: 'Invoices',
  titleField: 'number',
  ui: { listColumns: ['number', 'customer', 'amount', 'status', 'dueDate', 'paid'] },
  fields: [
    field({ name: 'id', type: 'id', label: 'ID', readOnly: true }),
    field({
      name: 'number',
      type: 'string',
      label: 'Number',
      required: true,
      unique: true,
      writeOnce: true,
      sortable: true,
      searchable: true,
      filterOperators: ['eq', 'contains'],
      help: 'Format INV-1234',
      schema: { maxLength: 20, pattern: '^INV-\\d+$' },
    }),
    field({
      name: 'customer',
      type: 'belongsTo',
      label: 'Customer',
      required: true,
      relation: { kind: 'belongsTo', target: 'Customer', foreignKey: 'customerId' },
      filterOperators: ['eq', 'in'],
      widget: 'relation-picker',
    }),
    field({
      name: 'amount',
      type: 'decimal',
      label: 'Amount',
      required: true,
      sortable: true,
      filterOperators: ['gte', 'lte', 'between'],
      schema: { minimum: 0 },
    }),
    field({
      name: 'status',
      type: 'enum',
      label: 'Status',
      required: true,
      sortable: true,
      enumValues: ['draft', 'sent', 'paid'],
      filterOperators: ['eq', 'ne', 'in'],
    }),
    field({
      name: 'issueDate',
      type: 'date',
      label: 'Issue date',
      required: true,
      sortable: true,
      filterOperators: ['gte', 'lte'],
    }),
    field({
      name: 'dueDate',
      type: 'date',
      label: 'Due date',
      required: true,
      sortable: true,
      filterOperators: ['gte', 'lte'],
    }),
    field({ name: 'paid', type: 'boolean', label: 'Paid', filterOperators: ['eq'] }),
    field({ name: 'notes', type: 'text', label: 'Notes', schema: { maxLength: 500 } }),
    field({
      name: 'lines',
      type: 'array',
      label: 'Line items',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['description'],
          properties: {
            description: { type: 'string', title: 'Description', maxLength: 200 },
            amount: { type: 'number', title: 'Line amount', minimum: 0 },
          },
        },
      },
    }),
    field({
      name: 'createdAt',
      type: 'datetime',
      label: 'Created',
      readOnly: true,
      sortable: true,
    }),
  ],
})

export const manifest: ResourceManifest = {
  manifestVersion: 1,
  app: { name: 'acme', apiVersion: 'v1' },
  generatedAt: '2026-11-13T00:00:00.000Z',
  resources: [invoiceResource, customerResource],
}

/** A copy of a resource with some capabilities switched off (what a less-privileged actor sees). */
export function withCapabilities(
  r: ResourceDescriptor,
  overrides: Partial<ResourceCapabilities>,
): ResourceDescriptor {
  return { ...r, capabilities: { ...r.capabilities, ...overrides } }
}
