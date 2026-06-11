/** Experiencia premium: horno en vivo, favoritos, búsqueda rápida, PWA, etc. */
import { ETIQUETAS_CATEGORIA } from "./productos.js";

const FAV_KEY = "dulce-aroma-favoritos";
const PUNTOS_KEY = "dulce-aroma-puntos";

export function obtenerFavoritos() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); }
  catch { return new Set(); }
}

export function guardarFavoritos(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}

export function esFavorito(id) {
  return obtenerFavoritos().has(id);
}

export function alternarFavorito(id) {
  const favs = obtenerFavoritos();
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  guardarFavoritos(favs);
  document.dispatchEvent(new CustomEvent("favoritos:cambio", { detail: { id, activo: favs.has(id) } }));
  return favs.has(id);
}

export function sumarPuntos(cantidad) {
  const prev = parseInt(localStorage.getItem(PUNTOS_KEY) || "0", 10);
  localStorage.setItem(PUNTOS_KEY, String(prev + cantidad));
}

export function obtenerPuntos() {
  return parseInt(localStorage.getItem(PUNTOS_KEY) || "0", 10);
}

export async function canjearCuponSorpresa() {
  // 1. Jalamos el ID del usuario de la ventana global
  const idDoc = window.idDocumentoUsuarioFirestore;

  if (!idDoc) {
    console.error("No hay un ID de documento de Firestore guardado en window.idDocumentoUsuarioFirestore.");
    return false;
  }

  const puntosActuales = obtenerPuntos();
  if (puntosActuales >= 10) {
    const nuevosPuntos = puntosActuales - 10;
    
    const codigoTicket = "DULCE-" + Math.floor(1000 + Math.random() * 9000);
    const nuevoCupon = {
      codigo: codigoTicket,
      descripcion: "1 Pan Dulce Tradicional Gratis",
      fecha: new Date().toLocaleDateString("es-MX"),
      estado: "disponible"
    };

    try {
      // 2. Importamos las herramientas nativas y la inicialización de Firebase directamente aquí
      const { initializeApp, getApp } = await import("https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js");
      const { doc, updateDoc, arrayUnion, getFirestore } = await import("https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js");

      // 3. Obtenemos la instancia activa de Firebase que ya inicializaste en tu app
      let appActiva;
      try {
        appActiva = getApp(); // Jala la app que ya está corriendo en script.js
      } catch {
        // Por si acaso no se hubiera iniciado, usamos tus llaves (firebaseConfig ya debe estar visible en tu entorno)
        if (typeof firebaseConfig !== 'undefined') {
          appActiva = initializeApp(firebaseConfig);
        } else {
          throw new Error("No se encontró la configuración de Firebase 'firebaseConfig'.");
        }
      }

      // 4. Creamos una referencia de base de datos local súper sólida y certificada por Firebase
      const localDB = getFirestore(appActiva);
      const usuarioRef = doc(localDB, "usuarios", idDoc);

      // 5. Guardamos en Firestore de forma segura
      await updateDoc(usuarioRef, {
        puntos: nuevosPuntos,
        cupones: arrayUnion(nuevoCupon)
      });

      // Actualizamos localStorage para la interfaz de la app
      localStorage.setItem("dulce-aroma-puntos", String(nuevosPuntos));

      // Tu alerta de éxito favorita con SweetAlert
      Swal.fire({
        title: "¡Puntos Canjeados! 🥳🥐",
        html: `Has canjeado 10 puntos en el Raspa y Gana por un premio:<br><br><strong style="font-size: 1.5rem; color: #8B4513;">${codigoTicket}</strong><br><br>¡Felicidades! Tu cupón de Pan Gratis ya aparece en la sección "Mis Cupones" dentro de tu perfil.`,
        icon: "success",
        confirmButtonColor: "#7b5533"
      });

      // Notificamos el cambio de puntos a la interfaz
      document.dispatchEvent(new CustomEvent("puntos:cambio", { detail: { puntos: nuevosPuntos } }));

      return true; 
    } catch (error) {
      console.error("Error al conectar con Firestore desde experiencia.js:", error);
      return false;
    }
  } else {
    return false;
  }
}
const LOTES_HORNO = [
  { h: 7, m: 0, label: "Lote matutino" },
  { h: 11, m: 0, label: "Media mañana" },
  { h: 16, m: 0, label: "Tarde dorada" }
];

