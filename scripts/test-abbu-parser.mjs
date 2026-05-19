/**
 * test-abbu-parser.mjs
 *
 * Tests the SQL queries and logic used by src/lib/abbu-parser-client.ts.
 * Does NOT import the TypeScript source — all query logic is inlined so the
 * SQL layer can be exercised independently of the Next.js build.
 *
 * Run:  node --test scripts/test-abbu-parser.mjs
 */

import { describe, it, before } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

// ---------------------------------------------------------------------------
// Module resolution
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const require = createRequire(import.meta.url)

const BetterSqlite3 = require(path.join(projectRoot, "node_modules/better-sqlite3"))
const initSqlJs = require(path.join(projectRoot, "node_modules/sql.js/dist/sql-asm.js"))

// ---------------------------------------------------------------------------
// Globals initialised in before()
// ---------------------------------------------------------------------------

/** @type {import('sql.js').SqlJs} */
let SQL

before(async () => {
  SQL = await initSqlJs()
})

// ---------------------------------------------------------------------------
// Helpers mirroring abbu-parser-client.ts
// ---------------------------------------------------------------------------

/**
 * Build a better-sqlite3 in-memory DB, run setup(), then return the serialised
 * Buffer so it can be re-opened by sql.js exactly as the browser does.
 *
 * @param {(db: import('better-sqlite3').Database) => void} setup
 * @returns {Buffer}
 */
function createTestDb(setup) {
  const db = new BetterSqlite3(":memory:")
  setup(db)
  const buf = db.serialize() // Buffer
  db.close()
  return buf
}

/**
 * Open a serialised Buffer with sql.js (same path as the browser parser).
 *
 * @param {Buffer} buf
 * @returns {import('sql.js').Database}
 */
function openWithSqlJs(buf) {
  return new SQL.Database(new Uint8Array(buf))
}

// --- Inlined helpers from parser ----------------------------------------

/** @param {string[]} columns */
function colMap(columns) {
  return (row) => Object.fromEntries(columns.map((c, i) => [c, row[i]]))
}

/**
 * Run a query; return [] on SQL error (mirrors queryAll in parser).
 *
 * @param {import('sql.js').Database} db
 * @param {string} sql
 */
function queryAll(db, sql) {
  try {
    const res = db.exec(sql)
    if (!res.length) return []
    const mapper = colMap(res[0].columns)
    return res[0].values.map(mapper)
  } catch {
    return []
  }
}

/**
 * Run a query; throw on SQL error (mirrors queryRequired in parser).
 *
 * @param {import('sql.js').Database} db
 * @param {string} sql
 */
function queryRequired(db, sql) {
  const res = db.exec(sql)
  if (!res.length) return []
  const mapper = colMap(res[0].columns)
  return res[0].values.map(mapper)
}

/**
 * List all user tables in the DB (mirrors listTables in parser).
 *
 * @param {import('sql.js').Database} db
 * @returns {string[]}
 */
function listTables(db) {
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    if (!res.length) return []
    return res[0].values.map((row) => String(row[0]))
  } catch {
    return []
  }
}

// --- Inlined detectMime from parser -------------------------------------

/**
 * Detect MIME type from magic bytes; returns null for unrecognised formats.
 *
 * @param {Uint8Array} bytes
 * @returns {string | null}
 */
function detectMime(bytes) {
  if (bytes.length < 8) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "image/heic"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  return null
}

// --- Inlined normalizeUuid from parser ----------------------------------

/**
 * Strip hyphens and uppercase — produces the key used to match Images/ folder
 * entries to ZUNIQUEID values.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeUuid(s) {
  return s.replace(/-/g, "").toUpperCase()
}

// --- Inlined uint8ToBase64 from parser ----------------------------------

/** @param {Uint8Array} bytes */
function uint8ToBase64(bytes) {
  const CHUNK = 8192
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return Buffer.from(binary, "binary").toString("base64")
}

// --- Full schema DDL (real macOS AddressBook Core Data schema) ----------

