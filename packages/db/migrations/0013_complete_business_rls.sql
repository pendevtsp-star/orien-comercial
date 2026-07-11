DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND c.table_name NOT IN (
        'invites',
        'memberships',
        'roles',
        'tenant_domains'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
        table_name
      );
    END IF;
  END LOOP;
END $$;
