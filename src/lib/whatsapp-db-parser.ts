import Database from "better-sqlite3"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"

// Apple CoreData epoch starts Jan 1 2001; Unix epoch starts Jan 1 1970
const APPLE_EPOCH_OFFSET = 978307200

type DBRow = {
  chatName: string
  sentAt: Date
  isOutbound: boolean
}

export type ParsedDBChat = {
  chatName: string
  messages: DBRow[]
}

export function parseWhatsAppDatabase(buffer: Buffer): ParsedDBChat[] {
  const tmpPath = path.join(os.tmpdir(), `wa-db-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)

  try {
    fs.writeFileSync(tmpPath, buffer)
    const db = new Database(tmpPath, { readonly: true })

    // Only 1:1 chats — group JIDs end with @g.us
    const sessions = db
      .prepare(
        `SELECT Z_PK, ZPARTNERNAME
         FROM ZWACHATSESSION
         WHERE ZPARTNERNAME IS NOT NULL
           AND (ZCONTACTJID IS NULL OR ZCONTACTJID NOT LIKE '%@g.us')`,
      )
      .all() as { Z_PK: number; ZPARTNERNAME: string }[]

    const results: ParsedDBChat[] = []

    for (const session of sessions) {
      const rows = db
        .prepare(
          `SELECT ZMESSAGEDATE, ZISFROMME
           FROM ZWAMESSAGE
           WHERE ZCHATSESSION = ?
             AND ZMESSAGETYPE != 6
             AND ZMESSAGEDATE > 0`,
        )
        .all(session.Z_PK) as { ZMESSAGEDATE: number; ZISFROMME: number }[]

      if (rows.length === 0) continue

      const messages: DBRow[] = rows.map((r) => ({
        chatName: session.ZPARTNERNAME,
        sentAt: new Date((r.ZMESSAGEDATE + APPLE_EPOCH_OFFSET) * 1000),
        isOutbound: r.ZISFROMME === 1,
      }))

      results.push({ chatName: session.ZPARTNERNAME, messages })
    }

    db.close()
    return results
  } finally {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore cleanup errors
    }
  }
}