function proximoLoteHorno() {
  const now = new Date();
  for (const lote of LOTES_HORNO) {
    const t = new Date(now);
    t.setHours(lote.h, lote.m, 0, 0);
    if (t > now) return { target: t, label: lote.label };
  }
  const manana = new Date(now);
  manana.setDate(manana.getDate() + 1);
  manana.setHours(7, 0, 0, 0);
  return { target: manana, label: "Lote matutino" };
}

function formatearCountdown(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function iniciarContadorHorno() {
  const el = document.getElementById("hornoCountdown");
  const label = document.getElementById("hornoCountdownLabel");
  if (!el) return;

  const tick = () => {
    const { target, label: txt } = proximoLoteHorno();
    const diff = target - Date.now();
    el.textContent = formatearCountdown(Math.max(0, diff));
    if (label) label.textContent = txt;
    if (diff <= 0) el.classList.add("horno-listo");
    else el.classList.remove("horno-listo");
  };
  tick();
  setInterval(tick, 1000);
}

export function renderizarDestacados(catalogo) {
  const track = document.getElementById("destacadosTrack");
  if (!track || !catalogo?.length) return;

  const destacados = catalogo
    .filter((p) => p.disponible !== false)
    .filter((p) => p.badge || ["roles-canela", "barquillos", "donas-chocolate", "empanadas"].includes(p.id))
    .slice(0, 8);

  track.innerHTML = "";
  destacados.forEach((p) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "destacado-chip";
    chip.innerHTML = `
      <img src="${p.img}" alt="" width="48" height="48" loading="lazy">
      <span class="destacado-chip-texto">
        <strong>${p.nombre}</strong>
        <small>$${Number(p.precio).toFixed(0)}</small>
      </span>`;
    chip.addEventListener("click", () => {
      document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => window.abrirVistaRapida?.(p.id), 400);
    });
    track.appendChild(chip);
  });
}

export function abrirVistaRapida(producto) {
  const modal = document.getElementById("modalVistaRapida");
  if (!modal || !producto) return;
  const agotado = producto.disponible === false;
  const cat = ETIQUETAS_CATEGORIA[producto.categoria] || producto.categoria;

  document.getElementById("vrImg").src = producto.img;
  document.getElementById("vrImg").alt = producto.nombre;
  document.getElementById("vrNombre").textContent = producto.nombre;
  document.getElementById("vrDesc").textContent = producto.descripcion;
  document.getElementById("vrCat").textContent = cat;
  document.getElementById("vrPrecio").textContent = agotado ? "No disponible" : `$${Number(producto.precio).toFixed(2)}`;

  const btn = document.getElementById("vrAgregar");
  btn.disabled = agotado;
  btn.innerHTML = agotado
    ? '<i class="fa-solid fa-ban"></i> Agotado'
    : '<i class="fa-solid fa-plus"></i> Agregar al carrito';
  btn.onclick = () => {
    if (!agotado) {
      window.agregarAlCarrito(producto.nombre, Number(producto.precio), producto.img);
      cerrarVistaRapida();
    }
  };

  const btnFav = document.getElementById("vrFavorito");
  const favActivo = esFavorito(producto.id);
  btnFav.classList.toggle("activo", favActivo);
  btnFav.setAttribute("aria-pressed", favActivo ? "true" : "false");
  btnFav.onclick = () => {
    const on = alternarFavorito(producto.id);
    btnFav.classList.toggle("activo", on);
    btnFav.setAttribute("aria-pressed", on ? "true" : "false");
  };

  modal.hidden = false;
  modal.classList.add("activo");
  document.body.style.overflow = "hidden";
}

export function cerrarVistaRapida() {
  const modal = document.getElementById("modalVistaRapida");
  if (!modal) return;
  modal.hidden = true;
  modal.classList.remove("activo");
  if (!document.querySelector(".side-panel.active")) document.body.style.overflow = "";
}

function initCommandPalette(catalogoGetter) {
  const modal = document.getElementById("commandPalette");
  const input = document.getElementById("commandInput");
  const lista = document.getElementById("commandResults");
  if (!modal || !input || !lista) return;

  const abrir = () => {
    modal.hidden = false;
    input.value = "";
    renderResultados("");
    input.focus();
  };
  const cerrar = () => { modal.hidden = true; };

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      modal.hidden ? abrir() : cerrar();
    }
    if (e.key === "Escape" && !modal.hidden) cerrar();
  });

  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });

  const renderResultados = (q) => {
    const catalogo = catalogoGetter() || [];
    const term = q.toLowerCase().trim();
    const filtrados = catalogo.filter((p) => {
      if (!term) return p.disponible !== false;
      return (p.nombre + p.descripcion + (ETIQUETAS_CATEGORIA[p.categoria] || "")).toLowerCase().includes(term);
    }).slice(0, 8);

    lista.innerHTML = filtrados.length
      ? filtrados.map((p) => `
          <button type="button" class="command-item" data-id="${p.id}">
            <img src="${p.img}" alt="" width="40" height="40">
            <span><strong>${p.nombre}</strong><small>$${Number(p.precio).toFixed(2)} · ${p.disponible === false ? "Agotado" : "Disponible"}</small></span>
          </button>`).join("")
      : '<p class="command-vacio">Sin resultados</p>';

    lista.querySelectorAll(".command-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = catalogo.find((x) => x.id === btn.dataset.id);
        cerrar();
        if (p) abrirVistaRapida(p);
      });
    });
  };

  input.addEventListener("input", () => renderResultados(input.value));
  window.abrirBusquedaRapida = abrir;
}

