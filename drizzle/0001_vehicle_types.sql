-- Starting catalogue. Prices are placeholders to tune in the admin.
INSERT INTO "vehicle_types" ("kind", "code", "name", "unit", "min_hours", "base_price", "per_km", "commission_pct", "sort") VALUES
  ('cargo', 'porter', 'Портер (до 1 т)', 'trip', NULL, 500, 40, 8, 10),
  ('cargo', 'gazel', 'Газель (до 2 т)', 'trip', NULL, 700, 50, 8, 20),
  ('cargo', 'truck_5t', 'Грузовик до 5 т', 'trip', NULL, 1500, 70, 8, 30),
  ('cargo', 'truck_10t', 'Грузовик до 10 т', 'trip', NULL, 2500, 90, 8, 40),
  ('equipment', 'backhoe', 'Экскаватор-погрузчик', 'hour', 3, 2000, 0, 6, 110),
  ('equipment', 'dump_truck', 'Самосвал', 'trip', NULL, 2500, 60, 6, 120),
  ('equipment', 'crane', 'Автокран', 'hour', 4, 3000, 0, 6, 130),
  ('equipment', 'manipulator', 'Манипулятор', 'hour', 2, 2500, 0, 6, 140);
