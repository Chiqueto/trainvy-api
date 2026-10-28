-- Do not infer a date of birth from the approximate legacy age.
ALTER TABLE "user" ADD COLUMN "birthDate" DATE;
