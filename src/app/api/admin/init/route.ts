import prisma from "@/lib/prisma"

function checkKey(req: Request) {
  const key = new URL(req.url).searchParams.get("key")
  const adminKey = process.env.ADMIN_KEY
  if (!adminKey) return process.env.NODE_ENV !== "production"
  return key === adminKey
}

const SQL = `
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "emailVerified" TIMESTAMPTZ(3),
  "image" TEXT,
  "password" TEXT,
  "lastSyncAt" TIMESTAMPTZ(3)
);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT;

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_prov_key" UNIQUE("provider","providerAccountId"),
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VerificationToken_ident_token_key" UNIQUE("identifier","token")
);

CREATE TABLE IF NOT EXISTS "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "linkedinKey" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "position" TEXT,
  "company" TEXT,
  "connectedOn" TIMESTAMPTZ(3),
  "location" TEXT,
  "industry" TEXT,
  "headline" TEXT,
  "profileUrl" TEXT,
  "photoUrl" TEXT,
  "commonConnections" INTEGER,
  "coworkEnrichedAt" TIMESTAMPTZ(3),
  "syncedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Contact_userId_key_key" UNIQUE("userId","linkedinKey"),
  CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX IF NOT EXISTS "Contact_userId_company_idx" ON "Contact"("userId","company");
CREATE INDEX IF NOT EXISTS "Contact_userId_industry_idx" ON "Contact"("userId","industry");

CREATE TABLE IF NOT EXISTS "ContactNote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "ContactList" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "shareToken" TEXT UNIQUE,
  "shareEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContactList_userId_idx" ON "ContactList"("userId");

CREATE TABLE IF NOT EXISTS "ContactListMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactListMember_list_contact_key" UNIQUE("listId","contactId"),
  CONSTRAINT "ContactListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE,
  CONSTRAINT "ContactListMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extensionToken" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "syncCursor" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "syncTotal" INTEGER;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "experience" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "education" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "sharedConnections" JSONB;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "extensionSyncedAt" TIMESTAMPTZ(3);

CREATE TABLE IF NOT EXISTS "Label" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'blue',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Label_userId_name_key" UNIQUE("userId","name"),
  CONSTRAINT "Label_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Label_userId_idx" ON "Label"("userId");

CREATE TABLE IF NOT EXISTS "ContactLabel" (
  "contactId" TEXT NOT NULL,
  "labelId" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactLabel_pkey" PRIMARY KEY ("contactId","labelId"),
  CONSTRAINT "ContactLabel_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE,
  CONSTRAINT "ContactLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE
);
`

export async function POST(req: Request) {
  if (!checkKey(req)) return new Response("Forbidden", { status: 403 })

  const statements = SQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const errors: string[] = []

  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (errors.length > 0) {
    return Response.json({ ok: false, message: errors.join("\n") }, { status: 500 })
  }

  return Response.json({ ok: true, message: `Database initialized successfully (${statements.length} statements)` })
}
