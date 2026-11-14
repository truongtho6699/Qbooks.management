-- Enforce at most one first FILM_COMPLETED and EDIT_SUBMITTED event per finished video.
-- Revisions, approvals and publications remain separately auditable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_video_first_milestone ON video_events(video_id,event_type) WHERE event_type IN ('FILM_COMPLETED','EDIT_SUBMITTED');
