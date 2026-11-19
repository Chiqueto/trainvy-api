BEGIN;

SELECT id FROM "Exercise" WHERE id = 'd0a2d0cf-c6b3-4bfb-889e-82ccd3701ede' FOR UPDATE;

CREATE TEMP TABLE reviewed_exercise ON COMMIT DROP AS
SELECT id
FROM "Exercise"
WHERE id = 'd0a2d0cf-c6b3-4bfb-889e-82ccd3701ede'
  AND "ownerUserId" IS NULL
  AND name = 'Supino Declinado no Smith'
  AND "anatomyReview" IS NULL
  AND (
    SELECT string_agg(m.role::text || ':' || m."muscleGroup"::text, '|' ORDER BY m.role::text || ':' || m."muscleGroup"::text)
    FROM "ExerciseMuscle" m WHERE m."exerciseId" = "Exercise".id
  ) = 'PRIMARY:CHEST|SECONDARY:SHOULDERS|SECONDARY:TRICEPS';

INSERT INTO "ExerciseMuscle"(id, "exerciseId", "muscleGroup", role, "createdAt")
SELECT gen_random_uuid()::text, id, muscle_group::"MuscleGroup", 'SECONDARY'::"MuscleRole", now()
FROM reviewed_exercise
CROSS JOIN (VALUES ('FOREARMS')) AS added(muscle_group);

UPDATE "Exercise"
SET "anatomyReview" = '{"version":"2026-11-19.3d.1","reviewedAt":"2026-11-19T16:31:00.000Z","variant":"Supino declinado com barra guiada em trilhos verticais.","aliases":["supino declinado na máquina Smith","decline Smith bench press"],"participants":[{"id":"PECTORALIS_MAJOR","label":"Peitoral maior","muscleGroup":"CHEST","role":"PRIMARY","aliases":[],"regions":[{"id":"CLAVICULAR","label":"Porção clavicular do peitoral","aliases":["peitoral superior"]},{"id":"STERNOCOSTAL","label":"Porção esternocostal do peitoral","aliases":["peitoral médio e inferior"]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY","BENCH_ANGLE"]},{"id":"TRICEPS_BRACHII","label":"Tríceps braquial","muscleGroup":"TRICEPS","role":"SECONDARY","aliases":["tríceps"],"regions":[{"id":"LONG_HEAD","label":"Cabeça longa do tríceps","aliases":[]},{"id":"LATERAL_HEAD","label":"Cabeça lateral do tríceps","aliases":[]},{"id":"MEDIAL_HEAD","label":"Cabeça medial do tríceps","aliases":[]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY","SMITH"]},{"id":"DELTOID","label":"Deltoide anterior","muscleGroup":"SHOULDERS","role":"SECONDARY","aliases":[],"regions":[{"id":"ANTERIOR","label":"Porção anterior do deltoide","aliases":[]}],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_DIGITORUM_SUPERFICIALIS","label":"Flexor superficial dos dedos","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":["pegada"],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"FLEXOR_CARPI_ULNARIS","label":"Flexor ulnar do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]},{"id":"EXTENSOR_CARPI_RADIALIS_BREVIS","label":"Extensor radial curto do carpo","muscleGroup":"FOREARMS","role":"SECONDARY","aliases":[],"regions":[],"emphasizedRegionIds":[],"sourceIds":["ANATOMY"]}],"sources":[{"id":"ANATOMY","title":"OpenStax Anatomy and Physiology 2e: Muscles of the Pectoral Girdle and Upper Limbs","url":"https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs","limitation":"Referência anatômica para ações do cotovelo, ombro e punho."},{"id":"BENCH_ANGLE","title":"Saeterbakken et al. — The Effects of Bench Press Variations in Competitive Athletes on Muscle Activity and Performance","url":"https://pmc.ncbi.nlm.nih.gov/articles/PMC5504579/","limitation":"Doze atletas de supino, 6RM com barra livre em posições reta, inclinada e declinada. A resposta do peitoral foi semelhante entre ângulos nessa amostra; os resultados não estabelecem ênfase regional para halteres ou trilhos."},{"id":"SMITH","title":"Schick et al. — A comparison of muscle activation between a Smith machine and free weight bench press","url":"https://pubmed.ncbi.nlm.nih.gov/20093960/","limitation":"EMG do peitoral maior e deltoides em homens treinados e não treinados, em supino no Smith e livre. A comparação não estudou o efeito do ângulo do banco."}],"notes":"Banco a −18°, joelhos e tornozelos apoiados. O trilho fica alinhado à região inferior do peito e a pegada mantém largura fixa. A trajetória guiada se distingue da barra livre. O ângulo e os participantes são decisões anatômicas, com evidência indireta para a variação declinada específica.","instructions":{"description":"Supino declinado com barra guiada em trilhos verticais.","setup":"Centralize o banco declinado, prenda as pernas nos rolos e alinhe o trilho com a parte inferior do peito. Ajuste os batentes antes da série.","execution":"Desça a barra em direção à parte inferior do peito. Faça uma pausa breve e empurre pelo trilho mantendo cabeça, costas e pernas apoiadas.","tips":"Use pegada pronada com os punhos alinhados e controle a amplitude ao se aproximar do peito. As cores indicam participação muscular ilustrativa."}}'::jsonb, "updatedAt" = now()
WHERE id IN (SELECT id FROM reviewed_exercise);

DROP TABLE reviewed_exercise;
COMMIT;
