"use strict";

const BASE_STORAGE_KEY = "trollsTravelMiniAgarioV1";
const LOCAL_TEST_MODE = new URLSearchParams(location.search).get("test") === "1"
  && (location.protocol === "file:"
    || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
const STORAGE_KEY = LOCAL_TEST_MODE ? `${BASE_STORAGE_KEY}:test` : BASE_STORAGE_KEY;
const PLAYABLE_WORLD_AREA_M2 = 107_455_488;
const COINS_PER_CAPTURED_AREA_M2 = 1_000;
const ECONOMY_VERSION = 1;
const MIN_CAPTURE_AREA_M2 = 1_000;
const ROUTE_CLOSE_DISTANCE_M = 50;
const MAX_ROUTE_SPEED_MPS = 5;
const TERRITORY_SIMPLIFY_TOLERANCE_M = 8;
const TERRITORY_SHARING_CONSENT_VERSION = 1;
const DEFAULT_PLAYER_NICKNAME = "Путешественник";
const DEFAULT_TERRITORY_COLOR = "#35ddb0";

function normalizeNickname(value) {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  const length = Array.from(nickname).length;
  return length >= 2 && length <= 24 ? nickname : null;
}

function isValidTerritoryColor(value) {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

const defaultState = {
  economyVersion: ECONOMY_VERSION,
  coins: 50,
  capturedArea: 0,
  captureCount: 0,
  playerNickname: DEFAULT_PLAYER_NICKNAME,
  territoryColor: DEFAULT_TERRITORY_COLOR,
  capturedZones: [],
  shareTerritories: false,
  shareTerritoriesConsentVersion: 0,
  owned: ["helmet-none", "armor-none", "weapon-none"],
  equipped: {
    helmet: "helmet-none",
    armor: "armor-none",
    weapon: "weapon-none",
    skin: "olive",
    hair: "dark"
  }
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const saved = parsed && typeof parsed === "object" ? parsed : {};
    const hasCurrentEconomy = saved.economyVersion === ECONOMY_VERSION
      && Number.isSafeInteger(saved.coins)
      && saved.coins >= 0;
    const legacyCoins = Number.isSafeInteger(saved.earnedCoins)
      ? Math.max(0, saved.earnedCoins)
      : 0;
    const legacyItemIds = {
      "helmet-horns": "helmet-viking",
      "armor-fur": "armor-scandinavian"
    };
    const equipped = { ...defaultState.equipped, ...(saved.equipped || {}) };
    equipped.helmet = legacyItemIds[equipped.helmet] || equipped.helmet;
    equipped.armor = legacyItemIds[equipped.armor] || equipped.armor;
    const owned = Array.isArray(saved.owned)
      ? saved.owned.map(id => legacyItemIds[id] || id)
      : [];
    const state = {
      ...defaultState,
      ...saved,
      economyVersion: ECONOMY_VERSION,
      coins: hasCurrentEconomy
        ? saved.coins
        : Math.max(defaultState.coins, legacyCoins),
      playerNickname: normalizeNickname(saved.playerNickname)
        || defaultState.playerNickname,
      territoryColor: isValidTerritoryColor(saved.territoryColor)
        ? saved.territoryColor.toLowerCase()
        : defaultState.territoryColor,
      equipped: { ...equipped, weapon: equipped.weapon || defaultState.equipped.weapon },
      owned: [...new Set([...defaultState.owned, ...owned])],
      capturedZones: Array.isArray(saved.capturedZones) ? saved.capturedZones : []
    };
    delete state.unlimitedMoney;
    delete state.earnedCoins;
    return state;
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
    icon: "♟",
    price: 0
  },
  {
    id: "helmet-normal",
    type: "helmet",
    name: "Обычный шлем",
    description: "Простой кожаный шлем для первых вылазок.",
    icon: "🪖",
    price: 40
  },
  {
    id: "helmet-iron",
    type: "helmet",
    name: "Рыцарский железный шлем",
    description: "Стальная полусфера с защитой носа.",
    icon: "⛑",
    price: 100
  },
  {
    id: "helmet-viking",
    type: "helmet",
    name: "Шлем викингов",
    description: "Кованый шлем с парой загнутых рогов.",
    icon: "🪓",
    price: 150
  },
  {
    id: "helmet-crown",
    type: "helmet",
    name: "Корона",
    description: "Золотая корона для повелителя округа.",
    icon: "♛",
    price: 250
  },
  {
    id: "helmet-oni",
    type: "helmet",
    name: "Маска они",
    description: "Красная демоническая маска с клыками.",
    icon: "👹",
    price: 275
  },
  {
    id: "armor-none",
    type: "armor",
    name: "Без брони",
    description: "Свободный вид для тролля-путешественника.",
    icon: "—",
    price: 0
  },
  {
    id: "armor-leather",
    type: "armor",
    name: "Кожаная броня",
    description: "Плечевая накладка и ремни из тёмной кожи.",
    icon: "🛡",
    price: 60
  },
  {
    id: "armor-iron",
    type: "armor",
    name: "Железная броня",
    description: "Тяжёлый нагрудник с металлическими наплечниками.",
    icon: "⚔",
    price: 120
  },
  {
    id: "armor-gold",
    type: "armor",
    name: "Золотая броня",
    description: "Полированный нагрудник с золотыми пластинами.",
    icon: "👑",
    price: 260
  },
  {
    id: "armor-scandinavian",
    type: "armor",
    name: "Скандинавская броня",
    description: "Меховой воротник и перекрёстные кожаные ремни.",
    icon: "🐺",
    price: 170
  },
  {
    id: "armor-japanese",
    type: "armor",
    name: "Японская броня",
    description: "Лакированные красные пластины и пояс-оби.",
    icon: "⛩",
    price: 220
  },
  {
    id: "weapon-none",
    type: "weapon",
    name: "Без оружия",
    description: "Свободные руки.",
    icon: "—",
    price: 0
  },
  {
    id: "weapon-club",
    type: "weapon",
    name: "Дубина",
    description: "Тяжёлая деревянная дубина с шипами.",
    icon: "🪵",
    price: 40
  },
  {
    id: "weapon-dagger",
    type: "weapon",
    name: "Кинжал",
    description: "Короткий клинок для быстрой руки.",
    icon: "🗡",
    price: 70
  },
  {
    id: "weapon-sword",
    type: "weapon",
    name: "Меч",
    description: "Прямой стальной меч с широкой гардой.",
    icon: "⚔",
    price: 100
  },
  {
    id: "weapon-katana",
    type: "weapon",
    name: "Катана",
    description: "Изогнутый клинок с обмотанной рукоятью.",
    icon: "🗡",
    price: 160
  },
  {
    id: "weapon-fire-axe",
    type: "weapon",
    name: "Огненный топор",
    description: "Двуручный топор с раскалённым лезвием.",
    icon: "🔥",
    price: 320
  }
];

const skinColors = {
  moss: 0x78977d,
  stone: 0x87908d,
  olive: 0x9b865d
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

function formatCoins(coins) {
  return coins.toLocaleString("ru-RU");
}

function updateWallet() {
  const formattedCoins = LOCAL_TEST_MODE ? "∞" : formatCoins(game.coins);
  document.getElementById("walletValue").textContent = formattedCoins;
  document.getElementById("shopBalance").textContent = formattedCoins;
  document.querySelector(".wallet").title = LOCAL_TEST_MODE
    ? "Тестовый режим: покупки не расходуют монеты"
    : "Монеты начисляются за новую территорию и тратятся на косметику";
}

/* Навигация */

const screens = [...document.querySelectorAll(".screen")];
const navButtons = [...document.querySelectorAll("[data-screen]")];
let gameAccessGranted = false;

function showScreen(name) {
  if (name !== "auth" && !gameAccessGranted) return;

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

  if (name === "shop") {
    renderShop();
  }

  if (name === "character") {
    initializeTroll();
    setTimeout(resizeTroll, 60);
  }
}

function enterGame() {
  gameAccessGranted = true;
  document.body.classList.remove("auth-landing");
  showScreen("home");
}

function showAuthLanding() {
  gameAccessGranted = false;
  document.body.classList.add("auth-landing");
  showScreen("auth");
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
  populateSelect("weaponSelect", "weapon");

  document.getElementById("skinSelect").value = game.equipped.skin;
  document.getElementById("hairSelect").value = game.equipped.hair;
}

function bindAppearanceControls() {
  const controls = [
    ["helmetSelect", "helmet"],
    ["armorSelect", "armor"],
    ["weaponSelect", "weapon"],
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
  const categories = [
    { type: "helmet", title: "Шлемы" },
    { type: "armor", title: "Броня" },
    { type: "weapon", title: "Оружие" }
  ];

  container.innerHTML = categories.map(category => `
    <section class="shop-category">
      <h2>${category.title}</h2>
      <div class="shop-grid">
        ${cosmetics.filter(item => item.type === category.type).map(item => {
          const owned = game.owned.includes(item.id);
          const canAfford = owned || LOCAL_TEST_MODE || game.coins >= item.price;
          return `
            <article class="shop-item">
              <div class="shop-item-preview">${item.icon}</div>
              <h3>${item.name}</h3>
              <p>${item.description}</p>
              <button
                class="${owned ? "secondary-button" : "primary-button"}"
                ${canAfford ? "" : "disabled"}
                data-cosmetic="${item.id}">
                ${owned ? "Надеть" : `Купить · ${formatCoins(item.price)} монет`}
              </button>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");

  container.querySelectorAll("[data-cosmetic]").forEach(button => {
    button.addEventListener("click", () => {
      const item = catalogItem(button.dataset.cosmetic);
      if (!item) return;

      if (!game.owned.includes(item.id)) {
        if (!Number.isSafeInteger(item.price) || item.price < 0) {
          console.error(`Invalid shop price for cosmetic "${item.id}".`);
          showToast("Не удалось определить цену предмета.", true);
          return;
        }
        if (!LOCAL_TEST_MODE && game.coins < item.price) {
          showToast(`Не хватает монет: нужно ${formatCoins(item.price)}.`, true);
          return;
        }
        if (!LOCAL_TEST_MODE) game.coins -= item.price;
        game.owned.push(item.id);
        showToast(LOCAL_TEST_MODE
          ? `Открыто для тестирования: ${item.name}.`
          : `Куплено: ${item.name} за ${formatCoins(item.price)} монет.`);
      }

      game.equipped[item.type] = item.id;
      saveState();
      updateWallet();
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

function addBox(parent, x, y, z, sx, sy, sz, material, rotationZ = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    material
  );

  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCone(parent, x, y, z, radius, height, material, rotationZ = 0) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 9),
    material
  );

  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addClothPanel(parent, x, y, z, points, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([pointX, pointY]) => shape.lineTo(pointX, pointY));
  shape.closePath();

  const frontMaterial = material.clone();
  frontMaterial.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      steps: 1
    }),
    frontMaterial
  );

  mesh.position.set(x, y, z);
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

function addTrollHelmet(
  parent,
  metalMaterial,
  leatherMaterial,
  leatherLight,
  goldMaterial,
  oniMaterial,
  toothMaterial,
  beltMaterial
) {
  const helmetId = game.equipped.helmet;

  if (helmetId === "helmet-none") return;

  if (helmetId === "helmet-normal") {
    addSphere(parent, 0, 2.98, 0, 0.5, 0.19, 0.43, leatherMaterial);
    addCylinder(parent, 0, 2.88, 0, 0.48, 0.48, 0.07, leatherLight);
    [-0.3, 0.3].forEach(x => addSphere(parent, x, 2.9, 0.34, 0.035, 0.035, 0.025, beltMaterial));
    return;
  }

  if (helmetId === "helmet-oni") {
    addSphere(parent, 0, 2.43, 0.49, 0.4, 0.2, 0.12, oniMaterial);
    [-1, 1].forEach(side => {
      addSphere(parent, side * 0.19, 2.55, 0.57, 0.09, 0.035, 0.035, leatherMaterial);
      addCone(parent, side * 0.31, 2.7, 0.43, 0.1, 0.36, oniMaterial, -side * 0.45);
      addCone(parent, side * 0.2, 2.34, 0.59, 0.06, 0.2, toothMaterial);
    });
    addSphere(parent, 0, 2.46, 0.62, 0.08, 0.06, 0.04, beltMaterial);
    return;
  }

  if (helmetId === "helmet-crown") {
    addCylinder(parent, 0, 2.98, 0, 0.47, 0.47, 0.1, goldMaterial);
    [-0.34, -0.17, 0, 0.17, 0.34].forEach((x, index) => {
      addCone(
        parent,
        x,
        3.1 + (index % 2) * 0.03,
        0,
        0.075,
        0.3 + (index % 2) * 0.05,
        goldMaterial
      );
    });
    addSphere(parent, 0, 3.04, 0.44, 0.08, 0.08, 0.04, oniMaterial);
    return;
  }

  addSphere(parent, 0, 2.98, 0, 0.52, 0.25, 0.45, metalMaterial);
  addCylinder(parent, 0, 2.87, 0, 0.5, 0.5, 0.09, metalMaterial);
  addBox(parent, 0, 2.7, 0.46, 0.09, 0.32, 0.08, metalMaterial);
  [-0.34, 0.34].forEach(x => addSphere(parent, x, 2.91, 0.31, 0.045, 0.045, 0.035, beltMaterial));

  if (helmetId === "helmet-viking") {
    [-1, 1].forEach(side => {
      addCone(parent, side * 0.45, 3.02, 0, 0.12, 0.46, toothMaterial, -side * 0.85);
    });
  } else {
    addSphere(parent, 0, 2.97, 0.02, 0.15, 0.2, 0.08, leatherMaterial);
  }
}

function addTrollWeapon(
  parent,
  woodMaterial,
  metalMaterial,
  leatherMaterial,
  beltMaterial,
  fireMaterial,
  flameCore
) {
  const weaponId = game.equipped.weapon;
  if (weaponId === "weapon-none") return;

  if (weaponId === "weapon-fire-axe") {
    addBetween(
      parent,
      new THREE.Vector3(0, 1.68, 0.53),
      new THREE.Vector3(0, 0.7, 0.53),
      0.07,
      woodMaterial
    );
    addBetween(
      parent,
      new THREE.Vector3(-0.02, 1.38, 0.57),
      new THREE.Vector3(0.02, 1.28, 0.57),
      0.095,
      leatherMaterial
    );
    addBetween(
      parent,
      new THREE.Vector3(-0.02, 1.08, 0.57),
      new THREE.Vector3(0.02, 0.98, 0.57),
      0.095,
      beltMaterial
    );
    addClothPanel(parent, 0, 1.91, 0.54, [
      [-0.08, 0.12], [-0.32, 0.27], [-0.57, 0.16], [-0.52, -0.02],
      [-0.31, -0.2], [-0.08, -0.1]
    ], fireMaterial);
    addClothPanel(parent, 0, 1.91, 0.59, [
      [0.08, 0.12], [0.32, 0.27], [0.57, 0.16], [0.52, -0.02],
      [0.31, -0.2], [0.08, -0.1]
    ], fireMaterial);
    [-1, 1].forEach(side => {
      addCone(parent, side * 0.43, 2.19, 0.62, 0.1, 0.3, flameCore, side * 0.45);
      addSphere(parent, side * 0.25, 1.94, 0.63, 0.07, 0.08, 0.035, beltMaterial);
    });
    addCone(parent, 0, 2.23, 0.6, 0.09, 0.3, fireMaterial);
    return;
  }

  const gripX = -1.02;
  const gripZ = 0.24;

  if (weaponId === "weapon-club") {
    addBetween(
      parent,
      new THREE.Vector3(gripX, 1.08, gripZ),
      new THREE.Vector3(-1.08, 0.26, gripZ),
      0.075,
      woodMaterial
    );
    addBetween(
      parent,
      new THREE.Vector3(-1.08, 0.46, gripZ),
      new THREE.Vector3(-1.12, 0.82, gripZ),
      0.13,
      woodMaterial
    );
    [-1, 1].forEach(side => {
      addCone(parent, -1.12 + side * 0.11, 0.67, gripZ + 0.08, 0.045, 0.16, metalMaterial, side * 0.65);
    });
    return;
  }

  addBetween(
    parent,
    new THREE.Vector3(gripX, 1.08, gripZ),
    new THREE.Vector3(gripX, 0.82, gripZ),
    0.065,
    leatherMaterial
  );
  addBetween(
    parent,
    new THREE.Vector3(gripX - 0.13, 0.84, gripZ + 0.015),
    new THREE.Vector3(gripX + 0.13, 0.84, gripZ + 0.015),
    0.045,
    metalMaterial
  );

  if (weaponId === "weapon-dagger") {
    addClothPanel(parent, gripX, 0.82, gripZ + 0.04, [
      [-0.075, 0], [0.075, 0], [0.09, -0.12], [0.045, -0.35], [0, -0.48], [-0.045, -0.35], [-0.09, -0.12]
    ], metalMaterial);
    return;
  }

  if (weaponId === "weapon-katana") {
    addClothPanel(parent, gripX, 0.82, gripZ + 0.04, [
      [-0.07, 0], [0.07, 0], [0.12, -0.2], [0.08, -0.52], [0.16, -0.83],
      [0.02, -0.96], [-0.08, -0.66], [-0.12, -0.32]
    ], metalMaterial);
    [-0.04, 0.04].forEach(x => addSphere(parent, gripX + x, 0.93, gripZ + 0.06, 0.025, 0.035, 0.02, beltMaterial));
    return;
  }

  addClothPanel(parent, gripX, 0.82, gripZ + 0.04, [
    [-0.09, 0], [0.09, 0], [0.11, -0.2], [0.15, -0.58], [0, -0.82],
    [-0.15, -0.58], [-0.11, -0.2]
  ], metalMaterial);
}

function addHair(parent, hairMaterial) {
  addSphere(parent, 0, 2.94, -0.12, 0.38, 0.17, 0.31, hairMaterial);

  for (let index = 0; index < 5; index += 1) {
    const offset = index - 2;
    addCone(
      parent,
      offset * 0.12,
      3.08 - Math.abs(offset) * 0.018,
      -0.1,
      0.115,
      0.32 + (index % 2) * 0.06,
      hairMaterial,
      offset * -0.16
    );
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
  const darkerSkin = makeMaterial(0x59604b);
  const innerEarMaterial = makeMaterial(0x76614a);
  const hairMaterial = makeMaterial(hairColors[game.equipped.hair] || hairColors.dark);
  const leatherMaterial = makeMaterial(0x503d2f);
  const leatherLight = makeMaterial(0x785b3e);
  const clothMaterial = makeMaterial(0x344a35);
  const metalMaterial = makeMaterial(0x7d8d85, 0.38, 0.62);
  const goldMaterial = makeMaterial(0xd0a43b, 0.3, 0.72);
  const japaneseMaterial = makeMaterial(0x762d2d, 0.42, 0.24);
  const oniMaterial = makeMaterial(0x9b3028, 0.55, 0.05);
  const woodMaterial = makeMaterial(0x59402a);
  const fireMaterial = makeMaterial(0xd84620, 0.34, 0.22);
  const flameCore = makeMaterial(0xffb52e, 0.32, 0.05);
  const eyeMaterial = makeMaterial(0xf2d58d, 0.25);
  const irisMaterial = makeMaterial(0x9b542b, 0.3);
  const pupilMaterial = makeMaterial(0x261d19, 0.2);
  const toothMaterial = makeMaterial(0xe7d7b6);
  const beltMaterial = makeMaterial(0xb18a43, 0.42, 0.56);

  // Тяжёлые ноги и открытые пальцы
  addBetween(
    trollGroup,
    new THREE.Vector3(-0.24, 1.08, 0),
    new THREE.Vector3(-0.35, 0.53, 0.02),
    0.25,
    skinMaterial
  );
  addBetween(
    trollGroup,
    new THREE.Vector3(0.24, 1.08, 0),
    new THREE.Vector3(0.35, 0.53, 0.02),
    0.25,
    skinMaterial
  );
  addSphere(trollGroup, -0.34, 0.48, 0.02, 0.28, 0.24, 0.3, skinMaterial);
  addSphere(trollGroup, 0.34, 0.48, 0.02, 0.28, 0.24, 0.3, skinMaterial);
  addBetween(
    trollGroup,
    new THREE.Vector3(-0.35, 0.47, 0.04),
    new THREE.Vector3(-0.37, 0.26, 0.08),
    0.2,
    leatherLight
  );
  addBetween(
    trollGroup,
    new THREE.Vector3(0.35, 0.47, 0.04),
    new THREE.Vector3(0.37, 0.26, 0.08),
    0.2,
    leatherLight
  );
  addSphere(trollGroup, -0.35, 0.16, 0.23, 0.24, 0.13, 0.33, skinMaterial);
  addSphere(trollGroup, 0.35, 0.16, 0.23, 0.24, 0.13, 0.33, skinMaterial);
  [-0.45, -0.31, -0.17, 0.17, 0.31, 0.45].forEach(x => {
    const side = x < 0 ? -1 : 1;
    const toeZ = 0.49 - Math.abs(x) * 0.18;
    addSphere(trollGroup, x, 0.105, toeZ, 0.075, 0.075, 0.13, skinMaterial);
    addCone(trollGroup, x, 0.12, toeZ + 0.09, 0.035, 0.09, toothMaterial, side * -0.15);
  });

  // Широкий торс и выраженная грудь
  addSphere(trollGroup, 0, 1.12, 0, 0.48, 0.42, 0.36, skinMaterial);
  addSphere(trollGroup, 0, 1.72, 0, 0.66, 0.62, 0.4, skinMaterial);
  addSphere(trollGroup, -0.3, 1.82, 0.2, 0.34, 0.29, 0.24, skinMaterial);
  addSphere(trollGroup, 0.3, 1.82, 0.2, 0.34, 0.29, 0.24, skinMaterial);
  addSphere(trollGroup, 0, 2.15, 0, 0.3, 0.3, 0.29, skinMaterial);

  if (game.equipped.armor === "armor-iron"
    || game.equipped.armor === "armor-gold") {
    const armorMaterial = game.equipped.armor === "armor-gold"
      ? goldMaterial
      : metalMaterial;
    addSphere(trollGroup, 0, 1.72, 0.12, 0.61, 0.48, 0.4, armorMaterial);
    addBox(trollGroup, 0, 1.72, 0.5, 0.08, 0.38, 0.04, leatherLight);
    [-0.42, 0.42].forEach(x => {
      addSphere(trollGroup, x, 2.0, 0.02, 0.3, 0.22, 0.31, armorMaterial);
      addSphere(trollGroup, x, 1.99, 0.27, 0.06, 0.06, 0.04, goldMaterial);
    });
    if (game.equipped.armor === "armor-gold") {
      [-0.24, 0, 0.24].forEach(x => {
        addSphere(trollGroup, x, 1.74, 0.51, 0.045, 0.045, 0.025, beltMaterial);
      });
    }
  } else if (game.equipped.armor === "armor-scandinavian") {
    const furMaterial = makeMaterial(0xc3b492);
    addSphere(trollGroup, 0, 2.04, 0, 0.72, 0.25, 0.46, furMaterial);
    [-0.46, -0.23, 0, 0.23, 0.46].forEach(x => {
      addSphere(trollGroup, x, 2.0, 0.37, 0.13, 0.09, 0.08, furMaterial);
    });
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.42, 2.02, 0.25),
      new THREE.Vector3(0.36, 1.25, 0.36),
      0.095,
      leatherLight
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.42, 2.02, 0.25),
      new THREE.Vector3(-0.36, 1.25, 0.36),
      0.065,
      leatherMaterial
    );
    addSphere(trollGroup, -0.53, 1.98, 0.02, 0.27, 0.23, 0.28, leatherMaterial);
  } else if (game.equipped.armor === "armor-japanese") {
    addSphere(trollGroup, 0, 1.72, 0.12, 0.59, 0.48, 0.39, japaneseMaterial);
    [1.52, 1.68, 1.84, 2].forEach(y => {
      addBox(trollGroup, 0, y, 0.47, 0.82 - Math.abs(y - 1.72) * 0.28, 0.09, 0.055, leatherMaterial);
      [-0.26, 0, 0.26].forEach(x => {
        addSphere(trollGroup, x, y, 0.51, 0.025, 0.025, 0.02, goldMaterial);
      });
    });
    [-0.5, 0.5].forEach(x => {
      addSphere(trollGroup, x, 1.98, 0.02, 0.3, 0.2, 0.29, japaneseMaterial);
    });
    addBox(trollGroup, 0, 1.23, 0.43, 0.75, 0.13, 0.08, oniMaterial);
  } else if (game.equipped.armor === "armor-leather") {
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.42, 2.02, 0.2),
      new THREE.Vector3(0.36, 1.25, 0.32),
      0.09,
      leatherLight
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.42, 2.02, 0.2),
      new THREE.Vector3(-0.36, 1.25, 0.32),
      0.065,
      leatherMaterial
    );
    addSphere(trollGroup, -0.53, 1.98, 0.02, 0.27, 0.23, 0.28, leatherMaterial);
    addBox(trollGroup, -0.42, 1.9, 0.38, 0.12, 0.09, 0.035, beltMaterial, 0.72);
    addBox(trollGroup, 0.29, 1.36, 0.42, 0.12, 0.09, 0.035, beltMaterial, 0.72);
  }

  addClothPanel(trollGroup, 0, 1.08, 0.34, [
    [-0.39, 0.1], [0.39, 0.1], [0.31, -0.28], [0.1, -0.55], [-0.24, -0.42]
  ], clothMaterial);
  addClothPanel(trollGroup, 0.04, 1.08, 0.4, [
    [-0.22, 0.08], [0.3, 0.08], [0.25, -0.27], [0.04, -0.44], [-0.18, -0.25]
  ], leatherMaterial);
  addCylinder(trollGroup, 0, 1.2, 0.02, 0.49, 0.49, 0.15, leatherMaterial);
  addBox(trollGroup, 0, 1.2, 0.515, 0.2, 0.17, 0.07, beltMaterial);
  addBox(trollGroup, 0, 1.2, 0.56, 0.11, 0.085, 0.025, leatherMaterial);

  const fireAxeTwoHanded = game.equipped.weapon === "weapon-fire-axe";

  if (!fireAxeTwoHanded) {
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.53, 1.98, 0),
      new THREE.Vector3(-0.83, 1.42, 0.04),
      0.24,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.53, 1.98, 0),
      new THREE.Vector3(0.83, 1.42, 0.04),
      0.24,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.83, 1.42, 0.04),
      new THREE.Vector3(-0.96, 1.12, 0.12),
      0.2,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.83, 1.42, 0.04),
      new THREE.Vector3(0.96, 1.12, 0.12),
      0.2,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.87, 1.38, 0.12),
      new THREE.Vector3(-0.95, 1.19, 0.17),
      0.21,
      leatherLight
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.87, 1.38, 0.12),
      new THREE.Vector3(0.95, 1.19, 0.17),
      0.21,
      leatherLight
    );
    addSphere(trollGroup, -0.98, 1.08, 0.17, 0.2, 0.2, 0.18, skinMaterial);
    addSphere(trollGroup, 0.98, 1.08, 0.17, 0.2, 0.2, 0.18, skinMaterial);
  } else {
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.53, 1.98, 0),
      new THREE.Vector3(-0.48, 1.62, 0.08),
      0.24,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.48, 1.62, 0.08),
      new THREE.Vector3(-0.12, 1.43, 0.48),
      0.19,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.53, 1.98, 0),
      new THREE.Vector3(0.48, 1.58, 0.08),
      0.24,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.48, 1.58, 0.08),
      new THREE.Vector3(0.12, 1.2, 0.48),
      0.19,
      skinMaterial
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(-0.3, 1.52, 0.28),
      new THREE.Vector3(-0.12, 1.43, 0.49),
      0.2,
      leatherLight
    );
    addBetween(
      trollGroup,
      new THREE.Vector3(0.3, 1.39, 0.28),
      new THREE.Vector3(0.12, 1.2, 0.49),
      0.2,
      leatherLight
    );
    addSphere(trollGroup, -0.12, 1.43, 0.48, 0.18, 0.17, 0.16, skinMaterial);
    addSphere(trollGroup, 0.12, 1.2, 0.48, 0.18, 0.17, 0.16, skinMaterial);
  }

  const shoulderMaterial = game.equipped.armor === "armor-iron"
    ? metalMaterial
    : game.equipped.armor === "armor-gold"
      ? goldMaterial
      : game.equipped.armor === "armor-japanese"
        ? japaneseMaterial
        : game.equipped.armor === "armor-leather"
          || game.equipped.armor === "armor-scandinavian"
          ? leatherMaterial
          : darkerSkin;
  addSphere(trollGroup, -0.54, 1.98, 0.01, 0.28, 0.25, 0.3, shoulderMaterial);
  addSphere(trollGroup, 0.54, 1.98, 0.01, 0.28, 0.25, 0.3, shoulderMaterial);

  if (!fireAxeTwoHanded) {
    [-1, 1].forEach(side => {
      const fingerCount = side < 0 && game.equipped.weapon !== "weapon-none" ? 2 : 3;
      for (let finger = 0; finger < fingerCount; finger += 1) {
        const spread = (finger - 1) * 0.1;
        const start = new THREE.Vector3(side * 1.02 + spread, 1.0, 0.2);
        const end = new THREE.Vector3(side * 1.03 + spread * 1.5, 0.84, 0.25);
        addBetween(trollGroup, start, end, 0.055, skinMaterial);
        addCone(trollGroup, end.x, 0.79, 0.27, 0.035, 0.1, toothMaterial, side * -0.2);
      }
    });
  }

  addTrollWeapon(
    trollGroup,
    woodMaterial,
    metalMaterial,
    leatherMaterial,
    beltMaterial,
    fireMaterial,
    flameCore
  );

  // Голова с выраженной челюстью, ушами и клыками
  addCylinder(trollGroup, 0, 2.2, 0, 0.23, 0.26, 0.34, skinMaterial);
  addSphere(trollGroup, 0, 2.58, 0.02, 0.53, 0.55, 0.44, skinMaterial);
  addSphere(trollGroup, 0, 2.34, 0.12, 0.43, 0.28, 0.39, skinMaterial);
  [-1, 1].forEach(side => {
    addSphere(trollGroup, side * 0.49, 2.56, 0, 0.18, 0.19, 0.13, darkerSkin);
    addCone(
      trollGroup,
      side * 0.67,
      2.62,
      -0.015,
      0.145,
      0.46,
      skinMaterial,
      -side * Math.PI / 2.7
    );
    addCone(
      trollGroup,
      side * 0.55,
      2.58,
      0.09,
      0.06,
      0.25,
      innerEarMaterial,
      -side * Math.PI / 2.7
    );
  });

  // Глубокие брови, янтарные глаза и широкий нос
  const leftBrow = addSphere(trollGroup, -0.22, 2.76, 0.37, 0.22, 0.09, 0.1, hairMaterial);
  const rightBrow = addSphere(trollGroup, 0.22, 2.76, 0.37, 0.22, 0.09, 0.1, hairMaterial);
  leftBrow.rotation.z = -0.12;
  rightBrow.rotation.z = 0.12;
  [-1, 1].forEach(side => {
    addSphere(trollGroup, side * 0.2, 2.63, 0.4, 0.11, 0.105, 0.06, eyeMaterial);
    addSphere(trollGroup, side * 0.2, 2.63, 0.455, 0.052, 0.07, 0.025, irisMaterial);
    addSphere(trollGroup, side * 0.2, 2.63, 0.476, 0.024, 0.055, 0.018, pupilMaterial);
  });
  addSphere(trollGroup, 0, 2.48, 0.46, 0.23, 0.18, 0.17, darkerSkin);
  addSphere(trollGroup, 0, 2.43, 0.57, 0.15, 0.11, 0.09, skinMaterial);
  addSphere(trollGroup, -0.075, 2.46, 0.645, 0.035, 0.022, 0.018, pupilMaterial);
  addSphere(trollGroup, 0.075, 2.46, 0.645, 0.035, 0.022, 0.018, pupilMaterial);
  addSphere(trollGroup, 0, 2.24, 0.43, 0.28, 0.11, 0.1, leatherMaterial);
  [-1, 1].forEach(side => {
    addCone(trollGroup, side * 0.17, 2.3, 0.49, 0.075, 0.27, toothMaterial);
  });

  addHair(trollGroup, hairMaterial);
  addTrollHelmet(
    trollGroup,
    metalMaterial,
    leatherMaterial,
    leatherLight,
    goldMaterial,
    oniMaterial,
    toothMaterial,
    beltMaterial
  );

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

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const keyLight = new THREE.DirectionalLight(0xffe6c6, 0.85);
  keyLight.position.set(-3, 5, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x49d7b2, 0.3);
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
let playableBoundaryLayer = null;
let landmarkMarkers = [];
let onlineTerritoriesLayer = null;
let onlineClient = null;
let onlineUserId = null;
let onlineUser = null;
let onlineRefreshTimer = null;
let onlineMoveTimer = null;

