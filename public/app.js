const page = document.body.dataset.page || "storefront";
const fallbackImage = "/assets/products/charm-chain.png";
const cartStorageKey = "rsCollectionCart";
const adminTokenKey = "rsCollectionAdminToken";

const productsGrid = document.getElementById("products-grid");
const featuredGrid = document.getElementById("featured-grid");
const inventoryList = document.getElementById("inventory-list");
const inventoryCount = document.getElementById("inventory-count");
const resultsSummary = document.getElementById("results-summary");
const filterForm = document.getElementById("filter-form");
const resetFiltersButton = document.getElementById("reset-filters");
const productForm = document.getElementById("product-form");
const formMessage = document.getElementById("form-message");
const template = document.getElementById("product-card-template");
const statValue = document.getElementById("stat-value");
const statLowstock = document.getElementById("stat-lowstock");
const statActive = document.getElementById("stat-active");
const statHidden = document.getElementById("stat-hidden");
const submitButton = document.getElementById("submit-button");
const cancelEditButton = document.getElementById("cancel-edit");
const adminTitle = document.getElementById("admin-title");
const adminSubtitle = document.getElementById("admin-subtitle");
const productDialog = document.getElementById("product-dialog");
const productDetail = document.getElementById("product-detail");
const cartDrawer = document.getElementById("cart-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const cartItems = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const cartTotal = document.getElementById("cart-total");
const cartMessage = document.getElementById("cart-message");
const adminInventorySearch = document.getElementById("admin-inventory-search");
const adminStatusFilter = document.getElementById("admin-status-filter");
const adminSort = document.getElementById("admin-sort");
const imagePreview = document.getElementById("image-preview");

let currentQueryString = "";
let editingProductId = null;
let cart = readCart();
let adminProducts = [];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(price || 0));
}

function stockLabel(product) {
  if (product.status === "draft") return { text: "Draft", tone: "draft" };
  if (product.status === "archived") return { text: "Archived", tone: "out" };
  if (product.status === "sold_out") return { text: "Sold out", tone: "out" };
  const stock = Number(product.stock || 0);
  if (stock <= 0) return { text: "Out of stock", tone: "out" };
  if (stock <= 3) return { text: `Only ${stock} left`, tone: "low" };
  return { text: `${stock} in stock`, tone: "ok" };
}

function setMessage(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
  return payload;
}

function adminHeaders() {
  const token = sessionStorage.getItem(adminTokenKey) || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function adminRequestJSON(url, options = {}) {
  return requestJSON(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...adminHeaders(),
    },
  });
}

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  renderCart();
}

function createProductCard(product) {
  const fragment = template.content.cloneNode(true);
  const image = fragment.querySelector(".product-image");
  const badge = fragment.querySelector(".badge");
  const stylePill = fragment.querySelector(".style-pill");
  const price = fragment.querySelector(".price");
  const name = fragment.querySelector(".name");
  const description = fragment.querySelector(".description");
  const stockLine = fragment.querySelector(".stock-line");
  const detailsButton = fragment.querySelector(".details-button");
  const addButton = fragment.querySelector(".add-cart-button");
  const quickOrderButton = fragment.querySelector(".quick-order-button");
  const stock = stockLabel(product);

  image.src = product.image_url || fallbackImage;
  image.alt = product.name;
  image.onerror = () => { image.src = fallbackImage; };
  badge.textContent = product.featured ? "Featured" : product.style;
  stylePill.textContent = product.style;
  price.textContent = formatPrice(product.price);
  name.textContent = product.name;
  description.textContent = product.description;
  stockLine.textContent = stock.text;
  stockLine.dataset.tone = stock.tone;
  detailsButton.addEventListener("click", () => openProductDetail(product));
  quickOrderButton?.addEventListener("click", () => openWhatsAppOrder(product));
  addButton.addEventListener("click", () => addToCart(product));
  addButton.disabled = Number(product.stock || 0) <= 0;
  addButton.textContent = Number(product.stock || 0) <= 0 ? "Unavailable" : "Add";
  if (quickOrderButton) quickOrderButton.disabled = Number(product.stock || 0) <= 0;
  return fragment;
}

