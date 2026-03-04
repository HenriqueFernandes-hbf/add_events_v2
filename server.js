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
  const coverImage = body.cover_image ?? body.coverImage ?? null;
  const privateCode = body.private_code ?? body.privateCode ?? null;
  const city = body.city ?? null;
  const address = body.address ?? null;
  const registrationStart = body.registration_start ?? body.registrationStart ?? null;
  const registrationEnd = body.registration_end ?? body.registrationEnd ?? null;
  const eventCategory = body.event_category ?? body.eventCategory ?? null;
  const eventMode = body.event_mode ?? body.eventMode ?? null;
  const eventParticipation = body.event_participation ?? body.eventParticipation ?? null;

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
        cancellation_date,
        cover_image,
        private_code,
        city,
        address,
        registration_start,
        registration_end,
        event_category,
        event_mode,
        event_participation
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
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22
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
        cancellation_date,
        cover_image,
        private_code,
        city,
        address,
        registration_start,
        registration_end,
        event_category,
        event_mode,
        event_participation;
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
        coverImage,
        privateCode,
        city,
        address,
        registrationStart,
        registrationEnd,
        eventCategory,
        eventMode,
        eventParticipation,
      ]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error creating event:", err);
    return res.status(500).json({ message: "Failed to create event." });
  }
});

app.delete("/events/:id", async (req, res) => {
  const eventId = parseId(req.params.id);

  if (!eventId) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM events WHERE id = $1",
      [eventId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Event not found." });
    }

    return res.json({ message: "Event deleted successfully." });
  } catch (err) {
    console.error("Error deleting event:", err);
    return res.status(500).json({ message: "Failed to delete event." });
  }
});


app.put("/events/:id", async (req, res) => {
  const eventId = parseId(req.params.id);

  if (!eventId) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  const {
    name,
    location,
    start_date,
    end_date,
    sport_id,
    access_level,
    contact_information,
    organizer_name,
    description,
    status,
    cancellation_reason,
    cancellation_date,
    cover_image,
    private_code,
    city,
    address,
    registration_start,
    registration_end,
    event_category,
    event_mode,
    event_participation,
  } = req.body;

  try {
    const { rowCount, rows } = await pool.query(
      `
      UPDATE events SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        start_date = COALESCE($3, start_date),
        end_date = COALESCE($4, end_date),
        sport_id = COALESCE($5, sport_id),
        access_level = COALESCE($6, access_level),
        contact_information = COALESCE($7, contact_information),
        organizer_name = COALESCE($8, organizer_name),
        description = COALESCE($9, description),
        status = COALESCE($10, status),
        cancellation_reason = COALESCE($11, cancellation_reason),
        cancellation_date = COALESCE($12, cancellation_date),
        cover_image = COALESCE($13, cover_image),
        private_code = COALESCE($14, private_code),
        city = COALESCE($15, city),
        address = COALESCE($16, address),
        registration_start = COALESCE($17, registration_start),
        registration_end = COALESCE($18, registration_end),
        event_category = COALESCE($19, event_category),
        event_mode = COALESCE($20, event_mode),
        event_participation = COALESCE($21, event_participation)
      WHERE id = $22
      RETURNING *;
      `,
      [
        name,
        location,
        start_date,
        end_date,
        sport_id,
        access_level,
        contact_information,
        organizer_name,
        description,
        status,
        cancellation_reason,
        cancellation_date,
        cover_image,
        private_code,
        city,
        address,
        registration_start,
        registration_end,
        event_category,
        event_mode,
        event_participation,
        eventId,
      ]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Event not found." });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("Error updating event:", err);
    return res.status(500).json({ message: "Failed to update event." });
  }
});

app.get("/events", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
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
        cancellation_date,
        cover_image,
        private_code,
        city,
        address,
        registration_start,
        registration_end,
        event_category,
        event_mode,
        event_participation
       FROM events
       ORDER BY start_date ASC`
    );

    return res.json(rows);
  } catch (err) {
    console.error("Error fetching events:", err);
    return res.status(500).json({ message: "Failed to fetch events." });
  }
});

app.get("/events/:id", async (req, res) => {
  const eventId = parseId(req.params.id);

  if (!eventId) {
    return res.status(400).json({ message: "Invalid event id." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM events WHERE id = $1",
      [eventId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching event:", err);
    return res.status(500).json({ message: "Failed to fetch event." });
  }
});






app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Create events service on :${port}`));
