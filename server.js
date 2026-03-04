import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const allowedAccessLevels = new Set(["Public", "Private"]);
const allowedStatuses = new Set(["Scheduled", "Cancelled", "Completed"]);

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

app.post("/events", async (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const startDate = body.start_date ?? body.startDate;
  const endDate = body.end_date ?? body.endDate;
  const sportId = parseId(body.sport_id ?? body.sportId);
  const accessLevel = body.access_level ?? body.accessLevel ?? "Public";
  const contactInformation = body.contact_information ?? body.contactInformation ?? null;
  const organizerName = body.organizer_name ?? body.organizerName ?? null;
  const createdBy = parseId(body.created_by ?? body.createdBy ?? req.header("x-user-id"));
  const description = body.description ?? null;
  const status = body.status ?? "Scheduled";
  const cancellationReason = body.cancellation_reason ?? body.cancellationReason ?? null;
  const cancellationDate = body.cancellation_date ?? body.cancellationDate ?? null;

  if (!name || !location || !startDate || !sportId || !createdBy) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  if (!allowedAccessLevels.has(accessLevel)) {
    return res.status(400).json({ message: "Invalid access_level." });
  }

  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const parsedStart = parseDate(startDate);
  const parsedEnd = parseDate(endDate ?? startDate);
  if (!parsedStart || !parsedEnd) {
    return res.status(400).json({ message: "Invalid start_date or end_date." });
  }
  if (new Date(parsedEnd) < new Date(parsedStart)) {
    return res.status(400).json({ message: "end_date must be >= start_date." });
  }

  const shouldCancel = status === "Cancelled";
  const resolvedCancellationReason = shouldCancel ? cancellationReason : null;
  const resolvedCancellationDate = shouldCancel ? cancellationDate : null;

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO events (
        name,
        start_date,
        end_date,
        location,
        sport_id,
        access_level,
        contact_information,
        organizer_name,
        created_by,
        description,
        status,
        cancellation_reason,
        cancellation_date
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13
      )
      RETURNING
        id,
        name,
        start_date,
        end_date,
        location,
        sport_id,
        access_level,
        contact_information,
        organizer_name,
        created_by,
        description,
        status,
        cancellation_reason,
        cancellation_date;
      `,
      [
        name,
        parsedStart,
        parsedEnd,
        location,
        sportId,
        accessLevel,
        contactInformation,
        organizerName,
        createdBy,
        description,
        status,
        resolvedCancellationReason,
        resolvedCancellationDate,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating event:", err);
    return res.status(500).json({ message: "Failed to create event." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Create events service on :${port}`));
