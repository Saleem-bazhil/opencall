INSERT INTO regions (code, name)
VALUES
  ('ASPS01461', 'Chennai')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;
