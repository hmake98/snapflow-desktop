-- Add session_data column to snaps table for storing multi-screenshot session metadata
ALTER TABLE snaps
  ADD COLUMN IF NOT EXISTS session_data JSONB DEFAULT NULL;

COMMENT ON COLUMN snaps.session_data IS
  'Stores session capture metadata: duration, screenshotCount, eventCount, screenshotPaths, cloudScreenshotUrls, timeline';