function renderProducts(target, products, emptyText) {
  if (!target) return;
  target.innerHTML = "";
  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    target.appendChild(empty);
    return;
  }
  products.forEach((product) => target.appendChild(createProductCard(product)));
}

function openProductDetail(product) {
  if (!productDialog || !productDetail) return;
  const stock = stockLabel(product);
  productDetail.innerHTML = `
    <img src="${escapeHTML(product.image_url || fallbackImage)}" alt="${escapeHTML(product.name)}" onerror="this.src='${fallbackImage}'" />
    <div>
      <p class="eyebrow">${escapeHTML(product.style)}</p>
      <h2>${escapeHTML(product.name)}</h2>
      <div class="detail-price">${formatPrice(product.price)}</div>
      <p class="muted">${escapeHTML(product.description)}</p>
      <ul class="detail-specs">
        <li><span>Material</span><strong>${escapeHTML(product.material)}</strong></li>
        <li><span>Color</span><strong>${escapeHTML(product.color)}</strong></li>
        <li><span>Size</span><strong>${escapeHTML(product.chain_length_cm)} cm</strong></li>
        <li><span>Availability</span><strong>${escapeHTML(stock.text)}</strong></li>
      </ul>
      <div class="detail-actions"><button class="button primary detail-add" type="button" ${Number(product.stock || 0) <= 0 ? "disabled" : ""}>Add to order list</button><button class="button whatsapp detail-whatsapp" type="button" ${Number(product.stock || 0) <= 0 ? "disabled" : ""}>Order on WhatsApp</button></div>
      <p class="fineprint">RSCollection confirms price, delivery, and availability before final order confirmation.</p>
    </div>
  `;
  productDetail.querySelector(".detail-add").addEventListener("click", () => {
    addToCart(product);
    productDialog.close();
    openCart();
  });
  productDetail.querySelector(".detail-whatsapp")?.addEventListener("click", () => openWhatsAppOrder(product));
  productDialog.showModal();
}

function addToCart(product) {
  const existing = cart.find((item) => item.id === product.id);
  const stock = Number(product.stock || 0);
  if (stock <= 0) return;
  if (existing) existing.qty = Math.min(existing.qty + 1, stock);
  else cart.push({ id: product.id, name: product.name, price: Number(product.price), image_url: product.image_url, qty: 1, stock });
  saveCart();
  setMessage(cartMessage, `${product.name} added to cart.`, "success");
}

function renderCart() {
  if (!cartItems || !cartCount || !cartTotal) return;
  cartItems.innerHTML = "";
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + item.qty * Number(item.price || 0), 0);
  cartCount.textContent = String(count);
  cartTotal.textContent = formatPrice(total);
  if (!cart.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "Your order list is empty. Add a product from the catalog.";
    cartItems.appendChild(empty);
    return;
  }
  cart.forEach((item) => {
    const row = document.createElement("article");
    row.className = "cart-row";
    row.innerHTML = `<img src="${escapeHTML(item.image_url || fallbackImage)}" alt="${escapeHTML(item.name)}" /><div><strong>${escapeHTML(item.name)}</strong><span>${formatPrice(item.price)} × ${item.qty}</span></div><button class="button ghost small" type="button">Remove</button>`;
    row.querySelector("img").onerror = (event) => { event.currentTarget.src = fallbackImage; };
    row.querySelector("button").addEventListener("click", () => {
      cart = cart.filter((cartItem) => cartItem.id !== item.id);
      saveCart();
    });
    cartItems.appendChild(row);
  });
}

function openCart() {
  if (!cartDrawer) return;
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  drawerBackdrop?.classList.add("open");
}

function closeCart() {
  cartDrawer?.classList.remove("open");
  cartDrawer?.setAttribute("aria-hidden", "true");
  drawerBackdrop?.classList.remove("open");
}

async function copyOrderSummary() {
  if (!cart.length) return setMessage(cartMessage, "Add at least one product first.", "error");
  const lines = buildOrderLines();
  await navigator.clipboard.writeText(lines.join("\n"));
  setMessage(cartMessage, "Order summary copied. Send it to RSCollection on WhatsApp or Instagram.", "success");
}

