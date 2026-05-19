export type DiagStep = {
  label: string
  ok: boolean
  detail?: string
}

export type AbbuDiagPayload = {
  event: "parse_error" | "zero_contacts" | "self_test"
  fileName?: string
  fileSize?: number
  tables?: string[]
  zabcdrecordColumns?: string[]
  zabcdrecordRowCount?: number
  error?: string
  steps?: DiagStep[]
  userAgent?: string
}

export function postDiagnostics(payload: AbbuDiagPayload): void {
  // fire and forget — never throws
  fetch("/api/debug/abbu-diag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, userAgent: navigator.userAgent }),
  }).catch(() => {})
}

export async function runAbbuSelfTest(
  onStep: (step: DiagStep) => void
): Promise<boolean> {
  let allOk = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SQL: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null

  // Step 1: Load sql.js
  try {
    const initSqlJs = (await import("sql.js")).default
    SQL = await initSqlJs()
    onStep({ label: "Load sql.js WASM", ok: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Load sql.js WASM", ok: false, detail })
    allOk = false
  }

  // Step 2: Create synthetic database
  try {
    if (!SQL) throw new Error("sql.js not loaded")
    db = new SQL.Database()
    db.run(`
      CREATE TABLE ZABCDRECORD (
        Z_PK INTEGER PRIMARY KEY,
        ZFIRSTNAME TEXT,
        ZLASTNAME TEXT,
        ZTHUMBNAILIMAGEDATA BLOB,
        ZUNIQUEID TEXT
      );
      CREATE TABLE ZABCDPHONENUMBER (
        Z_PK INTEGER PRIMARY KEY,
        ZOWNER INTEGER,
        ZFULLNUMBER TEXT,
        ZLABEL TEXT
      );
      CREATE TABLE ZABCDEMAILADDRESS (
        Z_PK INTEGER PRIMARY KEY,
        ZOWNER INTEGER,
        ZADDRESS TEXT,
        ZLABEL TEXT
      );
      CREATE TABLE ZABCDURL (
        Z_PK INTEGER PRIMARY KEY,
        ZOWNER INTEGER,
        ZURL TEXT,
        ZLABEL TEXT
      );
      INSERT INTO ZABCDRECORD VALUES (1,'Alice','Smith',NULL,'AAAABBBB-CCCC-DDDD-EEEE-FFFF00001111');
      INSERT INTO ZABCDRECORD VALUES (2,'Bob','Jones',NULL,NULL);
      INSERT INTO ZABCDPHONENUMBER VALUES (1,1,'+33612345678','_$!<Mobile>!$_');
      INSERT INTO ZABCDEMAILADDRESS VALUES (1,1,'alice@example.com','_$!<Home>!$_');
      INSERT INTO ZABCDURL VALUES (1,1,'https://www.linkedin.com/in/alicesmith','LinkedIn');
    `)
    onStep({ label: "Create synthetic database", ok: true })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Create synthetic database", ok: false, detail })
    allOk = false
  }

  // Step 3: List tables
  try {
    if (!db) throw new Error("database not created")
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
    const tables: string[] = result[0]?.values?.map((row: unknown[]) => row[0] as string) ?? []
    if (!tables.includes("ZABCDRECORD")) {
      throw new Error(`ZABCDRECORD not found in tables: ${tables.join(", ")}`)
    }
    onStep({ label: "List tables", ok: true, detail: tables.join(", ") })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "List tables", ok: false, detail })
    allOk = false
  }

  // Step 4: Read contacts
  try {
    if (!db) throw new Error("database not created")
    const result = db.exec(
      "SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA, ZUNIQUEID FROM ZABCDRECORD ORDER BY Z_PK"
    )
    const rows = result[0]?.values ?? []
    if (rows.length !== 2) throw new Error(`Expected 2 rows, got ${rows.length}`)
    const firstName0 = rows[0][1] as string
    const firstName1 = rows[1][1] as string
    if (firstName0 !== "Alice") throw new Error(`Expected Alice, got ${firstName0}`)
    if (firstName1 !== "Bob") throw new Error(`Expected Bob, got ${firstName1}`)
    onStep({ label: "Read contacts", ok: true, detail: `${rows.length} rows` })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Read contacts", ok: false, detail })
    allOk = false
  }

  // Step 5: Read phones
  try {
    if (!db) throw new Error("database not created")
    const result = db.exec(
      "SELECT Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER WHERE ZOWNER = 1"
    )
    const rows = result[0]?.values ?? []
    if (rows.length === 0) throw new Error("No phone rows returned")
    const number = rows[0][2] as string
    if (number !== "+33612345678") throw new Error(`Expected +33612345678, got ${number}`)
    onStep({ label: "Read phones", ok: true, detail: number })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Read phones", ok: false, detail })
    allOk = false
  }

  // Step 6: Read emails
  try {
    if (!db) throw new Error("database not created")
    const result = db.exec(
      "SELECT Z_PK, ZOWNER, ZADDRESS, ZLABEL FROM ZABCDEMAILADDRESS WHERE ZOWNER = 1"
    )
    const rows = result[0]?.values ?? []
    if (rows.length === 0) throw new Error("No email rows returned")
    const address = rows[0][2] as string
    if (address !== "alice@example.com") throw new Error(`Expected alice@example.com, got ${address}`)
    onStep({ label: "Read emails", ok: true, detail: address })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Read emails", ok: false, detail })
    allOk = false
  }

  // Step 7: Read LinkedIn
  try {
    if (!db) throw new Error("database not created")
    const result = db.exec(
      "SELECT Z_PK, ZOWNER, ZURL, ZLABEL FROM ZABCDURL WHERE ZOWNER = 1"
    )
    const rows = result[0]?.values ?? []
    if (rows.length === 0) throw new Error("No URL rows returned")
    const url = rows[0][2] as string
    if (!url.includes("linkedin.com")) throw new Error(`Expected linkedin.com URL, got ${url}`)
    onStep({ label: "Read LinkedIn", ok: true, detail: url })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Read LinkedIn", ok: false, detail })
    allOk = false
  }

  // Step 8: Export to buffer
  let exported: Uint8Array | null = null
  try {
    if (!db) throw new Error("database not created")
    exported = db.export() as Uint8Array
    if (!exported || exported.length === 0) throw new Error("Export returned empty buffer")
    onStep({ label: "Export to buffer", ok: true, detail: `${exported.length} bytes` })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Export to buffer", ok: false, detail })
    allOk = false
  }

  // Step 9: Re-open from buffer
  try {
    if (!SQL) throw new Error("sql.js not loaded")
    if (!exported) throw new Error("No exported buffer to re-open")
    const db2 = new SQL.Database(exported)
    const result = db2.exec("SELECT COUNT(*) FROM ZABCDRECORD")
    const count = result[0]?.values?.[0]?.[0] as number
    if (count !== 2) throw new Error(`Expected COUNT=2, got ${count}`)
    db2.close()
    onStep({ label: "Re-open from buffer", ok: true, detail: `COUNT=${count}` })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    onStep({ label: "Re-open from buffer", ok: false, detail })
    allOk = false
  }

  // Clean up
  try {
    db?.close()
  } catch {
    // ignore
  }

  return allOk
}
