
-- Create a public storage bucket for SimC raw source files
INSERT INTO storage.buckets (id, name, public)
VALUES ('simc-source-files', 'simc-source-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read files from this bucket
CREATE POLICY "Public read access for simc source files"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'simc-source-files');

-- Allow service role to manage files
CREATE POLICY "Service role can manage simc source files"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'simc-source-files')
WITH CHECK (bucket_id = 'simc-source-files');
