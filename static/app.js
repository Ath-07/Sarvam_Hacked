const $ = (selector) => document.querySelector(selector);
let catalog = [];
let currentOrder = null;
let recorder = null;
let recordingChunks = [];

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

function showError(message) {
  $("#error").textContent = message;
  $("#error").classList.remove("hidden");
}

function clearError() {
  $("#error").textContent = "";
  $("#error").classList.add("hidden");
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

async function loadCatalog() {
  catalog = await request("/api/catalog");
  $("#catalog").innerHTML = catalog.map((product) =>
    `<span class="catalog-item">${escapeHtml(product.name)} <small>${escapeHtml(product.brand || product.unit)}</small></span>`
  ).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function setOrder(order) {
  currentOrder = order;
  $("#empty-state").classList.add("hidden");
  $("#draft").classList.remove("hidden");
  $("#confirmed").classList.toggle("hidden", order.status !== "confirmed");
  $("#save-button").classList.toggle("hidden", order.status !== "review");
  $("#confirm-button").classList.toggle("hidden", order.status !== "review");
  $("#order-status").textContent = order.status === "confirmed" ? "CONFIRMED" : "NEEDS REVIEW";
  $("#order-status").className = `status-badge ${order.status}`;
  $("#transcript-preview").textContent = order.transcript;
  $("#detected-language").textContent = order.language_code || "";
  $("#customer-name").value = order.customer_name || "";
  $("#delivery").value = order.delivery_instructions || "";
  renderQuestions(order.clarification_questions || []);
  renderItems(order.items || []);
  clearError();
  loadHistory();
}

function renderQuestions(questions) {
  const box = $("#questions");
  if (!questions.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<strong>Needs clarification — review before confirming</strong><ul>${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`;
}

function renderItems(items) {
  $("#items").innerHTML = items.map((item, index) => {
    const options = [`<option value="">Unmatched — choose product</option>`, ...catalog.map((product) =>
      `<option value="${product.id}" ${Number(item.product_id) === product.id ? "selected" : ""}>${escapeHtml(product.name)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</option>`
    )].join("");
    return `<div class="item-row" data-index="${index}">
      <input class="product-name" aria-label="Product name" value="${escapeHtml(item.product_name || "")}" placeholder="Product name">
      <input class="quantity" aria-label="Quantity" type="number" min="0" step="any" value="${item.quantity ?? ""}" placeholder="Qty">
      <input class="unit" aria-label="Unit" value="${escapeHtml(item.unit || "")}" placeholder="Unit">
      <select class="catalog-select" aria-label="Catalog match">${options}</select>
      <input class="brand" aria-label="Brand" value="${escapeHtml(item.brand || "")}" placeholder="Brand">
      <input class="variant" aria-label="Variant" value="${escapeHtml(item.variant || "")}" placeholder="Variant">
    </div>`;
  }).join("");
  $("#items").querySelectorAll(".catalog-select").forEach((select) => {
    select.addEventListener("change", (event) => {
      const row = event.target.closest(".item-row");
      const product = catalog.find((entry) => entry.id === Number(event.target.value));
      row.querySelector(".product-name").value = product?.name || row.querySelector(".product-name").value;
      if (product) {
        row.querySelector(".unit").value = product.unit;
        row.querySelector(".brand").value = product.brand || "";
      }
    });
  });
}

function readItems() {
  return [...$("#items").querySelectorAll(".item-row")].map((row) => ({
    product_name: row.querySelector(".product-name").value.trim(),
    product_id: row.querySelector(".catalog-select").value ? Number(row.querySelector(".catalog-select").value) : null,
    quantity: row.querySelector(".quantity").value ? Number(row.querySelector(".quantity").value) : null,
    unit: row.querySelector(".unit").value.trim() || null,
    brand: row.querySelector(".brand").value.trim() || null,
    variant: row.querySelector(".variant").value.trim() || null,
  }));
}

async function createDraft(url, options, button, label) {
  clearError();
  setBusy(button, true, label);
  try {
    const order = await request(url, options);
    setOrder(order);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(button, false);
  }
}

$("#extract-button").addEventListener("click", async () => {
  const transcript = $("#transcript").value.trim();
  if (!transcript) return showError("Enter a transcript or upload an audio note.");
  await createDraft("/api/orders/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, language_code: $("#language-code").value }),
  }, $("#extract-button"), "Extracting order…");
});

$("#audio-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("audio", file);
  await createDraft("/api/orders/draft/audio", { method: "POST", body: form }, $("#record-button"), "Transcribing…");
});

$("#record-button").addEventListener("click", async () => {
  clearError();
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return showError("Audio recording is not supported in this browser. Upload an audio file instead.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recordingChunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordingChunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      $("#record-button").textContent = "●  Record voice note";
      $("#record-status").textContent = "Transcribing recording…";
      const blob = new Blob(recordingChunks, { type: recorder.mimeType || "audio/webm" });
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("audio", blob, `voice-note.${extension}`);
      await createDraft("/api/orders/draft/audio", { method: "POST", body: form }, $("#record-button"), "Transcribing…");
      $("#record-status").textContent = "or upload an audio file";
    });
    recorder.start();
    $("#record-button").textContent = "■  Stop recording";
    $("#record-status").textContent = "Recording…";
  } catch (error) {
    showError(`Could not access the microphone: ${error.message}`);
  }
});

$("#add-item").addEventListener("click", () => {
  if (currentOrder?.status !== "review") return;
  renderItems([...readItems(), { product_name: "", product_id: null, quantity: null, unit: null, brand: null, variant: null }]);
});

async function saveDraft() {
  if (!currentOrder || currentOrder.status !== "review") return;
  const order = await request(`/api/orders/${currentOrder.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: $("#customer-name").value.trim() || null,
      delivery_instructions: $("#delivery").value.trim() || null,
      items: readItems(),
    }),
  });
  setOrder(order);
}

$("#save-button").addEventListener("click", async () => {
  clearError();
  try {
    await saveDraft();
  } catch (error) {
    showError(error.message);
  }
});

$("#confirm-button").addEventListener("click", async () => {
  if (!currentOrder || !window.confirm("Confirm this order? This action records it as a confirmed order.")) return;
  clearError();
  setBusy($("#confirm-button"), true, "Saving…");
  try {
    await saveDraft();
    const order = await request(`/api/orders/${currentOrder.id}/confirm`, { method: "POST" });
    setOrder(order);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy($("#confirm-button"), false);
  }
});

$("#speak-button").addEventListener("click", async () => {
  clearError();
  setBusy($("#speak-button"), true, "Generating audio…");
  try {
    const result = await request(`/api/orders/${currentOrder.id}/confirmation-audio`);
    const binary = atob(result.audio_base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const player = $("#confirmation-player");
    player.src = URL.createObjectURL(new Blob([bytes], { type: result.content_type }));
    player.classList.remove("hidden");
    await player.play();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy($("#speak-button"), false);
  }
});

async function loadHistory() {
  try {
    const orders = await request("/api/orders");
    $("#history").innerHTML = orders.length ? orders.map((order) =>
      `<span class="history-item"><strong>#${order.id} ${escapeHtml(order.customer_name || "Customer")}</strong><span class="${order.status === "confirmed" ? "confirmed-text" : "review-text"}">${escapeHtml(order.status)}</span></span>`
    ).join("") : `<span class="muted">No orders yet</span>`;
  } catch (error) {
    showError(error.message);
  }
}

Promise.all([loadCatalog(), loadHistory()]).catch((error) => showError(error.message));
