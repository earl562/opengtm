import { randomUUID } from 'node:crypto'
import type { OpenGtmEntityBase } from '@opengtm/types'

export function assertRequired(value: unknown, label: string): asserts value {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required OpenGTM field: ${label}`)
  }
}

export function assertOneOf(value: string, values: readonly string[], label: string): void {
  if (!values.includes(value)) {
    throw new Error(`Unknown OpenGTM ${label}: ${value}`)
  }
}

export function toIso(value?: string | Date | null): string {
  return value ? new Date(value).toISOString() : new Date().toISOString()
}

export function slugify(value = ''): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function createEntityBase(opts: { id?: string; createdAt?: string | Date } = {}): OpenGtmEntityBase {
  return {
    id: opts.id || randomUUID(),
    createdAt: toIso(opts.createdAt)
  }
}