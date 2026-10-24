-- Tender/Bidding order decided by the user on 2026-10-25 (CLAUDE.md §5.4):
-- Memo → RFQ → PVP* → MoA Hasil Tender → LoA → MoA Biaya → PO → Agreement (sequential).
-- Only the template changes; milestones of existing works are left as they are.
DELETE FROM "milestone_templates" WHERE "method" IN ('TENDER', 'BIDDING');

INSERT INTO "milestone_templates"
  ("id", "method", "type", "sequence", "executor", "prerequisites", "is_conditional", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), m.method::"ProcurementMethod", t.type::"MilestoneType", t.sequence, t.executor::"Executor",
       t.prerequisites::"MilestoneType"[], t.is_conditional, true, now(), now()
FROM (VALUES ('TENDER'), ('BIDDING')) AS m(method)
CROSS JOIN (VALUES
  ('MEMO',       1, 'IT',         '{}',                      false),
  ('RFQ',        2, 'IT',         '{MEMO}',                  false),
  ('PVP',        3, 'DIRECTORS',  '{RFQ}',                   true),
  ('MOA_METHOD', 4, 'IT',         '{PVP}',                   false),
  ('LOA',        5, 'OTHER_TEAM', '{MOA_METHOD}',            false),
  ('MOA_COST',   6, 'IT',         '{LOA}',                   false),
  ('PO',         7, 'IT',         '{MOA_METHOD,MOA_COST}',   false),
  ('AGREEMENT',  8, 'IT',         '{PO}',                    false)
) AS t(type, sequence, executor, prerequisites, is_conditional);
