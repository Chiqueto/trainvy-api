BEGIN;

SELECT id FROM "Exercise" WHERE id = '00000000-0000-4000-8000-000000000132' FOR UPDATE;

CREATE TEMP TABLE reviewed_exercise ON COMMIT DROP AS
SELECT id
FROM "Exercise"
WHERE id = '00000000-0000-4000-8000-000000000132'
  AND "ownerUserId" IS NULL
  AND name = 'Tríceps Testa'
  AND "anatomyReview" IS NULL
  AND (
    SELECT string_agg(m.role::text || ':' || m."muscleGroup"::text, '|' ORDER BY m.role::text || ':' || m."muscleGroup"::text)
    FROM "ExerciseMuscle" m WHERE m."exerciseId" = "Exercise".id
  ) = 'PRIMARY:TRICEPS';

INSERT INTO "ExerciseMuscle"(id, "exerciseId", "muscleGroup", role, "createdAt")
SELECT gen_random_uuid()::text, id, muscle_group::"MuscleGroup", 'SECONDARY'::"MuscleRole", now()
FROM reviewed_exercise
CROSS JOIN (VALUES ('SHOULDERS'), ('FOREARMS')) AS added(muscle_group);

UPDATE "Exercise"
SET "anatomyReview" = '{"version":"2026-11-19.3d.1","reviewedAt":"2026-11-19T16:31:00.000Z","variant":"Extensão bilateral dos cotovelos deitado, com barra curta e pegada pronada.","aliases":["extensão de tríceps deitado","tríceps testa com barra","skull crusher"],"participants":[{"id":"TRICEPS_BRACHII","label":"Tríceps braquial","muscleGroup":"TRICEPS","role":"PRIMARY","aliases":["tríceps"],"regions":[{"id":"LONG_HEAD","label":"Cabeça longa do tríceps","aliases":[]},{"id":"LATERAL_HEAD","label":"Cabeça lateral do tríceps","aliases":[]},{"id":"MEDIAL_HEAD","label":"Cabeça medial do tríceps","aliases":[]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY","ELBOW"]},{"id":"ANCONEUS","label":"Ancôneo","muscleGroup":"TRICEPS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"DELTOID","label":"Deltoide anterior","muscleGroup":"SHOULDERS","role":"SECONDARY","aliases":[],"regions":[{"id":"ANTERIOR","label":"Porção anterior do deltoide","aliases":[]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_DIGITORUM_SUPERFICIALIS","label":"Flexor superficial dos dedos","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":["pegada"],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_CARPI_ULNARIS","label":"Flexor ulnar do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"EXTENSOR_CARPI_RADIALIS_BREVIS","label":"Extensor radial curto do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]}],"sources":[{"id":"ANATOMY","title":"OpenStax Anatomy and Physiology 2e: Muscles of the Pectoral Girdle and Upper Limbs","url":"https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs","limitation":"Referência anatômica para ações do cotovelo, ombro e punho."},{"id":"ELBOW","title":"Kholinne et al. — The different role of each head of the triceps brachii muscle in elbow extension","url":"https://pmc.ncbi.nlm.nih.gov/articles/PMC6136322/","limitation":"EMG e simulação com diferentes elevações do ombro. As relações entre as cabeças dependem da posição; exercício deitado com barra não foi testado diretamente."},{"id":"SUPINE","title":"Isometric elbow extensors strength in supine- and prone-lying positions","url":"https://pubmed.ncbi.nlm.nih.gov/22489839/","limitation":"Teste isométrico deitado a 45° e 90° de flexão do cotovelo. Os ângulos do modelo são escolhas ilustrativas de uma repetição dinâmica."}],"notes":"Banco plano. Úmeros fixos a 12° da vertical em direção à cabeça; a flexão de cotovelo vai de 8° a 91°. A estabilidade do ombro e da pegada é inferida da tarefa. O ancôneo auxilia a extensão e o atlas não possui uma superfície separada para ele.","instructions":{"description":"Extensão bilateral dos cotovelos deitado, com barra curta e pegada pronada.","setup":"Deite-se no banco com cabeça, costas e quadril apoiados. Plante os pés e segure a barra com as mãos na largura dos ombros.","execution":"Com os braços ligeiramente inclinados para trás, flexione os cotovelos e aproxime a barra da testa. Faça uma pausa breve e estenda os cotovelos mantendo os braços estáveis.","tips":"Mantenha os punhos alinhados e deixe espaço entre a barra e a cabeça. As cores indicam participação muscular ilustrativa."}}'::jsonb, "updatedAt" = now()
WHERE id IN (SELECT id FROM reviewed_exercise);

DROP TABLE reviewed_exercise;
COMMIT;
