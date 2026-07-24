ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS commercial_document_type varchar(16) NOT NULL DEFAULT 'quote',
  ADD COLUMN IF NOT EXISTS document_number bigint,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason varchar(500),
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

WITH numbered AS (
  SELECT id, row_number() OVER (
    PARTITION BY tenant_id, branch_id, commercial_document_type ORDER BY created_at, id
  ) AS sequence_number
  FROM quotes
  WHERE document_number IS NULL
)
UPDATE quotes q SET document_number = numbered.sequence_number
FROM numbered WHERE numbered.id = q.id;

ALTER TABLE quotes ALTER COLUMN document_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_tenant_id_key') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_tenant_id_key UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_items_tenant_quote_id_key') THEN
    ALTER TABLE quote_items ADD CONSTRAINT quote_items_tenant_quote_id_key UNIQUE (tenant_id, quote_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_commercial_document_type_check') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_commercial_document_type_check
      CHECK (commercial_document_type IN ('quote','order','dav'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_commercial_status_check') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_commercial_status_check
      CHECK (status IN ('draft','sent','approved','reserved','converted','expired','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_tenant_branch_type_number_key') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_tenant_branch_type_number_key
      UNIQUE (tenant_id, branch_id, commercial_document_type, document_number);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_tenant_converted_sale_key
  ON quotes (tenant_id, converted_sale_id) WHERE converted_sale_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commercial_document_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  commercial_document_type varchar(16) NOT NULL
    CHECK (commercial_document_type IN ('quote','order','dav')),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, commercial_document_type),
  CONSTRAINT commercial_document_counters_tenant_branch_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id) ON DELETE CASCADE
);

INSERT INTO commercial_document_counters(tenant_id,branch_id,commercial_document_type,next_number)
SELECT tenant_id,branch_id,commercial_document_type,max(document_number)+1
FROM quotes GROUP BY tenant_id,branch_id,commercial_document_type
ON CONFLICT(tenant_id,branch_id,commercial_document_type)
DO UPDATE SET next_number=GREATEST(commercial_document_counters.next_number,EXCLUDED.next_number),updated_at=now();

CREATE TABLE IF NOT EXISTS stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  quote_id uuid NOT NULL,
  quote_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  status varchar(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','released','consumed','expired')),
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  released_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  released_at timestamptz,
  release_reason varchar(500),
  consumed_sale_id uuid,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_reservations_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT stock_reservations_tenant_branch_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_reservations_tenant_quote_fk
    FOREIGN KEY (tenant_id, quote_id) REFERENCES quotes (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT stock_reservations_tenant_quote_item_fk
    FOREIGN KEY (tenant_id, quote_id, quote_item_id)
    REFERENCES quote_items (tenant_id, quote_id, id) ON DELETE CASCADE,
  CONSTRAINT stock_reservations_tenant_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stock_reservations_tenant_sale_fk
    FOREIGN KEY (tenant_id, consumed_sale_id) REFERENCES sales (tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (status='active' AND released_at IS NULL AND consumed_at IS NULL)
    OR (status IN ('released','expired') AND released_at IS NOT NULL AND consumed_at IS NULL)
    OR (status='consumed' AND consumed_at IS NOT NULL AND consumed_sale_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_reservations_active_quote_item_key
  ON stock_reservations (tenant_id, quote_item_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS stock_reservations_tenant_availability_idx
  ON stock_reservations (tenant_id, branch_id, product_id, status, expires_at);
CREATE INDEX IF NOT EXISTS quotes_tenant_type_status_validity_idx
  ON quotes (tenant_id, commercial_document_type, status, valid_until, created_at DESC);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS commercial_origin_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_origin_type varchar(16),
  ADD CONSTRAINT sales_commercial_origin_type_check
    CHECK (commercial_origin_type IS NULL OR commercial_origin_type IN ('quote','order','dav')) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tenant_commercial_origin_fk') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_tenant_commercial_origin_fk
      FOREIGN KEY (tenant_id, commercial_origin_id) REFERENCES quotes (tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_commercial_origin_key
  ON sales (tenant_id, commercial_origin_id) WHERE commercial_origin_id IS NOT NULL;

ALTER TABLE commercial_document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON commercial_document_counters;
CREATE POLICY tenant_isolation ON commercial_document_counters
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
DROP POLICY IF EXISTS tenant_isolation ON stock_reservations;
CREATE POLICY tenant_isolation ON stock_reservations
  USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
