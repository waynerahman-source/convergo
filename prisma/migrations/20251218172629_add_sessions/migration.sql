-- Add Session table + sessionId on Message (PostgreSQL)

-- 1) Create Session table
CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- 2) FK Session -> Conversation
ALTER TABLE "Session"
ADD CONSTRAINT "Session_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Indexes for Session
CREATE INDEX "Session_conversationId_startedAt_idx"
ON "Session"("conversationId", "startedAt");

CREATE INDEX "Session_endedAt_idx"
ON "Session"("endedAt");

-- 4) Add sessionId column to Message
ALTER TABLE "Message"
ADD COLUMN "sessionId" TEXT;

-- 5) FK Message.sessionId -> Session.id
ALTER TABLE "Message"
ADD CONSTRAINT "Message_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Indexes for Message session queries
CREATE INDEX "Message_sessionId_createdAt_idx"
ON "Message"("sessionId", "createdAt");
