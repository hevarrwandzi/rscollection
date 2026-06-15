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
const imagePreview2 = document.getElementById("image-preview-2");
const imagePreview3 = document.getElementById("image-preview-3");
const orderRequestForm = document.getElementById("order-request-form");
const ordersList = document.getElementById("orders-list");
const ordersCount = document.getElementById("orders-count");
const orderStatusFilter = document.getElementById("order-status-filter");
const orderPriorityFilter = document.getElementById("order-priority-filter");
const orderSearch = document.getElementById("order-search");
const orderSort = document.getElementById("order-sort");
const statOrdersNew = document.getElementById("stat-orders-new");
const statOrdersPending = document.getElementById("stat-orders-pending");
const statOrdersConfirmed = document.getElementById("stat-orders-confirmed");
const statOrdersPriority = document.getElementById("stat-orders-priority");
const statOrdersFulfilled = document.getElementById("stat-orders-fulfilled");
const lowStockList = document.getElementById("low-stock-list");
const productImageFile = document.getElementById("product-image-file");
const uploadProductImageButton = document.getElementById("upload-product-image");
const siteContentForm = document.getElementById("site-content-form");
const siteContentFields = document.getElementById("site-content-fields");
const siteContentMessage = document.getElementById("site-content-message");
const adminPageTabs = document.querySelectorAll("[data-admin-target]");
const adminPanelPages = document.querySelectorAll("[data-admin-page]");

let currentQueryString = "";
let editingProductId = null;
let cart = readCart();
let adminProducts = [];
let adminOrders = [];
let activeTransitionId = null;

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

function applySiteContent(content = {}) {
  document.querySelectorAll("[data-content]").forEach((element) => {
    const value = content[element.dataset.content];
    if (typeof value === "string" && value.length) element.textContent = value;
  });
  if (content["theme.default"]) document.body.dataset.theme = content["theme.default"];
}

async function loadSiteContent() {
  const content = await requestJSON("/site-content");
  applySiteContent(content);
  return content;
}

function groupedSiteContent(rows) {
  return rows.reduce((groups, row) => {
    if (!groups[row.section]) groups[row.section] = [];
    groups[row.section].push(row);
    return groups;
  }, {});
}

function renderSiteContentEditor(rows) {
  if (!siteContentFields) return;
  siteContentFields.innerHTML = "";
  const groups = groupedSiteContent(rows);
  Object.entries(groups).forEach(([section, items]) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "content-section";
    fieldset.innerHTML = `<legend>${escapeHTML(section)}</legend>`;
    items.forEach((item) => {
      const label = document.createElement("label");
      label.dataset.key = item.key;
      const control = item.input_type === "textarea"
        ? `<textarea name="${escapeHTML(item.key)}" rows="3" maxlength="1200">${escapeHTML(item.value)}</textarea>`
        : item.input_type === "theme"
          ? `<select name="${escapeHTML(item.key)}"><option value="dark" ${item.value === "dark" ? "selected" : ""}>Dark</option><option value="light" ${item.value === "light" ? "selected" : ""}>Light</option></select>`
          : `<input name="${escapeHTML(item.key)}" value="${escapeHTML(item.value)}" maxlength="1200" />`;
      label.innerHTML = `<span>${escapeHTML(item.label)}</span>${control}`;
      fieldset.appendChild(label);
    });
    siteContentFields.appendChild(fieldset);
  });
}

async function loadAdminSiteContent() {
  const rows = await adminRequestJSON("/admin/site-content");
  renderSiteContentEditor(rows);
}