function setOnlineStatus(message, isError = false) {
  const status = document.getElementById("onlineStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setAuthStatus(message, isError = false) {
  const status = document.getElementById("authStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function renderProfileControls() {
  const nicknameInput = document.getElementById("playerNicknameInput");
  const colorInput = document.getElementById("territoryColorInput");
  const colorPalette = document.getElementById("territoryColorPalette");
  const nicknameLabel = document.getElementById("playerNickname");

  if (nicknameInput) nicknameInput.value = game.playerNickname;
  if (colorInput) {
    colorInput.value = game.territoryColor;
  }
  if (colorPalette) {
    let colorOptions = Array.from(
      colorPalette.querySelectorAll('input[name="territoryColorChoice"]')
    );
    const hasColorOption = colorOptions.some(option => option.value === game.territoryColor);
    let customColorOption = colorPalette.querySelector("[data-custom-color]");
    if (!hasColorOption) {
      if (!customColorOption) {
        customColorOption = document.createElement("label");
        customColorOption.className = "territory-color-option";
        customColorOption.dataset.customColor = "true";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "territoryColorChoice";
        const swatch = document.createElement("span");
        swatch.className = "territory-color-swatch";
        const name = document.createElement("span");
        name.className = "territory-color-name";
        customColorOption.append(radio, swatch, name);
        colorPalette.append(customColorOption);
      }

      const radio = customColorOption.querySelector("input");
      radio.value = game.territoryColor;
      customColorOption.querySelector(".territory-color-swatch")
        .style.setProperty("--territory-color", game.territoryColor);
      customColorOption.querySelector(".territory-color-name").textContent =
        `Текущий (${game.territoryColor.toUpperCase()})`;
    } else if (customColorOption) {
      customColorOption.remove();
    }

    colorOptions = Array.from(
      colorPalette.querySelectorAll('input[name="territoryColorChoice"]')
    );
    colorOptions.forEach(option => {
      const selected = option.value === game.territoryColor;
      option.checked = selected;
      option.closest(".territory-color-option").classList.toggle("selected", selected);
    });
  }
  if (nicknameLabel) nicknameLabel.textContent = game.playerNickname;
}

function applyAccountProfile(user) {
  const metadata = user?.user_metadata || {};
  game.playerNickname = normalizeNickname(metadata.nickname)
    || DEFAULT_PLAYER_NICKNAME;
  game.territoryColor = isValidTerritoryColor(metadata.territory_color)
    ? metadata.territory_color.toLowerCase()
    : DEFAULT_TERRITORY_COLOR;
  saveState();
}

function readProfileForm() {
  const nicknameInput = document.getElementById("playerNicknameInput");
  const colorInput = document.getElementById("territoryColorInput");
  if (!nicknameInput || !colorInput || !nicknameInput.reportValidity()) return null;

  const nickname = normalizeNickname(nicknameInput.value);
  if (!nickname) {
    nicknameInput.setCustomValidity("Никнейм должен содержать от 2 до 24 символов.");
    nicknameInput.reportValidity();
    nicknameInput.setCustomValidity("");
    return null;
  }

  return {
    nickname,
    territoryColor: isValidTerritoryColor(colorInput.value)
      ? colorInput.value.toLowerCase()
      : DEFAULT_TERRITORY_COLOR
  };
}

function applyLocalProfile(profile) {
  game.playerNickname = profile.nickname;
  game.territoryColor = profile.territoryColor;
  saveState();
  renderProfileControls();
  redrawCapturedTerritories(false);
}

function renderAuthState(user) {
  const fields = document.getElementById("authFields");
  const logoutButton = document.getElementById("logoutAccountButton");
  const registerButton = document.getElementById("registerAccountButton");
  const loginButton = document.getElementById("loginAccountButton");
  const guestButton = document.getElementById("continueGuestButton");
  const accountButton = document.getElementById("accountNavButton");
  if (!fields || !logoutButton || !registerButton || !loginButton
    || !guestButton || !accountButton) return;

  renderProfileControls();
  const isGuest = !user || user.is_anonymous;
  fields.hidden = !isGuest;
  logoutButton.hidden = isGuest;
  registerButton.hidden = !isGuest;
  loginButton.hidden = !isGuest;
  guestButton.hidden = Boolean(user && !isGuest);
  accountButton.hidden = !user;
  accountButton.textContent = isGuest ? "Войти" : "Аккаунт";

  if (user && !isGuest) {
    setAuthStatus(`Вошёл как ${user.email || "игрок"}.`);
  } else if (user) {
    setAuthStatus("Ты играешь как гость. Создай аккаунт, чтобы сохранить этого игрока и его территории.");
  }
}

function setAuthBusy(isBusy) {
  [
    "registerAccountButton",
    "loginAccountButton",
    "logoutAccountButton",
    "saveProfileButton"
  ].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = isBusy;
  });
}