const FULL_SCHEMA_DDL = `
  CREATE TABLE ZABCDRECORD (
    Z_PK               INTEGER PRIMARY KEY,
    ZFIRSTNAME         TEXT,
    ZLASTNAME          TEXT,
    ZTHUMBNAILIMAGEDATA BLOB,
    ZUNIQUEID          TEXT
  );
  CREATE TABLE ZABCDPHONENUMBER (
    Z_PK        INTEGER PRIMARY KEY,
    ZOWNER      INTEGER,
    ZFULLNUMBER TEXT,
    ZLABEL      TEXT
  );
  CREATE TABLE ZABCDEMAILADDRESS (
    Z_PK    INTEGER PRIMARY KEY,
    ZOWNER  INTEGER,
    ZADDRESS TEXT,
    ZLABEL  TEXT
  );
  CREATE TABLE ZABCDURL (
    Z_PK   INTEGER PRIMARY KEY,
    ZOWNER INTEGER,
    ZURL   TEXT,
    ZLABEL TEXT
  );
`

// ---------------------------------------------------------------------------
// Core extractContacts logic inlined from parser
// (without imageEntries/full-res photo path — tested elsewhere)
// ---------------------------------------------------------------------------

/**
 * Run the full extraction pipeline against an open sql.js Database, mirroring
 * extractContacts() in the parser (synchronous subset — no full-res photos).
 *
 * @param {import('sql.js').Database} db
 * @returns {{ contacts: Array<object>, phoneMap: Map, emailMap: Map, linkedinMap: Map }}
 */
function extractContacts(db) {
  // 1. Table list + ZABCDRECORD guard
  const tables = listTables(db)
  const hasZabcdrecord = tables.some((t) => t === "ZABCDRECORD")

  if (!hasZabcdrecord) {
    const tableList = tables.length > 0 ? tables.join(", ") : "(none found)"
    throw new Error(
      `Database does not contain a ZABCDRECORD table.\n` +
      `Tables found: ${tableList}\n\n` +
      `This may not be a valid AddressBook .abcddb file. ` +
      `Make sure you compressed the .abbu bundle itself (not a file inside it).`
    )
  }

  // 2. Schema probe
  const sampleRow = queryAll(db, "SELECT * FROM ZABCDRECORD LIMIT 1")
  const availableColumns = sampleRow.length > 0 ? Object.keys(sampleRow[0]) : []

  // 3. Build dynamic SELECT list
  const wantedColumns = ["Z_PK", "ZFIRSTNAME", "ZLASTNAME", "ZTHUMBNAILIMAGEDATA"].filter(
    (col) => availableColumns.length === 0 || availableColumns.includes(col)
  )
  const selectList =
    wantedColumns.length >= 2
      ? wantedColumns.join(", ")
      : "rowid AS Z_PK, ZFIRSTNAME, ZLASTNAME"

  // 4. Fetch contact records
  let records
  try {
    records = queryRequired(
      db,
      `SELECT ${selectList} FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL`
    )
  } catch (err) {
    try {
      records = queryRequired(db, `SELECT ${selectList} FROM ZABCDRECORD`)
    } catch (err2) {
      throw new Error(
        `Failed to read contacts from ZABCDRECORD.\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}\n` +
        `Fallback error: ${err2 instanceof Error ? err2.message : String(err2)}\n` +
        `Available columns: ${availableColumns.join(", ") || "(could not determine)"}`
      )
    }
  }

  // 5. Phone map — Mobile/iPhone/Cell labels get priority 2, rest get 1
  const phoneMap = new Map()
  const phonePri = new Map()
  for (const p of queryAll(db, "SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER")) {
    const num = p.ZFULLNUMBER
    if (!num) continue
    const owner = p.ZOWNER
    const label = p.ZLABEL ?? ""
    const isMobile =
      label.includes("Mobile") || label.includes("iPhone") || label.includes("Cell")
    const pri = isMobile ? 2 : 1
    if (pri > (phonePri.get(owner) ?? 0)) {
      phoneMap.set(owner, num)
      phonePri.set(owner, pri)
    }
  }

  // 6. Email map — first email per contact
  const emailMap = new Map()
  for (const e of queryAll(db, "SELECT ZOWNER, ZADDRESS FROM ZABCDEMAILADDRESS ORDER BY ZOWNER")) {
    const owner = e.ZOWNER
    const addr = e.ZADDRESS
    if (addr && !emailMap.has(owner)) emailMap.set(owner, addr.toLowerCase())
  }

  // 7. LinkedIn URL map
  const linkedinMap = new Map()
  for (const u of queryAll(db, "SELECT ZOWNER, ZURL, ZLABEL FROM ZABCDURL")) {
    const owner = u.ZOWNER
    const url = u.ZURL ?? ""
    const label = (u.ZLABEL ?? "").toLowerCase()
    if (!url || linkedinMap.has(owner)) continue
    if (url.includes("linkedin.com/in/") || label.includes("linkedin")) {
      const m = url.match(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/i)
      if (m) linkedinMap.set(owner, `https://www.linkedin.com/in/${m[1]}`)
    }
  }

  // 8. Assemble result contacts
  const contacts = []
  for (const r of records) {
    const pk = r.Z_PK
    const first = (r.ZFIRSTNAME ?? "").trim()
    const last = (r.ZLASTNAME ?? "").trim()
    const fullName = [first, last].filter(Boolean).join(" ")
    if (!fullName) continue

    const thumb = r.ZTHUMBNAILIMAGEDATA ?? null
    const thumbMime = thumb && thumb.length > 100 ? detectMime(thumb) : null
    const thumbPhoto = thumbMime ? `data:${thumbMime};base64,${uint8ToBase64(thumb)}` : null

    contacts.push({
      fullName,
      phone: phoneMap.get(pk) ?? null,
      email: emailMap.get(pk) ?? null,
      birthday: null,
      photoData: thumbPhoto,
      linkedinUrl: linkedinMap.get(pk) ?? null,
    })
  }

  return { contacts, phoneMap, emailMap, linkedinMap }
}

