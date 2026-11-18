"use strict";

const STORAGE_KEY = "trollsTravelMiniAgarioV1";
const PLAYABLE_WORLD_AREA_M2 = 5_000_000;
const COINS_PER_PERCENT = 10;
const MIN_CAPTURE_AREA_M2 = 1_000;
const ROUTE_CLOSE_DISTANCE_M = 50;
const MAX_ROUTE_SPEED_MPS = 5;
const TERRITORY_SIMPLIFY_TOLERANCE_M = 8;
const TERRITORY_SHARING_CONSENT_VERSION = 1;

const defaultState = {
  unlimitedMoney: true,
  earnedCoins: 0,
  capturedArea: 0,
  captureCount: 0,
  capturedZones: [],
  shareTerritories: false,
  shareTerritoriesConsentVersion: 0,
  owned: ["helmet-none", "armor-leather"],
  equipped: {
    helmet: "helmet-none",
    armor: "armor-leather",
    skin: "moss",
    hair: "dark"
  }
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...defaultState,
      ...saved,
      equipped: { ...defaultState.equipped, ...(saved.equipped || {}) },
      owned: Array.isArray(saved.owned)
        ? [...new Set([...defaultState.owned, ...saved.owned])]
        : [...defaultState.owned],
      capturedZones: Array.isArray(saved.capturedZones) ? saved.capturedZones : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

let game = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    showToast("Не удалось сохранить прогресс в этом браузере.", true);
  }
}

const cosmetics = [
  {
    id: "helmet-none",
    type: "helmet",
    name: "Без шлема",
    description: "Естественный вид путешественника.",
    icon: "♟"
  },
  {
    id: "helmet-iron",
    type: "helmet",
    name: "Железный шлем",
    description: "Прочный шлем для дальних прогулок.",
    icon: "⛑"
  },
  {
    id: "helmet-horns",
    type: "helmet",
    name: "Рогатый шлем",
    description: "Большие рога и суровый вид.",
    icon: "♜"
  },
  {
    id: "armor-leather",
    type: "armor",
    name: "Кожаная броня",
    description: "Лёгкая броня для исследователя.",
    icon: "🛡"
  },
  {
    id: "armor-iron",
    type: "armor",
    name: "Стальная броня",
    description: "Тяжёлый нагрудник с металлическими наплечниками.",
    icon: "⚔"
  },
  {
    id: "armor-fur",
    type: "armor",
    name: "Северный мех",
    description: "Тёплый плащ для холодных земель.",
    icon: "❄"
  }
];

const skinColors = {
  moss: 0x78977d,
  stone: 0x87908d,
  olive: 0x9a9c62
};

const hairColors = {
  dark: 0x3a2b22,
  gray: 0xaaa99e,
  red: 0x8e4d2e
};

let toastTimer = null;

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

/* Навигация */

const screens = [...document.querySelectorAll(".screen")];
const navButtons = [...document.querySelectorAll("[data-screen]")];

function showScreen(name) {
  screens.forEach(screen => {
    screen.classList.toggle("active", screen.id === `${name}Screen`);
  });

  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle("active", button.dataset.screen === name);
  });

  if (name === "map") {
    initializeMap();
    setTimeout(() => map?.invalidateSize(), 80);
  }

  if (name === "character") {
    initializeTroll();
    setTimeout(resizeTroll, 60);
  }
}

navButtons.forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    showScreen(button.dataset.screen);
  });
});

/* Магазин и внешний вид */

function catalogItem(id) {
  return cosmetics.find(item => item.id === id);
}

function populateSelect(selectId, type) {
  const select = document.getElementById(selectId);
  const current = game.equipped[type];

  select.innerHTML = cosmetics
    .filter(item => item.type === type && game.owned.includes(item.id))
    .map(item => `<option value="${item.id}">${item.name}</option>`)
    .join("");

  select.value = current;
}

function updateAppearanceControls() {
  populateSelect("helmetSelect", "helmet");
  populateSelect("armorSelect", "armor");

  document.getElementById("skinSelect").value = game.equipped.skin;
  document.getElementById("hairSelect").value = game.equipped.hair;
}

function bindAppearanceControls() {
  const controls = [
    ["helmetSelect", "helmet"],
    ["armorSelect", "armor"],
    ["skinSelect", "skin"],
    ["hairSelect", "hair"]
  ];

  controls.forEach(([selectId, appearanceType]) => {
    document.getElementById(selectId).addEventListener("change", event => {
      game.equipped[appearanceType] = event.target.value;
      saveState();
      rebuildTroll();
    });
  });
}