function authErrorMessage(error) {
  if (error?.message) return error.message;
  return "Не удалось выполнить действие с аккаунтом. Попробуй ещё раз.";
}

async function updateOnlineIdentity(user) {
  onlineUser = user || null;
  onlineUserId = onlineUser?.id || null;
  if (onlineUser && !onlineUser.is_anonymous) applyAccountProfile(onlineUser);
  renderAuthState(onlineUser);
  redrawCapturedTerritories(false);
  await refreshOnlineTerritories();
}

async function createPlayerAccount() {
  if (!onlineClient || !onlineUser?.is_anonymous) {
    setAuthStatus("Создать аккаунт можно из гостевой сессии.", true);
    return;
  }

  const profile = readProfileForm();
  if (!profile) return;
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  if (!emailInput.reportValidity() || !passwordInput.reportValidity()) return;

  applyLocalProfile(profile);
  setAuthBusy(true);
  try {
    const { data, error } = await onlineClient.auth.updateUser(
      {
        email: emailInput.value.trim(),
        password: passwordInput.value,
        data: {
          nickname: profile.nickname,
          territory_color: profile.territoryColor
        }
      },
      { emailRedirectTo: window.location.href }
    );
    if (error) throw error;

    await updateOnlineIdentity(data.user);
    passwordInput.value = "";
    if (data.user.email_confirmed_at) {
      enterGame();
      showToast("Аккаунт создан. Текущий игрок и его территории сохранены.");
    } else {
      setAuthStatus(
        `Аккаунт почти создан. Подтверди почту ${emailInput.value.trim()} по ссылке из письма, чтобы завершить регистрацию. Игрок и его ID сохранены.`
      );
      showToast("Подтверди почту по ссылке из письма, чтобы завершить регистрацию.");
    }
  } catch (error) {
    console.error("Player account registration failed:", error);
    setAuthStatus(authErrorMessage(error), true);
  } finally {
    setAuthBusy(false);
  }
}