// ===========================================================================
// Test suites
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Happy path — full schema, 3 contacts with phone / email / LinkedIn
// ---------------------------------------------------------------------------
describe("happy path — full schema with 3 contacts", () => {
  it("returns all 3 contacts with correct fields", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      // Contacts
      db.exec(`
        INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME, ZUNIQUEID) VALUES
          (1, 'Alice', 'Smith',   'uuid-1'),
          (2, 'Bob',   'Jones',   'uuid-2'),
          (3, 'Carol', 'Brown',   'uuid-3');
      `)
      // Phones — all Mobile
      db.exec(`
        INSERT INTO ZABCDPHONENUMBER (Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL) VALUES
          (1, 1, '+14155550001', '_$!<Mobile>!$_'),
          (2, 2, '+14155550002', '_$!<Mobile>!$_'),
          (3, 3, '+14155550003', '_$!<Mobile>!$_');
      `)
      // Emails
      db.exec(`
        INSERT INTO ZABCDEMAILADDRESS (Z_PK, ZOWNER, ZADDRESS, ZLABEL) VALUES
          (1, 1, 'alice@example.com',   'work'),
          (2, 2, 'bob@example.com',     'home'),
          (3, 3, 'carol@example.com',   'work');
      `)
      // LinkedIn URLs for Alice and Carol
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 1, 'https://www.linkedin.com/in/alicesmith', 'linkedin'),
          (2, 3, 'https://www.linkedin.com/in/carolbrown', 'linkedin');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 3, "should have 3 contacts")

      const alice = contacts.find((c) => c.fullName === "Alice Smith")
      assert.ok(alice, "Alice Smith not found")
      assert.equal(alice.phone, "+14155550001")
      assert.equal(alice.email, "alice@example.com")
      assert.equal(alice.linkedinUrl, "https://www.linkedin.com/in/alicesmith")
      assert.equal(alice.birthday, null)
      assert.equal(alice.photoData, null)

      const bob = contacts.find((c) => c.fullName === "Bob Jones")
      assert.ok(bob, "Bob Jones not found")
      assert.equal(bob.phone, "+14155550002")
      assert.equal(bob.email, "bob@example.com")
      assert.equal(bob.linkedinUrl, null)

      const carol = contacts.find((c) => c.fullName === "Carol Brown")
      assert.ok(carol, "Carol Brown not found")
      assert.equal(carol.linkedinUrl, "https://www.linkedin.com/in/carolbrown")
    } finally {
      db.close()
    }
  })

  it("table list query returns all 4 tables", () => {
    const buf = createTestDb((db) => db.exec(FULL_SCHEMA_DDL))
    const db = openWithSqlJs(buf)
    try {
      const tables = listTables(db)
      assert.ok(tables.includes("ZABCDRECORD"), "ZABCDRECORD missing")
      assert.ok(tables.includes("ZABCDPHONENUMBER"), "ZABCDPHONENUMBER missing")
      assert.ok(tables.includes("ZABCDEMAILADDRESS"), "ZABCDEMAILADDRESS missing")
      assert.ok(tables.includes("ZABCDURL"), "ZABCDURL missing")
    } finally {
      db.close()
    }
  })

  it("schema probe query returns correct column names", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Test', 'User')`)
    })
    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT * FROM ZABCDRECORD LIMIT 1")
      assert.equal(rows.length, 1)
      const cols = Object.keys(rows[0])
      assert.ok(cols.includes("Z_PK"), "Z_PK missing from schema probe")
      assert.ok(cols.includes("ZFIRSTNAME"), "ZFIRSTNAME missing from schema probe")
      assert.ok(cols.includes("ZLASTNAME"), "ZLASTNAME missing from schema probe")
      assert.ok(cols.includes("ZTHUMBNAILIMAGEDATA"), "ZTHUMBNAILIMAGEDATA missing from schema probe")
      assert.ok(cols.includes("ZUNIQUEID"), "ZUNIQUEID missing from schema probe")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Mobile phone priority — one Home, one Mobile for the same contact
