(() => {
  const STORAGE_KEY = "bcz_mvp_v1";

  const formatInt = (n) => new Intl.NumberFormat("pt-BR").format(Math.trunc(n || 0));
  const formatDateTime = (iso) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  const getState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { farms: [], orders: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { farms: [], orders: [] };
      return {
        farms: Array.isArray(parsed.farms) ? parsed.farms : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      };
    } catch {
      return { farms: [], orders: [] };
    }
  };

  const setState = (next) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const estimate = ({ areaHa, captureRate }) => {
    const tco2PerYear = Number(areaHa) * Number(captureRate);
    const tokens = Math.ceil(tco2PerYear);
    return { tco2PerYear, tokens };
  };

  const readPhotos = async (fileList, maxPhotos = 2) => {
    const files = Array.from(fileList || []).slice(0, maxPhotos);
    const readers = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(file);
        }),
    );
    return Promise.all(readers);
  };

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const isIndex = () => !!qs("#market-grid");
  const isFarmPage = () => location.pathname.toLowerCase().endsWith("fazenda.html");
  const isCertPage = () => location.pathname.toLowerCase().endsWith("certificado.html");

  const urlWithQuery = (path, params) => {
    const u = new URL(path, location.href);
    Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  };

  const qrUrl = (text) => `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=240&ecLevel=M`;

  const setQr = (imgEl, fallbackEl, targetUrl) => {
    if (!imgEl) return;
    const src = qrUrl(targetUrl);
    imgEl.src = src;
    imgEl.addEventListener(
      "error",
      () => {
        if (fallbackEl) fallbackEl.hidden = false;
        imgEl.remove();
      },
      { once: true },
    );
  };

  const renderMarketplaceCard = (farm) => {
    const el = document.createElement("article");
    el.className = "card market-card";

    const farmUrl = urlWithQuery("./fazenda.html", { id: farm.id });

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (farm.photos && farm.photos[0]) {
      const img = document.createElement("img");
      img.alt = `Foto da ${farm.name}`;
      img.src = farm.photos[0];
      thumb.appendChild(img);
    } else {
      const img = document.createElement("img");
      img.alt = "Ilustração de fazenda de bambu";
      img.src = "./assets/Images/fazenda-placeholder.svg";
      thumb.appendChild(img);
    }

    const top = document.createElement("div");
    top.className = "row-between";

    const titleWrap = document.createElement("div");
    const h3 = document.createElement("h3");
    h3.textContent = farm.name;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `${farm.location} • ${formatInt(farm.areaHa)} ha`;
    titleWrap.append(h3, sub);

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.innerHTML = `<strong>${formatInt(farm.tokensAvailable)}</strong> tokens`;

    top.append(titleWrap, pill);

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <span class="pill"><strong>${formatInt(farm.estimatedTco2PerYear)}</strong> tCO₂/ano</span>
      <span class="pill">taxa: <strong>${farm.captureRate}</strong> tCO₂/ha/ano</span>
    `;

    const actions = document.createElement("div");
    actions.className = "row";

    const farmLink = document.createElement("a");
    farmLink.className = "button ghost";
    farmLink.href = farmUrl;
    farmLink.textContent = "Página da fazenda";

    const buyBtn = document.createElement("button");
    buyBtn.className = "button primary";
    buyBtn.type = "button";
    buyBtn.textContent = "Comprar tokens";
    buyBtn.dataset.buyFarm = farm.id;
    buyBtn.disabled = farm.tokensAvailable <= 0;

    actions.append(farmLink, buyBtn);

    el.append(thumb, top, row, actions);
    return el;
  };

  const renderOrders = (state) => {
    const list = qs("#orders-list");
    if (!list) return;
    list.innerHTML = "";

    const orders = [...state.orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (orders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted small";
      empty.textContent = "Nenhuma compra ainda. Faça uma compra simulada no marketplace.";
      list.appendChild(empty);
      return;
    }

    for (const o of orders.slice(0, 8)) {
      const farm = state.farms.find((f) => f.id === o.farmId);
      const item = document.createElement("a");
      item.className = "list-item";
      item.href = urlWithQuery("./certificado.html", { orderId: o.id });

      const top = document.createElement("div");
      top.className = "top";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${o.company} • ${formatInt(o.tokens)} tokens`;

      const when = document.createElement("div");
      when.className = "muted small";
      when.textContent = formatDateTime(o.createdAt);

      top.append(title, when);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${farm ? farm.name : "Fazenda"} • impacto: ${formatInt(o.tco2)} tCO₂`;

      item.append(top, meta);
      list.appendChild(item);
    }
  };

  const computeStats = (state) => {
    const totalTokens = state.orders.reduce((acc, o) => acc + Number(o.tokens || 0), 0);
    const totalTco2 = state.orders.reduce((acc, o) => acc + Number(o.tco2 || 0), 0);
    const projects = new Set(state.orders.map((o) => o.farmId)).size;
    return { totalTokens, totalTco2, projects };
  };

  const renderStats = (state) => {
    const { totalTokens, totalTco2, projects } = computeStats(state);
    const tco2El = qs("#stat-tco2");
    const tokensEl = qs("#stat-tokens");
    const projectsEl = qs("#stat-projects");
    if (tco2El) tco2El.textContent = formatInt(totalTco2);
    if (tokensEl) tokensEl.textContent = formatInt(totalTokens);
    if (projectsEl) projectsEl.textContent = formatInt(projects);
  };

  const rerenderIndex = () => {
    if (!isIndex()) return;
    const state = getState();

    const grid = qs("#market-grid");
    const empty = qs("#market-empty");

    const search = (qs("#search")?.value || "").trim().toLowerCase();
    const sort = qs("#sort")?.value || "new";

    let farms = [...state.farms];
    if (search) {
      farms = farms.filter((f) => `${f.name} ${f.location}`.toLowerCase().includes(search));
    }

    farms.sort((a, b) => {
      if (sort === "tokens") return Number(b.tokensAvailable) - Number(a.tokensAvailable);
      if (sort === "tco2") return Number(b.estimatedTco2PerYear) - Number(a.estimatedTco2PerYear);
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    grid.innerHTML = "";

    if (farms.length === 0) {
      empty.hidden = state.farms.length !== 0;
    } else {
      empty.hidden = true;
      for (const f of farms) grid.appendChild(renderMarketplaceCard(f));
    }

    renderStats(state);
    renderOrders(state);
  };

  const buildStateFromSamples = (samples) => {
    const farms = [];
    const orders = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    for (const sample of samples) {
      const { tco2PerYear, tokens } = estimate(sample);
      const farmId = uid();
      const sold = sample.purchases.reduce((acc, p) => acc + Number(p.tokens || 0), 0);

      farms.push({
        id: farmId,
        name: sample.name,
        location: sample.location,
        areaHa: sample.areaHa,
        ageYears: sample.ageYears,
        captureRate: sample.captureRate,
        estimatedTco2PerYear: tco2PerYear,
        tokensAvailable: Math.max(0, tokens - sold),
        photos: [],
        createdAt: new Date(now - sample.createdDaysAgo * dayMs).toISOString(),
      });

      for (const purchase of sample.purchases) {
        orders.push({
          id: uid(),
          farmId,
          company: purchase.company,
          tokens: purchase.tokens,
          tco2: purchase.tokens,
          createdAt: new Date(now - purchase.daysAgo * dayMs).toISOString(),
        });
      }
    }

    return { farms, orders };
  };

  const buildDemoState = () => {
    return buildStateFromSamples([
      {
        name: "Fazenda Verde Vale",
        location: "Carolina/MA",
        areaHa: 12.5,
        ageYears: 3,
        captureRate: 12,
        createdDaysAgo: 12,
        purchases: [
          { company: "Eco Construcoes SA", tokens: 28, daysAgo: 8 },
          { company: "BioEnergia Norte", tokens: 12, daysAgo: 4 },
        ],
      },
      {
        name: "Sitio Bambuzal do Cerrado",
        location: "Riachao/MA",
        areaHa: 6.2,
        ageYears: 2,
        captureRate: 10,
        createdDaysAgo: 10,
        purchases: [{ company: "SolarTech Brasil", tokens: 14, daysAgo: 6 }],
      },
      {
        name: "Projeto Rio Azul",
        location: "Estreito/MA",
        areaHa: 18,
        ageYears: 4,
        captureRate: 13.5,
        createdDaysAgo: 14,
        purchases: [
          { company: "Logistica Verde Ltda", tokens: 35, daysAgo: 9 },
          { company: "Mercado Aurora", tokens: 22, daysAgo: 2 },
        ],
      },
      {
        name: "Cooperativa Serra Viva",
        location: "Imperatriz/MA",
        areaHa: 9.8,
        ageYears: 1.5,
        captureRate: 11.5,
        createdDaysAgo: 7,
        purchases: [{ company: "Rede Alimentos Centro", tokens: 18, daysAgo: 3 }],
      },
      {
        name: "Bambu Sustentavel Tocantins",
        location: "Araguaina/TO",
        areaHa: 21.3,
        ageYears: 5,
        captureRate: 14.2,
        createdDaysAgo: 20,
        purchases: [
          { company: "Industria Delta", tokens: 60, daysAgo: 15 },
          { company: "Grupo Horizonte", tokens: 44, daysAgo: 5 },
        ],
      },
    ]);
  };

  const loadExampleData = async ({ force = false } = {}) => {
    const state = getState();
    if (!force && (state.farms.length > 0 || state.orders.length > 0)) return false;
    try {
      const res = await fetch("./ex.json", { cache: "no-store" });
      if (!res.ok) throw new Error("ex.json not found");
      const data = await res.json();
      const samples = Array.isArray(data?.samples) ? data.samples : [];
      if (samples.length === 0) throw new Error("ex.json empty");
      const demo = buildStateFromSamples(samples);
      setState({ ...state, farms: demo.farms, orders: [...demo.orders, ...state.orders] });
      return true;
    } catch {
      if (force || (state.farms.length === 0 && state.orders.length === 0)) {
        const demo = buildDemoState();
        setState({ ...state, farms: demo.farms, orders: [...demo.orders, ...state.orders] });
        return true;
      }
      return false;
    }
  };

  const seedDemoData = () => {
    loadExampleData({ force: true });
  };

  const initFarmForm = () => {
    const farmForm = qs("#farm-form");
    if (!farmForm) return;
    const farmResult = qs("#farm-result");
    const seedBtn = qs("#seed-demo");

    seedBtn?.addEventListener("click", () => {
      seedDemoData();
      if (farmResult) farmResult.innerHTML = `<span class="ok">Exemplos adicionados.</span> Vá ao marketplace para comprar tokens.`;
      rerenderIndex();
      location.href = "./index.html#marketplace";
    });

    farmForm.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (farmResult) farmResult.textContent = "";

      const form = ev.currentTarget;
      if (!(form instanceof HTMLFormElement)) return;

      const data = new FormData(form);
      const name = String(data.get("farmName") || "").trim();
      const locationText = String(data.get("location") || "").trim();
      const areaHa = Number(data.get("areaHa"));
      const ageYears = Number(data.get("ageYears"));
      const captureRate = Number(data.get("captureRate"));
      const agree = data.get("agree") === "on";

      if (!name || !locationText || !Number.isFinite(areaHa) || !Number.isFinite(ageYears) || !Number.isFinite(captureRate)) {
        if (farmResult) farmResult.innerHTML = `<span class="bad">Preencha todos os campos obrigatórios.</span>`;
        return;
      }
      if (areaHa <= 0) {
        if (farmResult) farmResult.innerHTML = `<span class="bad">Área deve ser maior que 0.</span>`;
        return;
      }
      if (captureRate <= 0) {
        if (farmResult) farmResult.innerHTML = `<span class="bad">Taxa deve ser maior que 0.</span>`;
        return;
      }
      if (!agree) {
        if (farmResult) farmResult.innerHTML = `<span class="bad">Confirme o aviso de protótipo.</span>`;
        return;
      }

      const photos = await readPhotos(data.getAll("photos"));
      const { tco2PerYear, tokens } = estimate({ areaHa, captureRate });

      const state = getState();
      const farm = {
        id: uid(),
        name,
        location: locationText,
        areaHa,
        ageYears,
        captureRate,
        estimatedTco2PerYear: tco2PerYear,
        tokensAvailable: tokens,
        photos,
        createdAt: new Date().toISOString(),
      };
      setState({ ...state, farms: [farm, ...state.farms] });

      if (farmResult) {
        farmResult.innerHTML = `<span class="ok">Fazenda publicada!</span> Estimativa: <strong>${formatInt(
          tco2PerYear,
        )}</strong> tCO₂/ano → <strong>${formatInt(tokens)}</strong> tokens.`;
      }

      form.reset();
      const captureInput = qs('input[name="captureRate"]');
      if (captureInput) captureInput.value = "12";
      rerenderIndex();
      location.href = "./index.html#marketplace";
    });
  };

  const initIndex = () => {
    loadExampleData();
    const toggleIframe = qs("#toggle-iframe");
    const simFrame = qs("#sim-frame");

    toggleIframe?.addEventListener("click", () => {
      const nextHidden = !simFrame.hidden;
      simFrame.hidden = nextHidden;
      toggleIframe.textContent = nextHidden ? "Mostrar aqui" : "Ocultar aqui";
    });

    qs("#search")?.addEventListener("input", rerenderIndex);
    qs("#sort")?.addEventListener("change", rerenderIndex);

    qs("#reset-data")?.addEventListener("click", () => {
      if (!confirm("Limpar todos os dados salvos neste navegador?")) return;
      localStorage.removeItem(STORAGE_KEY);
      rerenderIndex();
      const list = qs("#orders-list");
      if (list) list.innerHTML = "";
    });

    const buyDialog = qs("#buy-dialog");
    const buyForm = qs("#buy-form");
    const buySub = qs("#buy-sub");
    const buyHelp = qs("#buy-help");
    const buyResult = qs("#buy-result");
    const buyFarmSelect = buyForm?.querySelector('select[name="farmIdSelect"]');
    const buyConfirm = qs("#buy-confirm");
    const buyClose = qs("#buy-close");
    const buyCancel = qs("#buy-cancel");

    const fillBuyFarmOptions = (selectedFarmId) => {
      if (!buyFarmSelect) return;
      const state = getState();
      const farms = [...state.farms].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

      buyFarmSelect.innerHTML = "";
      for (const farm of farms) {
        const opt = document.createElement("option");
        opt.value = farm.id;
        opt.textContent = `${farm.name} • ${farm.location} (${formatInt(farm.tokensAvailable)} tokens)`;
        buyFarmSelect.appendChild(opt);
      }

      if (farms.length === 0) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Nenhuma fazenda disponível";
        buyFarmSelect.appendChild(empty);
      }

      const availableIds = new Set(farms.map((f) => f.id));
      if (selectedFarmId && availableIds.has(selectedFarmId)) {
        buyFarmSelect.value = selectedFarmId;
      } else if (farms[0]) {
        buyFarmSelect.value = farms[0].id;
      }
    };

    const syncBuyDialogFarm = (farmId) => {
      const state = getState();
      const farm = state.farms.find((f) => f.id === farmId);
      if (!farm) return;

      if (buySub) buySub.textContent = `${farm.name} • ${farm.location}`;
      const farmIdInput = buyForm?.querySelector('input[name="farmId"]');
      if (farmIdInput) farmIdInput.value = farm.id;
      if (buyFarmSelect) buyFarmSelect.value = farm.id;

      const tokensInput = buyForm?.querySelector('input[name="tokens"]');
      if (tokensInput) {
        tokensInput.disabled = farm.tokensAvailable <= 0;
        tokensInput.value = String(Math.min(10, Math.max(1, farm.tokensAvailable)));
        tokensInput.max = String(Math.max(1, farm.tokensAvailable));
      }
      if (buyConfirm instanceof HTMLButtonElement) {
        buyConfirm.disabled = farm.tokensAvailable <= 0;
      }
      if (buyHelp) {
        buyHelp.textContent =
          farm.tokensAvailable > 0
            ? `Disponível: ${formatInt(farm.tokensAvailable)} tokens.`
            : "Esta fazenda está sem tokens disponíveis no momento.";
      }
    };

    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const farmId = target.dataset.buyFarm;
      if (!farmId) return;

      const state = getState();
      const farm = state.farms.find((f) => f.id === farmId);
      if (!farm) return;

      if (buyResult) buyResult.textContent = "";
      fillBuyFarmOptions(farm.id);
      syncBuyDialogFarm(farm.id);

      buyDialog?.showModal();
    });

    buyFarmSelect?.addEventListener("change", (ev) => {
      const target = ev.currentTarget;
      if (!(target instanceof HTMLSelectElement)) return;
      syncBuyDialogFarm(target.value);
    });

    buyForm?.addEventListener("submit", (ev) => {
      ev.preventDefault();
    });

    buyDialog?.addEventListener("close", () => {
      if (buyForm) buyForm.reset();
      if (buyResult) buyResult.textContent = "";
    });

    const closeBuyDialog = () => {
      if (buyDialog?.open) buyDialog.close("cancel");
    };
    buyClose?.addEventListener("click", closeBuyDialog);
    buyCancel?.addEventListener("click", closeBuyDialog);

    buyForm?.addEventListener("click", (ev) => {
      const btn = ev.target;
      if (!(btn instanceof HTMLButtonElement)) return;
      if (btn.id !== "buy-confirm") return;

      ev.preventDefault();
      if (!buyForm) return;

      const data = new FormData(buyForm);
      const farmId = String(data.get("farmId") || "");
      const company = String(data.get("company") || "").trim();
      const tokens = Number(data.get("tokens"));

      if (!farmId || !company || !Number.isFinite(tokens) || tokens <= 0) {
        if (buyResult) buyResult.innerHTML = `<span class="bad">Preencha empresa e quantidade.</span>`;
        return;
      }

      const state = getState();
      const farms = [...state.farms];
      const idx = farms.findIndex((f) => f.id === farmId);
      if (idx === -1) return;
      const farm = farms[idx];
      const available = Number(farm.tokensAvailable || 0);

      if (tokens > available) {
        if (buyResult)
          buyResult.innerHTML = `<span class="bad">Quantidade maior que o disponível (${formatInt(available)}).</span>`;
        return;
      }

      farms[idx] = { ...farm, tokensAvailable: available - tokens };

      const order = {
        id: uid(),
        farmId,
        company,
        tokens,
        tco2: tokens,
        createdAt: new Date().toISOString(),
      };

      setState({ ...state, farms, orders: [order, ...state.orders] });
      rerenderIndex();

      const certUrl = urlWithQuery("./certificado.html", { orderId: order.id });
      location.href = certUrl;
    });

    rerenderIndex();
  };

  const initFarmPage = () => {
    const state = getState();
    const id = new URLSearchParams(location.search).get("id");

    const title = qs("#farm-title");
    const sub = qs("#farm-sub");
    const metrics = qs("#farm-metrics");
    const buyLink = qs("#farm-buy");
    const copyBtn = qs("#copy-link");
    const cadastroSection = qs("#cadastro");

    if (!id) {
      if (cadastroSection) cadastroSection.hidden = false;
      if (title) title.textContent = "Nenhuma fazenda selecionada";
      if (sub) sub.textContent = "Cadastre acima ou acesse pelo marketplace para ver os detalhes.";
      return;
    }

    const farm = state.farms.find((f) => f.id === id);
    if (!farm) {
      if (cadastroSection) cadastroSection.hidden = true;
      if (title) title.textContent = "Fazenda não encontrada";
      if (sub) sub.textContent = "Esta fazenda pode ter sido removida deste navegador.";
      return;
    }

    if (cadastroSection) cadastroSection.hidden = true;
    if (title) title.textContent = farm.name;
    if (sub) sub.textContent = `${farm.location} • cadastrado em ${formatDateTime(farm.createdAt)}`;

    if (metrics) {
      metrics.innerHTML = "";
      const items = [
        ["Área", `${formatInt(farm.areaHa)} ha`],
        ["Idade do plantio", `${farm.ageYears} anos`],
        ["Taxa (protótipo)", `${farm.captureRate} tCO₂/ha/ano`],
        ["Estimativa", `${formatInt(farm.estimatedTco2PerYear)} tCO₂/ano`],
        ["Tokens disponíveis", `${formatInt(farm.tokensAvailable)} tokens`],
      ];
      for (const [k, v] of items) {
        const li = document.createElement("div");
        li.className = "list-item";
        li.innerHTML = `<div class="top"><div class="title">${k}</div><div class="pill">${v}</div></div>`;
        metrics.appendChild(li);
      }
    }

    if (buyLink) buyLink.href = "./index.html#marketplace";

    const farmUrl = urlWithQuery("./fazenda.html", { id: farm.id });
    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(new URL(farmUrl, location.href).toString());
        copyBtn.textContent = "Link copiado";
        setTimeout(() => (copyBtn.textContent = "Copiar link"), 1200);
      } catch {
        alert("Não foi possível copiar automaticamente. Copie manualmente pela barra de endereço.");
      }
    });

    setQr(qs("#qr"), qs("#qr-fallback"), new URL(farmUrl, location.href).toString());

    const photosWrap = qs("#photos");
    const noPhotos = qs("#no-photos");
    const photos = Array.isArray(farm.photos) ? farm.photos.filter(Boolean) : [];
    if (photosWrap) photosWrap.innerHTML = "";
    if (photos.length === 0) {
      if (noPhotos) noPhotos.hidden = false;
      return;
    }
    if (noPhotos) noPhotos.hidden = true;

    for (const src of photos) {
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "10px";
      card.innerHTML = `<img alt="Foto da fazenda" src="${src}" style="width:100%;height:260px;object-fit:cover;border-radius:14px;border:1px solid var(--border)" />`;
      photosWrap?.appendChild(card);
    }
  };

  const initCertPage = () => {
    const state = getState();
    const orderId = new URLSearchParams(location.search).get("orderId");

    const sub = qs("#cert-sub");
    const grid = qs("#cert-grid");
    const farmLink = qs("#farm-link");

    if (!orderId) {
      if (sub) sub.textContent = "Nenhuma compra informada. Volte ao marketplace e gere um certificado.";
      return;
    }

    const order = state.orders.find((o) => o.id === orderId);
    if (!order) {
      if (sub) sub.textContent = "Compra não encontrada neste navegador.";
      return;
    }

    const farm = state.farms.find((f) => f.id === order.farmId);
    const farmUrl = urlWithQuery("./fazenda.html", { id: order.farmId });

    if (sub)
      sub.textContent = `Emitido em ${formatDateTime(order.createdAt)} • ID ${order.id.slice(0, 8).toUpperCase()}`;

    const items = [
      ["Empresa", order.company],
      ["Projeto", farm ? farm.name : "Fazenda BCZ"],
      ["Localização", farm ? farm.location : "—"],
      ["Tokens adquiridos", `${formatInt(order.tokens)} (≈ ${formatInt(order.tco2)} tCO₂)`],
    ];
    if (grid) {
      grid.innerHTML = "";
      for (const [k, v] of items) {
        const el = document.createElement("div");
        el.className = "cert-item";
        el.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
        grid.appendChild(el);
      }
    }

    if (farmLink) farmLink.href = farmUrl;

    setQr(qs("#qr-farm"), qs("#qr-farm-fallback"), new URL(farmUrl, location.href).toString());

    qs("#copy-cert")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        const btn = qs("#copy-cert");
        if (btn) {
          btn.textContent = "Link copiado";
          setTimeout(() => (btn.textContent = "Copiar link"), 1200);
        }
      } catch {
        alert("Não foi possível copiar automaticamente. Copie manualmente pela barra de endereço.");
      }
    });

    qs("#print")?.addEventListener("click", () => window.print());
  };

  const init = () => {
    initFarmForm();
    if (isIndex()) initIndex();
    if (isFarmPage()) initFarmPage();
    if (isCertPage()) initCertPage();

    const hash = location.hash || "";
    qsa(".nav a").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("href") === hash);
    });
  };

  document.addEventListener("DOMContentLoaded", init);
})();

