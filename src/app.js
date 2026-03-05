const EMISSION_FACTOR_TON_CO2_PER_HA = 11.2;
const TARGET_REGION = "Chapada das Mesas";
const TARGET_CITY = "Carolina";

function classifyRisk({ confidence, frp, brightness, burned_area_ha: area }) {
  const score = confidence * 0.45 + frp * 0.3 + (brightness - 280) * 0.15 + area * 0.1;

  if (score >= 95) return "critico";
  if (score >= 78) return "alto";
  if (score >= 58) return "medio";
  return "baixo";
}

function riskColor(risk) {
  if (risk === "critico") return "#ff4f4f";
  if (risk === "alto") return "#ff7d59";
  if (risk === "medio") return "#f3d06d";
  return "#89d26f";
}

function sum(values) {
  return values.reduce((acc, n) => acc + n, 0);
}

function toBRNumber(value, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatRiskLabel(risk) {
  if (risk === "critico") return "cr\u00edtico";
  if (risk === "medio") return "m\u00e9dio";
  return risk;
}

function dailySeries(events) {
  const byDay = new Map();

  events.forEach((event) => {
    byDay.set(event.date, (byDay.get(event.date) || 0) + 1);
  });

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

function perCityRisk(events) {
  const byCity = new Map();

  events.forEach((event) => {
    if (!byCity.has(event.city)) {
      byCity.set(event.city, { city: event.city, avgScore: 0, total: 0, risk: "baixo", co2: 0 });
    }

    const cityData = byCity.get(event.city);
    cityData.total += 1;
    cityData.co2 += event.co2_tons;

    const eventWeight = { baixo: 1, medio: 2, alto: 3, critico: 4 }[event.risk];
    cityData.avgScore += eventWeight;
  });

  return [...byCity.values()]
    .map((c) => {
      const normalized = c.avgScore / c.total;
      let risk = "baixo";
      if (normalized >= 3.5) risk = "critico";
      else if (normalized >= 2.7) risk = "alto";
      else if (normalized >= 1.8) risk = "medio";

      return { ...c, risk };
    })
    .sort((a, b) => b.co2 - a.co2);
}

function riskDistribution(events) {
  const base = { baixo: 0, medio: 0, alto: 0, critico: 0 };
  events.forEach((event) => {
    base[event.risk] += 1;
  });
  return base;
}

function createCards(summary) {
  const cards = [
    { title: "Focos detectados", value: summary.totalEvents, note: `recorte ${TARGET_REGION}` },
    { title: "CO2 estimado", value: `${toBRNumber(summary.totalCO2, 1)} t`, note: "fator por \u00e1rea queimada" },
    { title: "Focos em Carolina", value: summary.carolinaEvents, note: "eventos no munic\u00edpio foco" },
    { title: "CO2 em Carolina", value: `${toBRNumber(summary.carolinaCO2, 1)} t`, note: "impacto local estimado" },
    { title: "Munic\u00edpios monitorados", value: summary.totalCities, note: "no recorte regional" },
    { title: "Maior n\u00edvel de risco", value: formatRiskLabel(summary.maxRisk).toUpperCase(), note: `${TARGET_CITY}-MA e entorno` },
  ];

  const root = document.getElementById("summary-cards");
  root.innerHTML = cards
    .map(
      (card) => `
        <article class="card">
          <h3>${card.title}</h3>
          <strong>${card.value}</strong>
          <small>${card.note}</small>
        </article>
      `,
    )
    .join("");
}

function drawDailyChart(series) {
  const canvas = document.getElementById("dailyChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 30;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const maxValue = Math.max(...series.map((x) => x.count), 1);
  const barWidth = chartWidth / Math.max(series.length, 1) - 18;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(157, 200, 173, 0.2)";
  ctx.fillRect(padding, padding, chartWidth, chartHeight);

  series.forEach((point, index) => {
    const x = padding + index * (barWidth + 18) + 12;
    const barH = (point.count / maxValue) * (chartHeight - 25);
    const y = height - padding - barH;

    const gradient = ctx.createLinearGradient(x, y, x, y + barH);
    gradient.addColorStop(0, "#ff8f65");
    gradient.addColorStop(1, "#f3d06d");

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barH);

    ctx.fillStyle = "#e7f3ec";
    ctx.font = "700 13px Space Grotesk";
    ctx.fillText(point.count.toString(), x + barWidth / 2 - 4, y - 6);

    ctx.fillStyle = "#9dc8ad";
    ctx.font = "500 12px Space Grotesk";
    const [, month, day] = point.date.split("-");
    ctx.fillText(`${day}/${month}`, x - 2, height - 10);
  });
}

function renderCityRisk(rows) {
  const root = document.getElementById("cityRisk");
  root.innerHTML = rows
    .map(
      (row) => `
      <div class="risk-row">
        <span>${row.city}</span>
        <span class="badge badge-${row.risk}">${formatRiskLabel(row.risk)}</span>
        <span>${toBRNumber(row.co2, 1)} t</span>
      </div>
    `,
    )
    .join("");
}

function renderRiskBreakdown(distribution, totalEvents) {
  const riskOrder = ["critico", "alto", "medio", "baixo"];
  const root = document.getElementById("riskBreakdown");

  root.innerHTML = riskOrder
    .map((risk) => {
      const count = distribution[risk];
      const pct = totalEvents > 0 ? (count / totalEvents) * 100 : 0;
      return `
        <div class="breakdown-row">
          <span class="badge badge-${risk}">${formatRiskLabel(risk)}</span>
          <div class="progress"><span style="width:${pct}%; background:${riskColor(risk)}"></span></div>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
}

function renderSatellites(events) {
  const root = document.getElementById("satelliteList");
  const satellites = [...new Set(events.map((event) => `${event.satellite} | ${event.sensor}`))];

  root.innerHTML = satellites
    .map((label) => `<span class="satellite-chip">${label}</span>`)
    .join("");
}

function renderEvents(events) {
  const root = document.getElementById("eventsBody");
  root.innerHTML = events
    .slice()
    .sort((a, b) => `${b.date} ${b.time_utc}`.localeCompare(`${a.date} ${a.time_utc}`))
    .map(
      (event) => `
      <tr>
        <td>${event.date} ${event.time_utc}</td>
        <td>${event.city}/${event.state}</td>
        <td>${event.satellite}</td>
        <td>${event.sensor}</td>
        <td>${event.confidence}%</td>
        <td>${toBRNumber(event.frp, 1)}</td>
        <td>${toBRNumber(event.brightness, 1)}</td>
        <td>${toBRNumber(event.burned_area_ha, 1)}</td>
        <td><span class="badge badge-${event.risk}">${formatRiskLabel(event.risk)}</span></td>
        <td>${toBRNumber(event.co2_tons, 1)}</td>
      </tr>
    `,
    )
    .join("");
}

function initMap(events) {
  const map = L.map("map").setView([-7.35, -47.15], 8);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const maxFrp = Math.max(...events.map((event) => event.frp), 1);
  const heatPoints = events.map((event) => {
    const normalizedFrp = event.frp / maxFrp;
    const confidenceBoost = event.confidence / 100;
    const intensity = Math.min(1, normalizedFrp * 0.75 + confidenceBoost * 0.25);
    return [event.lat, event.lon, intensity];
  });

  L.heatLayer(heatPoints, {
    radius: 30,
    blur: 24,
    minOpacity: 0.35,
    maxZoom: 12,
    gradient: {
      0.2: "#1fa854",
      0.45: "#d8d14d",
      0.7: "#ee8c3e",
      1.0: "#e44747",
    },
  }).addTo(map);

  events.forEach((event) => {
    const radius = Math.max(6, Math.min(18, event.frp / 4));
    L.circleMarker([event.lat, event.lon], {
      radius,
      color: riskColor(event.risk),
      fillColor: riskColor(event.risk),
      fillOpacity: 0.45,
      weight: 1,
    })
      .addTo(map)
      .bindPopup(`
        <strong>${event.city}/${event.state}</strong><br />
        Data: ${event.date} ${event.time_utc} UTC<br />
        Risco: ${formatRiskLabel(event.risk)}<br />
        Sat\u00e9lite: ${event.satellite}<br />
        Sensor: ${event.sensor}<br />
        CO2 estimado: ${toBRNumber(event.co2_tons, 1)} t
      `);
  });
}

async function main() {
  const response = await fetch("./data/hotspots.json");
  const rawEvents = await response.json();
  const scoped = rawEvents.filter(
    (event) => event.region === TARGET_REGION || event.city === TARGET_CITY,
  );

  const events = scoped.map((event) => {
    const risk = classifyRisk(event);
    const co2_tons = event.burned_area_ha * EMISSION_FACTOR_TON_CO2_PER_HA;
    return { ...event, risk, co2_tons };
  });

  const cityRisk = perCityRisk(events);
  const riskOrder = ["baixo", "medio", "alto", "critico"];
  const carolinaEvents = events.filter((event) => event.city === TARGET_CITY);

  const summary = {
    totalEvents: events.length,
    totalCO2: sum(events.map((event) => event.co2_tons)),
    totalCities: new Set(events.map((event) => event.city)).size,
    carolinaEvents: carolinaEvents.length,
    carolinaCO2: sum(carolinaEvents.map((event) => event.co2_tons)),
    maxRisk: (events
      .map((event) => event.risk)
      .sort((a, b) => riskOrder.indexOf(b) - riskOrder.indexOf(a))[0] || "baixo"),
  };

  createCards(summary);
  drawDailyChart(dailySeries(events));
  renderCityRisk(cityRisk);
  renderRiskBreakdown(riskDistribution(events), events.length);
  renderSatellites(events);
  renderEvents(events);
  initMap(events);
}

main().catch((error) => {
  console.error("Erro ao carregar dados de queimadas:", error);
});