// ---------------------------------------------------------------------------
describe("mobile phone priority", () => {
  it("picks Mobile number over Home when both exist for same contact", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Dave', 'Lee')`)
      // Home inserted first (lower Z_PK) — parser must still pick Mobile
      db.exec(`
        INSERT INTO ZABCDPHONENUMBER (Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL) VALUES
          (1, 1, '+10000000001', '_$!<Home>!$_'),
          (2, 1, '+10000000002', '_$!<Mobile>!$_');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].phone, "+10000000002", "should prefer Mobile number")
    } finally {
      db.close()
    }
  })

  it("picks iPhone label number over generic Work number", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Eve', 'Tan')`)
      db.exec(`
        INSERT INTO ZABCDPHONENUMBER (Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL) VALUES
          (1, 1, '+10000000003', '_$!<Work>!$_'),
          (2, 1, '+10000000004', 'iPhone');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].phone, "+10000000004", "should prefer iPhone-labelled number")
    } finally {
      db.close()
    }
  })

  it("falls back to any number when no mobile label exists", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Frank', 'Wu')`)
      db.exec(`
        INSERT INTO ZABCDPHONENUMBER (Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL) VALUES
          (1, 1, '+10000000005', '_$!<Work>!$_');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts[0].phone, "+10000000005")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Missing ZTHUMBNAILIMAGEDATA column (older macOS)
// ---------------------------------------------------------------------------
describe("missing ZTHUMBNAILIMAGEDATA column", () => {
  it("parser must not crash, photoData is null, contacts still returned", () => {
    const buf = createTestDb((db) => {
      // Schema WITHOUT ZTHUMBNAILIMAGEDATA
      db.exec(`
        CREATE TABLE ZABCDRECORD (
          Z_PK       INTEGER PRIMARY KEY,
          ZFIRSTNAME TEXT,
          ZLASTNAME  TEXT,
          ZUNIQUEID  TEXT
        );
        CREATE TABLE ZABCDPHONENUMBER (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZFULLNUMBER TEXT, ZLABEL TEXT);
        CREATE TABLE ZABCDEMAILADDRESS (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZADDRESS TEXT, ZLABEL TEXT);
        CREATE TABLE ZABCDURL (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZURL TEXT, ZLABEL TEXT);
      `)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Gina', 'Park')`)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1, "should still return contact")
      assert.equal(contacts[0].fullName, "Gina Park")
      assert.equal(contacts[0].photoData, null, "photoData should be null when column absent")
    } finally {
      db.close()
    }
  })

  it("schema probe returns columns without ZTHUMBNAILIMAGEDATA", () => {
    const buf = createTestDb((db) => {
      db.exec(`
        CREATE TABLE ZABCDRECORD (
          Z_PK       INTEGER PRIMARY KEY,
          ZFIRSTNAME TEXT,
          ZLASTNAME  TEXT
        );
      `)
      db.exec(`INSERT INTO ZABCDRECORD VALUES (1, 'Han', 'Solo')`)
    })

    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT * FROM ZABCDRECORD LIMIT 1")
      const cols = Object.keys(rows[0])
      assert.ok(!cols.includes("ZTHUMBNAILIMAGEDATA"), "column should be absent")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Missing ZUNIQUEID column (older macOS)
// ---------------------------------------------------------------------------
describe("missing ZUNIQUEID column", () => {
  it("parser must not crash, contacts returned without UUIDs", () => {
    const buf = createTestDb((db) => {
      // Schema WITHOUT ZUNIQUEID
      db.exec(`
        CREATE TABLE ZABCDRECORD (
          Z_PK                INTEGER PRIMARY KEY,
          ZFIRSTNAME          TEXT,
          ZLASTNAME           TEXT,
          ZTHUMBNAILIMAGEDATA BLOB
        );
        CREATE TABLE ZABCDPHONENUMBER (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZFULLNUMBER TEXT, ZLABEL TEXT);
        CREATE TABLE ZABCDEMAILADDRESS (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZADDRESS TEXT, ZLABEL TEXT);
        CREATE TABLE ZABCDURL (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZURL TEXT, ZLABEL TEXT);
      `)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Ida', 'Nguyen')`)
    })

    const db = openWithSqlJs(buf)
    try {
      // queryAll should silently return [] when ZUNIQUEID column is absent
      const uuidRows = queryAll(db, "SELECT Z_PK, ZUNIQUEID FROM ZABCDRECORD")
      assert.equal(uuidRows.length, 0, "queryAll should return [] on missing column")

      // Full extraction must not throw
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1, "should still return contact")
      assert.equal(contacts[0].fullName, "Ida Nguyen")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Missing ZABCDPHONENUMBER table
// ---------------------------------------------------------------------------
describe("missing ZABCDPHONENUMBER table", () => {
  it("parser must not crash, phoneMap empty, contacts returned", () => {
    const buf = createTestDb((db) => {
      // No ZABCDPHONENUMBER table at all
      db.exec(`
        CREATE TABLE ZABCDRECORD (
          Z_PK                INTEGER PRIMARY KEY,
          ZFIRSTNAME          TEXT,
          ZLASTNAME           TEXT,
          ZTHUMBNAILIMAGEDATA BLOB,
          ZUNIQUEID           TEXT
        );
        CREATE TABLE ZABCDEMAILADDRESS (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZADDRESS TEXT, ZLABEL TEXT);
        CREATE TABLE ZABCDURL (Z_PK INTEGER PRIMARY KEY, ZOWNER INTEGER, ZURL TEXT, ZLABEL TEXT);
      `)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Jack', 'Kim')`)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts, phoneMap } = extractContacts(db)
      assert.equal(contacts.length, 1, "should return contact")
      assert.equal(contacts[0].phone, null, "phone should be null")
      assert.equal(phoneMap.size, 0, "phoneMap should be empty")
    } finally {
      db.close()
    }
  })

  it("queryAll returns [] when querying a non-existent table", () => {
    const buf = createTestDb((db) => {
      db.exec(`CREATE TABLE ZABCDRECORD (Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT)`)
    })

    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER")
      assert.deepEqual(rows, [], "should silently return [] for missing table")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Empty contacts table (no rows)
// ---------------------------------------------------------------------------
describe("empty contacts table", () => {
  it("returns empty array when ZABCDRECORD has no rows", () => {
    const buf = createTestDb((db) => db.exec(FULL_SCHEMA_DDL))

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.deepEqual(contacts, [], "should return []")
    } finally {
      db.close()
    }
  })

  it("mandatory SELECT with WHERE clause returns [] on empty table", () => {
    const buf = createTestDb((db) => {
      db.exec(`CREATE TABLE ZABCDRECORD (
        Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT,
        ZTHUMBNAILIMAGEDATA BLOB, ZUNIQUEID TEXT
      )`)
    })

    const db = openWithSqlJs(buf)
    try {
      const rows = queryRequired(
        db,
        "SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL"
      )
      assert.deepEqual(rows, [])
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 7. No tables at all (corrupt / wrong DB) — must throw containing "ZABCDRECORD"
// ---------------------------------------------------------------------------
describe("no tables at all (corrupt DB)", () => {
  it("throws an error mentioning ZABCDRECORD", () => {
    const buf = createTestDb((db) => {
      // Intentionally create an unrelated table only
      db.exec("CREATE TABLE unrelated (x INTEGER)")
    })

    const db = openWithSqlJs(buf)
    try {
      assert.throws(
        () => extractContacts(db),
        (err) => {
          assert.ok(err instanceof Error, "should throw an Error")
          assert.ok(
            err.message.includes("ZABCDRECORD"),
            `error message should mention ZABCDRECORD, got: "${err.message}"`
          )
          return true
        }
      )
    } finally {
      db.close()
    }
  })

  it("completely empty DB throws mentioning ZABCDRECORD", () => {
    // An empty sqlite database still has the sqlite_master structure
    const buf = createTestDb(() => { /* no tables */ })

    const db = openWithSqlJs(buf)
    try {
      assert.throws(
        () => extractContacts(db),
        (err) => {
          assert.ok(err instanceof Error)
          assert.ok(err.message.includes("ZABCDRECORD"))
          return true
        }
      )
    } finally {
      db.close()
    }
  })

  it("error message lists tables actually found", () => {
    const buf = createTestDb((db) => {
      db.exec("CREATE TABLE wrong_table (id INTEGER)")
    })

    const db = openWithSqlJs(buf)
    try {
      assert.throws(
        () => extractContacts(db),
        (err) => {
          assert.ok(err.message.includes("wrong_table"), `should list tables; got: "${err.message}"`)
          return true
        }
      )
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 8. Contacts with null names — both ZFIRSTNAME and ZLASTNAME null → skipped
// ---------------------------------------------------------------------------
describe("null name filtering", () => {
  it("skips contacts where both ZFIRSTNAME and ZLASTNAME are null", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`
        INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES
          (1, 'Valid',  'Contact'),
          (2, NULL,     NULL),
          (3, NULL,     'OnlyLast'),
          (4, 'OnlyFirst', NULL);
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      // Row 2 is excluded by WHERE clause; rows 1, 3, 4 pass
      assert.equal(contacts.length, 3, "should have 3 contacts (null-null row filtered)")
      const names = contacts.map((c) => c.fullName)
      assert.ok(names.includes("Valid Contact"))
      assert.ok(names.includes("OnlyLast"))
      assert.ok(names.includes("OnlyFirst"))
      assert.ok(!names.includes(""), "should not have empty fullName")
    } finally {
      db.close()
    }
  })

  it("mandatory WHERE query excludes both-null rows at the SQL level", () => {
    const buf = createTestDb((db) => {
      db.exec(`
        CREATE TABLE ZABCDRECORD (
          Z_PK INTEGER PRIMARY KEY, ZFIRSTNAME TEXT, ZLASTNAME TEXT,
          ZTHUMBNAILIMAGEDATA BLOB, ZUNIQUEID TEXT
        )
      `)
      db.exec(`
        INSERT INTO ZABCDRECORD VALUES
          (1, 'Alice', NULL,   NULL, NULL),
          (2, NULL,    NULL,   NULL, NULL),
          (3, NULL,    'Chen', NULL, NULL);
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const rows = queryRequired(
        db,
        "SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL"
      )
      assert.equal(rows.length, 2, "WHERE should exclude the both-null row")
      const pks = rows.map((r) => r.Z_PK)
      assert.ok(pks.includes(1))
      assert.ok(pks.includes(3))
      assert.ok(!pks.includes(2))
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 9. LinkedIn URL extraction
// ---------------------------------------------------------------------------
describe("LinkedIn URL extraction", () => {
  it("extracts linkedin.com/in/ URL correctly", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Li', 'Na')`)
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 1, 'https://www.linkedin.com/in/testuser', 'linkedin');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].linkedinUrl, "https://www.linkedin.com/in/testuser")
    } finally {
      db.close()
    }
  })

  it("ignores non-LinkedIn URLs", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Mo', 'Ali')`)
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 1, 'https://twitter.com/moali', 'twitter'),
          (2, 1, 'https://example.com',        'homepage');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts[0].linkedinUrl, null, "should not extract non-LinkedIn URLs")
    } finally {
      db.close()
    }
  })

  it("detects LinkedIn by label even if URL format differs", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Pat', 'Rex')`)
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 1, 'https://linkedin.com/in/patrex', 'LinkedIn');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts[0].linkedinUrl, "https://www.linkedin.com/in/patrex")
    } finally {
      db.close()
    }
  })

  it("picks only the first LinkedIn URL per contact", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Quinn', 'V')`)
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 1, 'https://linkedin.com/in/first',  'LinkedIn'),
          (2, 1, 'https://linkedin.com/in/second', 'LinkedIn');
      `)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts[0].linkedinUrl, "https://www.linkedin.com/in/first")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// 10. BLOB / thumbnail detection
// ---------------------------------------------------------------------------
describe("BLOB / thumbnail detection", () => {
  it("sets photoData to a data URI when BLOB has valid JPEG magic bytes", () => {
    // Build a minimal 100+ byte JPEG-like blob: FF D8 FF + padding
    const jpegMagic = Buffer.alloc(110, 0x00)
    jpegMagic[0] = 0xff
    jpegMagic[1] = 0xd8
    jpegMagic[2] = 0xff
    jpegMagic[3] = 0xe0

    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      const stmt = db.prepare(
        "INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA) VALUES (?,?,?,?)"
      )
      stmt.run(1, "Rosa", "Parks", jpegMagic)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1)
      assert.ok(
        contacts[0].photoData !== null,
        "photoData should not be null for valid JPEG blob"
      )
      assert.ok(
        contacts[0].photoData.startsWith("data:image/jpeg;base64,"),
        `photoData should be a JPEG data URI; got: ${contacts[0].photoData?.slice(0, 50)}`
      )
    } finally {
      db.close()
    }
  })

  it("sets photoData to null when BLOB has plist magic bytes (bplist)", () => {
    // bplist magic: 62 70 6c 69 73 74 = "bplist"
    const plistMagic = Buffer.alloc(110, 0x00)
    plistMagic[0] = 0x62 // b
    plistMagic[1] = 0x70 // p
    plistMagic[2] = 0x6c // l
    plistMagic[3] = 0x69 // i
    plistMagic[4] = 0x73 // s
    plistMagic[5] = 0x74 // t

    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      const stmt = db.prepare(
        "INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA) VALUES (?,?,?,?)"
      )
      stmt.run(1, "Sam", "Plist", plistMagic)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].photoData, null, "plist blob should not produce a data URI")
    } finally {
      db.close()
    }
  })

  it("sets photoData to null when BLOB is too small (<=100 bytes)", () => {
    const tinyBlob = Buffer.alloc(50, 0xff)
    tinyBlob[0] = 0xff
    tinyBlob[1] = 0xd8
    tinyBlob[2] = 0xff

    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      const stmt = db.prepare(
        "INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA) VALUES (?,?,?,?)"
      )
      stmt.run(1, "Tiny", "Blob", tinyBlob)
    })

    const db = openWithSqlJs(buf)
    try {
      const { contacts } = extractContacts(db)
      assert.equal(contacts[0].photoData, null, "tiny blob should not produce a data URI")
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// detectMime unit tests
// ---------------------------------------------------------------------------
describe("detectMime", () => {
  it("returns null for empty array", () => {
    assert.equal(detectMime(new Uint8Array([])), null)
  })

  it("returns null for array shorter than 8 bytes", () => {
    assert.equal(detectMime(new Uint8Array([0xff, 0xd8, 0xff])), null)
  })

  it("returns image/jpeg for FF D8 FF prefix", () => {
    const bytes = new Uint8Array(10)
    bytes[0] = 0xff; bytes[1] = 0xd8; bytes[2] = 0xff
    assert.equal(detectMime(bytes), "image/jpeg")
  })

  it("returns image/png for 89 50 4E 47 prefix", () => {
    const bytes = new Uint8Array(10)
    bytes[0] = 0x89; bytes[1] = 0x50; bytes[2] = 0x4e; bytes[3] = 0x47
    assert.equal(detectMime(bytes), "image/png")
  })

  it("returns image/heic when bytes[4..7] = 66 74 79 70", () => {
    const bytes = new Uint8Array(10)
    bytes[4] = 0x66; bytes[5] = 0x74; bytes[6] = 0x79; bytes[7] = 0x70
    assert.equal(detectMime(bytes), "image/heic")
  })

  it("returns image/gif for GIF magic bytes 47 49 46", () => {
    const bytes = new Uint8Array(10)
    bytes[0] = 0x47; bytes[1] = 0x49; bytes[2] = 0x46
    assert.equal(detectMime(bytes), "image/gif")
  })

  it("returns null for bplist magic 62 70 6c 69 73 74", () => {
    const bytes = new Uint8Array(10)
    bytes[0] = 0x62; bytes[1] = 0x70; bytes[2] = 0x6c
    bytes[3] = 0x69; bytes[4] = 0x73; bytes[5] = 0x74
    assert.equal(detectMime(bytes), null)
  })

  it("returns null for all-zero bytes (unrecognised)", () => {
    assert.equal(detectMime(new Uint8Array(10)), null)
  })
})

// ---------------------------------------------------------------------------
// normalizeUuid unit tests
// ---------------------------------------------------------------------------
describe("normalizeUuid", () => {
  it("strips hyphens and uppercases a standard UUID", () => {
    assert.equal(
      normalizeUuid("550E8400-E29B-41D4-A716-446655440000"),
      "550E8400E29B41D4A716446655440000"
    )
  })

  it("leaves an already-normalised UUID unchanged", () => {
    assert.equal(
      normalizeUuid("550E8400E29B41D4A716446655440000"),
      "550E8400E29B41D4A716446655440000"
    )
  })

  it("uppercases lowercase hex digits", () => {
    assert.equal(
      normalizeUuid("aabbccdd-eeff-0011-2233-445566778899"),
      "AABBCCDDEEFF00112233445566778899"
    )
  })

  it("handles empty string without throwing", () => {
    assert.equal(normalizeUuid(""), "")
  })
})

// ---------------------------------------------------------------------------
// Direct SQL query validation — every query the parser issues
// ---------------------------------------------------------------------------
describe("parser SQL query validation", () => {
  it("mandatory contacts query executes without error on full schema", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME) VALUES (1, 'Test', 'User')`)
    })
    const db = openWithSqlJs(buf)
    try {
      assert.doesNotThrow(() =>
        queryRequired(
          db,
          "SELECT Z_PK, ZFIRSTNAME, ZLASTNAME, ZTHUMBNAILIMAGEDATA FROM ZABCDRECORD WHERE ZFIRSTNAME IS NOT NULL OR ZLASTNAME IS NOT NULL"
        )
      )
    } finally {
      db.close()
    }
  })

  it("ZUNIQUEID query returns rows on full schema", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDRECORD (Z_PK, ZFIRSTNAME, ZLASTNAME, ZUNIQUEID) VALUES (1, 'A', 'B', 'uid-1')`)
    })
    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT Z_PK, ZUNIQUEID FROM ZABCDRECORD")
      assert.equal(rows.length, 1)
      assert.equal(rows[0].ZUNIQUEID, "uid-1")
    } finally {
      db.close()
    }
  })

  it("phone query returns correct fields", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`INSERT INTO ZABCDPHONENUMBER (Z_PK, ZOWNER, ZFULLNUMBER, ZLABEL) VALUES (1, 42, '+10001112222', 'Mobile')`)
    })
    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT ZOWNER, ZFULLNUMBER, ZLABEL FROM ZABCDPHONENUMBER")
      assert.equal(rows.length, 1)
      assert.equal(rows[0].ZOWNER, 42)
      assert.equal(rows[0].ZFULLNUMBER, "+10001112222")
      assert.equal(rows[0].ZLABEL, "Mobile")
    } finally {
      db.close()
    }
  })

  it("email query returns ordered results", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`
        INSERT INTO ZABCDEMAILADDRESS (Z_PK, ZOWNER, ZADDRESS) VALUES
          (1, 2, 'b@example.com'),
          (2, 1, 'a@example.com');
      `)
    })
    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT ZOWNER, ZADDRESS FROM ZABCDEMAILADDRESS ORDER BY ZOWNER")
      assert.equal(rows.length, 2)
      assert.equal(rows[0].ZOWNER, 1, "first row should be owner 1 (ORDER BY ZOWNER)")
      assert.equal(rows[1].ZOWNER, 2)
    } finally {
      db.close()
    }
  })

  it("URL query returns correct fields", () => {
    const buf = createTestDb((db) => {
      db.exec(FULL_SCHEMA_DDL)
      db.exec(`
        INSERT INTO ZABCDURL (Z_PK, ZOWNER, ZURL, ZLABEL) VALUES
          (1, 7, 'https://linkedin.com/in/user', 'LinkedIn');
      `)
    })
    const db = openWithSqlJs(buf)
    try {
      const rows = queryAll(db, "SELECT ZOWNER, ZURL, ZLABEL FROM ZABCDURL")
      assert.equal(rows.length, 1)
      assert.equal(rows[0].ZOWNER, 7)
      assert.equal(rows[0].ZURL, "https://linkedin.com/in/user")
      assert.equal(rows[0].ZLABEL, "LinkedIn")
    } finally {
      db.close()
    }
  })
})
