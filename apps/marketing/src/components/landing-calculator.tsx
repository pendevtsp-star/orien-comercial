"use client";

import { useMemo, useState } from "react";

const workdaysPerMonth = 22;

export function LandingCalculator() {
  const [people, setPeople] = useState(3);
  const [minutesPerDay, setMinutesPerDay] = useState(15);
  const hoursPerMonth = useMemo(
    () => (people * minutesPerDay * workdaysPerMonth) / 60,
    [minutesPerDay, people],
  );

  return (
    <section id="calculator" className="border-y border-[#d9e1ee] bg-white">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[.2em] text-[#2563eb]">GANHO OPERACIONAL</p>
          <h2 data-brand-display="true" className="mt-3 text-4xl md:text-5xl">
            Menos retrabalho, mais tempo para decidir.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Estime o tempo que sua equipe pode redirecionar para atender clientes, acompanhar
            exceções e tomar decisões com mais contexto.
          </p>
        </div>
        <div className="mt-10 grid gap-6 border border-[#d9e1ee] bg-[#f7f8fb] p-6 md:grid-cols-[1fr_1fr_1.2fr] md:p-8">
          <label className="grid gap-2 font-semibold text-[#0b1d3d]">
            Pessoas envolvidas
            <input
              className="border border-[#cbd7e9] bg-white px-3 py-2 text-base"
              type="number"
              min="1"
              max="999"
              value={people}
              onChange={(event) => setPeople(toBoundedNumber(event.target.value, 1, 999))}
            />
          </label>
          <label className="grid gap-2 font-semibold text-[#0b1d3d]">
            Minutos economizados por dia
            <input
              className="border border-[#cbd7e9] bg-white px-3 py-2 text-base"
              type="number"
              min="0"
              max="480"
              value={minutesPerDay}
              onChange={(event) => setMinutesPerDay(toBoundedNumber(event.target.value, 0, 480))}
            />
          </label>
          <output className="border-l-4 border-[#f5c34a] bg-white p-5" aria-live="polite">
            <span className="block text-sm font-semibold text-[#133a7c]">
              Horas recuperadas por mês
            </span>
            <strong data-brand-display="true" className="mt-2 block text-4xl text-[#0b1d3d]">
              {formatHours(hoursPerMonth)} h
            </strong>
            <span className="mt-3 block leading-6 text-slate-600">
              Uma referência operacional para planejar capacidade e prioridades da equipe.
            </span>
          </output>
        </div>
      </div>
    </section>
  );
}

function toBoundedNumber(value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

function formatHours(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}