function buildOrderLines(singleProduct = null) {
  if (singleProduct) {
    return [
      "Hi RSCollection, I want to order:",
      `- ${singleProduct.name} (${formatPrice(singleProduct.price)})`,
      `Availability: ${stockLabel(singleProduct).text}`,
      "Please confirm delivery and payment details."
    ];
  }
  return [
    "Hi RSCollection, I want to order:",
    ...cart.map((item) => `- ${item.name} x${item.qty} (${formatPrice(item.price)} each)`),
    `Total: ${cartTotal?.textContent || ""}`,
    "Please confirm availability, delivery, and payment details."
  ];
}

function openWhatsAppOrder(product = null) {
  if (!product && !cart.length) {
    openCart();
    return setMessage(cartMessage, "Add at least one product first.", "error");
  }
  const text = buildOrderLines(product).join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

function buildQueryString(formData) {
  const params = new URLSearchParams();
  const q = formData.get("q")?.toString().trim();
  const style = formData.get("style")?.toString().trim();
  const maxPrice = formData.get("maxPrice")?.toString().trim();
  const sort = formData.get("sort")?.toString().trim();
  const featured = formData.get("featured");
  if (q) params.set("q", q);
  if (style) params.set("style", style);
  if (maxPrice) params.set("maxPrice", maxPrice);
  if (sort && sort !== "newest") params.set("sort", sort);
  if (featured) params.set("featured", "true");
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function statusLabel(status = "active") {
  return ({ active: "Active", draft: "Draft", sold_out: "Sold out", archived: "Archived" })[status] || "Active";
}

function applyAdminInventoryFilters(products) {
  const term = (adminInventorySearch?.value || "").trim().toLowerCase();
  const status = adminStatusFilter?.value || "";
  const sort = adminSort?.value || "newest";

  return products
    .filter((product) => {
      const haystack = [product.name, product.slug, product.material, product.color, product.style, product.description]
        .join(" ")
        .toLowerCase();
      return (!term || haystack.includes(term)) && (!status || product.status === status);
    })
    .sort((a, b) => {
      if (sort === "stock-asc") return Number(a.stock || 0) - Number(b.stock || 0);
      if (sort === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
      if (sort === "name-asc") return String(a.name).localeCompare(String(b.name));
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

function refreshAdminInventory() {
  renderInventory(applyAdminInventoryFilters(adminProducts));
  updateAdminStats(adminProducts);
}

async function loadProducts(queryString = "") {
  currentQueryString = queryString;
  const products = await requestJSON(`/products${queryString}`);
  renderProducts(productsGrid, products, "No RSCollection products matched those filters.");
  if (resultsSummary) resultsSummary.textContent = `${products.length} product${products.length === 1 ? "" : "s"} shown`;
}

async function loadAdminProducts() {
  adminProducts = await adminRequestJSON("/products?includeAll=true");
  refreshAdminInventory();
}

async function loadFeatured() {
  const products = await requestJSON("/featured-products");
  renderProducts(featuredGrid, products, "No featured RSCollection products right now.");
}

function normalizeProductPayload(form) {
  const formData = new FormData(form);
  const slug = formData.get("slug")?.toString().trim().toLowerCase().replace(/\s+/g, "-");
  return {
    slug,
    name: formData.get("name")?.toString().trim(),
    description: formData.get("description")?.toString().trim(),
    material: formData.get("material")?.toString().trim(),
    color: formData.get("color")?.toString().trim(),
    style: formData.get("style")?.toString().trim(),
    chain_length_cm: Number(formData.get("chain_length_cm")),
    price: Number(formData.get("price")),
    stock: Number(formData.get("stock") || 0),
    featured: Boolean(formData.get("featured")),
    image_url: formData.get("image_url")?.toString().trim() || null,
    status: formData.get("status")?.toString() || "active",
  };
}

function resetAdminForm() {
  if (!productForm) return;
  editingProductId = null;
  productForm.reset();
  productForm.elements.product_id.value = "";
  productForm.elements.status.value = "active";
  submitButton.textContent = "Create product";
  cancelEditButton.classList.add("hidden");
  adminTitle.textContent = "Create product";
  adminSubtitle.textContent = "Manage RSCollection inventory from this private workspace. Hosting and DevOps stay separate.";
  updateImagePreview();
}

function loadProductIntoForm(product) {
  editingProductId = product.id;
  productForm.elements.product_id.value = product.id;
  ["slug", "name", "description", "material", "color", "style", "chain_length_cm", "price", "stock", "image_url", "status"].forEach((key) => { productForm.elements[key].value = product[key] ?? (key === "status" ? "active" : ""); });
  productForm.elements.featured.checked = Boolean(product.featured);
  submitButton.textContent = "Save changes";
  cancelEditButton.classList.remove("hidden");
  adminTitle.textContent = `Editing ${product.name}`;
  adminSubtitle.textContent = "Update the selected item, then save or cancel edit mode.";
  setMessage(formMessage, `Loaded ${product.name} into the editor.`, "neutral");
  updateImagePreview();
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateImagePreview() {
  if (!imagePreview || !productForm) return;
  imagePreview.src = productForm.elements.image_url.value.trim() || fallbackImage;
  imagePreview.onerror = () => { imagePreview.src = fallbackImage; };
}

function renderInventory(products) {
  if (!inventoryList) return;
  inventoryList.innerHTML = "";
  inventoryCount.textContent = `${products.length} shown / ${adminProducts.length} total`;
  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = adminProducts.length ? "No products match those inventory filters." : "No inventory yet. Create the first product above.";
    inventoryList.appendChild(empty);
    return;
  }
  products.forEach((product) => {
    const row = document.createElement("article");
    row.className = "inventory-row";
    row.innerHTML = `<img src="${escapeHTML(product.image_url || fallbackImage)}" alt="${escapeHTML(product.name)}" /><div class="inventory-main"><strong>${escapeHTML(product.name)}</strong><span>${escapeHTML(product.slug)} · ${escapeHTML(product.style)} · ${formatPrice(product.price)}</span></div><div class="inventory-meta"><div class="stock-chip ${Number(product.stock) <= 3 || product.status === "sold_out" ? "low" : ""}">${escapeHTML(product.stock)} stock</div><div class="status-chip status-${escapeHTML(product.status || "active")}">${escapeHTML(statusLabel(product.status))}</div></div><div class="inventory-actions"></div>`;
    row.querySelector("img").onerror = (event) => { event.currentTarget.src = fallbackImage; };
    const actions = row.querySelector(".inventory-actions");
    const minus = document.createElement("button");
    minus.className = "button ghost small"; minus.type = "button"; minus.textContent = "−1";
    minus.disabled = Number(product.stock || 0) <= 0;
    minus.addEventListener("click", () => handleStockAdjust(product, -1));
    const plus = document.createElement("button");
    plus.className = "button ghost small"; plus.type = "button"; plus.textContent = "+1";
    plus.addEventListener("click", () => handleStockAdjust(product, 1));
    const edit = document.createElement("button");
    edit.className = "button ghost small"; edit.type = "button"; edit.textContent = "Edit";
    edit.addEventListener("click", () => loadProductIntoForm(product));
    const del = document.createElement("button");
    del.className = "button danger small"; del.type = "button"; del.textContent = product.status === "archived" ? "Archived" : "Archive";
    del.disabled = product.status === "archived";
    del.addEventListener("click", () => handleDeleteProduct(product));
    actions.append(minus, plus, edit, del);
    inventoryList.appendChild(row);
  });
}

function updateAdminStats(products) {
  if (!statValue || !statLowstock) return;
  const value = products.reduce((sum, product) => sum + Number(product.price || 0) * Number(product.stock || 0), 0);
  const lowStock = products.filter((product) => product.status === "active" && Number(product.stock || 0) <= 3).length;
  const active = products.filter((product) => product.status === "active").length;
  const hidden = products.length - active;
  statValue.textContent = formatPrice(value);
  statLowstock.textContent = String(lowStock);
  if (statActive) statActive.textContent = String(active);
  if (statHidden) statHidden.textContent = String(hidden);
}

async function handleStockAdjust(product, delta) {
  const stock = Math.max(0, Number(product.stock || 0) + delta);
  setMessage(formMessage, `Updating ${product.name} stock...`, "neutral");
  try {
    const updated = await adminRequestJSON(`/products/${product.id}/stock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock }),
    });
    adminProducts = adminProducts.map((item) => item.id === updated.id ? updated : item);
    refreshAdminInventory();
    setMessage(formMessage, `${updated.name} stock is now ${updated.stock}.`, "success");
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  }
}

async function handleDeleteProduct(product) {
  const confirmed = window.confirm(`Archive ${product.name}? It will be hidden from the public shop, but kept in inventory.`);
  if (!confirmed) return;
  setMessage(formMessage, `Archiving ${product.name}...`, "neutral");
  try {
    const result = await adminRequestJSON(`/products/${product.id}`, { method: "DELETE" });
    if (editingProductId === product.id) resetAdminForm();
    setMessage(formMessage, result.message, "success");
    await loadAdminProducts();
  } catch (error) { setMessage(formMessage, error.message, "error"); }
}

function unlockAdmin() {
  const gate = document.getElementById("admin-gate");
  const dashboard = document.getElementById("admin-dashboard");
  gate?.classList.add("hidden");
  dashboard?.classList.remove("hidden");
  loadAdminProducts().catch((error) => setMessage(formMessage, error.message, "error"));
}

function initStorefront() {
  filterForm?.addEventListener("submit", async (event) => { event.preventDefault(); await loadProducts(buildQueryString(new FormData(filterForm))); });
  resetFiltersButton?.addEventListener("click", async () => { filterForm.reset(); await loadProducts(); });
  document.querySelectorAll(".category-rail button").forEach((button) => button.addEventListener("click", async () => { filterForm.elements.style.value = button.dataset.style; await loadProducts(buildQueryString(new FormData(filterForm))); document.getElementById("catalog").scrollIntoView({ behavior: "smooth" }); }));
  document.getElementById("open-cart")?.addEventListener("click", openCart);
  document.getElementById("close-cart")?.addEventListener("click", closeCart);
  drawerBackdrop?.addEventListener("click", closeCart);
  document.getElementById("contact-cart")?.addEventListener("click", openCart);
  document.getElementById("copy-order")?.addEventListener("click", copyOrderSummary);
  document.getElementById("whatsapp-link")?.addEventListener("click", (event) => { event.preventDefault(); openWhatsAppOrder(); });
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => productDialog?.close()));
  renderCart();
  Promise.all([loadProducts(), loadFeatured()]).catch((error) => { console.error(error); if (resultsSummary) resultsSummary.textContent = "Could not load products"; });
}

function initAdmin() {
  const tokenForm = document.getElementById("admin-token-form");
  const tokenInput = document.getElementById("admin-token");
  const tokenMessage = document.getElementById("token-message");
  if (sessionStorage.getItem(adminTokenKey)) unlockAdmin();
  tokenForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    sessionStorage.setItem(adminTokenKey, tokenInput.value.trim());
    setMessage(tokenMessage, "Token saved for this browser session.", "success");
    unlockAdmin();
  });
  document.getElementById("clear-admin-token")?.addEventListener("click", () => { sessionStorage.removeItem(adminTokenKey); tokenInput.value = ""; setMessage(tokenMessage, "Token cleared.", "neutral"); });
  [adminInventorySearch, adminStatusFilter, adminSort].forEach((control) => {
    control?.addEventListener("input", refreshAdminInventory);
    control?.addEventListener("change", refreshAdminInventory);
  });
  productForm?.elements.image_url?.addEventListener("input", updateImagePreview);
  updateImagePreview();
  cancelEditButton?.addEventListener("click", () => { resetAdminForm(); setMessage(formMessage, "Edit cancelled.", "neutral"); });
  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = normalizeProductPayload(productForm);
    const isEditing = Boolean(editingProductId);
    setMessage(formMessage, isEditing ? "Saving changes..." : "Creating product...", "neutral");
    try {
      const result = await adminRequestJSON(isEditing ? `/products/${editingProductId}` : "/products", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMessage(formMessage, isEditing ? `Updated ${result.name} successfully.` : `Created ${result.name} successfully.`, "success");
      resetAdminForm();
      await loadAdminProducts();
    } catch (error) { setMessage(formMessage, error.message, "error"); }
  });
}

if (page === "admin") initAdmin();
else initStorefront();
