-- Labor Rates: Repair
CREATE TABLE IF NOT EXISTS labor_rates_repair (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id TEXT NOT NULL,
  part_name_ar TEXT,
  part_name_en TEXT,
  category TEXT,
  refitting_labor_hrs NUMERIC,
  dent_hrs NUMERIC,
  paint_hrs NUMERIC,
  elec_hrs NUMERIC,
  intr_hrs NUMERIC,
  cooling_hrs NUMERIC,
  susp_hrs NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs NUMERIC,
  total_repair_hrs NUMERIC,
  hr_price_egp NUMERIC,
  part_price NUMERIC,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year TEXT,
  last_updated TEXT
);

CREATE INDEX IF NOT EXISTS idx_repair_lookup ON labor_rates_repair (part_id, vehicle_make, vehicle_model, vehicle_year);

-- Labor Rates: Replace
CREATE TABLE IF NOT EXISTS labor_rates_replace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id TEXT NOT NULL,
  part_name_ar TEXT,
  part_name_en TEXT,
  category TEXT,
  refitting_labor_hrs NUMERIC,
  dent_hrs NUMERIC,
  paint_hrs NUMERIC,
  elec_hrs NUMERIC,
  intr_hrs NUMERIC,
  cooling_hrs NUMERIC,
  susp_hrs NUMERIC,
  mechanical_hrs NUMERIC,
  glass_hrs NUMERIC,
  total_replace_hrs NUMERIC,
  hr_price_egp NUMERIC,
  part_price NUMERIC,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_year TEXT,
  last_updated TEXT
);

CREATE INDEX IF NOT EXISTS idx_replace_lookup ON labor_rates_replace (part_id, vehicle_make, vehicle_model, vehicle_year);

-- RLS
ALTER TABLE labor_rates_repair ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_rates_replace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read labor_rates_repair" ON labor_rates_repair FOR SELECT USING (true);
CREATE POLICY "Allow read labor_rates_replace" ON labor_rates_replace FOR SELECT USING (true);
