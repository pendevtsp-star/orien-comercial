CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme varchar(24) NOT NULL DEFAULT 'orien',
  color_mode varchar(16) NOT NULL DEFAULT 'system',
  sidebar_mode varchar(16) NOT NULL DEFAULT 'expanded',
  density varchar(16) NOT NULL DEFAULT 'comfortable',
  start_page varchar(80) NOT NULL DEFAULT '/dashboard',
  date_format varchar(16) NOT NULL DEFAULT 'dd/MM/yyyy',
  reduce_motion boolean NOT NULL DEFAULT false,
  notify_in_app boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end time,
  favorite_routes text[] NOT NULL DEFAULT '{}',
  dashboard_widgets text[] NOT NULL DEFAULT ARRAY['executive','financial','indicators','performance','period','goals'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_theme_check CHECK (theme IN ('orien','safira','esmeralda','grafite','rubi','solaris')),
  CONSTRAINT user_preferences_mode_check CHECK (color_mode IN ('light','dark','system')),
  CONSTRAINT user_preferences_sidebar_check CHECK (sidebar_mode IN ('expanded','compact','collapsed')),
  CONSTRAINT user_preferences_density_check CHECK (density IN ('comfortable','compact'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO sgc_app;
