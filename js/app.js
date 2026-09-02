/* True North Dashboard
 * Recreates the Power BI "True North Dashboard" report as an interactive,
 * client-side HTML/JS dashboard. All values are computed from
 * data/dashboard_data.json at run time — nothing is hard-coded.
 *
 * COUNT SEMANTICS: every count in this dashboard is a raw row count,
 * matching the original Power BI report's aggregation logic exactly
 * (the source model has no DAX measures; every visual there used an
 * implicit COUNT of matching rows). This means duplicate rows for the
 * same Ticket ID are counted individually, same as in Power BI.
 */

(function () {
  "use strict";

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const PALETTE = ["#4A8DDC","#4C5D8A","#F3C911","#DC5B57","#33AE81","#95C8F0","#DD915F","#9A64A0"];
  const PHONE_COLOR = "#DD915F"; // explicit override in the original report (ThemeDataColor #6)

  let DATA = null;          // raw payload from dashboard_data.json
  let ROWS = null;          // { client:Int32Array, dateOffset, category, contactType, solution, mailbox, quarter, year, month }
  let DICTS = null;
  let DATE_BASE = null;
  let MIN_DATE = null, MAX_DATE = null;

  // ---- filter state -------------------------------------------------
  const state = {
    clients: null,        // null = all; otherwise Set of client dict-indices
    dateFrom: null,       // Date
    dateTo: null,         // Date
    datePreset: "all",
    categories: new Set(),
    contactTypes: new Set(),
    mailboxes: new Set(),
    quarters: new Set(),
    solutions: new Set(),
  };

  let barDrillYear = null; // null = showing years; otherwise a specific year number

  // ---- boot -----------------------------------------------------------
  // Deferred to the end of the file (called after every const/function
  // declaration below has run) so that functions invoked here — which
  // reference consts like DIM_CONFIG declared further down — don't hit
  // a temporal-dead-zone ReferenceError.
  function boot() {
    try {
      const payload = window.__TN_DASHBOARD_DATA__;
      if (!payload) throw new Error("dashboard_data.js did not set window.__TN_DASHBOARD_DATA__ — check that data/dashboard_data.js loaded before app.js.");
      DATA = payload;
      DICTS = payload.dicts;
      DATE_BASE = new Date(payload.meta.dateBase + "T00:00:00");
      prepareRows(payload);
      document.getElementById("lastUpdated").textContent =
        `Data as of ${payload.meta.generatedAt} · ${payload.meta.rowCount.toLocaleString()} rows`;
      initFilterUI();
      renderAll();
    } catch (err) {
      document.querySelector("main.tn-grid").innerHTML =
        `<div class="tn-empty">Could not load dashboard data: ${err.message || err}</div>`;
      console.error(err);
    }
  }

  function prepareRows(payload) {
    const n = payload.meta.rowCount;
    const client = new Int32Array(n);
    const dateOffset = new Int32Array(n);
    const category = new Int32Array(n).fill(-1);
    const contactType = new Int32Array(n).fill(-1);
    const solution = new Int32Array(n).fill(-1);
    const mailbox = new Int32Array(n).fill(-1);
    const quarter = new Int32Array(n).fill(-1);
    const year = new Int32Array(n);
    const month = new Int8Array(n);

    for (let i = 0; i < n; i++) {
      const r = payload.rows[i];
      client[i] = r[0];
      dateOffset[i] = r[1];
      category[i] = r[2] === null ? -1 : r[2];
      contactType[i] = r[3] === null ? -1 : r[3];
      solution[i] = r[4] === null ? -1 : r[4];
      mailbox[i] = r[5] === null ? -1 : r[5];
      quarter[i] = r[6] === null ? -1 : r[6];
      const d = new Date(DATE_BASE.getTime() + r[1] * 86400000);
      year[i] = d.getFullYear();
      month[i] = d.getMonth();
    }

    ROWS = { n, client, dateOffset, category, contactType, solution, mailbox, quarter, year, month };

    let minOff = Infinity, maxOff = -Infinity;
    for (let i = 0; i < n; i++) {
      if (dateOffset[i] < minOff) minOff = dateOffset[i];
      if (dateOffset[i] > maxOff) maxOff = dateOffset[i];
    }
    MIN_DATE = new Date(DATE_BASE.getTime() + minOff * 86400000);
    MAX_DATE = new Date(DATE_BASE.getTime() + maxOff * 86400000);
  }

  // ---- filtering --------------------------------------------------------

  // Returns a Uint8Array mask (1 = row passes) honoring every active filter
  // except the one named in `except` (used so a chart can show what a
  // click on it would look like against everything BUT its own dimension —
  // not required for correctness here, but keeps hooks simple).
  function computeMask() {
    const { n, client, dateOffset, category, contactType, mailbox, quarter, solution } = ROWS;
    const mask = new Uint8Array(n);

    const fromOff = state.dateFrom ? Math.floor((state.dateFrom - DATE_BASE) / 86400000) : -Infinity;
    const toOff = state.dateTo ? Math.ceil((state.dateTo - DATE_BASE) / 86400000) : Infinity;

    const clientSet = state.clients; // null = all
    const catSet = state.categories.size ? state.categories : null;
    const ctSet = state.contactTypes.size ? state.contactTypes : null;
    const mbSet = state.mailboxes.size ? state.mailboxes : null;
    const qSet = state.quarters.size ? state.quarters : null;
    const solSet = state.solutions.size ? state.solutions : null;

    for (let i = 0; i < n; i++) {
      if (clientSet && !clientSet.has(client[i])) continue;
      if (dateOffset[i] < fromOff || dateOffset[i] > toOff) continue;
      if (catSet && !catSet.has(category[i])) continue;
      if (ctSet && !ctSet.has(contactType[i])) continue;
      if (mbSet && !mbSet.has(mailbox[i])) continue;
      if (qSet && !qSet.has(quarter[i])) continue;
      if (solSet && !solSet.has(solution[i])) continue;
      mask[i] = 1;
    }
    return mask;
  }

  function maskCount(mask) {
    let c = 0;
    for (let i = 0; i < mask.length; i++) c += mask[i];
    return c;
  }

  // ---- render orchestration ----------------------------------------------

  function renderAll() {
    const mask = computeMask();
    renderKPI(mask);
    renderChips();
    renderBarChart(mask);
    renderBubbleChart(mask);
    renderTreemap(mask);
    renderMailboxTable(mask);
    renderCategoryTable(mask);
    renderSolutionTable(mask);
    notifyEmbedHeight();
  }

  // Tells a parent page (when this dashboard is embedded in an <iframe>)
  // how tall the content actually is, so the parent can size the iframe
  // to match instead of leaving dead space or clipping content. Harmless
  // no-op when there is no parent listening (e.g. opened standalone).
  function notifyEmbedHeight() {
    if (window.parent === window) return; // not embedded
    requestAnimationFrame(() => {
      const height = document.documentElement.scrollHeight;
      window.parent.postMessage({ type: "tn-dashboard-resize", height }, "*");
    });
  }

  // ---- KPI ----------------------------------------------------------

  function renderKPI(mask) {
    const count = maskCount(mask);
    document.getElementById("kpiValue").textContent = count.toLocaleString();
    document.getElementById("kpiSub").textContent = `of ${ROWS.n.toLocaleString()} total rows`;
  }

  // ---- Filter bar UI --------------------------------------------------

  function initFilterUI() {
    // Client dropdown
    const clientList = document.getElementById("clientList");
    const clients = DICTS.client;
    clientList.innerHTML = clients.map((name, idx) => `
      <label class="tn-filter__item" data-idx="${idx}">
        <input type="checkbox" value="${idx}">
        <span>${escapeHtml(name)}</span>
      </label>`).join("");
    syncClientCheckboxes();

    clientList.addEventListener("change", (e) => {
      if (e.target.tagName !== "INPUT") return;
      const idx = Number(e.target.closest(".tn-filter__item").dataset.idx);
      if (state.clients === null) {
        // switching from "all" to an explicit set: start from everything, then uncheck
        state.clients = new Set(clients.map((_, i) => i));
      }
      if (e.target.checked) state.clients.add(idx); else state.clients.delete(idx);
      if (state.clients.size === clients.length) state.clients = null;
      syncClientCheckboxes();
      updateClientLabel();
      renderAll();
    });

    document.getElementById("clientSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      clientList.querySelectorAll(".tn-filter__item").forEach((el) => {
        const name = el.textContent.trim().toLowerCase();
        el.style.display = name.includes(q) ? "" : "none";
      });
    });

    document.getElementById("clientSelectAll").addEventListener("click", () => {
      state.clients = null;
      syncClientCheckboxes();
      updateClientLabel();
      renderAll();
    });
    document.getElementById("clientClear").addEventListener("click", () => {
      state.clients = new Set();
      syncClientCheckboxes();
      updateClientLabel();
      renderAll();
    });

    setupDropdown("clientFilterToggle", "clientFilterPanel");
    setupDropdown("dateFilterToggle", "dateFilterPanel");

    // Date presets
    const fromInput = document.getElementById("dateFrom");
    const toInput = document.getElementById("dateTo");
    fromInput.min = toInput.min = isoDate(MIN_DATE);
    fromInput.max = toInput.max = isoDate(MAX_DATE);
    fromInput.value = isoDate(MIN_DATE);
    toInput.value = isoDate(MAX_DATE);
    state.dateFrom = MIN_DATE;
    state.dateTo = MAX_DATE;

    document.getElementById("datePresets").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-preset]");
      if (!btn) return;
      applyDatePreset(btn.dataset.preset);
    });

    [fromInput, toInput].forEach((el) => el.addEventListener("change", () => {
      state.datePreset = "custom";
      setActivePresetButton("custom");
      state.dateFrom = new Date(fromInput.value + "T00:00:00");
      state.dateTo = new Date(toInput.value + "T00:00:00");
      updateDateLabel();
      renderAll();
    }));

    document.getElementById("clearAll").addEventListener("click", clearAllFilters);

    // Bar drill back button
    document.getElementById("barDrillBack").addEventListener("click", () => {
      barDrillYear = null;
      renderBarChart(computeMask());
    });

    // table search boxes
    document.querySelectorAll(".tn-table-search").forEach((input) => {
      input.addEventListener("input", () => renderAll());
    });

    updateClientLabel();
    updateDateLabel();
  }

  function setupDropdown(toggleId, panelId) {
    const toggle = document.getElementById(toggleId);
    const panel = document.getElementById(panelId);
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !panel.hidden;
      document.querySelectorAll(".tn-filter__panel").forEach((p) => (p.hidden = true));
      panel.hidden = isOpen;
      toggle.setAttribute("aria-expanded", String(!isOpen));
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
  }
  document.addEventListener("click", () => {
    document.querySelectorAll(".tn-filter__panel").forEach((p) => (p.hidden = true));
  });

  function syncClientCheckboxes() {
    document.querySelectorAll("#clientList .tn-filter__item").forEach((el) => {
      const idx = Number(el.dataset.idx);
      const checked = state.clients === null || state.clients.has(idx);
      el.querySelector("input").checked = checked;
    });
  }

  function updateClientLabel() {
    const el = document.getElementById("clientFilterValue");
    if (state.clients === null) el.textContent = "All clients";
    else if (state.clients.size === 0) el.textContent = "None selected";
    else if (state.clients.size === 1) el.textContent = DICTS.client[[...state.clients][0]];
    else el.textContent = `${state.clients.size} clients`;
  }

  function applyDatePreset(preset) {
    state.datePreset = preset;
    setActivePresetButton(preset);
    const custom = document.getElementById("dateCustom");
    if (preset === "all") {
      state.dateFrom = MIN_DATE; state.dateTo = MAX_DATE;
    } else if (preset === "12m" || preset === "6m" || preset === "2m") {
      const months = { "12m": 12, "6m": 6, "2m": 2 }[preset];
      state.dateTo = MAX_DATE;
      const d = new Date(MAX_DATE);
      d.setMonth(d.getMonth() - months);
      state.dateFrom = d;
    }
    document.getElementById("dateFrom").value = isoDate(state.dateFrom);
    document.getElementById("dateTo").value = isoDate(state.dateTo);
    updateDateLabel();
    renderAll();
  }

  function setActivePresetButton(preset) {
    document.querySelectorAll("#datePresets button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.preset === preset);
    });
  }

  function updateDateLabel() {
    const el = document.getElementById("dateFilterValue");
    if (state.datePreset === "all") { el.textContent = "Full history"; return; }
    el.textContent = `${shortDate(state.dateFrom)} – ${shortDate(state.dateTo)}`;
  }

  function clearAllFilters() {
    state.clients = null;
    state.categories.clear();
    state.contactTypes.clear();
    state.mailboxes.clear();
    state.quarters.clear();
    state.solutions.clear();
    barDrillYear = null;
    applyDatePreset("all");
    syncClientCheckboxes();
    updateClientLabel();
    renderAll();
  }

  function toggleSetFilter(set, idx) {
    if (set.has(idx)) set.delete(idx); else set.add(idx);
    renderAll();
  }

  function renderChips() {
    const chips = [];
    state.categories.forEach((i) => chips.push({ label: `Category: ${labelFor("category", i)}`, clear: () => state.categories.delete(i) }));
    state.contactTypes.forEach((i) => chips.push({ label: `Contact: ${labelFor("contactType", i)}`, clear: () => state.contactTypes.delete(i) }));
    state.mailboxes.forEach((i) => chips.push({ label: `Mailbox: ${labelFor("mailbox", i)}`, clear: () => state.mailboxes.delete(i) }));
    state.quarters.forEach((i) => chips.push({ label: `Quarter: ${labelFor("quarter", i)}`, clear: () => state.quarters.delete(i) }));
    state.solutions.forEach((i) => chips.push({ label: `Solution: ${labelFor("solution", i)}`, clear: () => state.solutions.delete(i) }));

    const wrap = document.getElementById("activeChips");
    wrap.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("span");
      el.className = "tn-chip";
      el.innerHTML = `${escapeHtml(c.label)} <button type="button" aria-label="Remove filter">&times;</button>`;
      el.querySelector("button").addEventListener("click", () => { c.clear(); renderAll(); });
      wrap.appendChild(el);
    });

    const anyExtra = chips.length > 0;
    const anyClientOrDate = state.clients !== null || state.datePreset !== "all";
    document.getElementById("clearAll").hidden = !(anyExtra || anyClientOrDate);
  }

  function labelFor(dim, idx) {
    if (idx === -1) return "(Blank)";
    return DICTS[dim][idx];
  }

  // ---- Bar chart: Contact Type by Year / Month --------------------------

  function renderBarChart(mask) {
    const container = document.getElementById("barChart");
    const drillUI = document.getElementById("barDrill");
    const drillLabel = document.getElementById("barDrillLabel");
    container.innerHTML = "";

    const { n, contactType, year, month } = ROWS;
    const contactTypes = DICTS.contactType;

    // aggregate: key -> [countPerContactType...]
    const buckets = new Map(); // bucketKey(number) -> Int32Array(len contactTypes+1) (last slot = blank)
    const nCT = contactTypes.length;

    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      let key;
      if (barDrillYear === null) key = year[i];
      else { if (year[i] !== barDrillYear) continue; key = month[i]; }
      let arr = buckets.get(key);
      if (!arr) { arr = new Int32Array(nCT + 1); buckets.set(key, arr); }
      const ct = contactType[i];
      arr[ct === -1 ? nCT : ct]++;
    }

    let keys = [...buckets.keys()].sort((a, b) => a - b);

    drillUI.hidden = barDrillYear === null;
    drillLabel.textContent = barDrillYear === null ? "" : `Year ${barDrillYear}`;

    if (keys.length === 0) {
      container.innerHTML = `<div class="tn-empty">No data for the current filters.</div>`;
      renderBarLegend([]);
      return;
    }

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;
    const margin = { top: 10, right: 10, bottom: 38, left: 40 };

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const x = d3.scaleBand().domain(keys).range([margin.left, width - margin.right]).padding(0.28);
    const totals = keys.map((k) => d3.sum(buckets.get(k)));
    const y = d3.scaleLinear().domain([0, d3.max(totals) || 1]).nice().range([height - margin.bottom, margin.top]);

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat((k) => (barDrillYear === null ? String(k) : MONTH_NAMES[k])))
      .call((g) => g.selectAll("text")
        .attr("font-size", 10).attr("fill", "#5B6478")
        .attr("transform", "translate(-4,4) rotate(-40)")
        .style("text-anchor", "end"))
      .call((g) => g.select(".domain").attr("stroke", "#E3E7EF"));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5))
      .call((g) => g.selectAll("text").attr("font-size", 10).attr("fill", "#5B6478"))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll(".tick line").attr("stroke", "#EEF1F6"));

    const ctFiltered = state.contactTypes.size > 0;

    keys.forEach((k) => {
      const arr = buckets.get(k);
      let yCursor = height - margin.bottom;
      // click on empty bar column area = drill in (only from year view)
      const groupG = svg.append("g");
      if (barDrillYear === null) {
        groupG.append("rect")
          .attr("x", x(k)).attr("width", x.bandwidth())
          .attr("y", margin.top).attr("height", height - margin.top - margin.bottom)
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("click", () => { barDrillYear = k; renderBarChart(computeMask()); })
          .append("title").text(`Drill into ${k}`);
      }
      for (let ct = 0; ct < nCT + 1; ct++) {
        const v = arr[ct];
        if (!v) continue;
        const h = y(0) - y(v);
        yCursor -= h;
        const color = ct === nCT ? "#C7CDDA" : colorForContactType(ct);
        const dim = ctFiltered && !state.contactTypes.has(ct === nCT ? -1 : ct);
        svg.append("rect")
          .attr("class", "bar-rect" + (dim ? " is-dim" : ""))
          .attr("x", x(k)).attr("width", x.bandwidth())
          .attr("y", yCursor).attr("height", Math.max(h, 0))
          .attr("fill", color)
          .on("click", (event) => {
            event.stopPropagation();
            toggleSetFilter(state.contactTypes, ct === nCT ? -1 : ct);
          })
          .append("title")
          .text(`${ct === nCT ? "(Blank)" : contactTypes[ct]} · ${barDrillYear === null ? k : MONTH_NAMES[k]}: ${v.toLocaleString()}`);
      }
    });

    renderBarLegend(contactTypes);
  }

  function colorForContactType(idx) {
    const name = DICTS.contactType[idx];
    if (name === "Phone") return PHONE_COLOR;
    return PALETTE[idx % PALETTE.length];
  }

  function renderBarLegend(contactTypes) {
    const wrap = document.getElementById("barLegend");
    wrap.innerHTML = "";
    contactTypes.forEach((name, idx) => {
      const active = state.contactTypes.size === 0 || state.contactTypes.has(idx);
      const item = document.createElement("span");
      item.className = "tn-legend__item" + (active ? "" : " is-off");
      item.innerHTML = `<span class="tn-legend__swatch" style="background:${colorForContactType(idx)}"></span>${escapeHtml(name)}`;
      item.addEventListener("click", () => toggleSetFilter(state.contactTypes, idx));
      wrap.appendChild(item);
    });
  }

  // ---- Bubble chart: Categories (D3 pack) --------------------------------

  function renderBubbleChart(mask) {
    const container = document.getElementById("bubbleChart");
    container.innerHTML = "";
    const { n, category } = ROWS;
    const counts = new Map();
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const c = category[i];
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (counts.size === 0) { container.innerHTML = `<div class="tn-empty">No data for the current filters.</div>`; return; }

    let entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const TOP_N = 24;
    let top = entries.slice(0, TOP_N);
    const rest = entries.slice(TOP_N);
    const restTotal = d3.sum(rest, (d) => d[1]);

    const children = top.map(([idx, v]) => ({ idx, name: labelFor("category", idx), value: v }));
    if (restTotal > 0) children.push({ idx: null, name: `Other (${rest.length})`, value: restTotal, isOther: true });

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;

    const root = d3.hierarchy({ children }).sum((d) => d.value);
    d3.pack().size([width, height]).padding(3)(root);

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const nodes = svg.selectAll("g").data(root.leaves()).join("g")
      .attr("class", (d) => "bubble-node" + (state.categories.size && d.data.idx !== null && !state.categories.has(d.data.idx) ? " is-dim" : ""))
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", (d) => (d.data.isOther ? "default" : "pointer"))
      .on("click", (event, d) => { if (!d.data.isOther) toggleSetFilter(state.categories, d.data.idx); });

    nodes.append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d, i) => (d.data.isOther ? "#C7CDDA" : PALETTE[i % PALETTE.length]));

    nodes.append("title").text((d) => `${d.data.name}: ${d.data.value.toLocaleString()}`);

    nodes.filter((d) => d.r > 16).append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .text((d) => truncateLabel(d.data.name, d.r));

    nodes.filter((d) => d.r > 16).append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.1em")
      .attr("font-weight", 400)
      .text((d) => d.data.value.toLocaleString());
  }

  function truncateLabel(name, r) {
    const maxChars = Math.max(4, Math.floor(r / 3.6));
    return name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;
  }

  // ---- Treemap: Clients --------------------------------------------------

  function renderTreemap(mask) {
    const container = document.getElementById("treemapChart");
    container.innerHTML = "";
    const { n, client } = ROWS;
    const counts = new Map();
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const c = client[i];
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (counts.size === 0) { container.innerHTML = `<div class="tn-empty">No data for the current filters.</div>`; return; }

    const children = [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([idx, v]) => ({ idx, name: DICTS.client[idx], value: v }));

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;

    const root = d3.hierarchy({ children }).sum((d) => d.value);
    d3.treemap().size([width, height]).paddingInner(2)(root);

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const nodes = svg.selectAll("g").data(root.leaves()).join("g")
      .attr("class", (d) => "tree-node" + (state.clients && !state.clients.has(d.data.idx) ? " is-dim" : ""))
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        // Clicking a client isolates it (shows just that client everywhere).
        // Clicking the already-isolated client again clears back to "all clients".
        const isOnlyThisOne = state.clients && state.clients.size === 1 && state.clients.has(d.data.idx);
        state.clients = isOnlyThisOne ? null : new Set([d.data.idx]);
        syncClientCheckboxes();
        updateClientLabel();
        renderAll();
      });

    nodes.append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d, i) => PALETTE[i % PALETTE.length]);

    nodes.append("title").text((d) => {
      const isOnlyThisOne = state.clients && state.clients.size === 1 && state.clients.has(d.data.idx);
      const hint = isOnlyThisOne ? "Click again to show all clients" : "Click to view only this client";
      return `${d.data.name}: ${d.data.value.toLocaleString()} \u00b7 ${hint}`;
    });

    nodes.filter((d) => (d.x1 - d.x0) > 50 && (d.y1 - d.y0) > 22).append("text")
      .attr("x", 6).attr("y", 16)
      .text((d) => truncateLabelBox(d.data.name, d.x1 - d.x0));
  }

  function truncateLabelBox(name, widthPx) {
    const maxChars = Math.max(4, Math.floor(widthPx / 6.5));
    return name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name;
  }

  // ---- Mailbox x Quarter pivot table --------------------------------

  function renderMailboxTable(mask) {
    const container = document.getElementById("mailboxTable");
    const { n, mailbox, quarter } = ROWS;
    const mailboxes = DICTS.mailbox;
    const quarters = DICTS.quarter; // e.g. Q1..Q4

    const grid = new Map(); // mailboxIdx -> Map(quarterIdx -> count)
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const mb = mailbox[i];
      if (!grid.has(mb)) grid.set(mb, new Map());
      const qm = grid.get(mb);
      const q = quarter[i];
      qm.set(q, (qm.get(q) || 0) + 1);
    }

    // rows sorted descending alphabetically by mailbox name (matches the
    // original report's "Mailbox 2" descending text sort)
    const mbIdxList = [...new Set(mailboxes.map((_, i) => i))].sort((a, b) => mailboxes[b].localeCompare(mailboxes[a]));

    let html = `<table class="tn-table"><thead><tr><th>Mailbox</th>`;
    quarters.forEach((q, qi) => {
      const active = state.quarters.size === 0 || state.quarters.has(qi);
      html += `<th class="num quarter-h${active ? "" : " is-dim"}" data-q="${qi}">${escapeHtml(q)}</th>`;
    });
    html += `<th class="num">Total</th></tr></thead><tbody>`;

    const colTotals = new Array(quarters.length).fill(0);
    mbIdxList.forEach((mb) => {
      const row = grid.get(mb) || new Map();
      let rowTotal = 0;
      const selected = state.mailboxes.has(mb);
      html += `<tr class="${selected ? "is-selected" : ""}" data-mb="${mb}">`;
      html += `<td>${escapeHtml(mailboxes[mb])}</td>`;
      quarters.forEach((q, qi) => {
        const v = row.get(qi) || 0;
        rowTotal += v;
        colTotals[qi] += v;
        html += `<td class="num">${v ? v.toLocaleString() : "—"}</td>`;
      });
      html += `<td class="num">${rowTotal.toLocaleString()}</td>`;
      html += `</tr>`;
    });

    const grandTotal = d3.sum(colTotals);
    html += `<tr><td>Total</td>`;
    colTotals.forEach((v) => (html += `<td class="num">${v.toLocaleString()}</td>`));
    html += `<td class="num">${grandTotal.toLocaleString()}</td></tr>`;
    html += `</tbody></table>`;

    container.innerHTML = html;
    container.querySelectorAll("tbody tr[data-mb]").forEach((tr) => {
      tr.addEventListener("click", () => toggleSetFilter(state.mailboxes, Number(tr.dataset.mb)));
    });
    container.querySelectorAll("th.quarter-h").forEach((th) => {
      th.addEventListener("click", () => toggleSetFilter(state.quarters, Number(th.dataset.q)));
      th.style.cursor = "pointer";
    });
  }

  // ---- generic sortable / searchable count table (Category, Solution) ---

  const tableSort = { categoryTable: { col: "count", dir: -1 }, solutionTable: { col: "count", dir: -1 } };
  const DIM_CONFIG = {
    categoryTable: { dim: "category", set: () => state.categories, label: "Category" },
    solutionTable: { dim: "solution", set: () => state.solutions, label: "Solution" },
  };

  function renderCategoryTable(mask) { renderDimensionTable("categoryTable", mask); }
  function renderSolutionTable(mask) { renderDimensionTable("solutionTable", mask); }

  function renderDimensionTable(containerId, mask) {
    const { dim, set: getSet, label } = DIM_CONFIG[containerId];
    const selectedSet = getSet();
    const container = document.getElementById(containerId);
    const { n } = ROWS;
    const colArr = ROWS[dim];
    const searchInput = document.querySelector(`.tn-table-search[data-target="${containerId}"]`);
    const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";

    const counts = new Map();
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const idx = colArr[i];
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }

    let entries = [...counts.entries()].map(([idx, count]) => ({ idx, name: labelFor(dim, idx), count }));
    if (query) entries = entries.filter((e) => e.name.toLowerCase().includes(query));

    const sortCfg = tableSort[containerId];
    entries.sort((a, b) => sortCfg.col === "count" ? (a.count - b.count) * sortCfg.dir : a.name.localeCompare(b.name) * sortCfg.dir);

    const total = d3.sum(entries, (e) => e.count);

    let html = `<table class="tn-table"><thead><tr>
        <th data-col="name" class="${sortCfg.col === "name" ? "is-sorted" : ""}">${label} ${sortArrow(sortCfg, "name")}</th>
        <th data-col="count" class="num ${sortCfg.col === "count" ? "is-sorted" : ""}">Count ${sortArrow(sortCfg, "count")}</th>
      </tr></thead><tbody>`;

    entries.forEach((e) => {
      const isSel = selectedSet.has(e.idx);
      html += `<tr class="${isSel ? "is-selected" : ""}" data-idx="${e.idx}"><td>${escapeHtml(e.name)}</td><td class="num">${e.count.toLocaleString()}</td></tr>`;
    });

    html += `</tbody><tfoot><tr><td>Total</td><td class="num">${total.toLocaleString()}</td></tr></tfoot></table>`;
    container.innerHTML = html;

    container.querySelectorAll("th[data-col]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (sortCfg.col === col) sortCfg.dir *= -1; else { sortCfg.col = col; sortCfg.dir = col === "count" ? -1 : 1; }
        renderAll();
      });
    });

    container.querySelectorAll("tbody tr[data-idx]").forEach((tr) => {
      tr.addEventListener("click", () => toggleSetFilter(selectedSet, Number(tr.dataset.idx)));
    });
  }

  function sortArrow(cfg, col) {
    if (cfg.col !== col) return "";
    return `<span class="arrow">${cfg.dir === 1 ? "▲" : "▼"}</span>`;
  }

  // ---- utils --------------------------------------------------------

  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function shortDate(d) { return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.addEventListener("resize", debounce(() => renderAll(), 200));
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  boot();

})();