function continueAsGuest() {
  const profile = readProfileForm();
  if (!profile) {
    setAuthStatus("Укажи никнейм длиной от 2 до 24 символов.", true);
    return;
  }
  applyLocalProfile(profile);
  enterGame();
}

async function savePlayerProfile() {
  const profile = readProfileForm();
  if (!profile) return;

  const saveButton = document.getElementById("saveProfileButton");
  saveButton.disabled = true;
  try {
    if (onlineUser && !onlineUser.is_anonymous) {
      if (!onlineClient) throw new Error("Нет подключения к аккаунту.");
      const { data, error } = await onlineClient.auth.updateUser({
        data: {
          nickname: profile.nickname,
          territory_color: profile.territoryColor
        }
      });
      if (error) throw error;
      onlineUser = data.user;
    }

    applyLocalProfile(profile);
    showToast("Настройки игрока сохранены.");
  } catch (error) {
    console.error("Player profile could not be saved:", error);
    setAuthStatus(authErrorMessage(error), true);
  } finally {
    saveButton.disabled = false;
  }
}

async function syncTerritoryColorToAccount(color) {
  if (!onlineUser || onlineUser.is_anonymous) return;
  if (!onlineClient) {
    setAuthStatus("Цвет применён на этом устройстве, но аккаунт недоступен для синхронизации.", true);
    return;
  }

  try {
    const { data, error } = await onlineClient.auth.updateUser({
      data: { territory_color: color }
    });
    if (error) throw error;
    onlineUser = data.user;
  } catch (error) {
    console.error("Territory color could not be synced to the account:", error);
    setAuthStatus("Цвет применён на этом устройстве, но не синхронизирован с аккаунтом.", true);
  }
}