function initScrollReveal() {
  const obs = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("revealed"); }),
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal-on-scroll").forEach((el) => obs.observe(el));
}

function initNavActiva() {
  const links = document.querySelectorAll("#navPrincipal a[href^='#']");
  const secciones = [...links].map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("nav-active", a.getAttribute("href") === `#${e.target.id}`));
      });
    },
    { threshold: 0.35 }
  );
  secciones.forEach((s) => obs.observe(s));
}

function initStickyCartBar() {
  const bar = document.getElementById("stickyCartBar");
  const productos = document.getElementById("productos");
  if (!bar || !productos) return;

  const actualizarBarra = () => {
    const n = window.carritoActual?.reduce((s, i) => s + i.cantidad, 0) || 0;
    const total = window.carritoActual?.reduce((s, i) => s + i.precio * i.cantidad, 0) || 0;
    bar.querySelector(".sticky-cart-total").textContent = `$${total.toFixed(2)}`;
    bar.querySelector(".sticky-cart-count").textContent = n;
    const rect = productos.getBoundingClientRect();
    const catalogoVisible = rect.top < window.innerHeight && rect.bottom > 0;
    bar.classList.toggle("visible", n > 0 && !catalogoVisible);
  };

  window.addEventListener("scroll", actualizarBarra, { passive: true });
  document.addEventListener("carrito:actualizado", actualizarBarra);
}

function initBackToTop() {
  const btn = document.getElementById("btnBackTop");
  if (!btn) return;
  window.addEventListener("scroll", () => btn.classList.toggle("visible", window.scrollY > 600), { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function initPWA() {
  const btn = document.getElementById("btnInstalarApp");
  if (!btn) return;
  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function initNewsletter() {
  const form = document.getElementById("formNewsletter");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = form.querySelector("input[type=email]")?.value.trim();
    if (!email) return;
    localStorage.setItem("dulce-aroma-newsletter", email);
    form.reset();
    window.mostrarToast?.("¡Gracias! Te avisaremos de promos y novedades.");
  });
}

function initPromoDia() {
  const el = document.getElementById("promoDelDia");
  if (!el) return;
  const promos = [
    { dia: 2, titulo: "Martes 2×1 en Donas", desc: "Chocolate o azúcar — segunda gratis" },
    { dia: 4, titulo: "Jueves 3×2 Empanadas", desc: "Lleva 3 y paga 2" },
    { dia: 5, titulo: "Viernes -15% Roles", desc: "Cupón HORNO20 en carrito" },
    { dia: 0, titulo: "Domingo en familia", desc: "Envío bonificado en pedidos +$250" }
  ];
  const hoy = new Date().getDay();
  const promo = promos.find((p) => p.dia === hoy) || promos[0];
  el.querySelector(".promo-dia-titulo").textContent = promo.titulo;
  el.querySelector(".promo-dia-desc").textContent = promo.desc;
}

export function iniciarExperiencia(catalogoGetter) {
  iniciarContadorHorno();
  initCommandPalette(catalogoGetter);
  initScrollReveal();
  initNavActiva();
  initStickyCartBar();
  initBackToTop();
  initPWA();
  initNewsletter();
  initPromoDia();

  document.getElementById("btnCerrarVistaRapida")?.addEventListener("click", cerrarVistaRapida);
  document.getElementById("modalVistaRapida")?.addEventListener("click", (e) => {
    if (e.target.id === "modalVistaRapida") cerrarVistaRapida();
  });

  document.addEventListener("catalogo:listo", (e) => {
    renderizarDestacados(e.detail.catalogo);
  });

  window.abrirVistaRapida = (id) => {
    const p = catalogoGetter()?.find((x) => x.id === id);
    if (p) abrirVistaRapida(p);
  };
}
