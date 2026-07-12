CREATE TABLE IF NOT EXISTS platform_landing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  value jsonb NOT NULL DEFAULT '{"heroCta":"Começar agora","supportEmail":"suporte@useorien.com.br","showCalculator":true,"showTestimonials":false}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_landing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
