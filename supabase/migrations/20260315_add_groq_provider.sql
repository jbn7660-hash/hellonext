-- Add 'groq' to transcription_jobs provider check constraint
ALTER TABLE transcription_jobs DROP CONSTRAINT IF EXISTS transcription_jobs_provider_check;
ALTER TABLE transcription_jobs ADD CONSTRAINT transcription_jobs_provider_check CHECK (provider IN ('openai', 'google', 'whisper', 'groq'));
