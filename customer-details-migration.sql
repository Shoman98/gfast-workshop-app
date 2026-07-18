-- Add customer details and VIN to estimates table
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS vin_number TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_estimates_customer_mobile
  ON estimates(customer_mobile);

CREATE INDEX IF NOT EXISTS idx_estimates_vin
  ON estimates(vin_number);