async function saveSiteContent(event) {
  event.preventDefault();
  if (!siteContentForm) return;
  const formData = new FormData(siteContentForm);
  const updates = Array.from(formData.entries()).map(([key, value]) => ({ key, value: value.toString() }));
  setMessage(siteContentMessage, "Saving storefront text...", "neutral");
  try {
    const saved = await Promise.all(
      updates.map((update) =>
        adminRequestJSON(`/admin/site-content/${encodeURIComponent(update.key)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: update.value }),
        })
      )
    );
    applySiteContent(Object.fromEntries(saved.map((item) => [item.key, item.value])));
    setMessage(siteContentMessage, "Storefront text saved. Refresh the shop to see the public page update.", "success");
  } catch (error) {
    setMessage(siteContentMessage, error.message, "error");
  }
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

async function uploadSelectedProductImage() {
  if (!productImageFile?.files?.length) {
    setMessage(formMessage, "Choose a product image first.", "error");
    return;
  }

  const file = productImageFile.files[0];
  if (file.size > 3 * 1024 * 1024) {
    setMessage(formMessage, "Product image must be 3MB or smaller.", "error");
    return;
  }

  const uploadData = new FormData();
  uploadData.append("image", file);
  uploadProductImageButton.disabled = true;
  uploadProductImageButton.textContent = "Uploading...";
  setMessage(formMessage, `Uploading ${file.name}...`, "neutral");

  try {
    const result = await adminRequestJSON("/admin/product-images", {
      method: "POST",
      body: uploadData,
    });
    const imageFields = [productForm.elements.image_url, productForm.elements.image_url_2, productForm.elements.image_url_3];
    const nextEmptyImageField = imageFields.find((field) => !field.value.trim()) || imageFields[0];
    nextEmptyImageField.value = result.image_url;
    productImageFile.value = "";
    updateImagePreview();
    setMessage(formMessage, "Image uploaded and attached to the product form.", "success");
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  } finally {
    uploadProductImageButton.disabled = false;
    uploadProductImageButton.textContent = "Upload image";
  }
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

function productImages(product) {
  const images = Array.isArray(product.image_urls) ? product.image_urls : [];
  const combined = [product.image_url, ...images].map((item) => item?.toString().trim()).filter(Boolean);
  return Array.from(new Set(combined)).slice(0, 3);
}

function colorOptions(product) {
  const raw = product.color_options || product.color || "";
  return raw.toString().split(/\s*\/\s*|,/).map((item) => item.trim()).filter(Boolean);
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
  const images = productImages(product);
  const colors = colorOptions(product);

  image.src = images[0] || fallbackImage;
  image.alt = product.name;
  image.onerror = () => { image.src = fallbackImage; };
  badge.textContent = product.featured ? "Featured" : product.style;
  stylePill.textContent = product.style;
  price.textContent = formatPrice(product.price);
  name.textContent = product.name;
  description.textContent = product.description;
  if (colors.length > 1) {
    const colorRow = document.createElement("div");
    colorRow.className = "color-options";
    colorRow.innerHTML = colors.map((color) => `<span>${escapeHTML(color)}</span>`).join("");
    description.after(colorRow);
  }
  stockLine.textContent = stock.text;
  stockLine.dataset.tone = stock.tone;

  detailsButton.addEventListener("click", (event) => {
    const card = event.currentTarget.closest(".product-card");
    const img = card?.querySelector(".product-image");

    if (document.startViewTransition && img) {
      img.style.viewTransitionName = "modal-product-img";
      const transition = document.startViewTransition(() => {
        openProductDetail(product);
      });
      transition.finished.finally(() => {
        img.style.viewTransitionName = "";
        const modalImg = productDetail?.querySelector(".detail-gallery img");
        if (modalImg) modalImg.style.viewTransitionName = "";
      });
    } else {
      openProductDetail(product);
    }
  });

  quickOrderButton?.addEventListener("click", () => openWhatsAppOrder(product));

  addButton.addEventListener("click", (event) => {
    const card = event.currentTarget.closest(".product-card");
    const img = card?.querySelector(".product-image");

    const update = () => {
      addToCart(product);
    };

    if (document.startViewTransition && img) {
      img.style.viewTransitionName = "active-product-img";
      activeTransitionId = product.id;
      const transition = document.startViewTransition(() => {
        update();
      });
      transition.finished.finally(() => {
        img.style.viewTransitionName = "";
        activeTransitionId = null;
        renderCart();
      });
    } else {
      update();
    }
  });

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
  const images = productImages(product);
  const colors = colorOptions(product);
  const gallery = (images.length ? images : [fallbackImage]).map((src, index) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(product.name)} photo ${index + 1}" onerror="this.src='${fallbackImage}'" ${index === 0 ? 'style="view-transition-name: modal-product-img;"' : ''} />`).join("");
  const colorBadges = colors.length ? `<div class="color-options detail-colors">${colors.map((color) => `<span>${escapeHTML(color)}</span>`).join("")}</div>` : "";
  productDetail.innerHTML = `
    <div class="detail-gallery">${gallery}</div>
    <div>
      <p class="eyebrow">${escapeHTML(product.style)}</p>
      <h2>${escapeHTML(product.name)}</h2>
      <div class="detail-price">${formatPrice(product.price)}</div>
      <p class="muted">${escapeHTML(product.description)}</p>
      ${colorBadges}
      <ul class="detail-specs">
        <li><span>Material</span><strong>${escapeHTML(product.material)}</strong></li>
        <li><span>Colors</span><strong>${escapeHTML(product.color_options || product.color)}</strong></li>
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
    row.innerHTML = `
      <img src="${escapeHTML(item.image_url || fallbackImage)}" alt="${escapeHTML(item.name)}" ${item.id === activeTransitionId ? 'style="view-transition-name: active-product-img;"' : ''} />
      <div class="cart-item-details">
        <strong>${escapeHTML(item.name)}</strong>
        <div class="cart-item-price-qty">
          <span>${formatPrice(item.price)}</span>
          <div class="qty-controls">
            <button class="qty-btn dec-btn" type="button" aria-label="Decrease quantity">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn inc-btn" type="button" aria-label="Increase quantity" ${item.qty >= item.stock ? "disabled" : ""}>+</button>
          </div>
        </div>
      </div>
      <button class="button ghost small remove-btn" type="button">Remove</button>
    `;
    row.querySelector("img").onerror = (event) => { event.currentTarget.src = fallbackImage; };
    row.querySelector(".dec-btn").addEventListener("click", () => {
      if (item.qty <= 1) {
        cart = cart.filter((cartItem) => cartItem.id !== item.id);
      } else {
        item.qty--;
      }
      saveCart();
    });
    row.querySelector(".inc-btn").addEventListener("click", () => {
      if (item.qty < item.stock) {
        item.qty++;
        saveCart();
      }
    });
    row.querySelector(".remove-btn").addEventListener("click", () => {
      cart = cart.filter((cartItem) => cartItem.id !== item.id);
      saveCart();
    });
    cartItems.appendChild(row);
  });
}

function openCart() {
  if (!cartDrawer) return;
  const update = () => {
    cartDrawer.classList.add("open");
    cartDrawer.setAttribute("aria-hidden", "false");
    drawerBackdrop?.classList.add("open");
  };
  if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

function closeCart() {
  const update = () => {
    cartDrawer?.classList.remove("open");
    cartDrawer?.setAttribute("aria-hidden", "true");
    drawerBackdrop?.classList.remove("open");
  };
  if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

async function copyOrderSummary() {
  if (!cart.length) return setMessage(cartMessage, "Add at least one product first.", "error");
  const lines = buildOrderLines();
  await navigator.clipboard.writeText(lines.join("\n"));
  setMessage(cartMessage, "Order summary copied. Send it to RSCollection on WhatsApp or Instagram.", "success");
}

function normalizeOrderPayload(form) {
  const formData = new FormData(form);
  return {
    customer_name: formData.get("customer_name")?.toString().trim(),
    phone: formData.get("phone")?.toString().trim(),
    city: formData.get("city")?.toString().trim(),
    notes: formData.get("notes")?.toString().trim(),
    items: cart.map((item) => ({ product_id: item.id, quantity: item.qty })),
  };
}

async function submitOrderRequest(event) {
  event.preventDefault();
  if (!cart.length) {
    return setMessage(cartMessage, "Add at least one product before sending an order request.", "error");
  }

  const submitButton = document.getElementById("submit-order");
  submitButton.disabled = true;
  setMessage(cartMessage, "Sending your order request...", "neutral");

  try {
    const result = await requestJSON("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeOrderPayload(orderRequestForm)),
    });

    cart = [];
    saveCart();
    orderRequestForm.reset();
    setMessage(cartMessage, `${result.message} Request #${result.order.id}.`, "success");
  } catch (error) {
    setMessage(cartMessage, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
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
  renderLowStockAlerts(adminProducts);
}

async function loadProducts(queryString = "") {
  currentQueryString = queryString;
  const products = await requestJSON(`/products${queryString}`);
  renderProducts(productsGrid, products, "No RSCollection products matched those filters.");
  if (resultsSummary) resultsSummary.textContent = `${products.length} product${products.length === 1 ? "" : "s"} shown`;
  return products;
}

async function loadAdminProducts() {
  adminProducts = await adminRequestJSON("/products?includeAll=true");
  refreshAdminInventory();
}

async function loadAdminOrders() {
  adminOrders = await adminRequestJSON("/orders");
  refreshAdminOrders();
}

function refreshAdminOrders() {
  renderOrders(applyOrderFilters(adminOrders));
  updateOrderStats(adminOrders);
}

function applyOrderFilters(orders) {
  const status = orderStatusFilter?.value || "";
  const priority = orderPriorityFilter?.value || "";
  const term = (orderSearch?.value || "").trim().toLowerCase().replace(/^#/, "");
  const sort = orderSort?.value || "newest";

  return orders
    .filter((order) => {
      const haystack = [order.id, order.customer_name, order.phone, order.city, order.notes, order.admin_note]
        .join(" ")
        .toLowerCase();
      return (!status || order.status === status)
        && (!priority || (order.priority || "normal") === priority)
        && (!term || haystack.includes(term));
    })
    .sort((a, b) => {
      if (sort === "oldest") return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sort === "total-desc") return Number(b.total_price || 0) - Number(a.total_price || 0);
      if (sort === "priority") {
        const priorityDiff = Number((b.priority || "normal") === "priority") - Number((a.priority || "normal") === "priority");
        if (priorityDiff) return priorityDiff;
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
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
    color_options: formData.get("color_options")?.toString().trim(),
    style: formData.get("style")?.toString().trim(),
    chain_length_cm: Number(formData.get("chain_length_cm")),
    price: Number(formData.get("price")),
    stock: Number(formData.get("stock") || 0),
    featured: Boolean(formData.get("featured")),
    image_url: formData.get("image_url")?.toString().trim() || null,
    image_urls: [formData.get("image_url")?.toString().trim(), formData.get("image_url_2")?.toString().trim(), formData.get("image_url_3")?.toString().trim()].filter(Boolean),
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
  ["slug", "name", "description", "material", "color", "color_options", "style", "chain_length_cm", "price", "stock", "image_url", "status"].forEach((key) => { productForm.elements[key].value = product[key] ?? (key === "status" ? "active" : ""); });
  const images = productImages(product);
  productForm.elements.image_url.value = images[0] || product.image_url || "";
  productForm.elements.image_url_2.value = images[1] || "";
  productForm.elements.image_url_3.value = images[2] || "";
  productForm.elements.featured.checked = Boolean(product.featured);
  submitButton.textContent = "Save changes";
  cancelEditButton.classList.remove("hidden");
  adminTitle.textContent = `Editing ${product.name}`;
  adminSubtitle.textContent = "Update the selected item, then save or cancel edit mode.";
  setMessage(formMessage, `Loaded ${product.name} into the editor.`, "neutral");
  updateImagePreview();
  setAdminPage("add-product", { scroll: true });
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateImagePreview() {
  if (!imagePreview || !productForm) return;
  const previews = [imagePreview, imagePreview2, imagePreview3];
  const fields = [productForm.elements.image_url, productForm.elements.image_url_2, productForm.elements.image_url_3];
  previews.forEach((preview, index) => {
    if (!preview) return;
    preview.src = fields[index]?.value.trim() || fallbackImage;
    preview.onerror = () => { preview.src = fallbackImage; };
  });
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
    row.innerHTML = `<img src="${escapeHTML(product.image_url || fallbackImage)}" alt="${escapeHTML(product.name)}" /><div class="inventory-main"><strong>${escapeHTML(product.name)}</strong><span>${escapeHTML(product.slug)} · ${escapeHTML(product.style)} · ${escapeHTML(product.color_options || product.color)} · ${formatPrice(product.price)}</span></div><div class="inventory-meta"><div class="stock-chip ${Number(product.stock) <= 3 || product.status === "sold_out" ? "low" : ""}">${escapeHTML(product.stock)} stock</div><div class="status-chip status-${escapeHTML(product.status || "active")}">${escapeHTML(statusLabel(product.status))}</div></div><div class="inventory-actions"></div>`;
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
    del.className = "button danger small"; del.type = "button"; del.textContent = "Archive";
    del.disabled = product.status === "archived";
    del.addEventListener("click", () => handleDeleteProduct(product));
    if (product.status === "archived") {
      const restore = document.createElement("button");
      restore.className = "button ghost small"; restore.type = "button"; restore.textContent = "Restore";
      restore.addEventListener("click", () => handleRestoreProduct(product));
      actions.append(minus, plus, edit, restore);
    } else {
      actions.append(minus, plus, edit, del);
    }
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

function renderLowStockAlerts(products) {
  if (!lowStockList) return;
  lowStockList.innerHTML = "";
  const lowStockProducts = products
    .filter((product) => product.status === "active" && Number(product.stock || 0) <= 3)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

  if (!lowStockProducts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "No active products are low on stock.";
    lowStockList.appendChild(empty);
    return;
  }

  lowStockProducts.forEach((product) => {
    const row = document.createElement("article");
    row.className = `low-stock-row ${Number(product.stock || 0) === 0 ? "critical" : ""}`;
    row.innerHTML = `
      <img src="${escapeHTML(product.image_url || fallbackImage)}" alt="${escapeHTML(product.name)}" />
      <div><strong>${escapeHTML(product.name)}</strong><span>${escapeHTML(product.style || "Accessory")} · ${formatPrice(product.price)}</span></div>
      <b>${escapeHTML(product.stock)} left</b>
    `;
    row.querySelector("img").onerror = (event) => { event.currentTarget.src = fallbackImage; };
    row.addEventListener("click", () => {
      setAdminPage("inventory", { scroll: true });
      adminStatusFilter.value = "active";
      adminSort.value = "stock-asc";
      adminInventorySearch.value = product.name;
      refreshAdminInventory();
      inventoryList?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    lowStockList.appendChild(row);
  });
}

function updateOrderStats(orders) {
  const count = (status) => orders.filter((order) => order.status === status).length;
  if (statOrdersNew) statOrdersNew.textContent = String(count("new"));
  if (statOrdersPending) statOrdersPending.textContent = String(count("new") + count("contacted"));
  if (statOrdersConfirmed) statOrdersConfirmed.textContent = String(count("confirmed"));
  if (statOrdersPriority) statOrdersPriority.textContent = String(orders.filter((order) => (order.priority || "normal") === "priority").length);
  if (statOrdersFulfilled) statOrdersFulfilled.textContent = String(count("fulfilled"));
}

function orderStatusLabel(status) {
  return ({ new: "New", contacted: "Contacted", confirmed: "Confirmed", cancelled: "Cancelled", fulfilled: "Fulfilled" })[status] || status;
}

function buildCustomerContactUrl(order) {
  const phone = String(order.phone || "").replace(/\D/g, "");
  const itemLines = (order.items || []).map((item) => `- ${item.product_name} x${item.quantity}`).join("\n");
  const message = [
    `Hi ${order.customer_name}, this is RSCollection about request #${order.id}.`,
    itemLines,
    `Total: ${formatPrice(order.total_price)}`,
    "Please confirm availability and delivery details."
  ].filter(Boolean).join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderOrders(orders) {
  if (!ordersList) return;
  ordersList.innerHTML = "";
  if (ordersCount) ordersCount.textContent = `${orders.length} request${orders.length === 1 ? "" : "s"}`;
  if (!orders.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state compact";
    empty.textContent = "No customer requests match this filter yet.";
    ordersList.appendChild(empty);
    return;
  }
  orders.forEach((order) => {
    const row = document.createElement("article");
    row.className = `order-card ${(order.priority || "normal") === "priority" ? "priority" : ""}`;
    const items = (order.items || []).map((item) => `<li>${escapeHTML(item.product_name)} × ${escapeHTML(item.quantity)} <span>${formatPrice(item.line_total)}</span></li>`).join("");
    const priority = order.priority || "normal";
    row.innerHTML = `
      <div class="order-card-head">
        <div><strong>#${escapeHTML(order.id)} · ${escapeHTML(order.customer_name)}</strong><span>${escapeHTML(new Date(order.created_at).toLocaleString())}</span></div>
        <div class="order-badges"><div class="status-chip priority-${escapeHTML(priority)}">${priority === "priority" ? "Priority" : "Normal"}</div><div class="status-chip order-${escapeHTML(order.status)}">${escapeHTML(orderStatusLabel(order.status))}</div></div>
      </div>
      <div class="order-contact"><span>📞 ${escapeHTML(order.phone)}</span><span>📍 ${escapeHTML(order.city)}</span><strong>${formatPrice(order.total_price)}</strong></div>
      <ul class="order-items">${items}</ul>
      ${order.notes ? `<p class="order-notes"><strong>Customer note</strong>${escapeHTML(order.notes)}</p>` : ""}
      <div class="order-owner-tools">
        <label><span>Status</span><select data-role="order-status" aria-label="Update order status"><option value="new">New</option><option value="contacted">Contacted</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="fulfilled">Fulfilled</option></select></label>
        <label><span>Priority</span><select data-role="order-priority" aria-label="Update order priority"><option value="normal">Normal</option><option value="priority">Priority</option></select></label>
        <label class="owner-note"><span>Owner note</span><textarea data-role="admin-note" maxlength="500" placeholder="Private owner note, follow-up promise, delivery context...">${escapeHTML(order.admin_note || "")}</textarea></label>
      </div>
      <div class="order-actions"><button class="button ghost small" data-role="save-order" type="button">Save owner update</button><a class="button whatsapp small" href="${buildCustomerContactUrl(order)}" target="_blank" rel="noreferrer">WhatsApp customer</a></div>
    `;
    const statusSelect = row.querySelector('[data-role="order-status"]');
    const prioritySelect = row.querySelector('[data-role="order-priority"]');
    const adminNoteText = row.querySelector('[data-role="admin-note"]');
    const saveBtn = row.querySelector('[data-role="save-order"]');

    statusSelect.value = order.status;
    prioritySelect.value = priority;

    const checkDirty = () => {
      const isDirty = statusSelect.value !== order.status ||
                      prioritySelect.value !== priority ||
                      adminNoteText.value !== (order.admin_note || "");
      if (isDirty) {
        row.classList.add("unsaved");
        saveBtn.classList.remove("ghost");
        saveBtn.classList.add("primary");
        saveBtn.textContent = "Save Changes *";
      } else {
        row.classList.remove("unsaved");
        saveBtn.classList.add("ghost");
        saveBtn.classList.remove("primary");
        saveBtn.textContent = "Save owner update";
      }
    };

    [statusSelect, prioritySelect, adminNoteText].forEach(control => {
      control?.addEventListener("input", checkDirty);
      control?.addEventListener("change", checkDirty);
    });

    saveBtn.addEventListener("click", () => handleOrderAdminUpdate(order, row));
    ordersList.appendChild(row);
  });
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

async function handleRestoreProduct(product) {
  setMessage(formMessage, `Restoring ${product.name}...`, "neutral");
  try {
    const updated = await adminRequestJSON(`/products/${product.id}/restore`, { method: "PATCH" });
    setMessage(formMessage, `${updated.name} restored as ${statusLabel(updated.status)}.`, "success");
    await loadAdminProducts();
  } catch (error) { setMessage(formMessage, error.message, "error"); }
}

async function handleOrderAdminUpdate(order, row) {
  const statusSelect = row.querySelector('[data-role="order-status"]');
  const prioritySelect = row.querySelector('[data-role="order-priority"]');
  const adminNoteText = row.querySelector('[data-role="admin-note"]');
  const saveBtn = row.querySelector('[data-role="save-order"]');

  const payload = {
    status: statusSelect?.value,
    priority: prioritySelect?.value,
    admin_note: adminNoteText?.value,
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
  }

  setMessage(formMessage, `Saving order #${order.id} owner update...`, "neutral");
  try {
    const updated = await adminRequestJSON(`/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    adminOrders = adminOrders.map((item) => item.id === updated.id ? { ...item, ...updated } : item);
    setMessage(formMessage, `Order #${order.id} saved.`, "success");
    refreshAdminOrders();
  } catch (error) {
    setMessage(formMessage, error.message, "error");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes *";
    }
  }
}

async function loadAdminAnalytics() {
  const container = document.querySelector('[data-admin-page="analytics"]');
  if (!container) return;

  const totalSalesEl = document.getElementById("analytics-total-sales");
  const totalOrdersEl = document.getElementById("analytics-total-orders-count");
  const fulfilledSalesEl = document.getElementById("analytics-fulfilled-sales");
  const fulfilledOrdersEl = document.getElementById("analytics-fulfilled-orders-count");
  const inventoryValueEl = document.getElementById("analytics-inventory-value");
  const inventoryProductsEl = document.getElementById("analytics-inventory-products-count");
  const topProductsBody = document.getElementById("analytics-top-products");
  const topCitiesBody = document.getElementById("analytics-top-cities");

  try {
    const data = await adminRequestJSON("/admin/analytics");

    let totalSales = 0;
    let totalOrders = 0;
    let fulfilledSales = 0;
    let fulfilledOrders = 0;

    data.orders.forEach((stat) => {
      const rev = Number(stat.revenue || 0);
      const cnt = Number(stat.count || 0);
      if (stat.status !== "cancelled") {
        totalSales += rev;
        totalOrders += cnt;
      }
      if (stat.status === "fulfilled") {
        fulfilledSales += rev;
        fulfilledOrders += cnt;
      }
    });

    if (totalSalesEl) totalSalesEl.textContent = formatPrice(totalSales);
    if (totalOrdersEl) totalOrdersEl.textContent = `${totalOrders} request${totalOrders === 1 ? "" : "s"}`;
    if (fulfilledSalesEl) fulfilledSalesEl.textContent = formatPrice(fulfilledSales);
    if (fulfilledOrdersEl) fulfilledOrdersEl.textContent = `${fulfilledOrders} fulfilled`;
    if (inventoryValueEl) inventoryValueEl.textContent = formatPrice(data.stock.total_inventory_value);
    if (inventoryProductsEl) {
      inventoryProductsEl.textContent = `${data.stock.active_products} active / ${data.stock.low_stock_products} low / ${data.stock.sold_out_products} sold out`;
    }

    if (topProductsBody) {
      topProductsBody.innerHTML = "";
      if (!data.topProducts.length) {
        topProductsBody.innerHTML = `<tr><td colspan="3" class="muted text-center">No sales data yet.</td></tr>`;
      } else {
        data.topProducts.forEach((item) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${escapeHTML(item.product_name)}</strong></td>
            <td>${item.units_sold} unit${item.units_sold === 1 ? "" : "s"}</td>
            <td><strong>${formatPrice(item.revenue)}</strong></td>
          `;
          topProductsBody.appendChild(tr);
        });
      }
    }

    if (topCitiesBody) {
      topCitiesBody.innerHTML = "";
      if (!data.topCities.length) {
        topCitiesBody.innerHTML = `<tr><td colspan="3" class="muted text-center">No location data yet.</td></tr>`;
      } else {
        data.topCities.forEach((item) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><strong>${escapeHTML(item.city)}</strong></td>
            <td>${item.order_count} order${item.order_count === 1 ? "" : "s"}</td>
            <td><strong>${formatPrice(item.revenue)}</strong></td>
          `;
          topCitiesBody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    setMessage(formMessage, `Analytics error: ${error.message}`, "error");
  }
}

function setAdminPage(pageName, { scroll = false } = {}) {
  const update = () => {
    if (!adminPanelPages.length) return;
    const target = pageName || "add-product";
    adminPanelPages.forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPage === target));
    adminPageTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.adminTarget === target));
    const activeTab = Array.from(adminPageTabs).find((tab) => tab.dataset.adminTarget === target);
    if (activeTab && adminTitle) adminTitle.textContent = activeTab.querySelector("strong")?.textContent || "Admin workspace";
    if (adminSubtitle) {
      adminSubtitle.textContent = ({
        "add-product": "Create new products or edit an item loaded from inventory.",
        "edit-text": "Change public homepage text without touching code or hosting.",
        inventory: "Search products, adjust stock, and archive or restore items.",
        orders: "Review customer requests and track follow-up status.",
        analytics: "View sales metrics, top accessories, and location summaries.",
      })[target] || "Manage RSCollection from this private workspace.";
    }
    if (target === "analytics") {
      loadAdminAnalytics().catch((error) => setMessage(formMessage, error.message, "error"));
    }
    if (scroll) document.querySelector(`[data-admin-page="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

function unlockAdmin() {
  const gate = document.getElementById("admin-gate");
  const dashboard = document.getElementById("admin-dashboard");
  gate?.classList.add("hidden");
  dashboard?.classList.remove("hidden");
  setAdminPage("add-product");
  Promise.all([loadAdminProducts(), loadAdminOrders(), loadAdminSiteContent(), loadAdminAnalytics()]).catch((error) => setMessage(formMessage, error.message, "error"));
}

function syncCart(activeProducts) {
  if (!cart.length) return;

  const activeMap = new Map(activeProducts.map((p) => [p.id, p]));
  let changed = false;
  const newCart = [];
  const changes = [];

  for (const item of cart) {
    const fresh = activeMap.get(item.id);
    if (!fresh || fresh.status !== "active" || Number(fresh.stock || 0) <= 0) {
      changed = true;
      changes.push(`"${item.name}" is no longer available`);
    } else {
      const stock = Number(fresh.stock);
      let qty = item.qty;
      if (qty > stock) {
        qty = stock;
        changed = true;
        changes.push(`"${item.name}" quantity reduced to ${stock} (max available)`);
      }
      newCart.push({
        ...item,
        price: Number(fresh.price),
        stock: stock,
        qty: qty
      });
    }
  }

  if (changed) {
    cart = newCart;
    saveCart();
    setMessage(cartMessage, `Cart updated: ${changes.join("; ")}`, "neutral");
  }
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
  document.getElementById("cart-whatsapp")?.addEventListener("click", () => openWhatsAppOrder());
  orderRequestForm?.addEventListener("submit", submitOrderRequest);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => productDialog?.close()));
  renderCart();
  Promise.all([loadSiteContent(), loadProducts(), loadFeatured()])
    .then(([content, products]) => {
      if (products) syncCart(products);
    })
    .catch((error) => { console.error(error); if (resultsSummary) resultsSummary.textContent = "Could not load products"; });
}

function hasUnsavedChanges() {
  return document.querySelector(".unsaved") !== null;
}

async function initAdmin() {
  const tokenForm = document.getElementById("admin-token-form");
  const tokenInput = document.getElementById("admin-token");
  const tokenMessage = document.getElementById("token-message");

  try {
    const authStatus = await requestJSON("/api/admin/check-auth");
    if (authStatus.authenticated) {
      unlockAdmin();
    }
  } catch (err) {
    // Keep gate visible
  }

  tokenForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    setMessage(tokenMessage, "Authenticating...", "neutral");
    try {
      const result = await requestJSON("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (result.success) {
        setMessage(tokenMessage, "Authenticated successfully.", "success");
        sessionStorage.setItem(adminTokenKey, token);
        unlockAdmin();
      }
    } catch (error) {
      setMessage(tokenMessage, error.message || "Invalid token.", "error");
    }
  });

  document.getElementById("clear-admin-token")?.addEventListener("click", () => {
    sessionStorage.removeItem(adminTokenKey);
    tokenInput.value = "";
    setMessage(tokenMessage, "Token cleared.", "neutral");
  });

  document.getElementById("admin-logout")?.addEventListener("click", async () => {
    try {
      await requestJSON("/api/admin/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout failed:", err);
    }
    sessionStorage.removeItem(adminTokenKey);
    window.location.reload();
  });
  [adminInventorySearch, adminStatusFilter, adminSort].forEach((control) => {
    control?.addEventListener("input", refreshAdminInventory);
    control?.addEventListener("change", refreshAdminInventory);
  });
  [orderStatusFilter, orderPriorityFilter, orderSearch, orderSort].forEach((control) => {
    control?.addEventListener("input", refreshAdminOrders);
    control?.addEventListener("change", refreshAdminOrders);
  });
  document.getElementById("refresh-orders")?.addEventListener("click", () => loadAdminOrders().catch((error) => setMessage(formMessage, error.message, "error")));
  document.getElementById("refresh-analytics")?.addEventListener("click", () => loadAdminAnalytics().catch((error) => setMessage(formMessage, error.message, "error")));
  const nameInput = document.getElementById("product-name-input");
  const slugInput = document.getElementById("product-slug-input");
  nameInput?.addEventListener("input", () => {
    if (!editingProductId && slugInput) {
      slugInput.value = nameInput.value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
    }
  });

  document.querySelectorAll(".clear-img-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        input.value = "";
        updateImagePreview();
      }
    });
  });

  [productForm?.elements.image_url, productForm?.elements.image_url_2, productForm?.elements.image_url_3].forEach((field) => field?.addEventListener("input", updateImagePreview));
  productImageFile?.addEventListener("change", () => {
    if (productImageFile.files?.[0]) {
      setMessage(formMessage, `Ready to upload ${productImageFile.files[0].name}.`, "neutral");
    }
  });
  uploadProductImageButton?.addEventListener("click", uploadSelectedProductImage);
  siteContentForm?.addEventListener("submit", saveSiteContent);
  adminPageTabs.forEach((tab) => tab.addEventListener("click", (event) => {
    if (hasUnsavedChanges()) {
      const discard = window.confirm("You have unsaved order changes. Discard them?");
      if (!discard) return;
      document.querySelectorAll(".unsaved").forEach(el => el.classList.remove("unsaved"));
    }
    setAdminPage(tab.dataset.adminTarget, { scroll: true });
  }));
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
