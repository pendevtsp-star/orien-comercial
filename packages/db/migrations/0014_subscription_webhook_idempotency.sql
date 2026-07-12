CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_provider_invoice_unique
  ON subscription_invoices(provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;
