DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sgc_app') THEN
    CREATE ROLE sgc_app LOGIN PASSWORD 'sgc_app_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE sgc TO sgc_app;
