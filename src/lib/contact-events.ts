/**
 * Server-side pub/sub bus for real-time contact updates.
 *
 * When the Chrome extension POSTs to /api/extension/enrich, the handler emits
 * an event here.  The persistent SSE endpoint /api/contacts/live listens on
 * the same bus and forwards events to the browser, where React Query patches
 * the in-memory caches without a full page reload.
 *
 * We store the emitter on `globalThis` so that Next.js hot-module reloading
 * (which re-executes this module) doesn't silently create a second instance
 * and break in-flight SSE connections.
 */

import { EventEmitter } from "events"

export type ContactUpdatedEvent = {
  type: "contact_updated"
  contactId: string
  /** Subset of fields that were actually changed — never undefined keys */
  photoUrl?: string | null
  firstName?: string
  lastName?: string
  headline?: string | null
  position?: string | null
  company?: string | null
  location?: string | null
  city?: string | null
  country?: string | null
  commonConnections?: number | null
}

export type ContactCreatedEvent = {
  type: "contact_created"
  contactId: string
}

export type ContactLiveEvent = ContactUpdatedEvent | ContactCreatedEvent

declare global {
  // eslint-disable-next-line no-var
  var __contactEventBus: EventEmitter | undefined
}

if (!globalThis.__contactEventBus) {
  globalThis.__contactEventBus = new EventEmitter()
  globalThis.__contactEventBus.setMaxListeners(500) // one per open browser tab
}

export const contactEvents = globalThis.__contactEventBus!

/** Emit a live update event for a specific user's SSE stream. */
export function emitContactEvent(userId: string, event: ContactLiveEvent) {
  contactEvents.emit(`user:${userId}`, event)
}