async function loginPlayerAccount() {
  if (!onlineClient) return;

  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  if (!emailInput.reportValidity() || !passwordInput.reportValidity()) return;

  if (onlineUser?.is_anonymous && !window.confirm(
    "Вход переключит игру на выбранный аккаунт. Опубликованные территории текущего гостя останутся привязаны к гостю. Чтобы сохранить этого игрока, выбери «Создать аккаунт и сохранить игрока»."
  )) {
    return;
  }

  setAuthBusy(true);
  try {
    const { data, error } = await onlineClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) throw error;

    await updateOnlineIdentity(data.user);
    passwordInput.value = "";
    enterGame();
    showToast(`Выполнен вход: ${data.user.email}.`);
  } catch (error) {
    console.error("Player account sign-in failed:", error);
    setAuthStatus(authErrorMessage(error), true);
  } finally {
    setAuthBusy(false);
  }
}

async function logoutPlayerAccount() {
  if (!onlineClient) return;

  setAuthBusy(true);
  try {
    const { error: signOutError } = await onlineClient.auth.signOut();
    if (signOutError) throw signOutError;

    const { data, error } = await onlineClient.auth.signInAnonymously();
    if (error) throw error;
    await updateOnlineIdentity(data.user);
    showAuthLanding();
    setAuthStatus("Вышел из аккаунта. Игра продолжится как гость.");
  } catch (error) {
    console.error("Player account sign-out failed:", error);
    setAuthStatus(authErrorMessage(error), true);
  } finally {
    setAuthBusy(false);
  }
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
  const registerButton = document.getElementById("registerAccountButton");
  const loginButton = document.getElementById("loginAccountButton");
  const logoutButton = document.getElementById("logoutAccountButton");
  const continueGuestButton = document.getElementById("continueGuestButton");
  const saveProfileButton = document.getElementById("saveProfileButton");
  const territoryColorInput = document.getElementById("territoryColorInput");
  const territoryColorPalette = document.getElementById("territoryColorPalette");

  registerButton.addEventListener("click", createPlayerAccount);
  loginButton.addEventListener("click", loginPlayerAccount);
  logoutButton.addEventListener("click", logoutPlayerAccount);
  continueGuestButton.addEventListener("click", continueAsGuest);
  saveProfileButton.addEventListener("click", savePlayerProfile);
  territoryColorPalette.addEventListener("change", event => {
    const option = event.target;
    if (!(option instanceof HTMLInputElement)
      || option.name !== "territoryColorChoice") return;

    const color = option.value.toLowerCase();
    territoryColorInput.value = color;
    game.territoryColor = color;
    saveState();
    redrawCapturedTerritories(false);
    showToast("Цвет территории изменён.");
    syncTerritoryColorToAccount(color);
    territoryColorPalette.querySelectorAll(".territory-color-option")
      .forEach(item => item.classList.toggle("selected", item.contains(option)));
  });
  renderAuthState(null);

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
    setAuthStatus("Сначала настрой подключение к Supabase.", true);
    setAuthBusy(true);
    return;
  }

  if (!window.supabase?.createClient) {
    setOnlineStatus("Не загрузилась библиотека Supabase. Проверь подключение к интернету.", true);
    setAuthStatus("Не удалось загрузить Supabase Auth.", true);
    setAuthBusy(true);
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
    onlineUser = session.user;
    if (!onlineUser.is_anonymous) applyAccountProfile(onlineUser);
    renderAuthState(onlineUser);
    if (!onlineUser.is_anonymous) enterGame();
    onlineClient.auth.onAuthStateChange((event, nextSession) => {
      const previousUserId = onlineUserId;
      onlineUser = nextSession?.user || null;
      onlineUserId = onlineUser?.id || null;
      if (onlineUser && !onlineUser.is_anonymous
        && previousUserId !== onlineUserId) {
        applyAccountProfile(onlineUser);
      }
      renderAuthState(onlineUser);

      if (previousUserId !== onlineUserId || event === "USER_UPDATED") {
        setTimeout(() => {
          redrawCapturedTerritories(false);
          refreshOnlineTerritories();
        }, 0);
      }
    });

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
    setAuthStatus("Не удалось подключиться к Supabase. Можно продолжить как гость.", true);
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
  if (typeof userId !== "string" || userId.length === 0 || userId === onlineUserId) {
    const color = game.territoryColor;
    return {
      color,
      weight: 0,
      opacity: 0,
      stroke: false,
      fillColor: color,
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
    stroke: false,
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

function getPlayableAreaGeometry() {
  const feature = window.IVANOVO_URBAN_OKRUG;
  const geometry = feature?.type === "Feature" ? feature.geometry : feature;
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error("Не загружена граница городского округа Иваново.");
  }
  return geometry;
}

function pointIsInRing(point, ring) {
  const [latitude, longitude] = point;
  let inside = false;

  for (let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1) {
    const [startLon, startLat] = ring[previousIndex];
    const [endLon, endLat] = ring[index];
    const cross = (longitude - startLon) * (endLat - startLat)
      - (latitude - startLat) * (endLon - startLon);
    const dot = (longitude - startLon) * (longitude - endLon)
      + (latitude - startLat) * (latitude - endLat);
    if (Math.abs(cross) < 1e-10 && dot <= 1e-10) return true;

    const crossesLatitude = (startLat > latitude) !== (endLat > latitude);
    if (crossesLatitude
      && longitude < (endLon - startLon) * (latitude - startLat)
        / (endLat - startLat) + startLon) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointWithinPlayableArea(point) {
  const geometry = getPlayableAreaGeometry();
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;

  return polygons.some(rings => pointIsInRing(point, rings[0])
    && !rings.slice(1).some(ring => pointIsInRing(point, ring)));
}

function toClippingGeometry(geometry, originLat, originLon) {
  const radius = 6378137;
  const latitudeScale = Math.cos(originLat * Math.PI / 180);
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;

  return polygons.map(rings => rings.map(ring => ring.map(([longitude, latitude]) => [
    radius * (longitude - originLon) * Math.PI / 180 * latitudeScale,
    radius * (latitude - originLat) * Math.PI / 180
  ])));
}

function isTerritoryWithinPlayableArea(points) {
  const clipping = window.polygonClipping;
  if (!clipping) throw new Error("Не загрузилась библиотека проверки границ.");
  if (!isValidAreaPoints(points)) {
    throw new Error("Маршрут содержит некорректные координаты.");
  }

  const originLat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const originLon = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const areaGeometry = toClippingGeometry(
    getPlayableAreaGeometry(),
    originLat,
    originLon
  );
  const territory = clipping.union(toClippingPolygon(points, originLat, originLon));
  const outside = clipping.difference(territory, areaGeometry);

  return clippedGeometryArea(outside) <= 0.1;
}

async function tryEatTerritory(points) {
  if (!onlineClient || !onlineUserId) return null;

  const latitudes = points.map(point => point[0]);
  const longitudes = points.map(point => point[1]);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  let totalEatenAreaM2 = 0;
  const eatenPlayers = [];

  const { data: candidates, error: queryError } = await onlineClient
    .from("territories")
    .select("id,user_id,player_tag,area_m2")
    .neq("user_id", onlineUserId)
    .gte("max_lat", minLat)
    .lte("min_lat", maxLat)
    .gte("max_lon", minLon)
    .lte("min_lon", maxLon)
    .order("area_m2", { ascending: true })
    .limit(500);

  if (queryError) return { error: queryError };

  for (const target of candidates || []) {
    const { data, error } = await onlineClient.rpc("consume_territory", {
      p_target_id: target.id,
      p_attack_points: points
    });

    if (error) return { error };
    if (data?.eaten) {
      totalEatenAreaM2 += Number(data.eaten_area_m2) || 0;
      if (data.target_player_tag && !eatenPlayers.includes(data.target_player_tag)) {
        eatenPlayers.push(data.target_player_tag);
      }
    }
  }

  if (totalEatenAreaM2 > 0) {
    return {
      eaten: true,
      eatenAreaM2: totalEatenAreaM2,
      target_player_tag: eatenPlayers.join(", ")
    };
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
  const userTag = game.playerNickname;
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
    style: () => territoryStyleForPlayer(onlineUserId)
  }).addTo(map);

  routeLine = L.polyline([], {
    color: "#765ff0",
    weight: 5,
    opacity: 0.9,
    lineCap: "round",
    lineJoin: "round",
    smoothFactor: 0
  }).addTo(map);

  const playableAreaGeometry = getPlayableAreaGeometry();
  L.geoJSON(playableAreaGeometry, {
    style: {
      color: "#ffffff",
      weight: 9,
      opacity: 0.9,
      fill: false,
      lineCap: "round",
      lineJoin: "round"
    }
  }).addTo(map);
  playableBoundaryLayer = L.geoJSON(playableAreaGeometry, {
    style: {
      color: "#000000",
      weight: 5,
      opacity: 1,
      fillColor: "#000000",
      fillOpacity: 0.025,
      lineCap: "round",
      lineJoin: "round"
    }
  }).addTo(map);
  playableBoundaryLayer.bindPopup(
    "Граница городского округа Иваново · данные OpenStreetMap"
  );
  playableBoundaryLayer.bringToFront();
  map.fitBounds(playableBoundaryLayer.getBounds(), { padding: [20, 20] });

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
  refreshOnlineTerritories();
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
    const oldCaptureCount = game.captureCount;
    game.capturedArea = uniqueArea;
    game.captureCount = uniqueCaptureCount;

    if (Math.abs(oldArea - uniqueArea) > 0.5
      || oldCaptureCount !== uniqueCaptureCount) {
      saveState();
      if (oldArea - uniqueArea > 0.5
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

  if (tracking && !isPointWithinPlayableArea(filteredPoint)) {
    tracking = false;
    stopGpsWatch();
    routePoints = [];
    routeDistance = 0;
    routeLine.setLatLngs([]);
    setRouteButtons();
    setGpsStatus("Ты за пределами городского округа Иваново. Маршрут остановлен.", "error");
    showToast("Играть можно только в пределах городского округа Иваново.", true);
    updateMapStats();
    return;
  }

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

  try {
    if (!isTerritoryWithinPlayableArea(polygonPoints)) {
      setGpsStatus("Контур выходит за границу городского округа Иваново.", "error");
      showToast("Захват возможен только внутри городского округа Иваново.", true);
      return;
    }
  } catch (error) {
    console.error("Playable-area validation failed:", error);
    setGpsStatus("Не удалось проверить границу игрового района.", "error");
    showToast("Захват не выполнен: не удалось проверить игровую границу.", true);
    return;
  }

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
      const eatenAreaM2 = Number(result.eatenAreaM2) || 0;
      captureTerritory(polygonPoints, area, newArea + eatenAreaM2, {
        publish: false,
        eatenPlayer: result.target_player_tag,
        eatenAreaM2
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
  const previousArea = game.capturedArea;
  game.capturedArea += newArea;
  game.captureCount += 1;
  const reward = Math.floor(game.capturedArea / COINS_PER_CAPTURED_AREA_M2)
    - Math.floor(previousArea / COINS_PER_CAPTURED_AREA_M2);
  game.coins += reward;
  game.capturedZones.push({
    area,
    points: points.map(point => [point[0], point[1]])
  });

  routeLine?.setLatLngs([]);
  redrawCapturedTerritories(true);
  saveState();
  updateWallet();
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
      `Новая территория: ${formatArea(newArea)}. Получено ${formatCoins(reward)} монет.`,
      "ok"
    );
    showToast(
      `Захвачено новой территории: ${formatArea(newArea)} · +${formatCoins(reward)} монет.`
    );
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
updateWallet();

bindAppearanceControls();
updateAppearanceControls();
renderShop();
updateMapStats();
initializeOnline();
