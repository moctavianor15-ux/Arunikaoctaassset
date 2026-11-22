-- Jalankan sekali SETELAH 0002, 0003, dan 0004.
-- Mencatat biaya satu kali pada tingkat penugasan, bukan pada tiap hari.
-- Nilai historis tidak dibuang: transport lama dijumlah sebagai satu biaya
-- penugasan, biaya lainnya disimpan sebagai rincian berlabel tanggal asal.
ALTER TABLE duty_days ADD COLUMN assignment_id TEXT;

UPDATE duty_days SET assignment_id = 'legacy-' || (
  SELECT MIN(d2.day) FROM duty_days AS d2
  WHERE lower(trim(d2.reference)) = lower(trim(duty_days.reference))
    AND lower(trim(d2.activity)) = lower(trim(duty_days.activity))
);

CREATE INDEX IF NOT EXISTS idx_duty_days_assignment ON duty_days(assignment_id,day);

CREATE TABLE IF NOT EXISTS duty_costs (
  assignment_id TEXT PRIMARY KEY NOT NULL,
  transport INTEGER NOT NULL DEFAULT 0 CHECK(transport BETWEEN 0 AND 999999999999),
  expenses TEXT NOT NULL DEFAULT '[]',
  lodging TEXT NOT NULL DEFAULT '[]',
  charge_day TEXT NOT NULL,
  version TEXT NOT NULL
);

INSERT INTO duty_costs(assignment_id,transport,expenses,lodging,charge_day,version)
SELECT d.assignment_id, SUM(d.transport),
  COALESCE((SELECT json_group_array(json_object(
    'label', (CASE WHEN trim(e.detail) = '' THEN 'Biaya lainnya' ELSE trim(e.detail) END) || ' (catatan lama ' || e.day || ')',
    'amount', e.other
  )) FROM duty_days e WHERE e.assignment_id=d.assignment_id AND e.other>0),'[]'),
  '[]',MIN(d.day),'migrated-v1'
FROM duty_days d GROUP BY d.assignment_id;

-- Tetap mempertahankan kolom lama untuk kompatibilitas; isi lama dipindahkan
-- ke duty_costs sehingga tidak dihitung dua kali.
UPDATE duty_days SET transport=0, other=0, detail='';
