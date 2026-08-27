-- 30 real Cleveland heart-disease rows pulled from
-- federated/data/heart_presentation_pool.csv — a set task.py's
-- _read_training_rows() explicitly excludes from every hospital's training
-- partition (matched by _source_row), so the global model has never seen
-- these patients. 15 positive / 15 negative for a balanced accuracy read.
-- "symptoms" only carries chest-pain presence because that's the only signal
-- federated/src/federated/service.py::_predict derives from it (cp becomes
-- "4" vs "1"); the original dataset's finer cp categories (2/3) don't survive
-- the /predict request shape.
insert into public.test_patients (name, age, sex, symptoms, health_conditions, actual_diagnosis)
values
  ('Pool Patient 214', 52, 'M', ARRAY['chest pain'], '{"trestbps": 112.0, "chol": 230.0, "fbs": 0, "restecg": 0, "thalach": 160.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 1, "thal": 3}'::jsonb, true),
  ('Pool Patient 267', 59, 'M', ARRAY[]::text[], '{"trestbps": 126.0, "chol": 218.0, "fbs": 1, "restecg": 0, "thalach": 134.0, "exang": 0, "oldpeak": 2.2, "slope": 2, "ca": 1, "thal": 6}'::jsonb, true),
  ('Pool Patient 248', 52, 'M', ARRAY['chest pain'], '{"trestbps": 125.0, "chol": 212.0, "fbs": 0, "restecg": 0, "thalach": 168.0, "exang": 0, "oldpeak": 1.0, "slope": 1, "ca": 2, "thal": 7}'::jsonb, true),
  ('Pool Patient 45', 58, 'M', ARRAY[]::text[], '{"trestbps": 112.0, "chol": 230.0, "fbs": 0, "restecg": 2, "thalach": 165.0, "exang": 0, "oldpeak": 2.5, "slope": 2, "ca": 1, "thal": 7}'::jsonb, true),
  ('Pool Patient 155', 70, 'M', ARRAY['chest pain'], '{"trestbps": 130.0, "chol": 322.0, "fbs": 0, "restecg": 2, "thalach": 109.0, "exang": 0, "oldpeak": 2.4, "slope": 2, "ca": 3, "thal": 3}'::jsonb, true),
  ('Pool Patient 60', 51, 'F', ARRAY['chest pain'], '{"trestbps": 130.0, "chol": 305.0, "fbs": 0, "restecg": 0, "thalach": 142.0, "exang": 1, "oldpeak": 1.2, "slope": 2, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 282', 55, 'F', ARRAY['chest pain'], '{"trestbps": 128.0, "chol": 205.0, "fbs": 0, "restecg": 1, "thalach": 130.0, "exang": 1, "oldpeak": 2.0, "slope": 2, "ca": 1, "thal": 7}'::jsonb, true),
  ('Pool Patient 24', 60, 'M', ARRAY['chest pain'], '{"trestbps": 130.0, "chol": 206.0, "fbs": 0, "restecg": 2, "thalach": 132.0, "exang": 1, "oldpeak": 2.4, "slope": 2, "ca": 2, "thal": 7}'::jsonb, true),
  ('Pool Patient 9', 53, 'M', ARRAY['chest pain'], '{"trestbps": 140.0, "chol": 203.0, "fbs": 1, "restecg": 2, "thalach": 155.0, "exang": 1, "oldpeak": 3.1, "slope": 3, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 236', 56, 'M', ARRAY['chest pain'], '{"trestbps": 130.0, "chol": 283.0, "fbs": 1, "restecg": 2, "thalach": 103.0, "exang": 1, "oldpeak": 1.6, "slope": 3, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 109', 39, 'M', ARRAY['chest pain'], '{"trestbps": 118.0, "chol": 219.0, "fbs": 0, "restecg": 0, "thalach": 140.0, "exang": 0, "oldpeak": 1.2, "slope": 2, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 211', 38, 'M', ARRAY[]::text[], '{"trestbps": 120.0, "chol": 231.0, "fbs": 0, "restecg": 0, "thalach": 182.0, "exang": 1, "oldpeak": 3.8, "slope": 2, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 290', 67, 'M', ARRAY[]::text[], '{"trestbps": 152.0, "chol": 212.0, "fbs": 0, "restecg": 2, "thalach": 150.0, "exang": 0, "oldpeak": 0.8, "slope": 2, "ca": 0, "thal": 7}'::jsonb, true),
  ('Pool Patient 187', 66, 'M', ARRAY[]::text[], '{"trestbps": 160.0, "chol": 246.0, "fbs": 0, "restecg": 0, "thalach": 120.0, "exang": 1, "oldpeak": 0.0, "slope": 2, "ca": 3, "thal": 6}'::jsonb, true),
  ('Pool Patient 91', 62, 'F', ARRAY['chest pain'], '{"trestbps": 160.0, "chol": 164.0, "fbs": 0, "restecg": 2, "thalach": 145.0, "exang": 0, "oldpeak": 6.2, "slope": 3, "ca": 3, "thal": 7}'::jsonb, true),
  ('Pool Patient 169', 45, 'F', ARRAY[]::text[], '{"trestbps": 112.0, "chol": 160.0, "fbs": 0, "restecg": 0, "thalach": 138.0, "exang": 0, "oldpeak": 0.0, "slope": 2, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 63', 54, 'F', ARRAY[]::text[], '{"trestbps": 135.0, "chol": 304.0, "fbs": 1, "restecg": 0, "thalach": 170.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 5', 56, 'M', ARRAY[]::text[], '{"trestbps": 120.0, "chol": 236.0, "fbs": 0, "restecg": 0, "thalach": 178.0, "exang": 0, "oldpeak": 0.8, "slope": 1, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 77', 51, 'F', ARRAY[]::text[], '{"trestbps": 140.0, "chol": 308.0, "fbs": 0, "restecg": 2, "thalach": 142.0, "exang": 0, "oldpeak": 1.5, "slope": 1, "ca": 1, "thal": 3}'::jsonb, false),
  ('Pool Patient 185', 63, 'F', ARRAY[]::text[], '{"trestbps": 140.0, "chol": 195.0, "fbs": 0, "restecg": 0, "thalach": 179.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 2, "thal": 3}'::jsonb, false),
  ('Pool Patient 159', 68, 'M', ARRAY[]::text[], '{"trestbps": 118.0, "chol": 277.0, "fbs": 0, "restecg": 0, "thalach": 151.0, "exang": 0, "oldpeak": 1.0, "slope": 1, "ca": 1, "thal": 7}'::jsonb, false),
  ('Pool Patient 140', 59, 'M', ARRAY[]::text[], '{"trestbps": 140.0, "chol": 221.0, "fbs": 0, "restecg": 0, "thalach": 164.0, "exang": 1, "oldpeak": 0.0, "slope": 1, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 78', 48, 'M', ARRAY[]::text[], '{"trestbps": 130.0, "chol": 245.0, "fbs": 0, "restecg": 2, "thalach": 180.0, "exang": 0, "oldpeak": 0.2, "slope": 2, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 93', 44, 'F', ARRAY[]::text[], '{"trestbps": 108.0, "chol": 141.0, "fbs": 0, "restecg": 0, "thalach": 175.0, "exang": 0, "oldpeak": 0.6, "slope": 2, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 102', 57, 'F', ARRAY['chest pain'], '{"trestbps": 128.0, "chol": 303.0, "fbs": 0, "restecg": 2, "thalach": 159.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 1, "thal": 3}'::jsonb, false),
  ('Pool Patient 42', 71, 'F', ARRAY[]::text[], '{"trestbps": 160.0, "chol": 302.0, "fbs": 0, "restecg": 0, "thalach": 162.0, "exang": 0, "oldpeak": 0.4, "slope": 1, "ca": 2, "thal": 3}'::jsonb, false),
  ('Pool Patient 225', 34, 'F', ARRAY[]::text[], '{"trestbps": 118.0, "chol": 210.0, "fbs": 0, "restecg": 0, "thalach": 192.0, "exang": 0, "oldpeak": 0.7, "slope": 1, "ca": 0, "thal": 3}'::jsonb, false),
  ('Pool Patient 288', 56, 'M', ARRAY[]::text[], '{"trestbps": 130.0, "chol": 221.0, "fbs": 0, "restecg": 2, "thalach": 163.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 0, "thal": 7}'::jsonb, false),
  ('Pool Patient 33', 59, 'M', ARRAY['chest pain'], '{"trestbps": 135.0, "chol": 234.0, "fbs": 0, "restecg": 0, "thalach": 161.0, "exang": 0, "oldpeak": 0.5, "slope": 2, "ca": 0, "thal": 7}'::jsonb, false),
  ('Pool Patient 149', 60, 'F', ARRAY[]::text[], '{"trestbps": 102.0, "chol": 318.0, "fbs": 0, "restecg": 0, "thalach": 160.0, "exang": 0, "oldpeak": 0.0, "slope": 1, "ca": 1, "thal": 3}'::jsonb, false);
