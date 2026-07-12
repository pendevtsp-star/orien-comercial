ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_integrations;
DROP POLICY IF EXISTS tenant_isolation ON integration_credentials;
CREATE POLICY tenant_isolation ON tenant_integrations USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
CREATE POLICY tenant_isolation ON integration_credentials USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
