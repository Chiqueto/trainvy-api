import z from "zod";

export function calendarToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function ageFromBirthDate(birthDate: string, today = calendarToday()) {
  return (
    Number(today.slice(0, 4)) -
    Number(birthDate.slice(0, 4)) -
    (today.slice(5) < birthDate.slice(5) ? 1 : 0)
  );
}

export const BirthDateSchema = z.iso.date().refine((date) => {
  const age = ageFromBirthDate(date);
  return age >= 10 && age <= 120;
}, "Informe uma data de nascimento correspondente a uma idade entre 10 e 120 anos.");

export const birthDateString = (date: Date | null) =>
  date?.toISOString().slice(0, 10) ?? null;
