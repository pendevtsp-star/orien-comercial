CREATE TABLE IF NOT EXISTS product_fiscal_profiles (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ncm varchar(8),
  cest varchar(7),
  tax_origin varchar(1),
  cfop_domestic varchar(4),
  cfop_interstate varchar(4),
  icms_tax_code varchar(4),
  pis_tax_code varchar(2),
  cofins_tax_code varchar(2),
  ipi_tax_code varchar(2),
  subject_to_icms_st boolean NOT NULL DEFAULT false,
  icms_rate numeric(7,4),
  icms_st_rate numeric(7,4),
  icms_st_mva_rate numeric(8,4),
  fcp_rate numeric(7,4),
  pis_rate numeric(7,4),
  cofins_rate numeric(7,4),
  ipi_rate numeric(7,4),
  tax_benefit_code varchar(20),
  fiscal_notes text,
  accountant_approved_at timestamptz,
  accountant_approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_fiscal_ncm_check CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$'),
  CONSTRAINT product_fiscal_cest_check CHECK (cest IS NULL OR cest ~ '^[0-9]{7}$'),
  CONSTRAINT product_fiscal_origin_check CHECK (tax_origin IS NULL OR tax_origin ~ '^[0-8]$'),
  CONSTRAINT product_fiscal_cfop_domestic_check CHECK (cfop_domestic IS NULL OR cfop_domestic ~ '^[0-9]{4}$'),
  CONSTRAINT product_fiscal_cfop_interstate_check CHECK (cfop_interstate IS NULL OR cfop_interstate ~ '^[0-9]{4}$'),
  CONSTRAINT product_fiscal_icms_code_check CHECK (icms_tax_code IS NULL OR icms_tax_code ~ '^[0-9]{2,4}$'),
  CONSTRAINT product_fiscal_rates_check CHECK (
    (icms_rate IS NULL OR icms_rate BETWEEN 0 AND 100) AND
    (icms_st_rate IS NULL OR icms_st_rate BETWEEN 0 AND 100) AND
    (icms_st_mva_rate IS NULL OR icms_st_mva_rate BETWEEN 0 AND 1000) AND
    (fcp_rate IS NULL OR fcp_rate BETWEEN 0 AND 100) AND
    (pis_rate IS NULL OR pis_rate BETWEEN 0 AND 100) AND
    (cofins_rate IS NULL OR cofins_rate BETWEEN 0 AND 100) AND
    (ipi_rate IS NULL OR ipi_rate BETWEEN 0 AND 100)
  )
);

CREATE INDEX IF NOT EXISTS product_fiscal_profiles_tenant_idx
  ON product_fiscal_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS product_fiscal_profiles_ncm_idx
  ON product_fiscal_profiles (tenant_id, ncm);

CREATE TABLE IF NOT EXISTS release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL UNIQUE,
  title varchar(180) NOT NULL,
  summary text NOT NULL,
  changes text[] NOT NULL DEFAULT '{}',
  audience_roles text[] NOT NULL DEFAULT '{}',
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_note_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_note_id uuid NOT NULL REFERENCES release_notes(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, release_note_id)
);

CREATE INDEX IF NOT EXISTS release_note_reads_user_idx
  ON release_note_reads (tenant_id, user_id, read_at DESC);

ALTER TABLE product_fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_note_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON product_fiscal_profiles;
CREATE POLICY tenant_isolation ON product_fiscal_profiles
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation ON release_note_reads;
CREATE POLICY tenant_isolation ON release_note_reads
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

INSERT INTO release_notes (version, title, summary, changes, audience_roles)
VALUES (
  '1.1.0',
  'Fundação fiscal e comunicação do piloto',
  'A Orien começou a preparar o cadastro tributário e uma comunicação mais clara sobre cada evolução do produto.',
  ARRAY[
    'Cadastro fiscal guiado e separado dos dados comerciais do produto.',
    'Indicador de prontidão para futura emissão de NF-e e NFC-e.',
    'Central de Novidades com histórico por usuário.'
  ],
  ARRAY[]::text[]
)
ON CONFLICT (version) DO NOTHING;
