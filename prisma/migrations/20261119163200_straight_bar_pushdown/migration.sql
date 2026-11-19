BEGIN;

SELECT id FROM "Exercise" WHERE id = '044421ae-d368-47a5-83e0-2af37dc61131' FOR UPDATE;

CREATE TEMP TABLE reviewed_exercise ON COMMIT DROP AS
SELECT id
FROM "Exercise"
WHERE id = '044421ae-d368-47a5-83e0-2af37dc61131'
  AND "ownerUserId" IS NULL
  AND name = 'Tríceps no Cabo com Barra Reta'
  AND "anatomyReview" IS NULL
  AND (
    SELECT string_agg(m.role::text || ':' || m."muscleGroup"::text, '|' ORDER BY m.role::text || ':' || m."muscleGroup"::text)
    FROM "ExerciseMuscle" m WHERE m."exerciseId" = "Exercise".id
  ) = 'PRIMARY:TRICEPS';

INSERT INTO "ExerciseMuscle"(id, "exerciseId", "muscleGroup", role, "createdAt")
SELECT gen_random_uuid()::text, id, muscle_group::"MuscleGroup", 'SECONDARY'::"MuscleRole", now()
FROM reviewed_exercise
CROSS JOIN (VALUES ('FOREARMS'), ('CORE')) AS added(muscle_group);

UPDATE "Exercise"
SET "anatomyReview" = '{"version":"2026-11-19.3d.1","reviewedAt":"2026-11-19T16:31:00.000Z","variant":"Extensão bilateral dos cotovelos em pé com barra reta na polia alta.","aliases":["tríceps na polia com barra reta","tríceps pulley com barra","straight bar pushdown"],"participants":[{"id":"TRICEPS_BRACHII","label":"Tríceps braquial","muscleGroup":"TRICEPS","role":"PRIMARY","aliases":["tríceps"],"regions":[{"id":"LONG_HEAD","label":"Cabeça longa do tríceps","aliases":[]},{"id":"LATERAL_HEAD","label":"Cabeça lateral do tríceps","aliases":[]},{"id":"MEDIAL_HEAD","label":"Cabeça medial do tríceps","aliases":[]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY","PUSHDOWN"]},{"id":"ANCONEUS","label":"Ancôneo","muscleGroup":"TRICEPS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_DIGITORUM_SUPERFICIALIS","label":"Flexor superficial dos dedos","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":["pegada"],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_CARPI_ULNARIS","label":"Flexor ulnar do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"EXTENSOR_CARPI_RADIALIS_BREVIS","label":"Extensor radial curto do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"RECTUS_ABDOMINIS","label":"Reto abdominal","muscleGroup":"CORE","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"EXTERNAL_OBLIQUE","label":"Oblíquo externo","muscleGroup":"CORE","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"ERECTOR_SPINAE","label":"Eretores da coluna","muscleGroup":"CORE","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]}],"sources":[{"id":"ANATOMY","title":"OpenStax Anatomy and Physiology 2e: Muscles of the Pectoral Girdle and Upper Limbs","url":"https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs","limitation":"Referência anatômica para ações do cotovelo, ombro e punho."},{"id":"PUSHDOWN","title":"Muscle Fatigue in the Three Heads of Triceps Brachii During Intensity and Speed Variations of Triceps Push-Down Exercise","url":"https://pmc.ncbi.nlm.nih.gov/articles/PMC7047337/","limitation":"EMG das três cabeças em adultos saudáveis, puxador reto bilateral e pegada pronada. Mediu fadiga em diferentes cargas e velocidades."}],"notes":"Pegada pronada com largura fixa; úmeros ao lado do tronco a 6° da vertical e flexão de cotovelo de 7° a 93°. As três cabeças são motoras. Ancôneo, pegada e sustentação do tronco são inferências anatômicas; o ancôneo não possui superfície própria no atlas.","instructions":{"description":"Extensão bilateral dos cotovelos em pé com barra reta na polia alta.","setup":"Prenda a barra reta na polia alta. Fique de frente para a torre, com os pés firmes e a pegada pronada na largura dos ombros.","execution":"Estenda os cotovelos e leve a barra em direção às coxas. Retorne devagar até aproximadamente 90° de flexão, faça uma pausa breve e repita.","tips":"Mantenha os braços junto ao tronco e os punhos alinhados durante todo o arco. As cores indicam participação muscular ilustrativa."}}'::jsonb, "updatedAt" = now()
WHERE id IN (SELECT id FROM reviewed_exercise);

DROP TABLE reviewed_exercise;
COMMIT;