function renderShop() {
  const container = document.getElementById("shopItems");

  container.innerHTML = cosmetics.map(item => {
    const owned = game.owned.includes(item.id);
    return `
      <article class="shop-item">
        <div class="shop-item-preview">${item.icon}</div>
        <h3>${item.name}</h3>
        <p>${item.description}</p>
        <button
          class="${owned ? "secondary-button" : "primary-button"}"
          data-cosmetic="${item.id}">
          ${owned ? "Надеть" : "Открыть бесплатно"}
        </button>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-cosmetic]").forEach(button => {
    button.addEventListener("click", () => {
      const item = catalogItem(button.dataset.cosmetic);
      if (!item) return;

      if (!game.owned.includes(item.id)) {
        game.owned.push(item.id);
        showToast(`Открыто: ${item.name}. Стоимость — 0 монет.`);
      }

      game.equipped[item.type] = item.id;
      saveState();
      renderShop();
      updateAppearanceControls();
      rebuildTroll();
    });
  });
}

/* Трёхмерный тролль */

let renderer = null;
let scene = null;
let camera = null;
let trollGroup = null;
let trollAnimationId = 0;
let trollResizeObserver = null;
let trollDrag = null;

function makeMaterial(color, roughness = 0.82, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addSphere(parent, x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 20),
    material
  );

  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, x, y, z, radiusTop, radiusBottom, height, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 18),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBetween(parent, start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.8, radius, direction.length(), 16),
    material
  );

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addTrollHelmet(parent, metalMaterial, leatherMaterial) {
  const helmetId = game.equipped.helmet;

  if (helmetId === "helmet-none") return;

  addSphere(parent, 0, 2.76, 0, 0.52, 0.3, 0.46, metalMaterial);
  addCylinder(parent, 0, 2.61, 0, 0.51, 0.51, 0.12, metalMaterial);
  addSphere(parent, 0, 2.54, 0.36, 0.39, 0.09, 0.18, metalMaterial);

  if (helmetId === "helmet-horns") {
    const hornMaterial = makeMaterial(0xd6c59b);
    const leftStart = new THREE.Vector3(-0.42, 2.77, 0);
    const leftEnd = new THREE.Vector3(-0.76, 3.05, 0.02);
    const rightStart = new THREE.Vector3(0.42, 2.77, 0);
    const rightEnd = new THREE.Vector3(0.76, 3.05, 0.02);

    addBetween(parent, leftStart, leftEnd, 0.1, hornMaterial);
    addBetween(parent, rightStart, rightEnd, 0.1, hornMaterial);
  } else {
    addSphere(parent, 0, 2.77, 0.06, 0.18, 0.22, 0.09, leatherMaterial);
  }
}

function addHair(parent, hairMaterial) {
  addSphere(parent, 0, 2.87, -0.18, 0.52, 0.22, 0.42, hairMaterial);

  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const x = Math.cos(angle) * 0.39;
    const z = -0.18 + Math.sin(angle) * 0.34;

    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, 0.38 + (i % 3) * 0.04, 8),
      hairMaterial
    );

    tuft.position.set(x, 3.0 + (i % 2) * 0.04, z);
    tuft.rotation.z = Math.sin(angle) * 0.7;
    tuft.rotation.x = Math.cos(angle) * 0.35;
    tuft.castShadow = true;
    parent.add(tuft);
  }
}

function buildTroll() {
  if (!scene) return;

  if (trollGroup) {
    scene.remove(trollGroup);
    trollGroup.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material && !Array.isArray(object.material)) object.material.dispose();
    });
  }

  trollGroup = new THREE.Group();
  scene.add(trollGroup);

  const skinMaterial = makeMaterial(skinColors[game.equipped.skin] || skinColors.moss);
  const darkerSkin = makeMaterial(0x526b5f);
  const hairMaterial = makeMaterial(hairColors[game.equipped.hair] || hairColors.dark);
  const leatherMaterial = makeMaterial(0x503d2f);
  const leatherLight = makeMaterial(0x785b3e);
  const metalMaterial = makeMaterial(0x85958d, 0.38, 0.62);
  const bootMaterial = makeMaterial(0x302c2b);
  const eyeMaterial = makeMaterial(0xf3df9b, 0.25);
  const pupilMaterial = makeMaterial(0x261d19, 0.2);
  const toothMaterial = makeMaterial(0xe5d8b7);

  // Ноги и сапоги
  addBetween(
    trollGroup,
    new THREE.Vector3(-0.22, 1.05, 0),
    new THREE.Vector3(-0.3, 0.28, 0),
    0.17,
    skinMaterial
  );
  addBetween(
    trollGroup,
    new THREE.Vector3(0.22, 1.05, 0),
    new THREE.Vector3(0.3, 0.28, 0),
    0.17,
    skinMaterial
  );
  addSphere(trollGroup, -0.34, 0.18, 0.08, 0.28, 0.14, 0.38, bootMaterial);
  addSphere(trollGroup, 0.34, 0.18, 0.08, 0.28, 0.14, 0.38, bootMaterial);

  // Тело и броня
  addSphere(trollGroup, 0, 1.55, 0, 0.56, 0.72, 0.37, skinMaterial);

  if (game.equipped.armor === "armor-iron") {
    addSphere(trollGroup, 0, 1.62, 0.08, 0.58, 0.55, 0.42, metalMaterial);
    addSphere(trollGroup, 0, 1.67, 0.46, 0.11, 0.32, 0.05, leatherLight);
  } else if (game.equipped.armor === "armor-fur") {
    const furMaterial = makeMaterial(0xc3b492);
    addSphere(trollGroup, 0, 2.02, 0, 0.6, 0.22, 0.42, furMaterial);
    addSphere(trollGroup, 0, 1.55, 0, 0.53, 0.54, 0.39, leatherMaterial);
    addSphere(trollGroup, 0, 1.56, 0.39, 0.28, 0.35, 0.05, leatherLight);
  } else {
    addSphere(trollGroup, 0, 1.56, 0, 0.53, 0.54, 0.39, leatherMaterial);
    addSphere(trollGroup, 0, 1.57, 0.39, 0.27, 0.34, 0.05, leatherLight);
  }

  // Ремень и пряжка
  addCylinder(trollGroup, 0, 1.17, 0.02, 0.48, 0.48, 0.12, leatherLight);
  addSphere(trollGroup, 0, 1.17, 0.49, 0.11, 0.11, 0.06, makeMaterial(0xd9ae4d));

  // Руки
  addBetween(
    trollGroup,
    new THREE.Vector3(-0.48, 1.95, 0),
    new THREE.Vector3(-0.76, 1.25, 0.06),
    0.16,
    skinMaterial
  );
  addBetween(
    trollGroup,
    new THREE.Vector3(0.48, 1.95, 0),
    new THREE.Vector3(0.76, 1.25, 0.06),
    0.16,
    skinMaterial
  );
  addSphere(trollGroup, -0.78, 1.2, 0.08, 0.19, 0.18, 0.17, skinMaterial);
  addSphere(trollGroup, 0.78, 1.2, 0.08, 0.19, 0.18, 0.17, skinMaterial);

  // Наплечники
  addSphere(trollGroup, -0.54, 1.94, 0.01, 0.27, 0.23, 0.28,
    game.equipped.armor === "armor-iron" ? metalMaterial : darkerSkin);
  addSphere(trollGroup, 0.54, 1.94, 0.01, 0.27, 0.23, 0.28,
    game.equipped.armor === "armor-iron" ? metalMaterial : darkerSkin);

  // Голова и уши
  addCylinder(trollGroup, 0, 2.18, 0, 0.2, 0.21, 0.27, skinMaterial);
  addSphere(trollGroup, 0, 2.54, 0.02, 0.51, 0.58, 0.43, skinMaterial);
  addSphere(trollGroup, -0.52, 2.48, 0, 0.16, 0.26, 0.11, darkerSkin);
  addSphere(trollGroup, 0.52, 2.48, 0, 0.16, 0.26, 0.11, darkerSkin);

  // Брови и глаза
  addSphere(trollGroup, -0.2, 2.67, 0.39, 0.19, 0.065, 0.07, hairMaterial);
  addSphere(trollGroup, 0.2, 2.67, 0.39, 0.19, 0.065, 0.07, hairMaterial);
  addSphere(trollGroup, -0.2, 2.55, 0.4, 0.095, 0.11, 0.055, eyeMaterial);
  addSphere(trollGroup, 0.2, 2.55, 0.4, 0.095, 0.11, 0.055, eyeMaterial);
  addSphere(trollGroup, -0.18, 2.55, 0.45, 0.035, 0.07, 0.025, pupilMaterial);
  addSphere(trollGroup, 0.22, 2.55, 0.45, 0.035, 0.07, 0.025, pupilMaterial);

  // Большой нос, улыбка и клыки
  addSphere(trollGroup, 0, 2.38, 0.49, 0.18, 0.17, 0.16, darkerSkin);
  addSphere(trollGroup, 0, 2.19, 0.405, 0.27, 0.09, 0.06, leatherMaterial);
  addSphere(trollGroup, -0.16, 2.19, 0.44, 0.04, 0.07, 0.035, toothMaterial);
  addSphere(trollGroup, 0.16, 2.19, 0.44, 0.04, 0.07, 0.035, toothMaterial);

  addHair(trollGroup, hairMaterial);
  addTrollHelmet(trollGroup, metalMaterial, leatherMaterial);

  trollGroup.position.y = 0;
}

function initializeTroll() {
  if (renderer || !window.THREE) return;

  const host = document.getElementById("trollCanvas");
  if (!host) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.8, 6.6);
  camera.lookAt(0, 1.65, 0);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));

  const keyLight = new THREE.DirectionalLight(0xfff0d7, 2.2);
  keyLight.position.set(-3, 5, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x49d7b2, 1.5);
  rimLight.position.set(4, 3, -3);
  scene.add(rimLight);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1c3440,
      roughness: 0.74,
      metalness: 0.18
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.015;
  ground.receiveShadow = true;
  scene.add(ground);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.77, 0.85, 0.15, 48),
    makeMaterial(0x253647, 0.45, 0.4)
  );
  pedestal.position.y = 0.08;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  buildTroll();
  attachTrollDrag(host);
  resizeTroll();

  trollResizeObserver = new ResizeObserver(resizeTroll);
  trollResizeObserver.observe(host);

  const animate = () => {
    trollAnimationId = requestAnimationFrame(animate);
    if (trollGroup && !trollDrag) trollGroup.rotation.y += 0.0025;
    renderer.render(scene, camera);
  };
  animate();
}

function resizeTroll() {
  if (!renderer || !camera) return;
  const host = document.getElementById("trollCanvas");
  if (!host || host.clientWidth < 1 || host.clientHeight < 1) return;

  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
}

function rebuildTroll() {
  if (!scene) return;
  buildTroll();
}

function attachTrollDrag(host) {
  host.addEventListener("pointerdown", event => {
    trollDrag = { x: event.clientX, rotation: trollGroup?.rotation.y || 0 };
    host.setPointerCapture(event.pointerId);
  });

  host.addEventListener("pointermove", event => {
    if (!trollDrag || !trollGroup) return;
    const delta = event.clientX - trollDrag.x;
    trollGroup.rotation.y = trollDrag.rotation + delta * 0.012;
  });

  const release = () => { trollDrag = null; };
  host.addEventListener("pointerup", release);
  host.addEventListener("pointercancel", release);
}

/* Карта и GPS */

let map = null;
let userMarker = null;
let routeLine = null;
let watchId = null;
let tracking = false;
let routePoints = [];
let routeFixes = [];
let routeDistance = 0;
let lastRoutePointAt = 0;
let lastRouteAccuracy = 0;
let capturedTerritoriesLayer = null;
let landmarkMarkers = [];
let onlineTerritoriesLayer = null;
let onlineClient = null;
let onlineUserId = null;
let onlineRefreshTimer = null;
let onlineMoveTimer = null;

function setOnlineStatus(message, isError = false) {
  const status = document.getElementById("onlineStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function onlineIsConfigured() {
  const config = window.TROLLS_TRAVEL_ONLINE_CONFIG || {};
  return Boolean(config.projectUrl && config.publishableKey);
}

function confirmTerritorySharing() {
  return window.confirm(
    "Публикация отправит точные границы каждого нового захвата и ваш тег игрока в общий мир, где их смогут видеть все. Эти границы могут раскрыть ваши маршруты; отключение остановит только будущую публикацию и не удалит уже опубликованные территории. Продолжить?"
  );
}

async function initializeOnline() {
  const config = window.TROLLS_TRAVEL_ONLINE_CONFIG || {};
  const shareToggle = document.getElementById("shareTerritoriesToggle");
  const refreshButton = document.getElementById("refreshOnlineButton");
  const deleteButton = document.getElementById("deleteOnlineTerritoriesButton");

  if (game.shareTerritories
    && game.shareTerritoriesConsentVersion !== TERRITORY_SHARING_CONSENT_VERSION) {
    if (confirmTerritorySharing()) {
      game.shareTerritoriesConsentVersion = TERRITORY_SHARING_CONSENT_VERSION;
    } else {
      game.shareTerritories = false;
    }
    saveState();
  }

  shareToggle.checked = Boolean(game.shareTerritories);
  shareToggle.addEventListener("change", event => {
    if (event.target.checked
      && game.shareTerritoriesConsentVersion !== TERRITORY_SHARING_CONSENT_VERSION) {
      if (!confirmTerritorySharing()) {
        event.target.checked = false;
        return;
      }
      game.shareTerritoriesConsentVersion = TERRITORY_SHARING_CONSENT_VERSION;
    }

    game.shareTerritories = event.target.checked;
    saveState();
    if (game.shareTerritories) {
      setOnlineStatus("Публикация включена. Новые захваты будут видны всем игрокам.");
    } else {
      setOnlineStatus("Публикация выключена. Твои новые захваты останутся на этом устройстве.");
    }
  });
  refreshButton.addEventListener("click", () => refreshOnlineTerritories(true));
  deleteButton.addEventListener("click", deleteOwnTerritories);

  if (!onlineIsConfigured()) {
    setOnlineStatus("Добавь URL и Publishable key Supabase в online-config.js.");
    return;
  }

  if (!window.supabase?.createClient) {
    setOnlineStatus("Не загрузилась библиотека Supabase. Проверь подключение к интернету.", true);
    return;
  }

  try {
    onlineClient = window.supabase.createClient(config.projectUrl, config.publishableKey);
    const { data, error } = await onlineClient.auth.getSession();
    if (error) throw error;

    let session = data.session;
    if (!session) {
      const result = await onlineClient.auth.signInAnonymously();
      if (result.error) throw result.error;
      session = result.data.session;
    }

    onlineUserId = session?.user?.id || null;
    if (!onlineUserId) throw new Error("Не удалось создать игровую сессию.");

    redrawCapturedTerritories(false);
    setOnlineStatus("Подключено. Чужие территории отображаются на карте.");
    await refreshOnlineTerritories();

    clearInterval(onlineRefreshTimer);
    onlineRefreshTimer = setInterval(() => {
      if (document.getElementById("mapScreen")?.classList.contains("active")) {
        refreshOnlineTerritories();
      }
    }, 45_000);
  } catch (error) {
    console.error("Online mode initialization failed:", error);
    setOnlineStatus("Не удалось подключиться. Проверь настройки Supabase.", true);
  }
}

async function refreshOnlineTerritories(showFeedback = false) {
  if (!onlineClient || !map || !onlineTerritoriesLayer) {
    if (showFeedback) setOnlineStatus("Сначала подключи Supabase в online-config.js.", true);
    return;
  }

  const bounds = map.getBounds();
  const { data, error } = await onlineClient
    .from("territories")
    .select("id,user_id,player_tag,area_m2,points,geometry_json,created_at,max_lat,min_lat,max_lon,min_lon")
    .gte("max_lat", bounds.getSouth())
    .lte("min_lat", bounds.getNorth())
    .gte("max_lon", bounds.getWest())
    .lte("min_lon", bounds.getEast())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Online territories could not be loaded:", error);
    setOnlineStatus("Не удалось загрузить территории. Проверь таблицу и доступ Supabase.", true);
    return;
  }

  onlineTerritoriesLayer.clearLayers();
  const territoriesByPlayer = new Map();

  (data || []).forEach(zone => {
    if (zone.user_id === onlineUserId) return;
    if (typeof zone.user_id !== "string" || !territoryCoordinatePolygons(zone)) return;
    if (!territoriesByPlayer.has(zone.user_id)) territoriesByPlayer.set(zone.user_id, []);
    territoriesByPlayer.get(zone.user_id).push(zone);
  });

  let mergeFailures = 0;
  territoriesByPlayer.forEach((zones, userId) => {
    try {
      const coordinates = zones.flatMap(territoryCoordinatePolygons);
      const allPoints = coordinates.flat(2);
      const originLat = allPoints.reduce((sum, point) => sum + point[1], 0) / allPoints.length;
      const originLon = allPoints[0][0];
      const radius = 6378137;
      const latitudeScale = Math.cos(originLat * Math.PI / 180);
      const toMeters = ([longitude, latitude]) => [
        radius * (longitude - originLon) * Math.PI / 180 * latitudeScale,
        radius * (latitude - originLat) * Math.PI / 180
      ];
      const toCoordinates = ([x, y]) => [
        originLon + x / (radius * latitudeScale) * 180 / Math.PI,
        originLat + y / radius * 180 / Math.PI
      ];
      const clipping = window.polygonClipping;
      if (!clipping) throw new Error("Не загрузилась библиотека объединения территорий.");

      const mergedGeometry = clipping.union(
        ...coordinates.map(polygon => polygon.map(ring => ring.map(toMeters)))
      );
      const geoJson = {
        type: "MultiPolygon",
        coordinates: mergedGeometry.map(polygon =>
          polygon.map(ring => ring.map(toCoordinates)))
      };
      if (!isValidTerritoryGeometry(geoJson)) {
        throw new Error("Объединённая геометрия чужой территории некорректна.");
      }

      const layer = L.geoJSON(geoJson, {
        style: territoryStyleForPlayer(userId)
      });
      const area = formatArea(clippedGeometryArea(mergedGeometry));
      const player = escapeHtml(zones[0].player_tag || "Путник");
      layer.bindPopup(`<b>${player}</b><br>${area}<br><small>Объединённая территория</small>`);
      onlineTerritoriesLayer.addLayer(layer);
    } catch (mergeError) {
      console.error("Online territory outlines could not be merged:", mergeError);
      mergeFailures += 1;

      zones.forEach(zone => {
        const style = territoryStyleForPlayer(userId);
        const layer = zone.geometry_json
          ? L.geoJSON(zone.geometry_json, { style })
          : L.polygon(zone.points, style);
        layer.bindPopup(`<b>${escapeHtml(zone.player_tag || "Путник")}</b><br>${formatArea(Number(zone.area_m2) || 0)}`);
        onlineTerritoriesLayer.addLayer(layer);
      });
    }
  });

  if (mergeFailures > 0) {
    setOnlineStatus(`Не удалось объединить территории ${mergeFailures} игроков. Отдельные зоны показаны по отдельности.`, true);
  } else {
    setOnlineStatus(
      territoriesByPlayer.size
        ? `На этой области карты чужих игроков: ${territoriesByPlayer.size}.`
        : "В этой области карты чужих территорий пока нет."
    );
  }
  if (showFeedback) showToast("Общая карта обновлена.");
}

function territoryStyleForPlayer(userId) {
  if (typeof userId !== "string" || userId.length === 0) {
    return {
      color: "#1ba782",
      weight: 0,
      opacity: 0,
      fillColor: "#35ddb0",
      fillOpacity: 0.3
    };
  }

  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash = Math.imul(hash ^ userId.charCodeAt(index), 16777619);
  }

  const unsignedHash = hash >>> 0;
  const hue = unsignedHash % 360;
  const saturation = 68 + ((unsignedHash >>> 8) % 20);
  const lightness = 42 + ((unsignedHash >>> 16) % 12);

  return {
    color: `hsl(${hue}, ${saturation}%, ${lightness - 13}%)`,
    weight: 0,
    opacity: 0,
    fillColor: `hsl(${hue}, ${saturation}%, ${lightness + 15}%)`,
    fillOpacity: 0.3
  };
}

function isValidTerritoryPoints(points) {
  return Array.isArray(points)
    && points.length >= 3
    && points.length <= 2000
    && points.every(point => Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && Math.abs(point[0]) <= 90
      && Math.abs(point[1]) <= 180);
}

function isValidTerritoryGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return false;

  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;

  return Array.isArray(polygons)
    && polygons.length > 0
    && polygons.every(rings => Array.isArray(rings)
      && rings.length > 0
      && rings.every(ring => Array.isArray(ring)
        && ring.length >= 4
        && ring.every(point => Array.isArray(point)
          && point.length >= 2
          && Number.isFinite(point[0])
          && Number.isFinite(point[1])
          && Math.abs(point[0]) <= 180
          && Math.abs(point[1]) <= 90)));
}

function territoryCoordinatePolygons(zone) {
  if (zone.geometry_json) {
    if (!isValidTerritoryGeometry(zone.geometry_json)) return null;
    return zone.geometry_json.type === "Polygon"
      ? [zone.geometry_json.coordinates]
      : zone.geometry_json.coordinates;
  }
  if (!isValidTerritoryPoints(zone.points)) return null;

  let ring = zone.points.map(([latitude, longitude]) => [longitude, latitude]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring = [...ring, [...first]];
  }
  return [[ring]];
}

async function tryEatTerritory(points) {
  if (!onlineClient || !onlineUserId) return null;

  const latitudes = points.map(point => point[0]);
  const longitudes = points.map(point => point[1]);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data: candidates, error: queryError } = await onlineClient
      .from("territories")
      .select("id,user_id,player_tag,area_m2")
      .neq("user_id", onlineUserId)
      .gte("max_lat", minLat)
      .lte("min_lat", maxLat)
      .gte("max_lon", minLon)
      .lte("min_lon", maxLon)
      .order("area_m2", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (queryError) return { error: queryError };
    if (!candidates?.length) break;

    for (const target of candidates) {
      const { data, error } = await onlineClient.rpc("consume_territory", {
        p_target_id: target.id,
        p_attack_points: points
      });

      if (error) return { error };
      if (data?.eaten) return data;
    }

    if (candidates.length < pageSize) break;
  }

  return null;
}

async function publishTerritory(points, area) {
  if (!onlineClient || !onlineUserId) {
    setOnlineStatus("Общая карта не подключена: захват сохранён только на этом устройстве.", true);
    return;
  }

  const latitudes = points.map(point => point[0]);
  const longitudes = points.map(point => point[1]);
  const userTag = `Путник-${onlineUserId.slice(0, 5).toUpperCase()}`;
  setOnlineStatus("Публикую границы территории на общей карте…");

  const { error } = await onlineClient.from("territories").insert({
    user_id: onlineUserId,
    player_tag: userTag,
    area_m2: Math.round(area),
    points,
    min_lat: Math.min(...latitudes),
    max_lat: Math.max(...latitudes),
    min_lon: Math.min(...longitudes),
    max_lon: Math.max(...longitudes)
  });

  if (error) {
    console.error("Online territory could not be published:", error);
    setOnlineStatus("Захват сохранён локально, но не опубликован. Проверь доступ Supabase.", true);
    return;
  }

  setOnlineStatus("Территория опубликована и видна другим игрокам.");
  await refreshOnlineTerritories();
}

async function deleteOwnTerritories() {
  if (!onlineClient || !onlineUserId) {
    setOnlineStatus("Сначала подключись к общей карте, чтобы удалить опубликованные зоны.", true);
    return;
  }

  const confirmed = window.confirm(
    "Удалить все территории, опубликованные этим анонимным игроком? Они исчезнут с общей карты. Локальная статистика и сохранённые территории в этом браузере останутся."
  );
  if (!confirmed) return;

  setOnlineStatus("Удаляю опубликованные территории…");
  const { data, error } = await onlineClient
    .from("territories")
    .delete()
    .eq("user_id", onlineUserId)
    .select("id");

  if (error) {
    console.error("Online territories could not be deleted:", error);
    setOnlineStatus("Не удалось удалить территории. Проверь политику удаления в Supabase.", true);
    return;
  }

  await refreshOnlineTerritories();
  const deletedCount = data?.length || 0;
  setOnlineStatus(deletedCount
    ? `Удалено опубликованных территорий: ${deletedCount}.`
    : "У этого анонимного игрока нет опубликованных территорий.");
  if (deletedCount) showToast(`Удалено с общей карты: ${deletedCount}.`);
}

function setGpsStatus(message, kind = "") {
  document.getElementById("gpsStatus").textContent = message;
  const dot = document.getElementById("gpsDot");
  dot.classList.toggle("ok", kind === "ok");
  dot.classList.toggle("error", kind === "error");
}

function initializeMap() {
  if (map || !window.L) return;

  map = L.map("mapCanvas", {
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true
  }).setView([56.9972, 40.9714], 15);
  onlineTerritoriesLayer = L.layerGroup().addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  L.control.attribution({ prefix: false, position: "bottomleft" }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  capturedTerritoriesLayer = L.geoJSON(null, {
    color: "#1ba782",
    weight: 2,
    opacity: 0.95,
    fillColor: "#35ddb0",
    fillOpacity: 0.3
  }).addTo(map);

  routeLine = L.polyline([], {
    color: "#765ff0",
    weight: 5,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    smoothFactor: 0
  }).addTo(map);

  redrawCapturedTerritories(false);

  document.getElementById("locateButton").addEventListener("click", locatePlayer);
  document.getElementById("startRouteButton").addEventListener("click", startRoute);
  document.getElementById("finishRouteButton").addEventListener("click", finishRoute);
  document.getElementById("cancelRouteButton").addEventListener("click", cancelRoute);
  document.getElementById("landmarksButton").addEventListener("click", findLandmarks);
  map.on("moveend", () => {
    clearTimeout(onlineMoveTimer);
    onlineMoveTimer = setTimeout(() => refreshOnlineTerritories(), 250);
  });

  map.whenReady(() => setTimeout(() => map.invalidateSize(), 80));
  updateMapStats();
  initializeOnline();
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;

  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function simplifyOpenPath(points, tolerance) {
  if (points.length <= 2) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const ranges = [[0, points.length - 1]];

  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop();
    const start = points[startIndex];
    const end = points[endIndex];
    const segmentX = end[0] - start[0];
    const segmentY = end[1] - start[1];
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
    let farthestDistance = tolerance;
    let farthestIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = points[index];
      const projection = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (
          (point[0] - start[0]) * segmentX
          + (point[1] - start[1]) * segmentY
        ) / segmentLengthSquared));
      const distance = Math.hypot(
        point[0] - (start[0] + projection * segmentX),
        point[1] - (start[1] + projection * segmentY)
      );

      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }

    if (farthestIndex !== -1) {
      keep[farthestIndex] = 1;
      ranges.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }

  return points.filter((point, index) => keep[index]);
}

function simplifyTerritoryOutline(points) {
  const ringPoints = points.map(point => [point[0], point[1]]);
  if (ringPoints.length > 1
    && ringPoints[0][0] === ringPoints[ringPoints.length - 1][0]
    && ringPoints[0][1] === ringPoints[ringPoints.length - 1][1]) {
    ringPoints.pop();
  }
  if (ringPoints.length < 4) return ringPoints;

  const originLat = ringPoints.reduce((sum, point) => sum + point[0], 0) / ringPoints.length;
  const originLon = ringPoints[0][1];
  const radius = 6378137;
  const latitudeScale = Math.cos(originLat * Math.PI / 180);
  const projectedPoints = ringPoints.map(point => [
    radius * (point[1] - originLon) * Math.PI / 180 * latitudeScale,
    radius * (point[0] - originLat) * Math.PI / 180
  ]);

  let pivotIndex = 1;
  let farthestDistanceSquared = 0;
  projectedPoints.forEach((point, index) => {
    const distanceSquared = (point[0] - projectedPoints[0][0]) ** 2
      + (point[1] - projectedPoints[0][1]) ** 2;
    if (distanceSquared > farthestDistanceSquared) {
      farthestDistanceSquared = distanceSquared;
      pivotIndex = index;
    }
  });

  const firstArc = simplifyOpenPath(
    projectedPoints.slice(0, pivotIndex + 1),
    TERRITORY_SIMPLIFY_TOLERANCE_M
  );
  const secondArc = simplifyOpenPath(
    [...projectedPoints.slice(pivotIndex), projectedPoints[0]],
    TERRITORY_SIMPLIFY_TOLERANCE_M
  );
  const simplified = [...firstArc, ...secondArc.slice(1, -1)];
  if (simplified.length < 3) return ringPoints;

  return simplified.map(point => [
    originLat + point[1] / radius * 180 / Math.PI,
    originLon + point[0] / (radius * latitudeScale) * 180 / Math.PI
  ]);
}

function polygonAreaMeters(points) {
  if (points.length < 3) return 0;

  const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const radius = 6378137;
  const cosLat = Math.cos(latitude * Math.PI / 180);
  const xy = points.map(point => [
    radius * point[1] * Math.PI / 180 * cosLat,
    radius * point[0] * Math.PI / 180
  ]);

  let twiceArea = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const current = xy[i];
    const next = xy[(i + 1) % xy.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(twiceArea) / 2;
}

function isValidAreaPoints(points) {
  return Array.isArray(points)
    && points.length >= 3
    && points.every(point => Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && Math.abs(point[0]) <= 90
      && Math.abs(point[1]) <= 180);
}

function territoryBounds(points) {
  return points.reduce((bounds, point) => ({
    minLat: Math.min(bounds.minLat, point[0]),
    maxLat: Math.max(bounds.maxLat, point[0]),
    minLon: Math.min(bounds.minLon, point[1]),
    maxLon: Math.max(bounds.maxLon, point[1])
  }), {
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity
  });
}

function boundsOverlap(a, b) {
  return a.minLat <= b.maxLat
    && a.maxLat >= b.minLat
    && a.minLon <= b.maxLon
    && a.maxLon >= b.minLon;
}

function toClippingPolygon(points, originLat, originLon) {
  const radius = 6378137;
  const latitudeScale = Math.cos(originLat * Math.PI / 180);
  const ring = [];

  points.forEach(point => {
    const coordinate = [
      radius * (point[1] - originLon) * Math.PI / 180 * latitudeScale,
      radius * (point[0] - originLat) * Math.PI / 180
    ];
    const previous = ring[ring.length - 1];
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      ring.push(coordinate);
    }
  });

  if (ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1]) {
    ring.pop();
  }
  if (ring.length < 3) throw new Error("У контура недостаточно уникальных точек.");

  ring.push([...ring[0]]);
  return [ring];
}

function clippedGeometryArea(geometry) {
  if (!Array.isArray(geometry)) throw new Error("Не удалось обработать геометрию территории.");

  return geometry.reduce((total, polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error("Получен некорректный многоугольник территории.");
    }

    const polygonArea = polygon.reduce((area, ring, index) => {
      let twiceArea = 0;
      for (let pointIndex = 0; pointIndex < ring.length; pointIndex += 1) {
        const current = ring[pointIndex];
        const next = ring[(pointIndex + 1) % ring.length];
        twiceArea += current[0] * next[1] - next[0] * current[1];
      }

      const ringArea = Math.abs(twiceArea) / 2;
      return area + (index === 0 ? ringArea : -ringArea);
    }, 0);

    return total + Math.max(0, polygonArea);
  }, 0);
}

function calculateNewTerritoryArea(points, existingZones) {
  const clipping = window.polygonClipping;
  if (!clipping) throw new Error("Не загрузилась библиотека расчёта площадей.");
  if (!isValidAreaPoints(points)) throw new Error("Маршрут содержит некорректные координаты.");

  const bounds = territoryBounds(points);
  const overlappingZones = existingZones
    .map(zone => {
      if (!zone || !isValidAreaPoints(zone.points)) {
        throw new Error("В сохранённых территориях обнаружены некорректные координаты.");
      }
      return { zone, bounds: territoryBounds(zone.points) };
    })
    .filter(item => boundsOverlap(bounds, item.bounds));

  const originLat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const originLon = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const newPolygon = toClippingPolygon(points, originLat, originLon);
  const normalizedNewPolygon = clipping.union(newPolygon);

  if (overlappingZones.length === 0) return clippedGeometryArea(normalizedNewPolygon);

  const previousPolygons = overlappingZones.map(({ zone }) =>
    toClippingPolygon(zone.points, originLat, originLon)
  );
  const previousUnion = clipping.union(...previousPolygons);
  const uncoveredArea = clipping.difference(normalizedNewPolygon, previousUnion);
  const area = clippedGeometryArea(uncoveredArea);

  if (!Number.isFinite(area)) throw new Error("Не удалось определить площадь нового участка.");
  return area;
}

function reconcileSavedTerritoryArea() {
  if (game.capturedZones.length === 0) return;

  try {
    let uniqueArea = 0;
    let uniqueCaptureCount = 0;
    game.capturedZones.forEach((zone, index) => {
      const newArea = calculateNewTerritoryArea(
        zone.points,
        game.capturedZones.slice(0, index)
      );
      uniqueArea += newArea;
      if (newArea > 0.5) uniqueCaptureCount += 1;
    });

    const oldArea = game.capturedArea;
    const oldCoins = game.earnedCoins;
    const oldCaptureCount = game.captureCount;
    game.capturedArea = uniqueArea;
    game.captureCount = uniqueCaptureCount;
    game.earnedCoins = Math.floor(
      Math.min(100, (uniqueArea / PLAYABLE_WORLD_AREA_M2) * 100) * COINS_PER_PERCENT
    );

    if (Math.abs(oldArea - uniqueArea) > 0.5
      || oldCoins !== game.earnedCoins
      || oldCaptureCount !== uniqueCaptureCount) {
      saveState();
      if (oldArea - uniqueArea > 0.5
        || oldCoins !== game.earnedCoins
        || oldCaptureCount !== uniqueCaptureCount) {
        showToast("Площадь и награды пересчитаны без повторного учёта захватов.");
      }
    }
  } catch (error) {
    console.error("Saved territory area could not be reconciled:", error);
    showToast("Не удалось пересчитать сохранённые территории. Проверь подключение и сохранения.", true);
  }
}

function formatArea(area) {
  if (area >= 1_000_000) return `${(area / 1_000_000).toFixed(2)} км²`;
  if (area >= 1_000) return `${(area / 1_000).toFixed(2)} тыс. м²`;
  return `${Math.round(area)} м²`;
}

function formatDistance(distance) {
  if (distance >= 1_000) return `${(distance / 1_000).toFixed(2)} км`;
  return `${Math.round(distance)} м`;
}

function locatePlayer() {
  if (!navigator.geolocation) {
    setGpsStatus("Этот браузер не поддерживает геолокацию.", "error");
    showToast("Геолокация в этом браузере недоступна.", true);
    return;
  }

  setGpsStatus("Определяю местоположение…");
  navigator.geolocation.getCurrentPosition(
    position => {
      const point = [position.coords.latitude, position.coords.longitude];
      map.setView(point, 17);

      if (!userMarker) {
        userMarker = L.circleMarker(point, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#477af1",
          fillOpacity: 1
        }).addTo(map).bindPopup("Вы здесь");
      } else {
        userMarker.setLatLng(point);
      }

      setGpsStatus("Местоположение найдено.", "ok");
    },
    error => handleGeoError(error),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

function handleGeoError(error) {
  let message = "Не удалось получить местоположение.";

  if (error?.code === 1) {
    message = "Разреши доступ к геолокации в браузере.";
  } else if (error?.code === 2) {
    message = "Сигнал GPS недоступен. Попробуй выйти на улицу.";
  } else if (error?.code === 3) {
    message = "GPS не ответил вовремя. Попробуй ещё раз.";
  }

  setGpsStatus(message, "error");
  showToast(message, true);
}

function setRouteButtons() {
  document.getElementById("startRouteButton").disabled = tracking;
  document.getElementById("finishRouteButton").disabled = !tracking;
  document.getElementById("cancelRouteButton").disabled = !tracking;
  document.getElementById("routeBadge").textContent = tracking ? "МАРШРУТ" : "ГОТОВ";
}

function startRoute() {
  if (!navigator.geolocation) {
    showToast("Браузер не поддерживает GPS.", true);
    return;
  }

  if (!window.isSecureContext) {
    showToast("Для GPS открой проект через localhost или HTTPS, а не через file://.", true);
    setGpsStatus("Для геолокации открой приложение через localhost или HTTPS.", "error");
    return;
  }

  routePoints = [];
  routeFixes = [];
  routeDistance = 0;
  lastRoutePointAt = 0;
  lastRouteAccuracy = 0;
  tracking = true;
  routeLine.setLatLngs([]);
  setRouteButtons();
  setGpsStatus("Маршрут записывается. Пройди и замкни контур.", "ok");

  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    handleGeoError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function onPositionUpdate(position) {
  const point = [position.coords.latitude, position.coords.longitude];
  const accuracy = Number(position.coords.accuracy);

  if (!userMarker) {
    userMarker = L.circleMarker(point, {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#477af1",
      fillOpacity: 1
    }).addTo(map).bindPopup("Вы здесь");
  } else {
    userMarker.setLatLng(point);
  }

  if (!Number.isFinite(accuracy) || accuracy > 40) {
    routeFixes = [];
    if (tracking) setGpsStatus("Сигнал GPS неточный. Подожди точность не хуже 40 м.");
    updateMapStats();
    return;
  }

  const receivedAt = Number(position.timestamp) || Date.now();
  routeFixes.push(point);
  if (routeFixes.length > 3) routeFixes.shift();

  if (routePoints.length === 0 && routeFixes.length < 3) {
    setGpsStatus("Уточняю GPS перед началом записи маршрута…", "ok");
    updateMapStats();
    return;
  }

  const filteredPoint = [
    median(routeFixes.map(fix => fix[0])),
    median(routeFixes.map(fix => fix[1]))
  ];

  if (routePoints.length === 0) {
    routePoints.push(filteredPoint);
    lastRoutePointAt = receivedAt;
    lastRouteAccuracy = accuracy;
    map.setView(filteredPoint, Math.max(map.getZoom(), 16));
  } else {
    const lastPoint = routePoints[routePoints.length - 1];
    const stepDistance = distanceMeters(lastPoint, filteredPoint);
    const elapsedSeconds = Math.max(1, (receivedAt - lastRoutePointAt) / 1000);
    const accuracyAllowance = Math.min(15, accuracy + lastRouteAccuracy);
    const plausibleStep = Math.max(
      15,
      elapsedSeconds * MAX_ROUTE_SPEED_MPS + accuracyAllowance
    );

    // Median-filtered fixes and a walking-speed cap prevent isolated GPS jumps
    // from stretching the visible route across the map.
    if (stepDistance > plausibleStep) {
      routeFixes = [];
      setGpsStatus("GPS дал скачок координат — пропустил точку, продолжаю запись.");
    } else if (stepDistance >= Math.max(3, Math.min(6, accuracy * 0.1))) {
      routeDistance += stepDistance;
      routePoints.push(filteredPoint);
      lastRoutePointAt = receivedAt;
      lastRouteAccuracy = accuracy;
    }
  }

  routeLine.setLatLngs(routePoints);
  updateMapStats();
}

function stopGpsWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

async function finishRoute() {
  if (!tracking) return;

  tracking = false;
  stopGpsWatch();
  setRouteButtons();

  if (routePoints.length < 5) {
    setGpsStatus("Маршрут слишком короткий — нужно пройти больше точек.", "error");
    showToast("Недостаточно точек для захвата территории.", true);
    return;
  }

  const start = routePoints[0];
  const end = routePoints[routePoints.length - 1];
  const gap = distanceMeters(start, end);

  if (gap > ROUTE_CLOSE_DISTANCE_M) {
    setGpsStatus("Маршрут не замкнут: вернись ближе к точке старта.", "error");
    showToast("Замкни маршрут рядом с начальной точкой.", true);
    return;
  }

  const pointsToCapture = [...routePoints];
  if (gap > 2) pointsToCapture.push(start);
  const polygonPoints = simplifyTerritoryOutline(pointsToCapture);

  const area = polygonAreaMeters(polygonPoints);

  if (area < MIN_CAPTURE_AREA_M2) {
    setGpsStatus("Площадь участка меньше минимальной.", "error");
    showToast(`Нужна площадь не меньше ${MIN_CAPTURE_AREA_M2} м².`, true);
    return;
  }

  let newArea;
  try {
    newArea = calculateNewTerritoryArea(polygonPoints, game.capturedZones);
  } catch (error) {
    console.error("New territory area could not be calculated:", error);
    setGpsStatus("Не удалось рассчитать новую площадь. Захват не выполнен.", "error");
    showToast("Не удалось проверить пересечения территорий. Захват не сохранён.", true);
    return;
  }

  if (newArea < MIN_CAPTURE_AREA_M2) {
    setGpsStatus("Вся территория уже захвачена или новой площади меньше минимума.", "error");
    showToast(`Нужно не меньше ${MIN_CAPTURE_AREA_M2} м² новой территории.`, true);
    return;
  }

  if (game.shareTerritories && onlineClient) {
    setOnlineStatus("Проверяю, можно ли поглотить чужую территорию…");
    const result = await tryEatTerritory(polygonPoints);

    if (result?.eaten) {
      captureTerritory(polygonPoints, area, newArea, {
        publish: false,
        eatenPlayer: result.target_player_tag,
        eatenAreaM2: Number(result.eaten_area_m2) || 0
      });
      await refreshOnlineTerritories();
      return;
    }

    if (result?.error) {
      console.error("Territory eating failed:", result.error);
      setGpsStatus(
        "Не удалось обновить чужую территорию. Проверь SQL-скрипт и подключение к общей карте.",
        "error"
      );
      showToast("Захват не сохранён: не удалось проверить чужую территорию.", true);
      return;
    }
  }

  captureTerritory(polygonPoints, area, newArea);
}

function cancelRoute() {
  tracking = false;
  stopGpsWatch();
  routePoints = [];
  routeDistance = 0;
  routeLine?.setLatLngs([]);
  setRouteButtons();
  setGpsStatus("Маршрут отменён.");
  updateMapStats();
}

function captureTerritory(points, area, newArea, options = {}) {
  const previousPercent = Math.min(
    100,
    (game.capturedArea / PLAYABLE_WORLD_AREA_M2) * 100
  );

  game.capturedArea += newArea;
  game.captureCount += 1;

  const currentPercent = Math.min(
    100,
    (game.capturedArea / PLAYABLE_WORLD_AREA_M2) * 100
  );

  // Начисление по приросту процента: 10 монет за каждый новый 1% игровой зоны.
  const oldCoinMark = Math.floor(previousPercent * COINS_PER_PERCENT);
  const newCoinMark = Math.floor(currentPercent * COINS_PER_PERCENT);
  const reward = Math.max(0, newCoinMark - oldCoinMark);

  game.earnedCoins += reward;
  game.capturedZones.push({
    area,
    points: points.map(point => [point[0], point[1]])
  });

  routeLine?.setLatLngs([]);
  redrawCapturedTerritories(true);
  saveState();
  updateMapStats();

  if (options.eatenPlayer) {
    const eatenArea = formatArea(options.eatenAreaM2 || 0);
    setGpsStatus(
      `Забрано ${eatenArea} территории игрока ${options.eatenPlayer}; его остаток сохранён.`,
      "ok"
    );
    showToast(
      `Забрано ${eatenArea} у игрока ${options.eatenPlayer}. Остальная территория сохранена.`
    );
  } else {
    setGpsStatus(
      `Новая территория: ${formatArea(newArea)}. Получено ${reward} монет.`,
      "ok"
    );
    showToast(`Захвачено новой территории: ${formatArea(newArea)} · +${reward} монет.`);
  }

  if (game.shareTerritories && options.publish !== false) publishTerritory(points, area);
}

function redrawCapturedTerritories(fitBounds) {
  if (!capturedTerritoriesLayer) return;

  const zones = game.capturedZones.filter(zone => isValidAreaPoints(zone?.points));
  if (zones.length === 0) {
    capturedTerritoriesLayer.clearLayers();
    return;
  }

  const style = territoryStyleForPlayer(onlineUserId);

  try {
    const clipping = window.polygonClipping;
    if (!clipping) throw new Error("Не загрузилась библиотека объединения территорий.");

    const allPoints = zones.flatMap(zone => zone.points);
    const originLat = allPoints.reduce((sum, point) => sum + point[0], 0) / allPoints.length;
    const originLon = allPoints[0][1];
    const radius = 6378137;
    const latitudeScale = Math.cos(originLat * Math.PI / 180);
    const union = clipping.union(
      ...zones.map(zone => toClippingPolygon(zone.points, originLat, originLon))
    );
    const geometry = {
      type: "MultiPolygon",
      coordinates: union.map(polygon => polygon.map(ring => ring.map(point => [
        originLon + point[0] / (radius * latitudeScale) * 180 / Math.PI,
        originLat + point[1] / radius * 180 / Math.PI
      ])))
    };

    if (!isValidTerritoryGeometry(geometry)) {
      throw new Error("Объединённая геометрия территории некорректна.");
    }

    capturedTerritoriesLayer.clearLayers();
    capturedTerritoriesLayer.addData(geometry);
    if (fitBounds) {
      map.fitBounds(capturedTerritoriesLayer.getBounds(), { padding: [36, 36] });
    }
  } catch (error) {
    console.error("Captured territory outlines could not be merged:", error);
    capturedTerritoriesLayer.clearLayers();
    zones.forEach(zone => {
      capturedTerritoriesLayer.addLayer(L.polygon(zone.points, style));
    });
    if (fitBounds) {
      map.fitBounds(capturedTerritoriesLayer.getBounds(), { padding: [36, 36] });
    }
    showToast("Не удалось объединить контуры захваченных территорий.", true);
  }
}

function updateMapStats() {
  const percent = Math.min(
    100,
    (game.capturedArea / PLAYABLE_WORLD_AREA_M2) * 100
  );

  document.getElementById("areaValue").textContent = formatArea(game.capturedArea);
  document.getElementById("distanceValue").textContent = formatDistance(routeDistance);
  document.getElementById("captureValue").textContent = String(game.captureCount);
  document.getElementById("percentValue").textContent = `${percent.toFixed(2)}%`;
  document.getElementById("progressText").textContent =
    `${percent.toFixed(2)}% игровой зоны`;
  document.getElementById("progressFill").style.width = `${percent}%`;
}

/* Достопримечательности из OpenStreetMap через Overpass API */

function iconForLandmark(tags) {
  if (tags.historic === "monument" || tags.historic === "memorial") return "🏛️";
  if (tags.amenity === "place_of_worship") return "⛪";
  if (tags.amenity === "university") return "🎓";
  if (tags.amenity === "cinema") return "🎬";
  if (tags.shop === "mall") return "🛍️";
  if (tags.amenity === "theatre" || tags.amenity === "arts_centre") return "🎭";
  return "📍";
}

function landmarkCategory(tags) {
  if (tags.historic === "monument" || tags.historic === "memorial") return "Памятник";
  if (tags.amenity === "place_of_worship") return "Церковь";
  if (tags.amenity === "university") return "Университет";
  if (tags.amenity === "cinema") return "Кинотеатр";
  if (tags.shop === "mall") return "Торговый центр";
  if (tags.amenity === "theatre" || tags.amenity === "arts_centre") return "Культура";
  return "Достопримечательность";
}

async function findLandmarks() {
  if (!map) initializeMap();

  const bounds = map.getBounds().pad(0.25);
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();

  const query = `
    [out:json][timeout:10];
    (
      nwr["historic"~"monument|memorial"](${south},${west},${north},${east});
      nwr["amenity"~"place_of_worship|theatre|cinema|university|arts_centre"](${south},${west},${north},${east});
      nwr["shop"="mall"](${south},${west},${north},${east});
    );
    out center tags;
  `;

  const list = document.getElementById("landmarkList");
  list.innerHTML = '<p class="muted">Ищу места в OpenStreetMap…</p>';

  try {
    const endpoints = [
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      "https://overpass-api.de/api/interpreter",
      "https://overpass.private.coffee/api/interpreter"
    ];
    let data = null;
    let lastError = null;

    for (let index = 0; index < endpoints.length; index += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 13000);
      try {
        if (index > 0) {
          list.innerHTML = '<p class="muted">Первый сервер не ответил, пробую запасной…</p>';
        }

        const response = await fetch(endpoints[index], {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Overpass API: HTTP ${response.status}`);

        const result = await response.json();
        if (result.remark) throw new Error(result.remark);
        data = result;
        break;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!data) throw lastError || new Error("Overpass API is unavailable");
    const elements = data.elements || [];

    landmarkMarkers.forEach(marker => map.removeLayer(marker));
    landmarkMarkers = [];

    if (elements.length === 0) {
      list.innerHTML = '<p class="muted">В этой области важные места не найдены.</p>';
      return;
    }

    const seen = new Set();
    const visibleElements = elements.filter(element => {
      const tags = element.tags || {};
      const name = tags.name || tags["name:ru"] || landmarkCategory(tags);
      const key = `${name}:${element.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    list.innerHTML = "";

    visibleElements.slice(0, 40).forEach(element => {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") return;

      const name = tags.name || tags["name:ru"] || landmarkCategory(tags);
      const icon = iconForLandmark(tags);
      const category = landmarkCategory(tags);

      const markerIcon = L.divIcon({
        className: "",
        html: `<span class="landmark-marker">${icon}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lon], { icon: markerIcon })
        .addTo(map)
        .bindPopup(`<b>${escapeHtml(name)}</b><br>${escapeHtml(category)}`);

      landmarkMarkers.push(marker);

      const button = document.createElement("button");
      button.className = "landmark-item";
      button.innerHTML = `
        <span class="landmark-symbol">${icon}</span>
        <span class="landmark-name">${escapeHtml(name)}<br>
          <span class="muted">${escapeHtml(category)}</span>
        </span>
      `;
      button.addEventListener("click", () => {
        map.setView([lat, lon], Math.max(map.getZoom(), 17));
        marker.openPopup();
      });
      list.appendChild(button);
    });

    if (!list.children.length) {
      list.innerHTML = '<p class="muted">В этой области важные места не найдены.</p>';
    }
  } catch (error) {
    console.warn("Landmark search failed:", error);
    list.innerHTML =
      '<p class="muted">Сервис карты не ответил. Проверь интернет, приблизь карту к району и попробуй ещё раз.</p>';
    showToast("Сервис достопримечательностей временно недоступен.", true);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

/* Начальная настройка */

reconcileSavedTerritoryArea();

document.getElementById("walletValue").textContent =
  game.unlimitedMoney ? "∞" : String(game.earnedCoins);

bindAppearanceControls();
updateAppearanceControls();
renderShop();
updateMapStats();
