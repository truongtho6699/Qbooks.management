-- Qbook Media V2.2 — atomic milestone events, same D1 transaction as video UPDATE.
-- Guarantee a first-completion event even if application logging fails after UPDATE.
-- Unique milestone index (0013) makes application INSERT OR IGNORE harmless.
CREATE TRIGGER IF NOT EXISTS trg_video_film_first_event
AFTER UPDATE OF filmed_at ON video_items
WHEN OLD.filmed_at IS NULL AND NEW.filmed_at IS NOT NULL AND NEW.camera_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO video_events(video_id,actor_id,event_type,event_time,details)
  VALUES(NEW.id,NEW.camera_id,'FILM_COMPLETED',NEW.filmed_at,'Tự ghi khi hoàn thành quay lần đầu');
END;

CREATE TRIGGER IF NOT EXISTS trg_video_edit_first_event
AFTER UPDATE OF edited_at ON video_items
WHEN OLD.edited_at IS NULL AND NEW.edited_at IS NOT NULL AND NEW.editor_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO video_events(video_id,actor_id,event_type,event_time,details)
  VALUES(NEW.id,NEW.editor_id,'EDIT_SUBMITTED',NEW.edited_at,'Tự ghi khi nộp hậu kỳ lần đầu');
END;
